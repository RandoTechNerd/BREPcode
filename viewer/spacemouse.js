// 3D mouse (3Dconnexion SpaceMouse and its kin) over WebHID.
//
// Push the cap to pan, pull or push it to zoom, twist and tilt it to turn the
// model, all at once, the way every CAD package with one works. WebHID is in
// Chrome, Edge and Electron (the desktop app picks the device itself, see
// desktop/main.cjs); Firefox and Safari have no WebHID, so the setting hides.
//
// The device speaks one of two dialects: older ones send translation as report
// 1 and rotation as report 2 (three signed 16-bit axes each); newer ones put
// all six in report 1. Report 3 is the buttons: left fits the view (home),
// right resets to the iso view. Values run roughly ±350 at full deflection.

export const VENDORS = [0x256f, 0x046d];      // 3Dconnexion, and Logitech for the older units
const FULL = 350;                              // full deflection
const DEAD = 0.06;                             // ignore the cap's rest wobble

export function hidSupported() {
  return typeof navigator !== "undefined" && !!navigator.hid;
}

// Pure: one HID report -> the axes it carries ({ t: [x,y,z] } and/or
// { r: [rx,ry,rz] }, each -1..1) or the buttons ({ buttons: bits }).
export function parseReport(reportId, data) {
  const n = data.byteLength;
  const ax = (i) => Math.max(-1, Math.min(1, data.getInt16(i * 2, true) / FULL));
  if (reportId === 1 && n >= 12) return { t: [ax(0), ax(1), ax(2)], r: [ax(3), ax(4), ax(5)] };
  if (reportId === 1 && n >= 6) return { t: [ax(0), ax(1), ax(2)] };
  if (reportId === 2 && n >= 6) return { r: [ax(0), ax(1), ax(2)] };
  if (reportId === 3 && n >= 1) return { buttons: data.getUint8(0) | (n > 1 ? data.getUint8(1) << 8 : 0) };
  return null;
}
const dz = (v) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

// Pure: the camera move for one frame. pan/zoom in units of the view's own
// size (distance to the target), turn in radians, so it feels the same on a
// 2 mm part and a 300 mm one. dt in seconds.
export function frameMove(t, r, dt, { speed = 1 } = {}) {
  return {
    pan: [dz(t[0]) * dt * 1.2 * speed, -dz(t[2]) * dt * 1.2 * speed],   // cap right / cap up (device Z is down)
    zoom: dz(t[1]) * dt * 1.5 * speed,                                   // pull toward you: positive = closer
    yaw: -dz(r[2]) * dt * 2.2 * speed,                                   // twist
    pitch: -dz(r[0]) * dt * 2.2 * speed,                                 // tilt forward/back
  };
}

// Drive a three.js camera + OrbitControls from the device. Returns
// { connect(), disconnect(), connected } and keeps going until disconnect.
export function attachSpaceMouse({ THREE, camera, controls, onButton, onMove, getSpeed = () => 1 }) {
  let device = null, raf = 0, last = 0;
  const t = [0, 0, 0], r = [0, 0, 0];
  const onReport = (e) => {
    const p = parseReport(e.reportId, e.data);
    if (!p) return;
    if (p.t) t.splice(0, 3, ...p.t);
    if (p.r) r.splice(0, 3, ...p.r);
    if (p.buttons !== undefined && p.buttons) onButton?.(p.buttons);
  };
  const v = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(), q = new THREE.Quaternion();
  const step = (now) => {
    raf = requestAnimationFrame(step);
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
    last = now;
    const m = frameMove(t, r, dt, { speed: getSpeed() });
    if (!m.pan[0] && !m.pan[1] && !m.zoom && !m.yaw && !m.pitch) return;
    const target = controls.target;
    v.copy(camera.position).sub(target);
    const dist = v.length() || 1;
    // turn about the target: yaw about world Z (the scene is Z-up), pitch
    // about the camera's own right axis, kept off the poles
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), m.yaw);
    v.applyQuaternion(q);
    right.crossVectors(camera.up, v).normalize();
    const polar = Math.acos(Math.max(-1, Math.min(1, v.z / v.length())));
    const pitch = Math.max(0.02 - polar, Math.min(Math.PI - 0.02 - polar, m.pitch));
    q.setFromAxisAngle(right, -pitch);
    v.applyQuaternion(q);
    // zoom along the view, never through the target
    v.multiplyScalar(Math.max(0.05, 1 - m.zoom));
    camera.position.copy(target).add(v);
    // pan in the screen plane
    camera.getWorldDirection(up);
    right.crossVectors(up, camera.up).normalize();
    up.crossVectors(right, up).normalize();
    const pan = right.multiplyScalar(m.pan[0] * dist).add(up.multiplyScalar(m.pan[1] * dist));
    camera.position.add(pan);
    target.add(pan);
    camera.lookAt(target);
    onMove?.();
  };
  const open = async (d) => {
    if (!d.opened) await d.open();
    d.addEventListener("inputreport", onReport);
    device = d;
    if (!raf) raf = requestAnimationFrame(step);
    return d.productName || "3D mouse";
  };
  return {
    get connected() { return !!device; },
    // a device this site was allowed before, without asking (no gesture needed)
    async reconnect() {
      if (!hidSupported()) return null;
      const known = (await navigator.hid.getDevices()).find((d) => VENDORS.includes(d.vendorId));
      return known ? open(known) : null;
    },
    // asks: must run from a click
    async connect() {
      if (!hidSupported()) throw new Error("this browser has no WebHID: use Chrome, Edge or the desktop app");
      const [d] = await navigator.hid.requestDevice({ filters: VENDORS.map((vendorId) => ({ vendorId })) });
      if (!d) return null;
      return open(d);
    },
    async disconnect() {
      cancelAnimationFrame(raf); raf = 0; last = 0;
      if (device) { device.removeEventListener("inputreport", onReport); try { await device.close(); } catch { /* gone */ } }
      device = null;
    },
  };
}
