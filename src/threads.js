// Modelled screw threads: ISO metric, the real 60° profile, as a closed mesh.
//
//   thread({ size: "M8", length: 20 })                 a threaded rod
//   thread({ size: "M8", length: 12, internal: true }) the cutter for a tapped hole
//
// Why a mesh: a helix has no exact B-rep form the kernels here will take (the
// Rust lane refuses a swept helical face), so the thread is generated straight
// to triangles and joins the model on the mesh lane, the way tube() does.
//
// HOW IT STAYS CLOSED WITHOUT A BOOLEAN. The obvious build (a helical strip,
// then intersect it with a cylinder to cut the ends square) needs a mesh
// boolean, and the one here is quadratic. Instead the surface is made one
// COLUMN at a time: at each angle, the radius up the column is the profile
// shifted by that angle's share of the pitch, so the profile's corners land
// at exact heights, and the column is cut at z = 0 and z = length with the
// radius interpolated there. Neighbouring columns are zipped together by
// height, the last back to the first (one turn on, the corners are at the same
// heights again), and each end is a flat fan. Every edge is shared by exactly
// two triangles by construction.
//
// The profile is the ISO 68-1 basic one: thread depth 5H/8 (H = 0.866p), a
// p/8 flat on the crest and p/4 at the root, 60° flanks. Printing wants a
// clearance, which is `fit` (on diameter): an internal cutter is grown by it,
// so an M8 rod printed from thread() goes into a hole cut by
// thread({ internal: true }) of the same size.

// ISO 261 coarse pitches. Fine pitches are reachable with { pitch }.
export const COARSE_PITCH = {
  M1_6: 0.35, M2: 0.4, M2_5: 0.45, M3: 0.5, M4: 0.7, M5: 0.8, M6: 1.0, M8: 1.25, M10: 1.5,
  M12: 1.75, M14: 2.0, M16: 2.0, M20: 2.5, M24: 3.0, M30: 3.5, M36: 4.0,
};
// The diametral clearance a printed internal thread is cut oversize by.
export const THREAD_FIT = 0.3;

const sizeKey = (s) => String(s).trim().toUpperCase().replace(/[.\s-]/g, "_").replace(/^(\d)/, "M$1");

// -> { d, pitch } for "M8", "m2.5", 8 (a bare number is a diameter in mm)
export function threadSpec(size, pitch) {
  if (Number.isFinite(+size) && +size > 0) {
    const d = +size;
    const p = pitch ?? COARSE_PITCH[sizeKey(`M${d}`)];
    if (!(p > 0)) throw new Error(`thread(): no standard pitch for a ${d} mm thread; give one, thread({ d: ${d}, pitch: 1.5 })`);
    return { d, pitch: p };
  }
  const k = sizeKey(size);
  const p = pitch ?? COARSE_PITCH[k];
  const d = parseFloat(k.slice(1).replace("_", "."));
  if (!(d > 0) || !(p > 0)) {
    throw new Error(`thread size "${size}" isn't known; try ${Object.keys(COARSE_PITCH).map((n) => n.replace("_", ".")).join(", ")}, or { d, pitch }`);
  }
  return { d, pitch: p };
}

// The profile over one pitch, as [fraction of pitch, 0 = root .. 1 = crest].
// Starts at the root flat; the crest is the 1/8 flat in the middle-upper part.
const PROFILE = [[0, 0], [0.25, 0], [0.5625, 1], [0.6875, 1]];

