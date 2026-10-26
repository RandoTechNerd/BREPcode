// Exact screw threads and coils.
//
// A thread used to be tube({ r }, helix({ ... })): a round bead swept along a
// point list and imported as triangles, so the model fell off the exact lane
// (faceted in Design mode, no STEP curves, no fillet after it). Both kernels
// can do better on their own:
//
//   Rust (next.BREP.io)  HX publishes a helix edge WITH its screw axis, and SW
//                        in orientationMode "pathAlign" screws a sketch profile
//                        up that axis: one swept solid, its walls B-spline
//                        surfaces fitted to 64 stations a turn (~2e-7 x radius).
//                        There is also sweep_profile_helix() in the ABI (same
//                        sweep core, the profile transplanted square to the
//                        path), but no thread primitive and no ruled helicoid.
//   SMLib (NVIDIA)       SmApiCreateHelix fits a B-spline helix to a stated
//                        tolerance and SmApiCreateCurveSweep carries a profile
//                        along it; no thread primitive either (see
//                        native/nvidia-kernel/adapter.cjs).
//
// So a thread here is a REVOLVED CORE (the root cylinder, chamfered at the
// ends) with the tooth swept round it as a helical ridge, joined in one union.
// That union is the expensive step: a boolean that crosses a swept wall costs
// 2-10 s on the Rust kernel however small the overlap, while one that only
// meets the core's planes and cylinder stays fast. So the ridge stops short of
// both ends of the rod: joining the rod to a jar or a bolt head then touches
// only the plain core, and the one slow boolean is the thread's own.
//
// The thread reaches the engine as ONE IMPORT3D whose triangles are this
// module's mesh (what the JS kernel and the mesh lane read) and whose
// `exactSweep` carries the exact recipe; src/engine.js swaps the recipe in on
// the exact lane and, if the kernel refuses it, builds the triangles instead,
// the same bargain hull({ exact: true }) makes.
//
// Units are mm. The tooth is the ISO metric basic profile (60 degree flanks,
// depth 5H/8, crest P/8, root P/4); "square" is a half-pitch square tooth and
// "round" a circular bead, the jar-and-lid thread.

const T30 = Math.tan(Math.PI / 6);
const C30 = Math.cos(Math.PI / 6);

// ISO 261 coarse pitches, so thread({ d: 8, length: 20 }) is an M8.
const COARSE = [[1, 0.25], [1.2, 0.25], [1.6, 0.35], [2, 0.4], [2.5, 0.45], [3, 0.5], [4, 0.7], [5, 0.8],
  [6, 1], [8, 1.25], [10, 1.5], [12, 1.75], [14, 2], [16, 2], [20, 2.5], [24, 3], [30, 3.5], [36, 4], [42, 4.5], [48, 5]];
export function coarsePitch(d) {
  let best = COARSE[0];
  for (const row of COARSE) if (Math.abs(row[0] - d) < Math.abs(best[0] - d)) best = row;
  return d > 52 ? Math.round(d / 10) : best[1];
}

export const MAX_EXACT_TURNS = 4;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

