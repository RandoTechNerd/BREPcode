// The page's half of assemblies (src/assembly.js has the model's half).
//
// After a build, compile() has said which kernel features each copy of each
// part emitted. That is enough to give every mesh on screen an owner, and
// from there:
//
//   * the Parts card: what the model is made of, how many of each, colours;
//   * explode: each copy slides away from the middle (or along its own
//     `explode` vector), so a motor opens up like the drawing in a manual;
//   * Check fit: every pair of assembled copies intersected for real, the
//     overlaps painted red where they are and reported in mm³;
//   * Export parts: one STL per part, in its print pose and on the bed, a
//     parts.csv, and a true-curve STEP per part when the exact lane built it;
//   * Product shot: the assembled view re-lit on a white studio sweep, in
//     metal, copper or matte, with an optional cutaway wedge, as a PNG.
//
// The same functions answer the GUI buttons and the MCP tools, so what an
// assistant reports and what the person sees can't drift apart.

import * as THREE from "three";
import {
  instanceSoups, instanceLabel, checkFit, printPose, soupBounds, soupVolume, partsCSV, soupToBinarySTL, fileStem,
} from "../src/assembly.js";

const FINISHES = {
  metal: { color: 0xb9bec6, metalness: 1, roughness: 0.32, tint: 0.35 },
  steel: { color: 0x9aa1ab, metalness: 1, roughness: 0.42, tint: 0.2 },
  aluminium: { color: 0xd4d8de, metalness: 1, roughness: 0.28, tint: 0.25 },
  copper: { color: 0xb8733a, metalness: 1, roughness: 0.3, tint: 0 },
  brass: { color: 0xc9a54a, metalness: 1, roughness: 0.3, tint: 0 },
  matte: { metalness: 0, roughness: 0.82, tint: 1 },
  gloss: { metalness: 0, roughness: 0.25, clearcoat: 0.6, tint: 1 },
};
export const RENDER_PRESETS = ["studio", "metal", "copper", "matte"];

