// Two engines, one feature list.
//
// BREPcode compiles every model into the BREP.io feature list (ph.toJSON()).
// This runs that list on two engines that are each good at one thing:
//
//   EXACT lane  - the Rust BREP kernel (vendor/brep-kernel-rust). Primitives,
//                 sketches, extrude, revolve, booleans, fillet, chamfer. True
//                 curved surfaces, and 1.4-4x faster than the JS kernel on the
//                 example models.
//   MESH lane   - manifold-3d. Anything that came in as triangles (imported
//                 STLs, texture(), heightmap(), blobs) and every boolean that
//                 touches one. Rust sews each triangle into its own exact face,
//                 which made textures 4-6x slower than JS and refused a union
//                 of imported meshes outright; manifold is built for exactly
//                 this.
//
// Geometry only ever flows exact -> mesh. A feature is in the mesh lane when
// any solid it reads is a mesh; everything else runs exact. So a model with no
// mesh features is exact end to end, and the first texture or import turns
// that branch (and only that branch) into a mesh.
//
// This module is environment-free: the caller hands in the initialised Rust
// module and the manifold wasm, because Node, the page and a module worker
// each load them differently (a worker has no import map).
//
// Anything the engines cannot do throws EngineRefusal. The caller decides what
// that means; the viewer worker and the CLI fall back to the JS kernel.

export class EngineRefusal extends Error {
  constructor(message, lane) {
    super(message);
    this.name = "EngineRefusal";
    this.lane = lane;
  }
}

// ------------------------------------------------------------- the dialect
//
// The Rust kernel reads the same feature codes as the JS kernel but differs in
// four places. Each one fails SILENTLY if left alone (wrong geometry, no
// error), which is why they are fixed here rather than discovered per model.
// Measured against the JS kernel on the examples, 2026-10-17.
export function toRustDialect(doc) {
  const rename = new Map();
  const r = (n) => (typeof n === "string" && rename.has(n) ? rename.get(n) : n);
  for (const f of doc.features) {
    const p = f.inputParams || {};
    if (p.targetSolid != null) p.targetSolid = Array.isArray(p.targetSolid) ? p.targetSolid.map(r) : r(p.targetSolid);
    if (p.boolean?.targets) p.boolean.targets = p.boolean.targets.map(r);
    if (Array.isArray(p.solids)) p.solids = p.solids.map(r);

    // 1. Zero-length sketch edges: JS tolerates them, Rust refuses the
    //    profile ("degenerate profile loop"). Only plain line loops are
    //    rebuilt; a revolve names its axis by edge index, so its sketch is
    //    left exactly as written.
    const sk = f.type === "S" && f.persistentData?.sketch;
    if (sk && sk.geometries?.every((g) => g.type === "line")
        && !doc.features.some((g) => g.type === "R" && g.inputParams?.profile === p.id)) {
      const pts = sk.points.filter((q, i, a) => {
        const n = a[(i + 1) % a.length];
        return Math.hypot(q.x - n.x, q.y - n.y) > 1e-6;
      });
      sk.points = pts.map((q, i) => ({ ...q, id: i, fixed: i === 0 }));
      sk.geometries = pts.map((_, i) => ({ id: 100 + i, type: "line", points: [i, (i + 1) % pts.length], construction: false }));
    }
    // IMPORT3D's STEP lane: Rust reads `stepText` and refuses a feature
    // carrying two sources; `fileToImport` is the JS kernel's copy.
    if (f.type === "IMPORT3D" && typeof p.stepText === "string") delete p.fileToImport;
    // 2. Extrude direction: JS sends `distanceBack` along +normal, Rust
    //    sends `distance` that way.
    if (f.type === "E") {
      const fwd = p.distanceBack ?? 0, back = p.distance ?? 0;
      p.distance = fwd;
      p.distanceBack = back;
    }
    // 3. Transform: JS reads flat translate/rotateEulerDeg/scale, Rust reads
    //    a nested transform block and ignores the flat names.
    if (f.type === "XFORM") {
      p.transform ??= { position: p.translate ?? [0, 0, 0], rotationEuler: p.rotateEulerDeg ?? [0, 0, 0], scale: p.scale ?? [1, 1, 1] };
    }
    // 4. UNION/INTERSECT result name: JS keeps the target's, Rust takes the
    //    first tool's. Later references to the target follow the rename.
    if (f.type === "B" && (p.boolean?.operation === "UNION" || p.boolean?.operation === "INTERSECT") && p.boolean.targets?.length) {
      const tgt = Array.isArray(p.targetSolid) ? p.targetSolid[0] : p.targetSolid;
      const to = p.boolean.targets[0];
      rename.set(tgt, to);
      for (const [k, v] of rename) if (v === tgt) rename.set(k, to);
    }
  }
  polygonCylinders(doc);
  return { doc, rename };
}