// Every derived size of a thread, in its own frame: axis +Z, the rod (or tap)
// from z = 0 to z = length.
export function threadSpec(o = {}) {
  const d = num(o.d) ?? num(o.diameter) ?? (num(o.r) ?? num(o.radius)) * 2;
  if (!(d > 0)) throw new TypeError("thread() needs a size: thread({ d: 8, pitch: 1.25, length: 20 }) is an M8 bolt thread (or r: 4)");
  const P = num(o.pitch) ?? coarsePitch(d);
  const L = num(o.length) ?? num(o.h) ?? num(o.height);
  if (!(P > 0)) throw new TypeError("thread(): pitch must be a positive number of mm per turn");
  if (!(L > 0)) throw new TypeError("thread() needs a length: thread({ d: 8, pitch: 1.25, length: 20 })");
  const profile = o.profile ?? "iso";
  if (!["iso", "round", "square"].includes(profile)) throw new TypeError(`thread(): profile is "iso", "round" or "square", not ${JSON.stringify(profile)}`);
  const internal = !!o.internal;
  const starts = Math.max(1, Math.round(num(o.starts) ?? 1));
  const leftHand = !!(o.leftHand ?? o.left);
  // ON DIAMETER, as clearance() measures it: every surface of the tap moves
  // out by half of it. Only an internal thread has one; the bolt stays true.
  const clearance = internal ? Math.max(0, num(o.clearance) ?? 0.4) : 0;
  const g = clearance / 2;
  const lead = P * starts;
  const depth = profile === "iso" ? 0.625 * C30 * P : 0.5 * P;     // 5H/8 = 0.5413 P
  const rMaj0 = d / 2, rMin0 = rMaj0 - depth;
  if (rMin0 <= 0.2 * rMaj0) throw new RangeError(`thread(): a ${P} mm pitch is too coarse for a ${d} mm thread`);
  const rMaj = rMaj0 + g, rMin = rMin0 + g;          // crest and core, the tap grown by g
  const ov = 0.1 * P;                                // the ridge runs this far into the core
  const rIn = rMin - ov;
  // The tooth as radius against axial offset u from its centreline. iso and
  // square are a polygon; round is a circle cut by a chord inside the core.
  let poly = null, arc = null, extent;
  if (profile === "iso") {
    const crest = P / 16 + g / C30 - g * T30;        // half crest flat, after the grow
    const half = (rho) => P / 16 + g / C30 + (rMaj0 - rho) * T30;
    // just inside the core the ridge turns straight down: the flanks carried
    // on would only widen it into the next turn. The kink is NOT on the core's
    // surface (a profile corner on it is a degenerate cut the kernel refuses).
    if (2 * half(rIn) < 0.92 * P) {
      extent = half(rIn);
      poly = [[rIn, -extent], [rMaj, -crest], [rMaj, crest], [rIn, extent]];
    } else {
      const rK = rMin - 0.03 * P;
      extent = half(rK);
      poly = [[rIn, -extent], [rK, -extent], [rMaj, -crest], [rMaj, crest], [rK, extent], [rIn, extent]];
    }
  } else if (profile === "square") {
    extent = P / 4 + g;
    poly = [[rIn, -extent], [rMaj, -extent], [rMaj, extent], [rIn, extent]];
  } else {
    const w = 0.3 * P, a0 = (depth * depth + w * w) / (2 * depth);
    const a = a0 + g, rc = rMaj0 - a0;
    const h = Math.sqrt(Math.max(0, a * a - (rc - rIn) ** 2));
    arc = { rc, a, h };
    extent = rc > rIn ? a : h;
  }
  if (2 * extent >= P * 0.98) {
    throw new RangeError(`thread(): ${clearance} mm of clearance leaves no room between the turns of a ${P} mm pitch; use less clearance or a coarser pitch`);
  }
  // Where the ridge runs. A rod stops it short of both ends, clear of the
  // chamfers, so whatever the rod is joined to meets only the plain core. A
  // tap (internal) runs out through z = 0, and through z = length too unless
  // it is blind (a lid), so the nut's thread opens onto both faces.
  const chamfer = o.chamfer ?? (internal ? true : "both");
  const chBottom = chamfer === true || chamfer === "both" || chamfer === "bottom";
  const chTop = chamfer === true || chamfer === "both" || chamfer === "top";
  const blind = internal && !!o.blind;
  let zA, zB, core;
  if (!internal) {
    const ch = Math.min(0.5 * depth, 0.25 * rMin);
    const margin = extent + 0.25 * P;
    zA = (chBottom ? ch : 0) + margin;
    zB = L - (chTop ? ch : 0) - margin;
    core = [...(chBottom ? [[rMin - ch, 0], [rMin, ch]] : [[rMin, 0]]),
      ...(chTop ? [[rMin, L - ch], [rMin - ch, L]] : [[rMin, L]])];
  } else {
    // a 45 degree countersink at each open face, out past the crest
    const rF = chamfer === false || chamfer === "none" ? rMin : rMaj + Math.min(0.5, 0.25 * P), sink = rF - rMin;
    const zlo = -lead, zhi = blind ? L : L + lead;
    zA = -0.5 * P;
    zB = blind ? L - extent - 0.25 * P : L + 0.5 * P;
    core = sink > 0
      ? [[rF, zlo], [rF, 0], [rMin, sink], ...(blind ? [[rMin, L]] : [[rMin, L - sink], [rF, L], [rF, zhi]])]
      : [[rMin, zlo], [rMin, zhi]];
  }
  // Every ridge starts (angle 0, on +X) at a whole number of pitches, so a
  // bolt and its tap of the same pitch, both made at z = 0, mesh in place: an
  // assembly modelled in position fits without turning anything.
  zA = internal ? Math.floor(zA / P - 1e-9) * P : Math.ceil(zA / P - 1e-9) * P;
  const turns = (zB - zA) / lead;
  if (!(turns > 0.25)) throw new RangeError(`thread(): ${L} mm is too short for a ${P} mm pitch thread; make it longer`);
  // Joining the swept tooth to its core is the slow step on the Rust kernel,
  // and it grows faster than the thread does (2026-10-26, this machine: 2
  // turns 5 s, 2.5 turns 5-11 s, an M8 nut's 6 turns 25 s, an M8 x 12 bolt's 7
  // turns 38 s and 90 s with a head joined on). So past MAX_EXACT_TURNS a
  // thread is built as triangles unless exact: true asks for the wait.
  const exact = o.exact === true || (o.exact !== false && turns * starts <= MAX_EXACT_TURNS);
  return {
    kind: "thread", exact, d, P, L, profile, internal, starts, leftHand, clearance, lead, depth,
    rMaj, rMin, rIn, extent, poly, arc, zA, zB, turns, core, blind,
    helixR: rMin,   // the radius the helix edge winds at (the profile rides with it)
  };
}

