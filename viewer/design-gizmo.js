// design-gizmo.js — Design mode's move / rotate / scale gizmo.
//
// three.js TransformControls on a stand-in object at the centre of the
// selected shape. Dragging an arrow, a ring or the centre dot slides, turns
// or scales the shape's meshes (or, for a cutter, translucent ghosts of it:
// its own faces are the inside of a hole, and sliding those reads as the
// solid tearing) without touching the kernel. On release the change is handed
// back as one step, which the shell writes into the code (design-move.js for
// a move, design/features.js rotateText / scaleText for the others), so the
// code stays the only thing that says where anything is.
//
// The stock gizmo is trimmed to match the handle dots: arrows along each axis
// (no coloured plane squares at the centre; Alt-drag is the free move), one
// ring per axis for rotate (a turn about one axis is one number in
// rotate([…])), and for scale the centre dot (uniform: scale(k, …)) plus one
// handle per axis (scale([x, y, z], …)), as a slicer does. A scale never goes
// below MIN_SCALE: dragging through the centre used to turn the factor
// negative and the preview flipped inside out.

import { TransformControls } from "three/addons/controls/TransformControls.js";

const DROP = { translate: ["XY", "YZ", "XZ", "XYZ"], rotate: ["E", "XYZE"], scale: ["XY", "YZ", "XZ"] };
const MIN_SCALE = 0.02, MAX_SCALE = 50;
const ROT_SNAP = 5;    // degrees, when the toolbar's snap is on

