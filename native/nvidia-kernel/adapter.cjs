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
//   extrude      by which sketch curve made the wall (E3:S2:G101_SW; a full
//                circle's two halves G101_SW[0] and [1]), a hole's walls by
//                their loop (E3:HOLE:L104), and caps
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
    // a negative factor mirrors (the addon turns the faces over); zero flattens
    if (s.some((v) => !(Math.abs(v) > 0))) throw new Error("a zero scale flattens the solid");
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
      const arc = p.arc == null ? 360 : +p.arc;
      if (Math.abs(arc - 360) < 1e-9) {
        h = nk.torus(+p.majorRadius, +p.tubeRadius);
        label = () => `${id}_Side`;
      } else {
        if (!(arc > 0 && arc < 360)) throw new Error(`torus arc ${arc} isn't between 0 and 360 degrees`);
        // swept from +X toward +Y as the Rust kernel does: Cap0 at the start
        // (the XZ plane, x > 0), Cap1 at the end, and the tube Side[k]
        h = nk.torusArc(+p.majorRadius, +p.tubeRadius, arc);
        const a = arc * DEG, end = [-Math.sin(a), Math.cos(a), 0];
        let side = 0;
        label = ({ p: q, n }) => {
          if (Math.abs(q[1]) < 1e-6 && q[0] > 0 && Math.abs(n[1]) > 0.99) return `${id}_Cap0`;
          if (Math.abs(q[0] * end[0] + q[1] * end[1]) < 1e-6 && Math.abs(n[0] * end[0] + n[1] * end[1]) > 0.99) return `${id}_Cap1`;
          return `${id}_Side[${side++}]`;
        };
      }
    } else throw new Error(`primitive ${f.type} isn't supported on the NVIDIA kernel yet`);
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
    const geoms = sk.geometries.filter((g) => !g.construction).flatMap((g) => {
      const ps = g.points.map((i) => pt.get(i));
      if (ps.some((q) => !q)) throw new Error(`sketch ${f.inputParams.id}: a curve names a missing point`);
      if (g.type === "line" && ps.length === 2) return [{ id: g.id, kind: 0, ps }];
      if (g.type === "bezier" && ps.length === 4) return [{ id: g.id, kind: 1, ps }];
      // an arc is [center, start, end], counter-clockwise; start = end is a full turn
      if (g.type === "arc" && ps.length === 3) {
        const [c, a, b] = ps;
        const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
        const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]) / DEG;
        const sweep = ((((Math.atan2(b[1] - c[1], b[0] - c[0]) / DEG - a0) % 360) + 360) % 360) || 360;
        return [arc(g.id, c, r, a0, sweep, [a, b])];
      }
      // a circle ([center, rim]) is two half arcs from angle 0, as the Rust
      // kernel builds it, so its wall comes out as the same two faces
      if (g.type === "circle" && ps.length === 2) {
        const [c, rim] = ps;
        const r = Math.hypot(rim[0] - c[0], rim[1] - c[1]);
        const east = [c[0] + r, c[1]], west = [c[0] - r, c[1]];
        return [arc(g.id, c, r, 0, 180, [east, west], 0), arc(g.id, c, r, 180, 180, [west, east], 1)];
      }
      throw new Error(`sketch curve type "${g.type}" isn't supported on the NVIDIA kernel yet`);
    });
    sketches.set(f.inputParams.id, { geoms });
  }

  // SMLib takes arc angles in [-360, 360], end after start
  function arc(id, c, r, a0, sweep, ps, half) {
    if (!(r > 0)) throw new Error(`sketch arc G${id} has no radius`);
    let a1 = a0 + sweep;
    if (a1 > 360) { a0 -= 360; a1 -= 360; }
    return { id, kind: 2, c, r, a0, a1, ps, ...(half != null ? { half } : {}) };
  }

  const seg3 = (g, z = 0) => (g.kind === 2
    ? [2, g.c[0], g.c[1], z, g.r, g.a0, g.a1]
    : [g.kind, ...g.ps.flatMap(([x, y]) => [x, y, z])]);
  // a wall's name after its curve; a circle's two halves are [0] and [1]
  const wallOf = (g, tag) => `G${g.id}_${tag}${g.half != null ? `[${g.half}]` : ""}`;

  // a point on a sketch curve at t in [0, 1]
  function pointOn(g, t) {
    if (g.kind === 0) return [g.ps[0][0] + (g.ps[1][0] - g.ps[0][0]) * t, g.ps[0][1] + (g.ps[1][1] - g.ps[0][1]) * t];
    if (g.kind === 2) {
      const a = (g.a0 + (g.a1 - g.a0) * t) * DEG;
      return [g.c[0] + g.r * Math.cos(a), g.c[1] + g.r * Math.sin(a)];
    }
    const u = 1 - t, b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [0, 1].map((k) => b.reduce((s, w, j) => s + w * g.ps[j][k], 0));
  }

  // The closed loops of a sketch's curves, each with its nesting depth (odd is
  // a hole) and its key: the lowest curve id in it, as the Rust kernel keys a
  // loop (L<id>) when it names the loop's hole walls.
  function loopsOf(geoms) {
    const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const ends = (g) => [key(g.ps[0]), key(g.ps[g.ps.length - 1])];
    const left = new Set(geoms);
    const loops = [];
    while (left.size) {
      const first = left.values().next().value;
      left.delete(first);
      const members = [first];
      const [start] = ends(first);
      let end = ends(first)[1];
      while (end !== start) {
        const next = [...left].find((g) => ends(g).includes(end));
        if (!next) break;
        left.delete(next);
        members.push(next);
        const [a, b] = ends(next);
        end = a === end ? b : a;
      }
      const poly = members.flatMap((g) => Array.from({ length: 16 }, (_, i) => pointOn(g, i / 16)));
      loops.push({ members, poly, key: Math.min(...members.map((g) => g.id)), depth: 0 });
    }
    const inside = ([x, y], poly) => {
      let hit = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    for (const a of loops) for (const b of loops) if (a !== b && inside(pointOn(a.members[0], 0.5), b.poly)) a.depth++;
    return loops;
  }

  // the sketch curve nearest a point (in the sketch plane), for wall names
  function nearestGeom(geoms, [x, y]) {
    let best = null, bd = Infinity;
    for (const g of geoms) {
      if (g.kind === 0) {
        // a line: the exact distance (samples tie where two lines meet)
        const [[x0, y0], [x1, y1]] = g.ps, dx = x1 - x0, dy = y1 - y0;
        const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
        const d = Math.hypot(x0 + dx * t - x, y0 + dy * t - y);
        if (d < bd) { bd = d; best = g; }
        continue;
      }
      const samples = 24;
      for (let i = 0; i <= samples; i++) {
        const q = pointOn(g, i / samples);
        const d = Math.hypot(q[0] - x, q[1] - y);
        if (d < bd) { bd = d; best = g; }
      }
    }
    return best;
  }

  function extrude(f) {
    const p = f.inputParams;
    const sk = sketches.get(p.profile);
    if (!sk) throw new Error(`extrude ${p.id}: no sketch "${p.profile}"`);
    const fwd = +(p.distance || 0), back = +(p.distanceBack || 0);
    if (!(fwd + back > 0)) throw new Error(`extrude ${p.id}: zero height`);
    const h = nk.extrude(sk.geoms.map((g) => seg3(g, -back)), 0, 0, 1, fwd + back);
    const first = sk.geoms[0]?.id;
    // a hole's walls are named after its loop, repeats numbered (_1, _2), as
    // the Rust kernel names the walls its hole cutter leaves
    const holeOf = new Map(loopsOf(sk.geoms).filter((l) => l.depth % 2).flatMap((l) => l.members.map((g) => [g, l.key])));
    const seen = new Map();
    const faceNames = faceInfo(h).map(({ p: q, n }) => {
      if (Math.abs(n[2]) > 0.99) return `${p.id}:${p.profile}:PROFILE:L${first}_${q[2] < (fwd - back) / 2 ? "START" : "END"}`;
      const g = nearestGeom(sk.geoms, q);
      if (!holeOf.has(g)) return `${p.id}:${p.profile}:${wallOf(g, "SW")}`;
      const base = `${p.id}:HOLE:L${holeOf.get(g)}`, k = seen.get(base) ?? 0;
      seen.set(base, k + 1);
      return k ? `${base}_${k}` : base;
    });
    return own(h, faceNames);
  }

  function revolve(f) {
    const p = f.inputParams;
    const sk = sketches.get(p.profile);
    if (!sk) throw new Error(`revolve ${p.id}: no sketch "${p.profile}"`);
    const m = /:G(\d+)$/.exec(String(p.axis || ""));
    const axis = m && sk.geoms.find((g) => g.id === +m[1]);
    if (!axis || axis.kind !== 0) throw new Error(`revolve ${p.id}: its axis must be a straight sketch line`);
    const [a, b] = axis.ps;
    const dir = [b[0] - a[0], b[1] - a[1], 0];
    const angle = +(p.angle ?? 360);
    const profile = sk.geoms.filter((g) => g !== axis);
    const len = Math.hypot(dir[0], dir[1]), u = [dir[0] / len, dir[1] / len];
    // which side of the axis the profile lies on, in the sketch plane
    const side = Math.sign(profile.flatMap((g) => g.ps).reduce((t, [x, y]) => t + (x - a[0]) * u[1] - (y - a[1]) * u[0], 0)) || 1;
    // SMLib sweeps a full turn from the open profile, but a part turn only
    // from the closed one (axis edge included); without it, status 1001. A
    // ring's cross-section, clear of the axis, is closed on its own: the axis
    // line drawn beside it would only be a stray edge.
    const part = Math.abs(angle) < 360;
    const key = ([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`;
    const ends = new Set(profile.flatMap((g) => [key(g.ps[0]), key(g.ps[g.ps.length - 1])]));
    const closed = part && ends.has(key(a)) && ends.has(key(b));
    // SMLib turns about the axis line as it is drawn; the Rust kernel turns
    // the same way whichever way the axis edge runs (the profile's side of it
    // decides), so a part turn of a clockwise profile lands where it does there
    const turn = [-side * u[0], -side * u[1]];
    const h = nk.revolve((closed ? sk.geoms : profile).map((g) => seg3(g)), a[0], a[1], 0, turn[0], turn[1], 0, angle);
    const faceNames = faceInfo(h).map(({ p: q, n }) => {
      // a part revolve has two flat caps, each a plane through the axis: the
      // start one in the sketch plane on the profile's side, the end one swung
      if (part && Math.abs(n[0] * u[0] + n[1] * u[1]) < 1e-6
        && Math.abs((q[0] - a[0]) * n[0] + (q[1] - a[1]) * n[1] + q[2] * n[2]) < 1e-6) {
        const start = Math.abs(q[2]) < 1e-6 && Math.sign((q[0] - a[0]) * u[1] - (q[1] - a[1]) * u[0]) === side;
        return `${p.id}:L${sk.geoms[0].id}_${start ? "START" : "END"}`;
      }
      // a point on a wall, swung back into the sketch plane on the profile's
      // side (a face's sample point can be anywhere round the turn, and the
      // mirror image of an outer wall lies nearer an inner one), sits on its curve
      const v = [q[0] - a[0], q[1] - a[1], q[2]], t = v[0] * u[0] + v[1] * u[1];
      const r = Math.hypot(v[0] - t * u[0], v[1] - t * u[1], v[2]);
      const g = nearestGeom(profile, [a[0] + t * u[0] + side * r * u[1], a[1] + t * u[1] - side * r * u[0]]);
      return g ? `${p.profile}:${wallOf(g, "RV")}` : `${p.id}:${p.profile}:CAP_END`;
    });
    return own(h, faceNames);
  }

  // ------------------------------------------------------------ booleans
  function boolean(f, live, { keepTarget = false } = {}) {
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
    const resultName = op === 3 || !tools.length || keepTarget ? tName : tools[0].n;
    return { handle: target.h, resultName, removed: [tName, ...tools.map((t) => t.n)] };
  }

  // A primitive, extrude or revolve can carry its own boolean: the Rust
  // kernel combines it into the target, which keeps the target's name (for
  // SUBTRACT the new solid is the cutter). One target only; with more the
  // Rust kernel's results don't follow one rule, so those stay refused.
  function ownBoolean(f, h, live) {
    const b = f.inputParams.boolean;
    if (!b?.operation || b.operation === "NONE" || !b.targets?.length) return null;
    if (b.targets.length > 1) throw new Error(`${f.type} ${f.inputParams.id}: its own boolean has ${b.targets.length} targets; one is supported`);
    return boolean({ inputParams: { id: f.inputParams.id, targetSolid: b.targets[0], boolean: { operation: b.operation, targets: [f.inputParams.id] } } },
      new Map([...live, [f.inputParams.id, { h }]]), { keepTarget: true });
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
        const b = nk.bbox(h);
        pivot = [0, 1, 2].map((k) => (b[k] + b[k + 3]) / 2);
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
        else if (f.type.startsWith("P.") || f.type === "E" || f.type === "R") {
          const h = f.type === "E" ? extrude(f) : f.type === "R" ? revolve(f) : primitive(f);
          const o = ownBoolean(f, h, live);
          if (o) { drop(o.removed.filter((n) => n !== p.id)); add(o.resultName, o.handle); }
          else add(p.id, h);
        }
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
