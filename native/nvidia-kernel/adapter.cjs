// NVIDIA's SMLib kernel, dressed as the Rust kernel module.
//
// src/engine.js drives a kernel through four calls: execute_history_json()
// runs the feature list (already in the Rust dialect, see toRustDialect), and
// tessellate_handle() / face_names_handle() turn each resulting solid into
// named triangles. This file answers those same calls on the native SMLib
// addon (src/addon.cc), so the split engine, the mesh lane and every fallback
// run on it unchanged.
//
// What the Rust kernel gets for free and SMLib does not is FACE NAMES. BREPcode
// colours faces, maps a click back to the line of code, and picks fillet edges
// by the names of the two faces they join ("P.CU1_NX|P.CU1_PY[0]"). So every
// operation here names its result's faces the way the Rust kernel does:
//   primitives   by where each face points (P.CU1_PX, P.CY2_S/_B/_T, ...)
//   extrude      by which sketch curve made the wall (E3:S2:G101_SW) and caps
//   revolve      by profile curve (S2:G101_RV)
//   booleans     each face keeps the name of the input face it lies on
//                (the addon's matchFaces answers that exactly)
//   fillets      untouched faces keep their names, each new blend face is
//                named after the edge it rounds (F4:BLEND:<edge>)
//
// Anything it doesn't cover throws, and the caller takes that as a refusal:
// the model goes to the next kernel (the Rust one) instead.

const path = require("node:path");

const CANDIDATES = [
  path.join(__dirname, "build", "Release", "brepcode_nvidia.node"),
  path.join(__dirname, "..", "..", "vendor", "brep-kernel-nvidia", "brepcode_nvidia.node"),
  process.resourcesPath && path.join(process.resourcesPath, "app.asar.unpacked", "vendor", "brep-kernel-nvidia", "brepcode_nvidia.node"),
].filter(Boolean);

let cached;
function load() {
  if (cached !== undefined) return cached;
  cached = null;
  let lastError = null;
  for (const file of CANDIDATES) {
    try {
      cached = wrap(require(file));
      cached.file = file;
      break;
    } catch (e) { lastError = e; }
  }
  if (!cached) load.error = lastError ? String(lastError.message || lastError) : "not found";
  return cached;
}

const DEG = Math.PI / 180;
const MATCH_TOL = 1e-3;