// 5. Low-$fn cylinders. The JS kernel facets every cylinder with `resolution`
//    sides, and OpenSCAD habit leans on it: cylinder($fn=6) IS a hex nut,
//    $fn=3 a triangle. Rust builds a true circle whatever the resolution, so
//    a nut pocket came out round (and the nut bound in it). At or below
//    POLYGON_MAX sides the cylinder is rebuilt as an extruded polygon, corners
//    exactly where the JS kernel puts them; above it the exact circle stays,
//    which is the point of the exact lane.
const POLYGON_MAX = 16;
const DEG = Math.PI / 180;
function eulerXYZ([x, y, z]) {
  const [a, b, c] = [x * DEG, y * DEG, z * DEG];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
function toEulerXYZ(m) {
  const y = Math.asin(Math.max(-1, Math.min(1, m[0][2])));
  const [x, z] = Math.abs(m[0][2]) < 0.9999999
    ? [Math.atan2(-m[1][2], m[2][2]), Math.atan2(-m[0][1], m[0][0])]
    : [Math.atan2(m[2][1], m[1][1]), 0];
  return [x / DEG, y / DEG, z / DEG];
}
const mul3 = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));

function polygonCylinders(doc) {
  const out = [];
  for (const f of doc.features) {
    const p = f.inputParams || {};
    const n = Number(p.resolution);
    if (f.type === "P.CO" && n >= 3 && n <= POLYGON_MAX) {
      throw new EngineRefusal(`a ${n}-sided cone ($fn=${n}) would come out round on the Rust kernel`, "exact");
    }
    if (f.type !== "P.CY" || !(n >= 3 && n <= POLYGON_MAX)) { out.push(f); continue; }
    if (p.boolean?.targets?.length && p.boolean.operation !== "NONE") {
      throw new EngineRefusal(`a ${n}-sided cylinder with its own boolean isn't converted yet`, "exact");
    }
    const id = p.id, r = Number(p.radius), h = Number(p.height);
    // JS corners: angle 360/n * k in the cylinder's local XZ plane, axis +Y.
    // The sketch sits on XY and extrudes +Z; Rx(-90) carries (px, py, 0) to
    // (px, 0, -py) and +Z to +Y, so py = -r sin(a).
    const pts = Array.from({ length: n }, (_, k) => {
      const a = (2 * Math.PI * k) / n;
      return [r * Math.cos(a), -r * Math.sin(a)];
    });
    const t = p.transform || {};
    const [sx, sy, sz] = t.scale || [1, 1, 1];
    const rot = mul3(eulerXYZ(t.rotationEuler || [0, 0, 0]), eulerXYZ([-90, 0, 0]));
    out.push(
      { type: "P", inputParams: { id: `${id}__P`, orientation: "XY" }, persistentData: {} },
      { type: "S", inputParams: { id: `${id}__S`, sketchPlane: `${id}__P` }, persistentData: { sketch: {
        points: pts.map(([x, y], i) => ({ id: i, x, y, fixed: i === 0 })),
        geometries: pts.map((_, i) => ({ id: 100 + i, type: "line", points: [i, (i + 1) % n], construction: false })),
        constraints: [{ id: 0, type: "⏚", points: [0] }],
      } } },
      // already in the Rust dialect: `distance` runs along +normal
      { type: "E", inputParams: { id, profile: `${id}__S`, distance: h, distanceBack: 0, boolean: { targets: [], operation: "NONE" } }, persistentData: {} },
      { type: "XFORM", inputParams: { id: `${id}__X`, solids: [id], transform: {
        position: t.position || [0, 0, 0], rotationEuler: toEulerXYZ(rot), scale: [sx, sz, sy],
      } }, persistentData: {} },
    );
  }
  doc.features = out;
}

// ------------------------------------------------------------ lane routing

const readsOf = (f) => {
  const p = f.inputParams || {};
  const out = [];
  const t = p.targetSolid;
  if (t != null) out.push(...(Array.isArray(t) ? t : [t]));
  if (p.boolean?.targets) out.push(...p.boolean.targets);
  if (Array.isArray(p.solids)) out.push(...p.solids);
  return out.filter((x) => typeof x === "string");
};

// Fillet/chamfer name edges by FACE name, and a face name starts with the
// feature that made the solid ("P.CU1_PX").
const edgeOwners = (f, names) => {
  const edges = f.inputParams?.edges;
  if (!Array.isArray(edges)) return [];
  return [...names].filter((n) => edges.some((e) => typeof e === "string" && (e === n || e.startsWith(`${n}_`))));
};

