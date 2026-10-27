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
// The preview HOLDS a released change until the build of it lands: the
// meshes stay where they were dropped (the change is kept on each mesh as
// userData.designHeld) instead of jumping back to where the old code put
// them and then forward again, and the gizmo stays on the dropped shape, so
// it can be dragged again while the kernel works. A build hands over new
// meshes, which carry no hold; a failed build calls dropHolds().
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

  let cur = null;        // { fid, origin, meshes, ghosts, size, held }
  let base = null;       // the stand-in's position when this drag began: its pivot
  let dragging = false;
  let snap = 1;
  let mode = "translate";
  let lastAxis = null;

  const isHeld = (m) => !!m && !m.equals(new THREE.Matrix4());
  // this drag so far, as a matrix about the pivot
  const dragMatrix = () => {
    const m = new THREE.Matrix4();
    if (!cur || !base) return m;
    if (mode === "translate") return m.makeTranslation(proxy.position.x - base.x, proxy.position.y - base.y, proxy.position.z - base.z);
    const inner = mode === "rotate" ? new THREE.Matrix4().makeRotationFromQuaternion(proxy.quaternion)
      : new THREE.Matrix4().makeScale(proxy.scale.x, proxy.scale.y, proxy.scale.z);
    return m.makeTranslation(base.x, base.y, base.z).multiply(inner).multiply(new THREE.Matrix4().makeTranslation(-base.x, -base.y, -base.z));
  };
  // the stand-in's change since the drag began, as what will be written
  const change = () => {
    if (!cur) return null;
    if (mode === "translate") return { mode, delta: proxy.position.clone().sub(base) };
    if (mode === "rotate") {
      // the signed turn about each axis, read as axis-angle: an Euler read
      // wrote a 120 degree turn about Y as 60 (x=180, y=60, z=180)
      const q = proxy.quaternion;
      const a = [q.x, q.y, q.z].map((v) => THREE.MathUtils.radToDeg(2 * Math.atan2(v, q.w)));
      const ax = { X: 0, Y: 1, Z: 2 }[lastAxis] ?? a.reduce((b, v, i) => (Math.abs(v) > Math.abs(a[b]) ? i : b), 0);
      let deg = a[ax];
      if (deg > 180) deg -= 360; else if (deg < -180) deg += 360;
      return { mode, axis: ax, deg: Math.round(deg * 100) / 100, about: base.clone() };
    }
    const f = [proxy.scale.x, proxy.scale.y, proxy.scale.z].map((v) => Math.round(v * 1000) / 1000);
    return { mode, factor: f.every((v) => v === f[0]) ? f[0] : f, about: base.clone() };
  };
  // the preview: meshes (or ghosts) where the code puts them, then the held
  // changes, then this drag
  const place = () => {
    if (!cur) return;
    const m = (dragging ? dragMatrix() : new THREE.Matrix4()).multiply(cur.held);
    for (const g of cur.ghosts || cur.meshes) m.decompose(g.position, g.quaternion, g.scale);
    if (!cur.ghosts) for (const g of cur.meshes) g.userData.designHeld = cur.held.clone();
    for (const g of cur.ghosts || []) g.visible = dragging || isHeld(cur.held);
  };
  // ghosts go with their selection, except a held cutter's: they show where
  // it was dropped until the build (or a failure) replaces the meshes they copy
  const clearGhosts = ({ keepHeld = false } = {}) => {
    for (const g of [...ghostGroup.children]) {
      if (keepHeld && isHeld(g.userData.held) && g.userData.src?.parent) continue;
      ghostGroup.remove(g);
    }
  };
  const resetTurn = () => {
    if (!cur) return;
    proxy.quaternion.identity();
    proxy.scale.set(1, 1, 1);
    if (base) proxy.position.copy(base);
  };
  const makeGhosts = (meshes, held) => meshes.map((m) => {
    const g = new THREE.Mesh(m.geometry, ghostMat);
    g.matrixAutoUpdate = true;
    g.renderOrder = 995;
    g.userData = { src: m, held };
    ghostGroup.add(g);
    return g;
  });

  tc.addEventListener("dragging-changed", (e) => {
    const was = dragging;
    dragging = !!e.value;
    if (dragging) { lastAxis = tc.axis; base = proxy.position.clone(); }
    orbit.enabled = !dragging;
    onDragging?.(dragging);
    if (dragging || !cur || !was) { place(); return; }
    const c = change();
    const moved = !!c && (c.mode === "translate" ? c.delta.lengthSq() > 1e-8 : c.mode === "rotate" ? Math.abs(c.deg) > 1e-6
      : [c.factor].flat().some((v) => Math.abs(v - 1) > 1e-6));
    if (moved) {
      // hold it: the drop is where the shape stays until its build lands
      c.matrix = dragMatrix();
      cur.held = c.matrix.clone().multiply(cur.held);
      for (const g of cur.ghosts || []) g.userData.held = cur.held.clone();
      if (c.mode === "translate") base = proxy.position.clone();
    }
    resetTurn();
    place();
    if (moved) onRelease?.(cur.fid, c.mode === "translate" ? Object.assign(c.delta, { matrix: c.matrix }) : c);
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

  // where the code puts these meshes (a held mesh's own matrix is the hold)
  const codeBox = (meshes) => {
    const box = new THREE.Box3();
    for (const m of meshes) {
      const g = m.geometry;
      if (!g) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      m.parent?.updateWorldMatrix(true, false);
      box.union(g.boundingBox.clone().applyMatrix4(m.parent ? m.parent.matrixWorld : new THREE.Matrix4()));
    }
    return box;
  };

  return {
    // attach(fid, { meshes, isCutter }) puts the gizmo on those meshes' centre
    // (where a held change dropped them, if it did)
    attach(fid, { meshes, isCutter }) {
      this.detach();
      const box = codeBox(meshes);
      if (box.isEmpty()) return false;
      const held = isCutter
        ? ghostGroup.children.find((g) => meshes.includes(g.userData.src) && isHeld(g.userData.held))?.userData.held.clone() ?? new THREE.Matrix4()
        : meshes[0].userData.designHeld?.clone() ?? new THREE.Matrix4();
      const at = box.clone().applyMatrix4(held);
      const origin = box.getCenter(new THREE.Vector3()).applyMatrix4(held);
      proxy.position.copy(origin);
      proxy.quaternion.identity();
      proxy.scale.set(1, 1, 1);
      proxy.updateMatrixWorld(true);
      base = origin.clone();
      let ghosts = null;
      if (isCutter) {
        for (const g of [...ghostGroup.children]) if (meshes.includes(g.userData.src)) ghostGroup.remove(g);
        ghosts = makeGhosts(meshes, held.clone());
      }
      cur = { fid, origin, meshes, ghosts, size: at.getSize(new THREE.Vector3()), held };
      place();
      tc.attach(proxy);
      this.setSnap(snap);
      return true;
    },
    detach() {
      if (cur && !dragging) place();
      clearGhosts({ keepHeld: true });
      cur = null;
      tc.detach();
    },
    // A build landed under a drag: the new meshes already show every change
    // released before it, so the hold starts over and only the drag rides on.
    rebase({ meshes, isCutter }) {
      if (!cur || !dragging) return;
      cur.held = new THREE.Matrix4();
      cur.meshes = meshes;
      if (cur.ghosts) {
        for (const g of cur.ghosts) ghostGroup.remove(g);
        cur.ghosts = isCutter ? makeGhosts(meshes, new THREE.Matrix4()) : null;
      }
      place();
    },
    // A change still to be written (it waited for a build) held on fresh
    // meshes: they show it until its own build lands.
    hold(fid, { meshes, isCutter }, matrix) {
      if (cur?.fid === fid) {
        cur.held = matrix.clone().multiply(cur.held);
        for (const g of cur.ghosts || []) g.userData.held = cur.held.clone();
        if (!dragging) {
          base = cur.origin.clone().applyMatrix4(matrix);
          cur.origin = base.clone();
          resetTurn();
        }
        place();
      } else if (!isCutter) {
        for (const m of meshes) {
          const h = matrix.clone().multiply(m.userData.designHeld ?? new THREE.Matrix4());
          h.decompose(m.position, m.quaternion, m.scale);
          m.userData.designHeld = h;
        }
      }
    },
    // the build failed: every held mesh goes back to where the code that
    // did build puts it
    dropHolds(meshes = []) {
      for (const m of meshes) {
        if (!m.userData?.designHeld) continue;
        delete m.userData.designHeld;
        m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
      }
      for (const g of [...ghostGroup.children]) if (!cur?.ghosts?.includes(g)) ghostGroup.remove(g);
      if (!cur) return;
      cur.held = new THREE.Matrix4();
      for (const g of cur.ghosts || []) g.userData.held = cur.held.clone();
      const box = codeBox(cur.meshes);
      cur.origin = box.getCenter(new THREE.Vector3());
      if (!dragging) { base = cur.origin.clone(); resetTurn(); }
      place();
    },
    // is anything still shown where it was dropped rather than where it was built?
    holding: () => (cur && isHeld(cur.held)) || ghostGroup.children.some((g) => isHeld(g.userData.held)),
    // "translate" | "rotate" | "scale"
    setMode(m) {
      mode = m;
      tc.setMode(m);
      resetTurn();
    },
    get mode() { return mode; },
    // the attached shape's size (mm) and centre, for the scale panel
    get size() { return cur?.size?.clone() ?? null; },
    get origin() { return base?.clone() ?? cur?.origin?.clone() ?? null; },
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