// A round wire coiled up a helix: tube(helix({ r, turns, pitch }), { r: w }).
export function coilSpec({ R, pitch, turns, wire, start = 0, leftHand = false }) {
  if (!(R > wire) || !(pitch > 2 * wire) || !(turns > 0) || !(wire > 0)) return null;
  return { kind: "coil", exact: true, R, P: pitch, lead: pitch, turns, wire, start, leftHand, starts: 1, zA: 0, helixR: R };
}

// ------------------------------------------------------------------ exact

// The ridge's sketch for the Rust kernel's XZ plane, whose sketch x is world
// -Z and sketch y is world +X (measured; the JS kernel's XZ plane is not, so
// only the Rust lane reads this). (rho, u) -> (x = -u, y = rho) is a proper
// rotation, so a counter-clockwise outline stays counter-clockwise.
export function ridgeSketch(spec) {
  const P2 = ([rho, u]) => ({ x: -u, y: rho });
  const points = [], geometries = [];
  const pt = (p, fixed = false) => { points.push({ id: points.length, ...P2(p), fixed }); return points.length - 1; };
  if (spec.kind === "coil") {
    const c = pt([spec.R, 0], true), rim = pt([spec.R + spec.wire, 0]);
    geometries.push({ id: 100, type: "circle", points: [c, rim], construction: false });
  } else if (spec.poly) {
    const ids = spec.poly.map((p, i) => pt(p, i === 0));
    ids.forEach((id, i) => geometries.push({ id: 100 + i, type: "line", points: [id, ids[(i + 1) % ids.length]], construction: false }));
  } else {
    const { rc, h } = spec.arc;
    const lo = pt([spec.rIn, -h], true), hi = pt([spec.rIn, h]), c = pt([rc, 0]);
    // the bulge runs counter-clockwise from the low chord end out round the crest
    geometries.push({ id: 100, type: "arc", points: [c, lo, hi], construction: false });
    geometries.push({ id: 101, type: "line", points: [hi, lo], construction: false });
  }
  return { points, geometries, constraints: [{ id: 0, type: "⏚", points: [0] }] };
}