// -> { points: [[x,y,z]], faces: [[a,b,c]] }, axis along +Z from z = 0.
export function threadMesh({
  d, pitch, length, internal = false, fit = THREAD_FIT, segments, chamfer = true,
  leftHand = false,
} = {}) {
  if (!(d > 0) || !(pitch > 0) || !(length > 0)) throw new Error("threadMesh() needs d, pitch and length, all above 0");
  const depth = 0.625 * 0.8660254 * pitch;             // 5H/8
  const grow = internal ? fit / 2 : 0;                 // on radius
  const rMaj = d / 2 + grow, rMin = d / 2 - depth + grow;
  const n = Math.max(24, Math.min(160, segments ?? Math.round((Math.PI * d) / 0.5)));
  const hand = leftHand ? -1 : 1;
  // a 45° lead-in at each end, as deep as the thread, so a nut or a printed
  // part starts square instead of on a knife edge (not on a cutter, whose
  // ends sit inside the part anyway)
  const cham = chamfer && !internal ? depth : 0;

  const radiusAt = (z, shift) => {
    let u = ((z - shift) / pitch) % 1;
    if (u < 0) u += 1;
    let t = 0;
    for (let i = 0; i < PROFILE.length; i++) {
      const [u0, t0] = PROFILE[i];
      const [u1, t1] = i + 1 < PROFILE.length ? PROFILE[i + 1] : [1, PROFILE[0][1]];
      if (u >= u0 && u <= u1) { t = u1 === u0 ? t0 : t0 + (t1 - t0) * (u - u0) / (u1 - u0); break; }
    }
    let r = rMin + (rMaj - rMin) * t;
    if (cham) r = Math.min(r, rMin + z + depth * 0.15, rMin + (length - z) + depth * 0.15);
    return r;
  };

  const points = [];
  const cols = [];                                     // per column: point indices, bottom to top
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const shift = hand * (i / n) * pitch;              // the helix: one pitch per turn
    const zs = new Set([0, length]);
    for (let k = Math.floor(-shift / pitch) - 1; ; k++) {
      const base = shift + k * pitch;
      if (base > length) break;
      for (const [u] of PROFILE) {
        const z = base + u * pitch;
        if (z > 1e-9 && z < length - 1e-9) zs.add(+z.toFixed(9));
      }
    }
    if (cham) for (const z of [depth * 0.85, length - depth * 0.85]) if (z > 0 && z < length) zs.add(z);
    const ca = Math.cos(a), sa = Math.sin(a);
    const col = [];
    for (const z of [...zs].sort((p, q) => p - q)) {
      const r = radiusAt(z, shift);
      col.push(points.length);
      points.push([r * ca, r * sa, z]);
    }
    cols.push(col);
  }

  const faces = [];
  const zOf = (i) => points[i][2];
  for (let i = 0; i < n; i++) {
    const A = cols[i], B = cols[(i + 1) % n];
    let ia = 0, ib = 0;
    // zip by height: always advance the column whose next point is lower
    while (ia < A.length - 1 || ib < B.length - 1) {
      const nextA = ia < A.length - 1 ? zOf(A[ia + 1]) : Infinity;
      const nextB = ib < B.length - 1 ? zOf(B[ib + 1]) : Infinity;
      if (nextB <= nextA) { faces.push([A[ia], B[ib], B[ib + 1]]); ib++; }
      else { faces.push([A[ia], B[ib], A[ia + 1]]); ia++; }
    }
  }
  // flat ends, fanned from the axis
  const c0 = points.length; points.push([0, 0, 0]);
  const c1 = points.length; points.push([0, 0, length]);
  for (let i = 0; i < n; i++) {
    const A = cols[i], B = cols[(i + 1) % n];
    faces.push([c0, B[0], A[0]]);
    faces.push([c1, A[A.length - 1], B[B.length - 1]]);
  }
  return { points, faces };
}

// ASCII STL of a thread, for the importers and the tests.
export function threadStl(opts, name = "thread") {
  const { points, faces } = threadMesh(opts);
  let stl = `solid ${name}\n`;
  for (const f of faces) {
    stl += "facet normal 0 0 0\nouter loop\n";
    for (const i of f) stl += `vertex ${points[i][0]} ${points[i][1]} ${points[i][2]}\n`;
    stl += "endloop\nendfacet\n";
  }
  return `${stl}endsolid ${name}\n`;
}