export function createMoveGizmo({ THREE, scene, camera, renderer, orbit, onRelease, onDragging, onScaling }) {
  const tc = new TransformControls(camera, renderer.domElement);
  tc.setMode("translate");
  tc.setSpace("world");
  tc.setSize(0.85);
  const helper = tc.getHelper();
  helper.name = "design-move-gizmo";
  scene.add(helper);
  // trim the stock gizmo (see above): its visuals and pickers, by handle name
  const gz = helper.children.find((c) => c.gizmo && c.picker);
  if (gz) {
    for (const [mode, names] of Object.entries(DROP)) {
      for (const part of [gz.gizmo[mode], gz.picker[mode]]) {
        for (const h of [...part.children]) if (names.includes(h.name)) part.remove(h);
      }
    }
    // scale's centre: a light dot like a corner handle, not a white cube
    for (const h of gz.gizmo.scale.children) {
      if (h.name !== "XYZ") continue;
      h.geometry = new THREE.SphereGeometry(0.07, 16, 12);
      h.material = h.material.clone();
      h.material.color.setHex(0xf2f5fb);
      h.material.opacity = 0.95;
      h.material.tempColor = h.material.color.clone();
    }
  }
  const proxy = new THREE.Object3D();
  proxy.name = "design-move-proxy";
  scene.add(proxy);
  const ghostGroup = new THREE.Group();
  scene.add(ghostGroup);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0.35, depthWrite: false });

  let cur = null;        // { fid, origin, meshes, ghosts }
  let dragging = false;
  let snap = 1;
  let mode = "translate";
  let lastAxis = null;

  // the stand-in's change since the drag began, as what will be written
  const change = () => {
    if (!cur) return null;
    if (mode === "translate") return { mode, delta: proxy.position.clone().sub(cur.origin) };
    if (mode === "rotate") {
      // the signed turn about each axis, read as axis-angle: an Euler read
      // wrote a 120 degree turn about Y as 60 (x=180, y=60, z=180)
      const q = proxy.quaternion;
      const a = [q.x, q.y, q.z].map((v) => THREE.MathUtils.radToDeg(2 * Math.atan2(v, q.w)));
      const ax = { X: 0, Y: 1, Z: 2 }[lastAxis] ?? a.reduce((b, v, i) => (Math.abs(v) > Math.abs(a[b]) ? i : b), 0);
      let deg = a[ax];
      if (deg > 180) deg -= 360; else if (deg < -180) deg += 360;
      return { mode, axis: ax, deg: Math.round(deg * 100) / 100, about: cur.origin.clone() };
    }
    const f = [proxy.scale.x, proxy.scale.y, proxy.scale.z].map((v) => Math.round(v * 1000) / 1000);
    return { mode, factor: f.every((v) => v === f[0]) ? f[0] : f, about: cur.origin.clone() };
  };
  // the preview: meshes (or ghosts) moved, turned or scaled about the centre
  const place = () => {
    if (!cur) return;
    const o = cur.origin;
    const m = new THREE.Matrix4();
    if (dragging) {
      if (mode === "translate") m.makeTranslation(proxy.position.x - o.x, proxy.position.y - o.y, proxy.position.z - o.z);
      else {
        const inner = mode === "rotate" ? new THREE.Matrix4().makeRotationFromQuaternion(proxy.quaternion)
          : new THREE.Matrix4().makeScale(proxy.scale.x, proxy.scale.y, proxy.scale.z);
        m.makeTranslation(o.x, o.y, o.z).multiply(inner).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
      }
    }
    for (const g of cur.ghosts || cur.meshes) m.decompose(g.position, g.quaternion, g.scale);
  };
  const clearGhosts = () => {
    for (const g of [...ghostGroup.children]) ghostGroup.remove(g);
  };
  const reset = () => {
    if (!cur) return;
    proxy.position.copy(cur.origin);
    proxy.quaternion.identity();
    proxy.scale.set(1, 1, 1);
  };

  tc.addEventListener("dragging-changed", (e) => {
    const was = dragging;
    dragging = !!e.value;
    if (dragging) lastAxis = tc.axis;
    orbit.enabled = !dragging;
    ghostGroup.visible = dragging && !!cur?.ghosts;
    onDragging?.(dragging);
    if (dragging || !cur || !was) return;
    const c = change();
    place();             // not dragging: back where the code says, until the rebuild
    reset();
    if (!c) return;
    const moved = c.mode === "translate" ? c.delta.lengthSq() > 1e-8 : c.mode === "rotate" ? Math.abs(c.deg) > 1e-6
      : [c.factor].flat().some((v) => Math.abs(v - 1) > 1e-6);
    if (moved) onRelease?.(cur.fid, c.mode === "translate" ? c.delta : c);
  });
  tc.addEventListener("objectChange", () => {
    if (!dragging) return;
    if (mode === "scale") {
      // never through zero (a flip) and never absurd; the live size goes out
      for (const k of ["x", "y", "z"]) proxy.scale[k] = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.abs(proxy.scale[k])));
      onScaling?.(proxy.scale.clone(), cur?.size?.clone().multiply(proxy.scale));
    }
    place();
  });

  return {
    // attach(fid, { meshes, isCutter }) puts the gizmo on those meshes' centre
    attach(fid, { meshes, isCutter }) {
      this.detach();
      const box = new THREE.Box3();
      for (const m of meshes) box.expandByObject(m);
      if (box.isEmpty()) return false;
      const origin = box.getCenter(new THREE.Vector3());
      proxy.position.copy(origin);
      proxy.quaternion.identity();
      proxy.scale.set(1, 1, 1);
      proxy.updateMatrixWorld(true);
      let ghosts = null;
      if (isCutter) {
        ghosts = meshes.map((m) => {
          const g = new THREE.Mesh(m.geometry, ghostMat);
          g.matrixAutoUpdate = true;
          g.renderOrder = 995;
          ghostGroup.add(g);
          return g;
        });
        ghostGroup.visible = false;      // only while dragging
      }
      cur = { fid, origin, meshes, ghosts, size: box.getSize(new THREE.Vector3()) };
      tc.attach(proxy);
      this.setSnap(snap);
      return true;
    },
    detach() {
      if (cur && !dragging) place();
      clearGhosts();
      cur = null;
      tc.detach();
    },
    // "translate" | "rotate" | "scale"
    setMode(m) {
      mode = m;
      tc.setMode(m);
      reset();
    },
    get mode() { return mode; },
    // the attached shape's size (mm) and centre, for the scale panel
    get size() { return cur?.size?.clone() ?? null; },
    get origin() { return cur?.origin?.clone() ?? null; },
    get fid() { return cur?.fid ?? null; },
    get dragging() { return dragging; },
    // true while the pointer is over a gizmo handle or dragging one: the
    // viewer's own press handling (body drag, pick, orbit) stands aside
    ownsPointer() { return !!cur && (dragging || tc.axis !== null); },
    setSnap(mm) {
      snap = mm;
      tc.setTranslationSnap(snap || null);
      tc.setRotationSnap(snap ? THREE.MathUtils.degToRad(ROT_SNAP) : null);
      tc.setScaleSnap(snap ? 0.05 : null);
    },
    // the gizmo's own handles, for tests: names per mode
    handles: () => (gz ? Object.fromEntries(["translate", "rotate", "scale"].map((m) => [m, gz.gizmo[m].children.map((h) => h.name)])) : null),
    tc,
  };
}
