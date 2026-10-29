// The Android camera view for "See it on your desk": our own WebXR session,
// rather than model-viewer's. model-viewer drops the part on the FLOOR (its
// placement looks for the lowest surface, so a part aimed at a desk slid off
// it), shows no sign of looking for a surface, and holds "real size" by
// refusing to scale at all. Here:
//
//   1. a grid follows the surface the camera sees, so you can tell it has
//      found the table (and which one) before anything lands;
//   2. a tap puts the part on the grid, pinned to that spot (an anchor where
//      the phone has them, so it stays put as tracking settles);
//   3. pinch to resize, twist or drag one finger to spin it, "Move" to pick
//      it up again, "Real size" to go back to 1:1.
//
// The overlay is ordinary DOM shown over the camera (WebXR's dom-overlay), so
// the words and buttons are the page's own and fit a thin phone like the rest.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const CSS = `
  #dxr { position: fixed; inset: 0; z-index: 170000; pointer-events: auto; touch-action: none;
    font: 15px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff; user-select: none;
    -webkit-user-select: none; display: flex; flex-direction: column; justify-content: space-between;
    padding: max(12px, env(safe-area-inset-top)) 12px max(14px, env(safe-area-inset-bottom)); }
  #dxr * { box-sizing: border-box; }
  #dxr .dxr-top { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  #dxr .dxr-say { max-width: 100%; background: rgba(8, 12, 20, .72); border-radius: 14px; padding: 9px 14px;
    text-align: center; text-wrap: balance; }
  #dxr .dxr-size { background: rgba(28, 102, 229, .9); border-radius: 999px; padding: 4px 12px; font-weight: 600;
    font-size: 13px; }
  #dxr .dxr-bar { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  #dxr button { flex: 1 1 0; min-width: 0; max-width: 160px; border: 0; border-radius: 12px; padding: 12px 8px;
    font: 600 15px/1.2 inherit; color: #fff; background: rgba(8, 12, 20, .78); white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  #dxr button.dxr-main { background: #1c66e5; }
  #dxr [hidden] { display: none !important; }