export function planLanes(features) {
  const meshNames = new Set();
  const meshFeatures = new Set();
  for (const f of features) {
    const id = f.inputParams?.id;
    if (f.type === "IMPORT3D") {
      // An exact import (STEP text, e.g. an STL converted on drop) is exact
      // geometry like any primitive; only a mesh import starts the mesh lane.
      if (typeof f.inputParams?.stepText === "string") continue;
      meshFeatures.add(id);
      meshNames.add(id);
      continue;
    }
    const touches = readsOf(f).some((n) => meshNames.has(n)) || edgeOwners(f, meshNames).length > 0;
    if (!touches) continue;
    if (f.type === "F" || f.type === "CH") {
      throw new EngineRefusal(`${f.type === "F" ? "fillet" : "chamfer"}() on a mesh: a mesh has no exact edges to round. Round the part before adding texture or mesh features.`, "mesh");
    }
    if (f.type !== "B" && f.type !== "XFORM") {
      throw new EngineRefusal(`feature ${f.type} (${id}) can't take a mesh as input yet`, "mesh");
    }
    meshFeatures.add(id);
    if (f.type === "B") {
      const t = f.inputParams.targetSolid;
      meshNames.add(Array.isArray(t) ? t[0] : t);
    } else {
      const p = f.inputParams;
      for (const s of p.solids || []) meshNames.add(p.copy ? `${s}_${id}` : s);
    }
  }
  return { meshFeatures, meshNames };
}

// --------------------------------------------------------------- geometry

// Three.js Euler order "XYZ" (what both kernels document): R = Rx * Ry * Rz.
function trsMatrix(t = [0, 0, 0], deg = [0, 0, 0], s = [1, 1, 1], pivot = [0, 0, 0]) {
  const [a, b, c] = deg.map((d) => (d * Math.PI) / 180);
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  const R = [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
  // M = T(t) T(p) R S T(-p), column-major 4x4 for manifold
  const RS = R.map((row) => row.map((v, j) => v * s[j]));
  const off = [0, 1, 2].map((i) => t[i] + pivot[i] - (RS[i][0] * pivot[0] + RS[i][1] * pivot[1] + RS[i][2] * pivot[2]));
  return [
    RS[0][0], RS[1][0], RS[2][0], 0,
    RS[0][1], RS[1][1], RS[2][1], 0,
    RS[0][2], RS[1][2], RS[2][2], 0,
    off[0], off[1], off[2], 1,
  ];
}

function stlSoup(text) {
  const out = [];
  for (const m of text.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) out.push(+m[1], +m[2], +m[3]);
  return new Float32Array(out);
}

// Triangle soup -> manifold. STL repeats every corner per triangle; manifold
// needs them welded to see a closed solid.
function soupToManifold(mf, soup, what) {
  const map = new Map(), verts = [], tris = [];
  const q = 1e4;
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${Math.round(soup[i] * q)},${Math.round(soup[i + 1] * q)},${Math.round(soup[i + 2] * q)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(soup[i], soup[i + 1], soup[i + 2]); }
    tris.push(id);
  }
  const keep = [];
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    if (a !== b && b !== c && a !== c) keep.push(a, b, c);
  }
  return indexedToManifold(mf, new Float32Array(verts), new Uint32Array(keep), what);
}

function indexedToManifold(mf, verts, tris, what) {
  const mesh = new mf.Mesh({ numProp: 3, vertProperties: verts, triVerts: tris });
  mesh.merge();
  let solid;
  try { solid = new mf.Manifold(mesh); }
  catch (e) { throw new EngineRefusal(`${what} isn't a closed solid (${e?.message || e})`, "mesh"); }
  if (solid.status && solid.status() !== "NoError") throw new EngineRefusal(`${what} isn't a closed solid (${solid.status()})`, "mesh");
  return solid.asOriginal();
}

// Rust tessellation -> one buffer set per B-rep face, named like the JS
// kernel's faces so colours and click-to-code keep working.
function exactFaces(rk, handle, faceNames, tol) {
  const m = rk.tessellate_handle(handle, tol);
  const P = m.take_positions(), N = m.take_normals(), I = m.take_indices(), F = m.take_face_ids();
  const names = new Map(faceNames.map(([id, name]) => [Number(id), name]));
  const groups = new Map();
  for (let t = 0; t < I.length / 3; t++) {
    const id = F[t];
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(t);
  }
  const faces = [];
  for (const [id, tris] of groups) {
    const remap = new Map(), pos = [], nrm = [], idx = [];
    for (const t of tris) for (let k = 0; k < 3; k++) {
      const v = I[3 * t + k];
      let n = remap.get(v);
      if (n === undefined) {
        n = pos.length / 3; remap.set(v, n);
        pos.push(P[3 * v], P[3 * v + 1], P[3 * v + 2]);
        nrm.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]);
      }
      idx.push(n);
    }
    faces.push({ name: names.get(id) || `FACE_${id}`, positions: new Float32Array(pos), normals: new Float32Array(nrm), index: new Uint32Array(idx) });
  }
  return faces;
}