// The exact recipe as feature JSON, built in a scratch history so every
// feature has the kernel's own defaults. Ids are prefixed with the import's
// own id, and the result solid IS that id (the core carries it, so a union
// renamed by the Rust dialect still answers to it), so the model around the
// thread reads it exactly as it read the import.
export async function exactRecipe(spec, History, id, place, { cylinder, translate, union, compile }) {
  const h = new History();
  const pre = `${id}~`;
  const add = async (type) => h.newFeature(type);
  const ridges = [];
  const plane = await add("P");
  plane.inputParams.orientation = "XZ";
  const sk = await add("S");
  sk.inputParams.sketchPlane = plane.inputParams.id;
  sk.persistentData.sketch = ridgeSketch(spec);
  // one sweep per start, each turned to its own angle and lifted to zA (the
  // profile is drawn at angle 0, where the helix starts)
  for (let k = 0; k < spec.starts; k++) {
    const hx = await add("HX");
    Object.assign(hx.inputParams, {
      radius: spec.helixR, endRadius: spec.helixR, mode: "pitch", pitch: spec.lead,
      height: spec.lead * spec.turns, handedness: spec.leftHand ? "left" : "right", startAngle: 0,
    });
    const sw = await add("SW");
    Object.assign(sw.inputParams, { profile: sk.inputParams.id, path: [hx.inputParams.id], orientationMode: "pathAlign", consumeProfileSketch: false });
    const spin = (spec.start || 0) + (360 * k) / spec.starts;
    if (spin || spec.zA) {
      const xf = await add("XFORM");
      Object.assign(xf.inputParams, { solids: [sw.inputParams.id], translate: [0, 0, spec.zA], rotateEulerDeg: [0, 0, spin], scale: [1, 1, 1] });
    }
    ridges.push(sw.inputParams.id);
  }
  let result = ridges[0];
  if (spec.core) {
    // cylinders and cones stacked up the outline, not a revolve: a hole down
    // a revolve's axis is refused (its seam self-intersects), and a jar's
    // bore goes straight down this core
    const pieces = [];
    for (let i = 0; i < spec.core.length - 1; i++) {
      const [r1, z0] = spec.core[i], [r2, z1] = spec.core[i + 1];
      if (z1 - z0 > 1e-9) pieces.push(translate([0, 0, z0], r1 === r2 ? cylinder({ r: r1, h: z1 - z0 }) : cylinder({ r1, r2, h: z1 - z0 })));
    }
    const first = h.features.length;
    await compile(pieces.length > 1 ? union(...pieces) : pieces[0], h);
    result = h.features.slice(first).find((f) => f.type.startsWith("P.")).inputParams.id;
    const b = await add("B");
    b.inputParams.targetSolid = result;
    b.inputParams.boolean = { targets: ridges, operation: "UNION" };
  }
  if (place) {
    const xf = await add("XFORM");
    Object.assign(xf.inputParams, { solids: [result], translate: place.translate, rotateEulerDeg: place.rotateEulerDeg, scale: place.scale });
  }
  const json = await h.toJSON();
  const features = (typeof json === "string" ? JSON.parse(json) : structuredClone(json)).features;
  // rename: every feature id gets the prefix, except the result, which takes
  // the import's id; references follow (whole names, and "S2:G100" style
  // sub-references)
  const map = new Map(features.map((f) => [f.inputParams.id, f.inputParams.id === result ? id : pre + f.inputParams.id]));
  const ren = (v) => {
    if (typeof v === "string") {
      if (map.has(v)) return map.get(v);
      const m = /^([^:]+)(:.*)$/.exec(v);
      return m && map.has(m[1]) ? map.get(m[1]) + m[2] : v;
    }
    if (Array.isArray(v)) return v.map(ren);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ren(x)]));
    return v;
  };
  for (const f of features) {
    f.inputParams = Object.fromEntries(Object.entries(f.inputParams).map(([k, v]) => [k, k === "id" ? map.get(v) : ren(v)]));
  }
  return { features, result: id };
}

