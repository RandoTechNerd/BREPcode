// design/explode-video.js — the exploded view as a short video.
//
// Loaded only when "Save video…" is pressed (nothing here runs or downloads
// otherwise). Records the viewer's own canvas with the browser's
// MediaRecorder while the camera turns once around the model, the parts come
// apart, hold, and go back together, then saves a WebM. No extra library and
// no server: the browser encodes it, a few seconds of work at most.
//
//   0.0 - 3.5 s  one turn around the model, assembled
//   3.5 - 5.0 s  explode, still turning
//   5.0 - 6.5 s  hold apart
//   6.5 - 8.5 s  collapse back together
//   8.5 - 9.0 s  hold assembled
//
// One body (nothing to pull apart): the turn and the rest only, 4 s. A cut
// view that is on stays on for the whole video.

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
export const TIMELINE = { turn: 3.5, out: 1.5, hold: 1.5, back: 2, rest: 0.5 };
const LENGTH = Object.values(TIMELINE).reduce((a, b) => a + b, 0);

// How far apart (0..1) and how far round (radians) at time t (seconds).
export function frameAt(t) {
  const { turn, out, hold, back } = TIMELINE;
  const spin = (Math.PI * 2 * Math.min(t, turn)) / turn + Math.max(0, t - turn) * 0.35;
  let k = 0;
  if (t > turn && t <= turn + out) k = ease((t - turn) / out);
  else if (t > turn + out && t <= turn + out + hold) k = 1;
  else if (t > turn + out + hold && t <= turn + out + hold + back) k = 1 - ease((t - turn - out - hold) / back);
  return { k, spin };
}

export async function recordExplode({ host, THREE, setK, getK, explode = true, frame = null, onProgress = () => {} }) {
  const LEN = explode ? LENGTH : TIMELINE.turn + TIMELINE.rest;
  const canvas = host.renderer?.domElement;
  if (!canvas?.captureStream || typeof MediaRecorder === "undefined") throw new Error("this browser can't record the view (no MediaRecorder)");
  const type = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw new Error("this browser can't make a WebM video");
  const cam = host.camera, orbit = host.orbit;
  const target = orbit.target.clone(), start = cam.position.clone(), up = cam.up.clone(), k0 = getK();
  const offset = start.clone().sub(target);
  // far enough back that the model, exploded, stays in the picture all the
  // way round (never nearer than the view it started from)
  if (frame && !frame.isEmpty?.() && cam.isPerspectiveCamera) {
    const sph = frame.getBoundingSphere(new THREE.Sphere());
    const reach = sph.radius + sph.center.distanceTo(target);
    const fov = (Math.min(cam.fov, cam.fov * cam.aspect) * Math.PI) / 360;
    const need = (reach / Math.sin(fov)) * 1.08;
    if (need > offset.length()) offset.setLength(need);
  }
  const axis = up.clone().normalize();
  const stream = canvas.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6e6 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const wasEnabled = orbit.enabled;
  orbit.enabled = false;                 // a hand on the mouse would fight the camera
  host.overlaysVisible?.(false);         // the part only: no size lines, marks or handles
  try {
    rec.start(250);
    await new Promise((done) => {
      const t0 = performance.now();
      const step = (now) => {
        const t = (now - t0) / 1000;
        const { k, spin } = frameAt(Math.min(t, LEN));
        setK(explode ? k : k0);
        cam.position.copy(target).add(offset.clone().applyAxisAngle(axis, spin));
        cam.lookAt(target);
        onProgress(Math.min(1, t / LEN));
        if (t < LEN) requestAnimationFrame(step); else done();
      };
      requestAnimationFrame(step);
    });
    rec.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach((tr) => tr.stop());
    cam.position.copy(start); cam.up.copy(up); cam.lookAt(target);
    orbit.enabled = wasEnabled;
    setK(k0);
    host.overlaysVisible?.(k0 < 0.01);
  }
  const blob = new Blob(chunks, { type: "video/webm" });
  if (!blob.size) throw new Error("nothing was recorded");
  const name = `${(host.modelName?.() || (explode ? "brepcode-assembly" : "brepcode-part")).replace(/[^\w-]+/g, "-")}-${explode ? "explode" : "turntable"}.webm`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  // for the checks: what was made
  recordExplode.last = { size: blob.size, type, name };
  return `${name} (${Math.round(blob.size / 1024)} KB)`;
}
