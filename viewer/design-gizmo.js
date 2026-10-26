// design-gizmo.js — Design mode's move gizmo.
//
// three.js TransformControls on a stand-in object at the centre of the
// selected shape. Dragging an arrow or plane slides the shape's meshes (or, for
// a cutter, translucent ghosts of it: its own faces are the inside of a hole,
// and sliding those reads as the solid tearing) without touching the kernel.
// On release the move is handed back as one delta, which the shell writes into
// the code through the same writer as the body drag (design-move.js), so the
// code stays the only thing that says where anything is.

import { TransformControls } from "three/addons/controls/TransformControls.js";

export function createMoveGizmo({ THREE, scene, camera, renderer, orbit, onRelease, onDragging }) {
  const tc = new TransformControls(camera, renderer.domElement);
  tc.setMode("translate");
  tc.setSpace("world");
  tc.setSize(0.85);
  const helper = tc.getHelper();
  helper.name = "design-move-gizmo";
  scene.add(helper);
  const proxy = new THREE.Object3D();
  proxy.name = "design-move-proxy";
  scene.add(proxy);
  const ghostGroup = new THREE.Group();
  scene.add(ghostGroup);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xff7a45, transparent: true, opacity: 0.35, depthWrite: false });

  let cur = null;        // { fid, origin, meshes, ghosts }
  let dragging = false;
  let snap = 1;

  const delta = () => (cur ? proxy.position.clone().sub(cur.origin) : new THREE.Vector3());
  const place = (d) => {
    if (!cur) return;
    if (cur.ghosts) for (const g of cur.ghosts) g.position.copy(d);
    else for (const m of cur.meshes) m.position.copy(d);
  };
  const clearGhosts = () => {
    for (const g of [...ghostGroup.children]) ghostGroup.remove(g);
  };

  tc.addEventListener("dragging-changed", (e) => {
    dragging = !!e.value;
    orbit.enabled = !dragging;
    ghostGroup.visible = dragging && !!cur?.ghosts;
    onDragging?.(dragging);
    if (dragging || !cur) return;
    const d = delta();
    place(new THREE.Vector3());          // the rebuild puts it where the code says
    proxy.position.copy(cur.origin);
    if (d.lengthSq() > 1e-8) onRelease?.(cur.fid, d);
  });
  tc.addEventListener("objectChange", () => { if (dragging) place(delta()); });

  return {
    // attach(fid, { meshes, isCutter }) puts the gizmo on those meshes' centre
    attach(fid, { meshes, isCutter }) {
      this.detach();
      const box = new THREE.Box3();
      for (const m of meshes) box.expandByObject(m);
      if (box.isEmpty()) return false;
      const origin = box.getCenter(new THREE.Vector3());
      proxy.position.copy(origin);
      proxy.updateMatrixWorld(true);
      let ghosts = null;
      if (isCutter) {
        ghosts = meshes.map((m) => {
          const g = new THREE.Mesh(m.geometry, ghostMat);
          g.matrixAutoUpdate = true;
          g.position.set(0, 0, 0);
          g.renderOrder = 995;
          g.visible = true;
          ghostGroup.add(g);
          return g;
        });
        ghostGroup.visible = false;      // only while dragging
      }
      cur = { fid, origin, meshes, ghosts };
      tc.attach(proxy);
      tc.setTranslationSnap(snap || null);
      return true;
    },
    detach() {
      if (cur && !dragging) place(new THREE.Vector3());
      clearGhosts();
      cur = null;
      tc.detach();
    },
    get fid() { return cur?.fid ?? null; },
    get dragging() { return dragging; },
    // true while the pointer is over a gizmo handle or dragging one: the
    // viewer's own press handling (body drag, pick, orbit) stands aside
    ownsPointer() { return !!cur && (dragging || tc.axis !== null); },
    setSnap(mm) { snap = mm; if (cur) tc.setTranslationSnap(snap || null); },
    tc,
  };
}