// ------------------------------------------------------------------ mesh

// The rod as a radius over (angle, z): the core's radius, raised wherever a
// turn of the ridge passes. Every thread here is that kind of surface (the
// flanks are radial lines), so one grid wrapped round the axis and two capped
// ends is a closed, watertight mesh whatever the profile.
function toothRadius(spec, u) {
  const au = Math.abs(u);
  if (spec.poly) {
    if (spec.profile === "square") return au <= spec.extent ? spec.rMaj : -Infinity;
    const [rM, c] = spec.poly[spec.poly.length / 2 - 1], crest = Math.abs(c);
    if (au <= crest) return rM;
    const rho = rM - (au - crest) / T30;
    return au <= spec.extent ? rho : -Infinity;
  }
  const { rc, a } = spec.arc;
  return au < a ? rc + Math.sqrt(a * a - u * u) : -Infinity;
}
function coreRadius(core, z) {
  // the core's outline, radius against rising z
  let r = 0;
  for (let i = 0; i < core.length - 1; i++) {
    const [r0, z0] = core[i], [r1, z1] = core[i + 1];
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    if (z < lo - 1e-9 || z > hi + 1e-9) continue;
    const t = hi - lo < 1e-12 ? 1 : (z - z0) / (z1 - z0);
    r = Math.max(r, hi - lo < 1e-12 ? Math.max(r0, r1) : r0 + (r1 - r0) * t);
  }
  return r;
}
export function threadMesh(spec) {
  const zs = spec.core.map((p) => p[1]);
  const z0 = Math.min(...zs), z1 = Math.max(...zs);
  const N = Math.max(48, Math.min(160, Math.round((2 * Math.PI * spec.rMaj) / 0.5)));
  const step = Math.min(spec.P / 10, 0.5);
  const rows = new Set();
  for (let z = z0; z < z1; z += step) rows.add(+z.toFixed(6));
  for (const z of zs) rows.add(+z.toFixed(6));
  rows.add(z1);
  const Z = [...rows].sort((a, b) => a - b);
  const rho = (th, z) => {
    let r = coreRadius(spec.core, z);
    for (let k = 0; k < spec.starts; k++) {
      const phi = 2 * Math.PI * k / spec.starts;
      const frac = spec.leftHand ? (((phi - th) / (2 * Math.PI)) % 1 + 1) % 1 : (((th - phi) / (2 * Math.PI)) % 1 + 1) % 1;
      for (let m = Math.floor((z - spec.zA) / spec.lead) - 1; m <= Math.floor((z - spec.zA) / spec.lead) + 1; m++) {
        const t = frac + m;
        if (t < 0 || t > spec.turns) continue;
        r = Math.max(r, toothRadius(spec, z - (spec.zA + spec.lead * t)));
      }
    }
    return r;
  };
  const V = [];
  for (const z of Z) for (let i = 0; i < N; i++) {
    const th = (2 * Math.PI * i) / N, r = rho(th, z);
    V.push([r * Math.cos(th), r * Math.sin(th), z]);
  }
  const at = (i, j) => V[j * N + (i % N)];
  const tris = [];
  for (let j = 0; j < Z.length - 1; j++) for (let i = 0; i < N; i++) {
    tris.push([at(i, j), at(i + 1, j), at(i + 1, j + 1)], [at(i, j), at(i + 1, j + 1), at(i, j + 1)]);
  }
  const c0 = [0, 0, Z[0]], c1 = [0, 0, Z[Z.length - 1]];
  for (let i = 0; i < N; i++) {
    tris.push([c0, at(i + 1, 0), at(i, 0)], [c1, at(i, Z.length - 1), at(i + 1, Z.length - 1)]);
  }
  let stl = "solid thread\n";
  for (const t of tris) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (const p of t) stl += `vertex ${p[0]} ${p[1]} ${p[2]}\n`;
    stl += "endloop\nendfacet\n";
  }
  return stl + "endsolid thread\n";
}