function wrap(nk) {
  // handle -> face names by face index; every handle the last run made
  const names = new Map();
  let owned = [];
  const own = (h, faceNames) => { owned.push(h); names.set(h, faceNames); return h; };
  const freeAll = () => {
    for (const h of owned) { try { nk.free(h); } catch { /* already consumed */ } }
    owned = [];
    names.clear();
  };

  const faceInfo = (h) => {
    const a = nk.faces(h);
    const out = [];
    for (let i = 0; i < a.length; i += 6) out.push({ p: [a[i], a[i + 1], a[i + 2]], n: [a[i + 3], a[i + 4], a[i + 5]] });
    return out;
  };
  const edgeInfo = (h) => {
    const a = nk.edges(h);
    const out = [];
    for (let i = 0; i < a.length; i += 5) out.push({ fa: a[i], fb: a[i + 1], mid: [a[i + 2], a[i + 3], a[i + 4]] });
    return out;
  };

  // three.js Object3D order: v' = T * R * S * v, R = Rx * Ry * Rz ("XYZ").
  // As rotations about the world axes that is Z first, then Y, then X.
  function place(h, t = {}, pivot = [0, 0, 0]) {
    const s = t.scale || [1, 1, 1];
    const r = t.rotationEuler || [0, 0, 0];
    const p = t.position || [0, 0, 0];
    if (s.some((v) => !(v > 0))) throw new Error("a mirrored or zero scale isn't supported on the NVIDIA kernel yet");
    const moved = pivot.some((v) => v !== 0);
    if (moved) nk.translate(h, -pivot[0], -pivot[1], -pivot[2]);
    if (s[0] !== 1 || s[1] !== 1 || s[2] !== 1) nk.scale(h, s[0], s[1], s[2]);
    if (r[2]) nk.rotate(h, 0, 0, 0, 0, 0, 1, r[2]);
    if (r[1]) nk.rotate(h, 0, 0, 0, 0, 1, 0, r[1]);
    if (r[0]) nk.rotate(h, 0, 0, 0, 1, 0, 0, r[0]);
    const q = [p[0] + pivot[0], p[1] + pivot[1], p[2] + pivot[2]];
    if (q.some((v) => v !== 0)) nk.translate(h, q[0], q[1], q[2]);
  }

  // SMLib builds round primitives around +Z; BREP.io's stand on local +Y.
  const standOnY = (h) => nk.rotate(h, 0, 0, 0, 1, 0, 0, -90);

  function primitive(f) {
    const p = f.inputParams;
    if (p.boolean?.operation && p.boolean.operation !== "NONE" && p.boolean.targets?.length) {
      throw new Error(`${f.type} with its own boolean isn't supported on the NVIDIA kernel yet`);
    }
    const id = p.id;
    let h, label;
    if (f.type === "P.CU") {
      h = nk.box(+p.sizeX, +p.sizeY, +p.sizeZ);
      label = ({ n }) => {
        const k = [0, 1, 2].reduce((m, i) => (Math.abs(n[i]) > Math.abs(n[m]) ? i : m), 0);
        return `${id}_${n[k] > 0 ? "P" : "N"}${"XYZ"[k]}`;
      };
    } else if (f.type === "P.CY" || f.type === "P.CO") {
      h = f.type === "P.CY" ? nk.cylinder(+p.radius, +p.height) : nk.cone(+p.radiusBottom, +p.radiusTop, +p.height);
      label = ({ n }) => (n[2] < -0.99 ? `${id}_B` : n[2] > 0.99 ? `${id}_T` : `${id}_S`);
    } else if (f.type === "P.S") {
      h = nk.sphere(+p.radius);
      label = () => id;
    } else if (f.type === "P.T") {
      if (p.arc != null && Math.abs(+p.arc - 360) > 1e-9) throw new Error("a partial torus isn't supported on the NVIDIA kernel yet");
      h = nk.torus(+p.majorRadius, +p.tubeRadius);
      label = () => `${id}_Side`;
    }
    const faceNames = faceInfo(h).map(label);
    if (f.type !== "P.CU" && f.type !== "P.S") standOnY(h);
    own(h, faceNames);
    place(h, p.transform);
    return h;
  }

  // ------------------------------------------------------------ sketches
  const sketches = new Map();

  function sketch(f, planes) {
    const sk = f.persistentData?.sketch;
    const plane = planes.get(f.inputParams.sketchPlane);
    if (!sk) throw new Error(`sketch ${f.inputParams.id} has no geometry`);
    if (!plane || plane.orientation !== "XY" || +(plane.offset_distance || 0) !== 0 || plane.datum) {
      throw new Error("only sketches on the XY plane are supported on the NVIDIA kernel yet");
    }
    const pt = new Map(sk.points.map((q) => [q.id, [+q.x, +q.y]]));
    const geoms = sk.geometries.filter((g) => !g.construction).map((g) => {
      const ps = g.points.map((i) => pt.get(i));
      if (ps.some((q) => !q)) throw new Error(`sketch ${f.inputParams.id}: a curve names a missing point`);
      if (g.type === "line" && ps.length === 2) return { id: g.id, kind: 0, ps };
      if (g.type === "bezier" && ps.length === 4) return { id: g.id, kind: 1, ps };
      throw new Error(`sketch curve type "${g.type}" isn't supported on the NVIDIA kernel yet`);
    });
    sketches.set(f.inputParams.id, { geoms });
  }

  const seg3 = (g, z = 0) => [g.kind, ...g.ps.flatMap(([x, y]) => [x, y, z])];

  // the sketch curve nearest a point (in the sketch plane), for wall names
  function nearestGeom(geoms, [x, y]) {
    let best = null, bd = Infinity;
    for (const g of geoms) {
      const samples = g.kind === 0 ? 8 : 24;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        let q;
        if (g.kind === 0) q = [g.ps[0][0] + (g.ps[1][0] - g.ps[0][0]) * t, g.ps[0][1] + (g.ps[1][1] - g.ps[0][1]) * t];
        else {
          const u = 1 - t, b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
          q = [0, 1].map((k) => b.reduce((s, w, j) => s + w * g.ps[j][k], 0));
        }
        const d = Math.hypot(q[0] - x, q[1] - y);
        if (d < bd) { bd = d; best = g; }
      }
    }
    return best;
  }

  function extrude(f) {
    const p = f.inputParams;
    if (p.boolean?.operation && p.boolean.operation !== "NONE" && p.boolean.targets?.length) {
      throw new Error("an extrude with its own boolean isn't supported on the NVIDIA kernel yet");
    }
    const sk = sketches.get(p.profile);
    if (!sk) throw new Error(`extrude ${p.id}: no sketch "${p.profile}"`);
    const fwd = +(p.distance || 0), back = +(p.distanceBack || 0);
    if (!(fwd + back > 0)) throw new Error(`extrude ${p.id}: zero height`);
    const h = nk.extrude(sk.geoms.map((g) => seg3(g, -back)), 0, 0, 1, fwd + back);
    const first = sk.geoms[0]?.id;
    const faceNames = faceInfo(h).map(({ p: q, n }) => {
      if (Math.abs(n[2]) > 0.99) return `${p.id}:${p.profile}:PROFILE:L${first}_${q[2] < (fwd - back) / 2 ? "START" : "END"}`;
      return `${p.id}:${p.profile}:G${nearestGeom(sk.geoms, q).id}_SW`;
    });
    return own(h, faceNames);
  }

  function revolve(f) {
    const p = f.inputParams;
    if (p.boolean?.operation && p.boolean.operation !== "NONE" && p.boolean.targets?.length) {
      throw new Error("a revolve with its own boolean isn't supported on the NVIDIA kernel yet");
    }
    const sk = sketches.get(p.profile);
    if (!sk) throw new Error(`revolve ${p.id}: no sketch "${p.profile}"`);
    const m = /:G(\d+)$/.exec(String(p.axis || ""));
    const axis = m && sk.geoms.find((g) => g.id === +m[1]);
    if (!axis || axis.kind !== 0) throw new Error(`revolve ${p.id}: its axis must be a straight sketch line`);
    const [a, b] = axis.ps;
    const dir = [b[0] - a[0], b[1] - a[1], 0];
    const angle = +(p.angle ?? 360);
    const profile = sk.geoms.filter((g) => g !== axis);
    const h = nk.revolve(profile.map((g) => seg3(g)), a[0], a[1], 0, dir[0], dir[1], 0, angle);
    const faceNames = faceInfo(h).map(({ p: q, n }) => {
      // a part revolve has two flat caps, at the start and end angle
      if (Math.abs(angle) < 360 && Math.abs(n[2]) > 0.99 && Math.abs(q[2]) < 1e-6) return `${p.id}:${p.profile}:CAP_START`;
      // a point on a wall, swung back into the sketch plane, sits on its curve
      const r = Math.hypot(q[0] - a[0], q[2]);
      const g = nearestGeom(profile, [a[0] + Math.sign(q[0] - a[0] || 1) * r, q[1]]);
      return g ? `${p.profile}:G${g.id}_RV` : `${p.id}:${p.profile}:CAP_END`;
    });
    return own(h, faceNames);
  }

  // ------------------------------------------------------------ booleans
  function boolean(f, live) {
    const p = f.inputParams;
    const tName = Array.isArray(p.targetSolid) ? p.targetSolid[0] : p.targetSolid;
    const op = { UNION: 1, INTERSECT: 2, SUBTRACT: 3 }[p.boolean?.operation];
    if (!op) throw new Error(`boolean ${p.id}: operation "${p.boolean?.operation}" isn't supported`);
    const target = live.get(tName);
    if (!target) throw new Error(`boolean ${p.id}: no solid "${tName}"`);
    const tools = (p.boolean.targets || []).map((n) => {
      const s = live.get(n);
      if (!s) throw new Error(`boolean ${p.id}: no solid "${n}"`);
      return { n, h: s.h };
    });
    // the inputs as they were, to name the result's faces after
    const sources = [target.h, ...tools.map((t) => t.h)].map((h) => ({ h: nk.copy(h), names: names.get(h) }));
    try {
      for (const t of tools) nk.boolean(op, target.h, t.h);
      const match = nk.matchFaces(target.h, sources.map((s) => s.h), MATCH_TOL);
      const faceNames = [];
      for (let i = 0; i < match.length; i += 2) {
        const s = match[i], k = match[i + 1];
        faceNames.push(s >= 0 ? sources[s].names[k] : `${p.id}_FACE${i / 2}`);
      }
      names.set(target.h, faceNames);
    } finally {
      for (const s of sources) nk.free(s.h);
    }
    for (const t of tools) owned = owned.filter((h) => h !== t.h);
    // Rust dialect: UNION and INTERSECT hand the result the FIRST TOOL's name
    const resultName = op === 3 || !tools.length ? tName : tools[0].n;
    return { handle: target.h, resultName, removed: [tName, ...tools.map((t) => t.n)] };
  }

  // ------------------------------------------------------------- fillets
  function blend(f, live) {
    const p = f.inputParams;
    const edges = Array.isArray(p.edges) ? p.edges : [];
    const parsed = edges.map((e) => {
      const m = /^(.*)\|(.*)\[(\d+)\]$/.exec(String(e));
      if (!m) throw new Error(`${f.type} ${p.id}: edge "${e}" isn't in the FACE|FACE[n] form`);
      return { name: e, a: m[1], b: m[2], k: +m[3] };
    });
    if (!parsed.length) throw new Error(`${f.type} ${p.id}: no edges`);
    let owner = null;
    for (const [n, s] of live) {
      const fn = names.get(s.h) || [];
      if (fn.includes(parsed[0].a) && fn.includes(parsed[0].b)) { owner = { n, h: s.h, fn }; break; }
    }
    if (!owner) throw new Error(`${f.type} ${p.id}: no solid has faces ${parsed[0].a} and ${parsed[0].b}`);
    const info = edgeInfo(owner.h);
    const picks = parsed.map((e) => {
      const hits = [];
      info.forEach((ed, i) => {
        const pair = [owner.fn[ed.fa], owner.fn[ed.fb]];
        if ((pair[0] === e.a && pair[1] === e.b) || (pair[0] === e.b && pair[1] === e.a)) hits.push(i);
      });
      if (hits.length <= e.k) throw new Error(`${f.type} ${p.id}: edge ${e.name} not found`);
      return { ...e, index: hits[e.k], mid: info[hits[e.k]].mid };
    });
    const before = { h: nk.copy(owner.h), names: owner.fn };
    try {
      const size = f.type === "F" ? +p.radius : +p.distance;
      nk.fillet(owner.h, picks.map((e) => e.index), size, f.type === "F" ? 1 : 0);
      const match = nk.matchFaces(owner.h, [before.h], MATCH_TOL);
      const fi = faceInfo(owner.h);
      const faceNames = [];
      for (let i = 0; i < match.length; i += 2) {
        if (match[i] >= 0) { faceNames.push(before.names[match[i + 1]]); continue; }
        const q = fi[i / 2].p;
        let best = picks[0], bd = Infinity;
        for (const e of picks) {
          const d = Math.hypot(e.mid[0] - q[0], e.mid[1] - q[1], e.mid[2] - q[2]);
          if (d < bd) { bd = d; best = e; }
        }
        faceNames.push(`${p.id}:BLEND:${best.name}`);
      }
      names.set(owner.h, faceNames);
    } finally {
      nk.free(before.h);
    }
    return { handle: owner.h, resultName: owner.n, removed: [owner.n] };
  }

  // ------------------------------------------------------------ transforms
  function xform(f, live) {
    const p = f.inputParams;
    const out = [];
    for (const s of p.solids || []) {
      const src = live.get(s);
      if (!src) throw new Error(`XFORM ${p.id}: no solid "${s}"`);
      let h = src.h;
      if (p.copy) { h = own(nk.copy(src.h), [...names.get(src.h)]); }
      let pivot = [0, 0, 0];
      if (String(p.pivot || "").toUpperCase() === "BBOX_CENTER") {
        const fi = faceInfo(h).map((x) => x.p);
        const lo = [0, 1, 2].map((k) => Math.min(...fi.map((q) => q[k])));
        const hi = [0, 1, 2].map((k) => Math.max(...fi.map((q) => q[k])));
        pivot = lo.map((v, k) => (v + hi[k]) / 2);
        throw new Error("XFORM about the bounding-box centre isn't supported on the NVIDIA kernel yet");
      }
      place(h, p.transform || { position: p.translate, rotationEuler: p.rotateEulerDeg, scale: p.scale }, pivot);
      out.push({ handle: h, resultName: p.copy ? `${s}_${p.id}` : s, removed: p.copy ? [] : [s] });
    }
    return out;
  }

  // ---------------------------------------------------------- the history
  function execute(json) {
    freeAll();
    sketches.clear();
    const doc = typeof json === "string" ? JSON.parse(json) : json;
    const planes = new Map();
    const live = new Map(); // name -> { h }
    const results = [];
    for (const f of doc.features || []) {
      const p = f.inputParams || {};
      const r = { id: p.id, feature_type: f.type, added: [], removed: [] };
      results.push(r);
      const add = (name, h) => { live.set(name, { h }); r.added.push({ name, handle: h }); };
      const drop = (list) => { for (const n of list) { live.delete(n); r.removed.push(n); } };
      try {
        if (f.type === "P") planes.set(p.id, p);
        else if (f.type === "S") sketch(f, planes);
        else if (f.type.startsWith("P.")) add(p.id, primitive(f));
        else if (f.type === "E") add(p.id, extrude(f));
        else if (f.type === "R") add(p.id, revolve(f));
        else if (f.type === "B") { const o = boolean(f, live); drop(o.removed); add(o.resultName, o.handle); }
        else if (f.type === "F" || f.type === "CH") { const o = blend(f, live); drop(o.removed); add(o.resultName, o.handle); }
        else if (f.type === "XFORM") for (const o of xform(f, live)) { drop(o.removed); add(o.resultName, o.handle); }
        else throw new Error(`feature ${f.type} isn't supported on the NVIDIA kernel yet`);
      } catch (e) {
        r.error = `NVIDIA kernel: ${e?.message || e}`;
        break;
      }
    }
    return JSON.stringify({ results });
  }

  return {
    nvidia: true,
    info: nk.info(),
    execute_history_json: execute,
    tessellate_handle(handle, tol) {
      // 8 degrees: at 15 a cylinder came out 0.65% light (24 facets round)
      const m = nk.tessellate(handle, Math.max(+tol || 0.05, 1e-4), 8);
      return {
        take_positions: () => m.positions,
        take_normals: () => m.normals,
        take_indices: () => m.indices,
        take_face_ids: () => m.faceIds,
      };
    },
    face_names_handle: (handle) => JSON.stringify((names.get(handle) || []).map((n, i) => [i, n])),
    free_solid: (handle) => nk.free(handle),
    registered_solid_count: () => nk.count(),
    clear_history_cache_json: () => { freeAll(); return "{}"; },
    volume: (handle) => nk.volume(handle),
  };
}

module.exports = { load };