export function createAssemblyView(ctx) {
  const { scene, modelGroup } = ctx;
  let instances = [];        // partHistory.assembly: { name, index, count, world, ids, spec }
  let parts = [];            // one row per named part
  let owner = new Map();     // feature id -> instance index
  let centres = [];          // each copy's assembled centre
  let mid = new THREE.Vector3();
  let explodeT = 0;
  let soupCache = null;      // instance soups for THIS build
  let lastFit = null;
  const clashGroup = new THREE.Group();
  clashGroup.name = "fit-clashes";
  scene.add(clashGroup);

  const active = () => instances.length > 0;

  // ---- after every build -------------------------------------------------
  function update(asm) {
    instances = Array.isArray(asm) ? asm : [];
    soupCache = null;
    lastFit = null;
    clearClashes();
    parts = [];
    owner = new Map();
    const byName = new Map();
    instances.forEach((inst, k) => {
      for (const id of inst.ids) owner.set(id, k);
      if (!byName.has(inst.name)) {
        const row = { name: inst.name, count: inst.count, color: inst.spec?.color ?? null,
          finish: inst.spec?.finish ?? null, print: inst.spec?.print ?? "asis", first: k };
        byName.set(inst.name, row);
        parts.push(row);
      }
    });
    attach();
    ctx.onChange?.();
  }

  // Give every mesh its copy, measure where each copy sits, and put the
  // explode back where the slider has it.
  function attach() {
    const boxes = instances.map(() => new THREE.Box3());
    const all = new THREE.Box3();
    for (const m of modelGroup.children) {
      if (!m.isMesh) continue;
      const k = owner.get(m.userData.featureId);
      m.userData.asm = k;
      if (k === undefined || !m.geometry) continue;
      m.position.set(0, 0, 0);
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      boxes[k].union(m.geometry.boundingBox);
      all.union(m.geometry.boundingBox);
    }
    centres = boxes.map((b) => (b.isEmpty() ? null : b.getCenter(new THREE.Vector3())));
    mid = all.isEmpty() ? new THREE.Vector3() : all.getCenter(new THREE.Vector3());
    applyExplode();
  }

  function explodeOffset(k, t) {
    const inst = instances[k], c = centres[k];
    if (!c) return new THREE.Vector3();
    const own = inst.spec?.explode;
    if (Array.isArray(own)) {
      // a part's own direction, turned with the copy (so twelve pods each
      // slide out along their own spoke)
      const rot = new THREE.Matrix4().extractRotation(new THREE.Matrix4().fromArray(inst.world));
      return new THREE.Vector3(...own).applyMatrix4(rot).multiplyScalar(t);
    }
    return c.clone().sub(mid).multiplyScalar(t * 1.2);
  }

  function applyExplode() {
    for (const m of modelGroup.children) {
      const k = m.userData?.asm;
      if (k === undefined) continue;
      m.position.copy(explodeOffset(k, explodeT));
    }
    modelGroup.updateMatrixWorld(true);
    clashGroup.visible = explodeT === 0;
  }

  function setExplode(t) {
    explodeT = Math.max(0, Math.min(1, Number(t) || 0));
    applyExplode();
    ctx.onExplode?.(explodeT);
    return explodeT;
  }

  // ---- geometry ----------------------------------------------------------
  async function soups() {
    if (soupCache) return soupCache;
    const stl = await ctx.exportSTL();
    if (!stl) throw new Error("the kernel returned no mesh");
    soupCache = instanceSoups(instances, stl);
    return soupCache;
  }

  function need() {
    if (!active()) throw new Error("the model on screen is not an assembly — return assembly({ name: { shape, … }, … }) to get named parts");
  }

  // ---- fit check ---------------------------------------------------------
  function clearClashes() {
    for (const c of [...clashGroup.children]) { c.geometry?.dispose(); clashGroup.remove(c); }
  }
  const clashMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.85, depthTest: false });
  const clashEdge = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });

  async function fit({ minVolume = 0.01, paint = true } = {}) {
    need();
    const list = await soups();
    const { loadManifold, weld } = await import("../src/fizzcore.js");
    const wasm = await loadManifold();
    const items = instances.map((inst, k) => ({ label: instanceLabel(inst), soup: list[k] }));
    const r = await checkFit(wasm, weld, items, {
      minVolume,
      onProgress: (n, of) => ctx.setStatus?.("busy", `Checking fit… ${n} of ${of} pairs`),
    });
    clearClashes();
    if (paint) {
      if (explodeT) setExplode(0);
      for (const c of r.clashes) {
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(c.soup, 3));
        g.computeVertexNormals();
        const mesh = new THREE.Mesh(g, clashMat);
        mesh.renderOrder = 999;
        clashGroup.add(mesh);
        const box = new THREE.Box3Helper(new THREE.Box3().setFromBufferAttribute(g.attributes.position).expandByScalar(0.6), 0xff4d4d);
        box.material = clashEdge;
        box.renderOrder = 1000;
        clashGroup.add(box);
      }
    }
    lastFit = {
      ok: true, clear: r.clashes.length === 0, parts: r.parts, pairsChecked: r.pairsChecked, pairsTotal: r.pairsTotal,
      clashes: r.clashes.map(({ soup, ...c }) => c),
      notClosed: r.notClosed,
      totalOverlap: +r.clashes.reduce((n, c) => n + c.volume, 0).toFixed(3),
    };
    ctx.onChange?.();
    return lastFit;
  }

  // ---- export parts ------------------------------------------------------
  // One file per PART (not per copy): the copy that comes first, taken back
  // into the part's own frame, turned by its print setting and stood on the
  // bed. STEP is only offered when the exact lane built the model, because
  // that is what makes a true-curve STEP the same part as the STL.
  async function exportParts({ step = "auto", onProgress = null } = {}) {
    need();
    const list = await soups();
    const exact = ctx.getEngine?.()?.engine === "exact";
    const wantStep = step === true || (step === "auto" && exact);
    let curved = null;
    const files = [], rows = [], skipped = [];
    for (const p of parts) {
      const inst = instances[p.first];
      const stem = fileStem(p.name);
      const posed = printPose(list[p.first], inst.world, p.print);
      const [mn, mx] = soupBounds(posed.soup);
      const row = { name: p.name, count: p.count, size: mn.map((v, k) => mx[k] - v), volume: soupVolume(posed.soup),
        print: p.print, stl: `${stem}.stl`, step: "" };
      files.push({ name: row.stl, bytes: soupToBinarySTL(posed.soup, `BREPcode part ${p.name}`) });
      if (wantStep && inst.spec?.shape) {
        onProgress?.(`STEP for ${p.name}`);
        try {
          if (!curved) { curved = await ctx.getCurved(); await curved.loadReplicad(); }
          const local = new THREE.Matrix4().copy(posed.matrix).multiply(new THREE.Matrix4().fromArray(inst.world));
          // asmPart marks it as an assembly part, so edges picked by direction
          // keep meaning the part's own axes (curved.js edgePick)
          const blob = await curved.curvedStepBlob({ __brepscript: true, kind: "xform", matrix: local, child: inst.spec.shape,
            asmPart: { name: p.name, index: 0, count: 1 } });
          row.step = `${stem}.step`;
          files.push({ name: row.step, bytes: new Uint8Array(await blob.arrayBuffer()) });
        } catch (e) { skipped.push(`${p.name}.step: ${String(e?.message || e).slice(0, 160)}`); }
      }
      rows.push(row);
    }
    const csv = partsCSV(rows);
    files.push({ name: "parts.csv", bytes: new TextEncoder().encode(csv) });
    return {
      files, csv, skipped, step: wantStep,
      parts: rows.map((r) => ({ ...r, size: r.size.map((v) => +v.toFixed(2)), volume: +r.volume.toFixed(1) })),
    };
  }

  // ---- product shot ------------------------------------------------------
  function partOf(mesh) { const k = mesh.userData?.asm; return k === undefined ? null : instances[k]; }

  function shotMaterial(mesh, preset, planes) {
    const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const base = src?.color ? src.color.clone() : new THREE.Color(0x9fb4d6);
    const want = preset === "studio" ? (partOf(mesh)?.spec?.finish || "matte") : preset;
    const f = FINISHES[want] || FINISHES.matte;
    const color = f.color != null ? new THREE.Color(f.color).lerp(base, f.tint ?? 0) : base;
    return new THREE.MeshPhysicalMaterial({
      color, metalness: f.metalness, roughness: f.roughness, clearcoat: f.clearcoat || 0,
      clippingPlanes: planes, clipIntersection: true, side: THREE.FrontSide,
    });
  }

  async function render({
    preset = "studio", cutaway = false, width = 1600, height = 1200, background = "#ffffff", view = null, explode = null,
  } = {}) {
    if (!modelGroup.children.length) throw new Error("nothing on screen to render — build a model first");
    if (!RENDER_PRESETS.includes(preset)) throw new Error(`preset must be one of ${RENDER_PRESETS.join(", ")}`);
    width = Math.max(64, Math.min(4096, Math.round(width)));
    height = Math.max(64, Math.min(4096, Math.round(height)));
    const before = explodeT;
    if (explode != null && active()) setExplode(explode);
    if (view) ctx.snapView?.(view);
    // The reflections are made by THIS renderer: a PMREM texture belongs to
    // the WebGL context that built it, and the main view's left every metal
    // in the shot reflecting nothing, which reads as black.
    const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.04).texture;

    const shot = new THREE.Scene();
    shot.background = new THREE.Color(background);
    shot.environment = env;
    const box = new THREE.Box3().setFromObject(modelGroup);
    const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.length() / 2, 1);

    // The view's direction, but framed on the model: the window's own camera
    // is shifted to keep the model clear of open panels, and its aspect is
    // the window's, so copying it left the motor small in one corner.
    const cam = ctx.camera.clone();
    cam.aspect = width / height;
    const dir = ctx.camera.getWorldDirection(new THREE.Vector3()).negate();
    let dist = r * 3;
    const corner = new THREE.Vector3();
    for (let pass = 0; pass < 4; pass++) {
      cam.position.copy(c).addScaledVector(dir, dist);
      cam.lookAt(c);
      cam.near = Math.max(dist - r * 2, r / 100); cam.far = dist + r * 4;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld(true);
      let ext = 0;
      for (let i = 0; i < 8; i++) {
        corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
        ext = Math.max(ext, Math.abs(corner.x), Math.abs(corner.y));
      }
      if (!(ext > 0)) break;
      dist *= ext * 1.12;
    }
    cam.position.copy(c).addScaledVector(dir, dist);
    cam.lookAt(c);
    cam.near = Math.max(dist - r * 2, r / 100); cam.far = dist + r * 4;
    cam.updateProjectionMatrix();

    // the wedge faces the camera, so the cut is what you look into
    let planes = [];
    if (cutaway) {
      const d = new THREE.Vector3().subVectors(cam.position, c).setZ(0);
      if (d.lengthSq() < 1e-9) d.set(1, -1, 0);
      d.normalize();
      const turn = (deg) => d.clone().applyAxisAngle(new THREE.Vector3(0, 0, 1), deg * Math.PI / 180);
      planes = [turn(45), turn(-45)].map((a) => new THREE.Plane(a.clone().negate(), a.dot(c)));
    }

    const made = [];
    const section = new THREE.MeshBasicMaterial({ color: 0xd8493a, side: THREE.BackSide, clippingPlanes: planes, clipIntersection: true });
    for (const m of modelGroup.children) {
      if (!m.isMesh || !m.visible || !m.geometry) continue;
      const mat = shotMaterial(m, preset, planes);
      made.push(mat);
      const add = (material) => {
        const s = new THREE.Mesh(m.geometry, material);
        s.matrixAutoUpdate = false;
        s.matrix.copy(m.matrixWorld);
        s.castShadow = true; s.receiveShadow = true;
        shot.add(s);
      };
      add(mat);
      if (cutaway) add(section);      // inside faces, seen only through the cut: reads as a solid section
    }

    // studio: a soft sky/floor fill, a key that casts the floor shadow, a rim
    shot.add(new THREE.HemisphereLight(0xffffff, 0xd9dde3, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    const side = new THREE.Vector3().subVectors(cam.position, c).normalize();
    key.position.copy(c).add(new THREE.Vector3(-side.y, side.x, 0).multiplyScalar(r * 1.2)).add(new THREE.Vector3(0, 0, r * 2.4));
    key.target.position.copy(c);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -r * 1.6, right: r * 1.6, top: r * 1.6, bottom: -r * 1.6, near: 0.1, far: r * 8 });
    key.shadow.bias = -0.0004;
    shot.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xffffff, 0.9);
    rim.position.copy(c).addScaledVector(side, -r * 2).add(new THREE.Vector3(0, 0, r));
    shot.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(r * 12, r * 12), new THREE.ShadowMaterial({ opacity: 0.16 }));
    floor.position.set(c.x, c.y, box.min.z - 0.02);
    floor.receiveShadow = true;
    shot.add(floor);

    try {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
      renderer.localClippingEnabled = true;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.render(shot, cam);
      const dataUrl = renderer.domElement.toDataURL("image/png");
      return { ok: true, width, height, preset, cutaway: !!cutaway, png: dataUrl.slice(dataUrl.indexOf(",") + 1) };
    } finally {
      for (const m of made) m.dispose();
      section.dispose();
      floor.geometry.dispose(); floor.material.dispose();
      key.shadow.map?.dispose();
      env.dispose(); pmrem.dispose(); room.dispose?.();
      renderer.dispose();
      renderer.forceContextLoss();
      if (explode != null && active()) setExplode(before);
    }
  }

  function summary() {
    if (!active()) return null;
    return {
      parts: parts.map((p) => ({ name: p.name, count: p.count, color: p.color, finish: p.finish, print: p.print })),
      copies: instances.length,
      explode: explodeT,
      lastFit: lastFit ? { clear: lastFit.clear, clashes: lastFit.clashes.length, totalOverlap: lastFit.totalOverlap } : null,
    };
  }

  return {
    update, attach, setExplode, fit, exportParts, render, summary, clearClashes,
    get active() { return active(); }, get parts() { return parts; }, get instances() { return instances; },
    get explode() { return explodeT; }, get lastFit() { return lastFit; },
    get clashMeshes() { return clashGroup.children.filter((c) => c.isMesh).length; },
  };
}