// Manifold -> one flat-shaded face per SOURCE solid, using manifold's run
// provenance, so a box with a textured sphere cut out of it still colours as
// the box where it is the box.
function meshFaces(solid, sourceOf) {
  const m = solid.getMesh();
  const V = m.vertProperties, np = m.numProp, T = m.triVerts;
  const runs = m.runIndex && m.runOriginalID?.length ? m.runOriginalID.length : 0;
  const spans = runs
    ? [...m.runOriginalID].map((oid, i) => [oid, m.runIndex[i], m.runIndex[i + 1]])
    : [[-1, 0, T.length]];
  const byName = new Map();
  for (const [oid, a, b] of spans) {
    const name = `${sourceOf.get(oid) || "MESH"}_MESH`;
    if (!byName.has(name)) byName.set(name, { pos: [], nrm: [] });
    const g = byName.get(name);
    for (let i = a; i < b; i += 3) {
      const p = [0, 1, 2].map((k) => [V[T[i + k] * np], V[T[i + k] * np + 1], V[T[i + k] * np + 2]]);
      const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const w = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const len = Math.hypot(...n) || 1;
      n = n.map((x) => x / len);
      for (const q of p) { g.pos.push(...q); g.nrm.push(...n); }
    }
  }
  return [...byName].map(([name, g]) => ({ name, positions: new Float32Array(g.pos), normals: new Float32Array(g.nrm), index: null }));
}

// ------------------------------------------------------------------ run it

/**
 * @param {string|object} json  ph.toJSON() output
 * @param {{rust: object, manifold?: object|(() => Promise<object>), tolerance?: number}} deps
 *   rust: the initialised vendor/brep-kernel-rust module
 *   manifold: the set-up manifold-3d wasm, or a loader for it (only called
 *             when the model has mesh features)
 */