`;

// The grid that sits on the found surface: a disc of fine lines with a ring,
// fading out to the edge, so it reads as "this surface" rather than a target.
function gridTexture() {
  const n = 512, cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const g = cv.getContext("2d"), c = n / 2;
  g.save();
  g.beginPath(); g.arc(c, c, c - 4, 0, Math.PI * 2); g.clip();
  g.strokeStyle = "rgba(255,255,255,.55)";
  g.lineWidth = 2;
  for (let i = 0; i <= 16; i++) {
    const p = (i / 16) * n;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, n); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(n, p); g.stroke();
  }
  g.restore();
  // fade the lines out toward the rim
  g.globalCompositeOperation = "destination-in";
  const fade = g.createRadialGradient(c, c, c * 0.25, c, c, c);
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(1, "rgba(0,0,0,.15)");
  g.fillStyle = fade;
  g.fillRect(0, 0, n, n);
  g.globalCompositeOperation = "source-over";
  g.strokeStyle = "rgba(255,255,255,.95)";
  g.lineWidth = 8;
  g.beginPath(); g.arc(c, c, c - 8, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#fff";
  g.beginPath(); g.arc(c, c, 9, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A soft round shadow under the part: without one it seems to float.
function shadowTexture() {
  const n = 128, cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const g = cv.getContext("2d");
  const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  r.addColorStop(0, "rgba(0,0,0,.45)");
  r.addColorStop(0.6, "rgba(0,0,0,.2)");
  r.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, n, n);
  return new THREE.CanvasTexture(cv);
}

const scaleText = (s) => Math.abs(s - 1) < 0.005 ? "Real size"
  : `${s >= 1 ? (Math.round(s * 10) / 10) : (Math.round(s * 100) / 100)}× real size`;

// Load the part BEFORE the tap: the browser only starts a camera view straight
// from a tap, so nothing slow may sit between the tap and requestSession().
// Returns { start() } where start() must be called inside the tap handler.
export async function prepareDeskXR({ glb, onEnd, onError }) {
  const gltf = await new GLTFLoader().parseAsync(glb, "");
  const part = gltf.scene;
  // stand it on y = 0, centred over its own footprint
  const box = new THREE.Box3().setFromObject(part);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  part.position.set(-mid.x, -box.min.y, -mid.z);
  const footprint = Math.max(size.x, size.z, 0.02);

  return {
    start() {
      if (!document.getElementById("dxr-css")) {
        const st = document.createElement("style");
        st.id = "dxr-css";
        st.textContent = CSS;
        document.head.append(st);
      }
      const ui = document.createElement("div");
      ui.id = "dxr";
      ui.innerHTML = `<div class="dxr-top"><div class="dxr-say"></div><div class="dxr-size" hidden></div></div>`
        + `<div class="dxr-bar"><button type="button" class="dxr-move" hidden>Move</button>`
        + `<button type="button" class="dxr-real" hidden>Real size</button>`
        + `<button type="button" class="dxr-main dxr-done">Done</button></div>`;
      document.body.append(ui);
      const $ = (s) => ui.querySelector(s);
      const say = (t) => { $(".dxr-say").textContent = t; };
      say("Starting the camera…");

      // Called straight from the tap, first thing: that is what lets it start
      let req;
      try {
        req = navigator.xr.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test"],
          optionalFeatures: ["dom-overlay", "anchors", "local-floor"],
          domOverlay: { root: ui },
        });
      } catch (e) { req = Promise.reject(e); }
      req.then((session) => run(session, ui, $, say)).catch((e) => { ui.remove(); onError?.(e); });
    },
  };

  async function run(session, ui, $, say) {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType("local");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(0.4, 1, 0.3);
    scene.add(sun);

    // the grid, a little bigger than the part so it reads as "the spot"
    const gridSize = Math.min(Math.max(footprint * 1.6, 0.18), 0.6);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(gridSize, gridSize),
      new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, depthWrite: false }));
    grid.rotation.x = -Math.PI / 2;
    const reticle = new THREE.Group();
    reticle.add(grid);
    reticle.visible = false;
    scene.add(reticle);

    // holder: where it sits (position + spin); sizer: how big
    const holder = new THREE.Group(), sizer = new THREE.Group();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(footprint * 1.5, footprint * 1.5),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.0005;
    sizer.add(shadow, part);
    holder.add(sizer);
    holder.visible = false;
    scene.add(holder);

    await renderer.xr.setSession(session);
    const space = renderer.xr.getReferenceSpace();
    const viewer = await session.requestReferenceSpace("viewer");
    const hits = await session.requestHitTestSource({ space: viewer });

    let mode = "scan";            // scan: looking / ready to place; placed
    let spin = 0, scale = 1, anchor = null, lastHit = null, found = false;
    const showSize = () => {
      $(".dxr-size").textContent = scaleText(scale);
      $(".dxr-size").hidden = mode !== "placed";
      $(".dxr-real").hidden = mode !== "placed" || Math.abs(scale - 1) < 0.005;
    };
    const scanText = () => say(found ? (holder.visible ? "Tap to put it down here." : "Found a surface. Tap to place it.")
      : "Looking for a surface. Point at the table and move the phone slowly.");
    scanText();

    // buttons never count as a tap on the scene
    ui.addEventListener("beforexrselect", (e) => { if (e.target.closest("button")) e.preventDefault(); });
    $(".dxr-done").onclick = () => session.end();
    $(".dxr-move").onclick = () => {
      mode = "scan";
      anchor?.delete?.(); anchor = null;
      $(".dxr-move").hidden = true;
      showSize();
      scanText();
    };
    $(".dxr-real").onclick = () => { scale = 1; sizer.scale.setScalar(1); showSize(); };

    session.addEventListener("select", () => {
      if (mode !== "scan" || !lastHit) return;
      mode = "placed";
      holder.visible = true;
      holder.position.setFromMatrixPosition(reticle.matrix);
      if (holder.userData.fresh !== false) {
        // first placement: face the phone
        const cam = renderer.xr.getCamera().position;
        spin = Math.atan2(cam.x - holder.position.x, cam.z - holder.position.z);
        holder.userData.fresh = false;
      }
      holder.rotation.set(0, spin, 0);
      reticle.visible = false;
      $(".dxr-move").hidden = false;
      showSize();
      say("Pinch to resize. Twist, or drag one finger, to spin it.");
      // pin it to the real spot, where the phone can
      const hit = lastHit;
      if (hit.createAnchor) hit.createAnchor().then((a) => {
        if (mode === "placed" && !anchor) anchor = a; else a.delete?.();
      }).catch(() => {});
    });

    // gestures, read off the overlay (it covers the whole camera view)
    const pts = new Map();
    let g0 = null;
    const pair = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(b.x - a.x, b.y - a.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    ui.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      g0 = pts.size === 2 ? { ...pair(), scale, spin } : null;
    });
    ui.addEventListener("pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p || mode !== "placed") { if (p) { p.x = e.clientX; p.y = e.clientY; } return; }
      if (pts.size === 1) {
        spin += (e.clientX - p.x) * 0.012;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2 && g0) {
        const now = pair();
        let s = g0.scale * now.d / Math.max(g0.d, 1);
        s = Math.min(Math.max(s, 0.05), 20);
        if (Math.abs(s - 1) < 0.06) s = 1;         // a click into real size on the way past
        scale = s;
        spin = g0.spin - (now.a - g0.a);
        sizer.scale.setScalar(scale);
        showSize();
      }
      holder.rotation.set(0, spin, 0);
    });
    const lift = (e) => {
      pts.delete(e.pointerId);
      g0 = pts.size === 2 ? { ...pair(), scale, spin } : null;
    };
    ui.addEventListener("pointerup", lift);
    ui.addEventListener("pointercancel", lift);

    const m = new THREE.Matrix4();
    renderer.setAnimationLoop((t, frame) => {
      if (!frame) return;
      const res = frame.getHitTestResults(hits);
      let pose = null;
      for (const r of res) {
        const p = r.getPose(space);
        if (!p) continue;
        // a flat, upward-facing surface only: not a wall or a screen
        m.fromArray(p.transform.matrix);
        const up = new THREE.Vector3(0, 1, 0).applyMatrix4(new THREE.Matrix4().extractRotation(m));
        if (up.y < 0.85) continue;
        pose = p; lastHit = r;
        break;
      }
      if (!pose) lastHit = null;
      if (mode === "scan") {
        const was = found;
        found = !!pose;
        reticle.visible = found;
        if (found) {
          reticle.matrix.fromArray(pose.transform.matrix);
          reticle.matrix.decompose(reticle.position, reticle.quaternion, reticle.scale);
          // flat on the surface, without the hit's own twist
          reticle.quaternion.identity();
          reticle.updateMatrix();
          const pulse = 1 + Math.sin(t / 300) * 0.04;
          grid.scale.setScalar(pulse);
          // moving it again: the part rides the grid until the tap
          if (holder.visible) { holder.position.copy(reticle.position); holder.rotation.set(0, spin, 0); }
        }
        if (was !== found) scanText();
      } else if (anchor && frame.trackedAnchors?.has(anchor)) {
        const ap = frame.getPose(anchor.anchorSpace, space);
        if (ap) holder.position.set(ap.transform.position.x, ap.transform.position.y, ap.transform.position.z);
      }
      renderer.render(scene, camera);
    });

    session.addEventListener("end", () => {
      renderer.setAnimationLoop(null);
      hits.cancel?.();
      renderer.dispose();
      ui.remove();
      onEnd?.();
    });
  }
}