export async function runEngine(json, { rust: rk, manifold, tolerance = 0.05 } = {}) {
  const src = typeof json === "string" ? JSON.parse(json) : structuredClone(json);
  const features = src.features || [];
  const { meshFeatures } = planLanes(features);

  // EXACT lane: everything that never reads a mesh.
  const t0 = performance.now();
  const exactDoc = { ...src, features: features.filter((f) => !meshFeatures.has(f.inputParams?.id)) };
  const { doc, rename } = toRustDialect(structuredClone(exactDoc));
  let res;
  try { res = JSON.parse(rk.execute_history_json(JSON.stringify(doc))); }
  catch (e) { throw new EngineRefusal(`Rust kernel: ${e?.message || e}`, "exact"); }
  const live = new Map();
  for (const r of res.results) {
    if (r.error) throw new EngineRefusal(`Rust kernel, ${r.feature_type} ${r.id}: ${r.error}`, "exact");
    for (const n of r.removed) live.delete(n);
    for (const a of r.added) live.set(a.name, a);
  }
  const exactMs = performance.now() - t0;

  // MESH lane: walk the mesh features in order, pulling exact solids across
  // (tessellated) the first time one is read.
  const t1 = performance.now();
  const meshes = new Map();
  const sourceOf = new Map();
  let mf = null;
  if (meshFeatures.size) {
    mf = typeof manifold === "function" ? await manifold() : manifold;
    if (!mf) throw new EngineRefusal("mesh features need manifold-3d, and none was provided", "mesh");
  }
  const take = (name) => {
    if (meshes.has(name)) { const m = meshes.get(name); meshes.delete(name); return m; }
    const rn = rename.has(name) ? rename.get(name) : name;
    const a = live.get(rn);
    if (!a) throw new EngineRefusal(`mesh step reads "${name}", which no earlier feature made`, "mesh");
    live.delete(rn);
    const m = rk.tessellate_handle(a.handle, tolerance);
    const P = m.take_positions(), I = m.take_indices();
    const solid = indexedToManifold(mf, Float32Array.from(P), Uint32Array.from(I), `"${name}"`);
    sourceOf.set(solid.originalID(), name);
    return solid;
  };
  for (const f of features) {
    const p = f.inputParams || {};
    if (!meshFeatures.has(p.id)) continue;
    if (f.type === "IMPORT3D") {
      const data = p.fileToImport;
      if (typeof data !== "string" || !/^\s*solid/.test(data)) {
        throw new EngineRefusal(`IMPORT3D ${p.id}: only ASCII STL text goes through the mesh lane`, "mesh");
      }
      let solid = soupToManifold(mf, stlSoup(data), `the import "${p.id}"`);
      sourceOf.set(solid.originalID(), p.id);
      if (p.centerMesh) {
        const bb = solid.boundingBox();
        solid = solid.translate([0, 1, 2].map((k) => -(bb.min[k] + bb.max[k]) / 2));
      }
      if (p.extractMultipleSolids) {
        const parts = solid.decompose();
        if (parts.length > 1) throw new EngineRefusal(`IMPORT3D ${p.id}: splitting a multi-part import isn't in the mesh lane yet`, "mesh");
      }
      meshes.set(p.id, solid);
    } else if (f.type === "B") {
      const tName = Array.isArray(p.targetSolid) ? p.targetSolid[0] : p.targetSolid;
      const op = p.boolean?.operation;
      const target = take(tName);
      const tools = (p.boolean?.targets || []).map(take);
      let out = target;
      if (tools.length) {
        if (op === "UNION") out = mf.Manifold.union([target, ...tools]);
        else if (op === "SUBTRACT") out = target.subtract(tools.length === 1 ? tools[0] : mf.Manifold.union(tools));
        else if (op === "INTERSECT") out = mf.Manifold.intersection([target, ...tools]);
      }
      meshes.set(tName, out);
    } else if (f.type === "XFORM") {
      for (const s of p.solids || []) {
        const solid = p.copy ? (meshes.has(s) ? meshes.get(s) : null) : take(s);
        if (!solid) throw new EngineRefusal(`XFORM copy of "${s}" isn't in the mesh lane yet`, "mesh");
        let pivot = [0, 0, 0];
        if (String(p.pivot || "").toUpperCase() === "BBOX_CENTER") {
          const bb = solid.boundingBox();
          pivot = [0, 1, 2].map((k) => (bb.min[k] + bb.max[k]) / 2);
        }
        meshes.set(p.copy ? `${s}_${p.id}` : s, solid.transform(trsMatrix(p.translate, p.rotateEulerDeg, p.scale, pivot)));
      }
    }
  }
  const meshMs = performance.now() - t1;

  // Report solids under the names the JS kernel would have used.
  const jsName = new Map();
  for (const [from, to] of rename) jsName.set(to, from);
  const solids = [];
  for (const a of live.values()) {
    solids.push({ name: jsName.get(a.name) || a.name, exact: true, handle: a.handle, faces: exactFaces(rk, a.handle, a.face_names, tolerance) });
  }
  for (const [name, solid] of meshes) {
    solids.push({ name, exact: false, faces: meshFaces(solid, sourceOf) });
  }
  if (!solids.length) throw new EngineRefusal("the model produced no solids", meshFeatures.size ? "mesh" : "exact");
  return {
    lane: meshFeatures.size ? "mesh" : "exact",
    solids,
    stats: {
      exactFeatures: exactDoc.features.length, meshFeatures: meshFeatures.size,
      exactMs: Math.round(exactMs), meshMs: Math.round(meshMs),
    },
  };
}

// ASCII STL in the same shape the JS kernel's Solid.toSTL() writes, so every
// downstream converter (OBJ, 3MF, slicer) sees what it always saw.
export function solidsToSTL(solids, precision = 6) {
  const f = (x) => (Object.is(x, -0) ? 0 : +x.toFixed(precision));
  return solids.map((s, si) => {
    const name = s.name || `solid_${si}`;
    const lines = [`solid ${name}`];
    for (const face of s.faces) {
      const P = face.positions;
      const idx = face.index || Array.from({ length: P.length / 3 }, (_, i) => i);
      for (let t = 0; t < idx.length; t += 3) {
        const v = [idx[t], idx[t + 1], idx[t + 2]].map((i) => [P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
        const u = [0, 1, 2].map((k) => v[1][k] - v[0][k]), w = [0, 1, 2].map((k) => v[2][k] - v[0][k]);
        const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const len = Math.hypot(...n) || 1;
        lines.push(`facet normal ${n.map((x) => f(x / len)).join(" ")}`, "outer loop",
          ...v.map((q) => `vertex ${q.map(f).join(" ")}`), "endloop", "endfacet");
      }
    }
    lines.push(`endsolid ${name}`);
    return lines.join("\n");
  }).join("\n");
}
