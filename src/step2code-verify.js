// The judge for STEP -> code: is a rebuilt body the same solid as the file's?
//
// Shared by the Node checker (src/step2code-check.js) and the viewer's kernel
// worker, so the website and the CLI keep exactly the same bodies. Takes the
// Rust kernel (wasm) and works on its resident solid handles: the file's own
// bodies come from the kernel's STEP reader, each candidate from a build, and
// the verdict is the volume of the difference both ways (A - B plus B - A)
// against the body's own volume.

// How close two solids' measurements must be to count as the same shape:
// the kernel's own integration accuracy (B-spline faces are integrated
// numerically), not a modelling tolerance. Relative to the body's size.
export const SAME_SHAPE = 1e-5;
// random points in the box that must fall inside (or outside) both solids
const PROBES = 4096;

// Why not a boolean difference? Subtracting two solids that are the SAME is
// the hardest case a boolean has (every face lies on another): measured on
// real parts it threw ("fragment_face: chain 7 fragmented") or ran for more
// than 90 s, and a hang inside wasm cannot be interrupted. Mass properties
// (volume, area, centroid, inertia) and a point test are cheap, cannot hang,
// and together say the same thing: a hole 0.1 mm off moves the inertia, a
// wrong diameter changes the area, a missing pocket fails the points.

// the file's bodies as the kernel reads them
export function kernelBodies(rk, text) {
  let list = [];
  try { list = JSON.parse(rk.import_step_json(text)); } catch { list = []; }
  return list.map((s) => {
    const json = JSON.stringify(s);
    let handle = null, props = null;
    try { handle = rk.register_solid_json(json); } catch { /* not a closed solid */ }
    try { props = JSON.parse(rk.solid_mass_properties_full_json(json)); } catch { /* no volume */ }
    return { handle, json, props, volume: Math.abs(props?.volume ?? 0), box: box(s.vertices.map((v) => [v.point.x, v.point.y, v.point.z])), used: false };
  });
}
// file bodies' point-test grids (coverage), by handle, until freed
const grids = new Map();
export function freeBodies(rk, kernel) {
  for (const k of kernel) grids.delete(k.handle);
  for (const k of kernel) { try { if (k.handle != null) rk.free_solid(k.handle); } catch { /* gone */ } }
}

export const volumeOf = (rk, h) => Math.abs(JSON.parse(rk.mass_properties_handle(h)).volume);

// a candidate's handles (several solids: unioned first)
export function unionAll(rk, handles) {
  let h = handles[0];
  for (const x of handles.slice(1)) h = rk.boolean_handle(h, x, "union", 1e-6, true);
  return h;
}

// a resident solid's JSON and full mass properties
export function measure(rk, handle) {
  try { return measureOnce(rk, handle); }
  catch (e) {
    // Some UNION results carry a loop-wire id twice ("duplicate loop wire
    // id"): fine in the registry, refused by the validating codec the JSON is
    // read through. Intersecting with a box round the solid changes nothing
    // and rebuilds the topology with fresh ids (as src/stepexport.js does).
    if (!/duplicate|wire id|loop/i.test(String(e?.message ?? e))) throw e;
    const box = enclosingBox(rk, handle);
    let fresh = null;
    try { fresh = rk.boolean_handle(handle, box, "intersect", 1e-6, true); return measureOnce(rk, fresh); }
    catch { return measureMesh(rk, handle); }
    finally { for (const h of [box, fresh]) { if (h != null) { try { rk.free_solid(h); } catch { /* gone */ } } } }
  }
}
// When even that is refused (a stack of layers: the intersect came back a
// "degenerate arrangement"), the handle still answers its exact volume and
// area, and its tessellation gives the centroid, the inertia and the points.
// The mesh is a hair off the surface, so a point that close may disagree:
// that can only turn a match down, never let a wrong one through.
const MESH_TOL = 0.01;
function measureMesh(rk, handle) {
  const exact = JSON.parse(rk.mass_properties_handle(handle));
  const m = rk.tessellate_handle(handle, MESH_TOL);
  const P = m.take_positions(), I = m.take_indices();
  let V = 0, cx = 0, cy = 0, cz = 0;
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];          // second moments about the origin
  for (let t = 0; t < I.length; t += 3) {
    const a = [P[3 * I[t]], P[3 * I[t] + 1], P[3 * I[t] + 2]], b = [P[3 * I[t + 1]], P[3 * I[t + 1] + 1], P[3 * I[t + 1] + 2]], c = [P[3 * I[t + 2]], P[3 * I[t + 2] + 1], P[3 * I[t + 2] + 2]];
    const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    V += v;
    cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      // the tetrahedron (0, a, b, c): integral of x_i x_j
      S[i][j] += v / 20 * (a[i] * a[j] + b[i] * b[j] + c[i] * c[j] + (a[i] + b[i] + c[i]) * (a[j] + b[j] + c[j]));
    }
  }
  const C = [cx / V, cy / V, cz / V];
  const tr = S[0][0] + S[1][1] + S[2][2];
  // inertia about the centroid, the kernel's convention (I = tr(S) 1 - S, shifted)
  const inertia = [0, 1, 2].map((i) => [0, 1, 2].map((j) => ((i === j ? tr : 0) - S[i][j]) - V * ((i === j ? C[0] ** 2 + C[1] ** 2 + C[2] ** 2 : 0) - C[i] * C[j])));
  return { mesh: { P, I }, props: { volume: exact.volume, surface_area: exact.surface_area, centroid: { x: C[0], y: C[1], z: C[2] }, inertia }, volume: Math.abs(exact.volume) };
}
function measureOnce(rk, handle) {
  const buf = rk.solid_handle_to_buffer(handle);
  const solid = rk.WasmBrepSolid.from_buffer(buf.take_data(), buf.names_json());
  try {
    const json = solid.to_json();
    const props = JSON.parse(solid.full_mass_properties_json());
    return { json, props, volume: Math.abs(props.volume) };
  } finally { try { solid.free(); } catch { /* gone */ } }
}
function enclosingBox(rk, handle) {
  const m = rk.tessellate_handle(handle, 0.5);
  const P = m.take_positions();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) { const k = i % 3; if (P[i] < lo[k]) lo[k] = P[i]; if (P[i] > hi[k]) hi[k] = P[i]; }
  const pad = 0.1 * Math.max(...hi.map((v, k) => v - lo[k])) + 1;
  const box = new rk.WasmBrepSolid(rk.box_brep_json(lo[0] - pad, lo[1] - pad, lo[2] - pad,
    hi[0] - lo[0] + 2 * pad, hi[1] - lo[1] + 2 * pad, hi[2] - lo[2] + 2 * pad));
  const b = box.to_buffer();
  try { return rk.register_solid_buffer(b.take_data(), b.names_json()); }
  finally { box.free(); }
}

// how far apart two measured solids are, relative (0 = the same shape); a
// point that one solid holds and the other does not makes it 1
export function shapeDistance(rk, A, B, b) {
  const size = Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) || 1;
  const pa = A.props, pb = B.props;
  const rel = (x, y) => Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-12);
  let d = Math.max(rel(Math.abs(pa.volume), Math.abs(pb.volume)), rel(pa.surface_area, pb.surface_area));
  // a side measured off its mesh is good to the mesh's chord, not the kernel's
  // integration: its centroid and inertia are held to that, scaled down so the
  // one verdict (below SAME_SHAPE) still reads the same
  const meshy = A.mesh || B.mesh ? SAME_SHAPE / Math.max(MESH_REL, 2 * MESH_TOL / size) : 1;
  const c = Math.hypot(pa.centroid.x - pb.centroid.x, pa.centroid.y - pb.centroid.y, pa.centroid.z - pb.centroid.z) / size;
  d = Math.max(d, c * meshy);
  // diagonal as it is, products of inertia by size (kernels differ on their sign)
  const I = (p) => p.inertia.flatMap((row, i) => row.map((v, j) => (i === j ? v : Math.abs(v))));
  const ia = I(pa), ib = I(pb), scale = Math.max(...ia.map(Math.abs), 1e-12);
  d = Math.max(d, (Math.max(...ia.map((v, i) => Math.abs(v - ib[i]))) / scale / 10) * meshy);
  if (d >= SAME_SHAPE) return d;
  // the point test, only for a pair that already measures the same
  const pts = probePoints(b, A.mesh || B.mesh ? PROBES / 4 : PROBES);
  const ca = inside(rk, A, pts), cb = inside(rk, B, pts);
  if (!ca || !cb) return d;
  const mesh = A.mesh || B.mesh;
  for (let i = 0; i < pts.length; i++) {
    if (ca[i] === "on" || cb[i] === "on" || ca[i] === cb[i]) continue;
    // a mesh is its chord off the true surface: a point that close is noise
    if (mesh && meshDistance(mesh, pts[i]) < 3 * MESH_TOL) continue;
    return 1;
  }
  return d;
}
// how far a point is from a triangle mesh (only asked of the few points the
// two sides disagree on)
function meshDistance({ P, I }, p) {
  let best = Infinity;
  for (let t = 0; t < I.length; t += 3) {
    const a = [P[3 * I[t]], P[3 * I[t] + 1], P[3 * I[t] + 2]], b = [P[3 * I[t + 1]], P[3 * I[t + 1] + 1], P[3 * I[t + 1] + 2]], c = [P[3 * I[t + 2]], P[3 * I[t + 2] + 1], P[3 * I[t + 2] + 2]];
    best = Math.min(best, triDistance(p, a, b, c));
  }
  return best;
}
// point to triangle (Ericson, Real-Time Collision Detection 5.1.5)
function triDistance(p, a, b, c) {
  const s = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dt = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const at = (u, k, v, m) => [a[0] + u[0] * k + v[0] * m, a[1] + u[1] * k + v[1] * m, a[2] + u[2] * k + v[2] * m];
  const ab = s(b, a), ac = s(c, a), ap = s(p, a);
  const d1 = dt(ab, ap), d2 = dt(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = s(p, b), d3 = dt(ab, bp), d4 = dt(ac, bp);
    if (d3 >= 0 && d4 <= d3) q = b;
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) q = at(ab, d1 / (d1 - d3), ac, 0);
      else {
        const cp = s(p, c), d5 = dt(ab, cp), d6 = dt(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c;
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) q = at(ab, 0, ac, d2 / (d2 - d6));
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; }
            else { const den = 1 / (va + vb + vc); q = at(ab, vb * den, ac, vc * den); }
          }
        }
      }
    }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}
const MESH_REL = 2e-4;
const inside = (rk, X, pts) => (X.parts ? anyOf(X.parts.map((p) => inBox(rk, p, pts))) : X.json ? classify(rk, X.json, pts) : X.mesh ? meshClassify(X.mesh, pts) : null);
// a piece asked only about the points in its own box (a slice is thin)
function inBox(rk, X, pts) {
  const b = X.box ??= X.json ? box(JSON.parse(X.json).vertices.map((v) => [v.point.x, v.point.y, v.point.z])) : null;
  if (!b) return inside(rk, X, pts);
  const pad = 1e-6 * (1 + Math.abs(b.hi[0]) + Math.abs(b.hi[1]) + Math.abs(b.hi[2]));
  const idx = [];
  pts.forEach((p, i) => { if (p.every((v, k) => v >= b.lo[k] - pad && v <= b.hi[k] + pad)) idx.push(i); });
  const out = new Array(pts.length).fill("out");
  if (!idx.length) return out;
  const r = inside(rk, X, idx.map((i) => pts[i]));
  if (!r) return null;
  idx.forEach((i, j) => { out[i] = r[j]; });
  return out;
}
// a candidate in pieces (a group, never unioned): in when inside any piece
const anyOf = (lists) => (lists.some((l) => !l) ? null : lists[0].map((_, i) => (lists.some((l) => l[i] === "in") ? "in" : lists.some((l) => l[i] === "on") ? "on" : "out")));

// in or out of a closed triangle mesh: a ray along a slightly skewed
// direction (so it does not run along an edge), crossings counted
function meshClassify({ P, I }, pts) {
  const dir = [0.8726, 0.3491, 0.3417];
  const out = [];
  for (const p of pts) {
    let n = 0;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
      const h = [dir[1] * e2[2] - dir[2] * e2[1], dir[2] * e2[0] - dir[0] * e2[2], dir[0] * e2[1] - dir[1] * e2[0]];
      const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
      if (Math.abs(det) < 1e-14) continue;
      const s = [p[0] - P[a], p[1] - P[a + 1], p[2] - P[a + 2]];
      const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det;
      if (u < 0 || u > 1) continue;
      const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
      const v = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) / det;
      if (v < 0 || u + v > 1) continue;
      if ((e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) / det > 0) n++;
    }
    out.push(n % 2 ? "in" : "out");
  }
  return out;
}

// in or out of a closed triangle mesh, fast: a ray along +x from each point,
// the triangles bucketed by where they cover the (y, z) plane, so a point
// meets only its own cell's (points nudged off the exact grid of a mesh's
// own vertices, so the ray does not run through an edge)
function meshGrid(P, I) {
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 2; k++) { const v = P[i + 1 + k]; if (v < lo[k]) lo[k] = v; if (v > hi[k]) hi[k] = v; }
  const n = Math.max(1, Math.min(256, Math.round(Math.sqrt(I.length / 3 / 4))));
  const sy = (hi[0] - lo[0]) / n || 1, sz = (hi[1] - lo[1]) / n || 1;
  const cells = Array.from({ length: n * n }, () => []);
  for (let t = 0; t < I.length; t += 3) {
    const ys = [P[3 * I[t] + 1], P[3 * I[t + 1] + 1], P[3 * I[t + 2] + 1]], zs = [P[3 * I[t] + 2], P[3 * I[t + 1] + 2], P[3 * I[t + 2] + 2]];
    const y0 = Math.max(0, Math.floor((Math.min(...ys) - lo[0]) / sy)), y1 = Math.min(n - 1, Math.floor((Math.max(...ys) - lo[0]) / sy));
    const z0 = Math.max(0, Math.floor((Math.min(...zs) - lo[1]) / sz)), z1 = Math.min(n - 1, Math.floor((Math.max(...zs) - lo[1]) / sz));
    for (let a = y0; a <= y1; a++) for (let c = z0; c <= z1; c++) cells[a * n + c].push(t);
  }
  return { P, I, lo, n, sy, sz, cells, nudge: Math.max(hi[0] - lo[0], hi[1] - lo[1], 1) * 1.3e-7 };
}
function gridClassify(g, pts) {
  const { P, I, lo, n, sy, sz, cells } = g;
  return pts.map((q) => {
    const y = q[1] + g.nudge, z = q[2] + g.nudge * 0.71;
    const a = Math.floor((y - lo[0]) / sy), c = Math.floor((z - lo[1]) / sz);
    if (a < 0 || c < 0 || a >= n || c >= n) return "out";
    let hits = 0;
    for (const t of cells[a * n + c]) {
      const i0 = 3 * I[t], i1 = 3 * I[t + 1], i2 = 3 * I[t + 2];
      const y0 = P[i0 + 1], z0 = P[i0 + 2], y1 = P[i1 + 1], z1 = P[i1 + 2], y2 = P[i2 + 1], z2 = P[i2 + 2];
      // barycentric in (y, z); then where the triangle's plane is in x
      const d = (y1 - y0) * (z2 - z0) - (y2 - y0) * (z1 - z0);
      if (d === 0) continue;
      const u = ((y - y0) * (z2 - z0) - (y2 - y0) * (z - z0)) / d, v = ((y1 - y0) * (z - z0) - (y - y0) * (z1 - z0)) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      const x = P[i0] + u * (P[i1] - P[i0]) + v * (P[i2] - P[i0]);
      if (x > q[0]) hits++;
    }
    return hits % 2 ? "in" : "out";
  });
}

function classify(rk, json, pts) {
  try {
    const r = JSON.parse(rk.classify_points_json(`{"solid":${json},"points":${JSON.stringify(pts)}}`));
    return r.map((x) => x.class);
  } catch { return null; }
}
// a repeatable spread of points through the box (a little past it)
function probePoints(b, n) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const lo = b.lo, hi = b.hi, pad = (k) => (hi[k] - lo[k]) * 0.02 + 1e-3;
  const out = [];
  for (let i = 0; i < n; i++) out.push([0, 1, 2].map((k) => lo[k] - pad(k) + rnd() * (hi[k] - lo[k] + 2 * pad(k))));
  return out;
}

// How much of a file body a candidate that is NOT the same shape covers, for
// the "close" offer: points through their joint box, each in or out of both.
// missing: the file's material the code leaves out; extra: what the code
// adds; both as a fraction of the file body's volume. points: where they
// disagree, [x, y, z, 0 missing | 1 extra], for the map. A mesh-measured side
// is classified by ray casting, so it gets fewer points.
export const CLOSE_MIN = 0.9;
export function coverage(rk, file, cand, b, dense = false, rkCand = rk) {
  const meshy = file.mesh || cand.mesh || cand.parts?.some((p) => p.mesh);
  const n = meshy ? (dense ? 4096 : 2048) : dense ? 60000 : 12000;
  // in batches, against a clock: a freeform file body answers a point test
  // a thousand times slower than a box, and the numbers settle long before
  const all = probePoints(b, n), budget = dense ? 8000 : 3000, t0 = Date.now();
  const pts = [], ca = [], cb = [];
  let side = grids.has(file.handle) ? { grid: grids.get(file.handle) } : file;
  for (let i = 0, step = 250; i < all.length; i += step, step = 2000) {
    const chunk = all.slice(i, i + step);
    const t1 = Date.now();
    const x = side.grid ? gridClassify(side.grid, chunk) : inside(rk, side, chunk), y = inside(rkCand, cand, chunk);
    // a file body that answers slowly (B-spline faces, point by point) is
    // asked of its own fine tessellation from then on, a chord off the face
    if (side === file && file.handle != null && Date.now() - t1 > chunk.length * 0.5) {
      try { const m = rk.tessellate_handle(file.handle, MESH_TOL); side = { grid: meshGrid(m.take_positions(), m.take_indices()) }; grids.set(file.handle, side.grid); } catch { /* keep asking the kernel */ }
    }
    if (!x || !y) return null;
    pts.push(...chunk); ca.push(...x); cb.push(...y);
    if (Date.now() - t0 > budget) break;
  }
  let inF = 0, miss = 0, extra = 0;
  const where = [];
  for (let i = 0; i < pts.length; i++) {
    if (ca[i] === "on" || cb[i] === "on") continue;
    const f = ca[i] === "in", c = cb[i] === "in";
    if (f) inF++;
    if (f && !c) { miss++; where.push([...pts[i].map((v) => +v.toFixed(4)), 0]); }
    else if (!f && c) { extra++; where.push([...pts[i].map((v) => +v.toFixed(4)), 1]); }
  }
  if (!inF) return null;
  return { match: Math.max(0, 1 - (miss + extra) / inF), missing: miss / inF, extra: extra / inF, points: where.slice(0, 6000) };
}
// a measured file body (kernelBodies) as coverage() takes it
export const fileSide = (k) => ({ json: k.json, volume: k.volume, handle: k.handle });
export const boxUnion = (a, b) => ({ lo: a.lo.map((v, k) => Math.min(v, b.lo[k])), hi: a.hi.map((v, k) => Math.max(v, b.hi[k])) });

// the file body this candidate is, and how far from it (below SAME_SHAPE: the same)
export function bestMatch(rk, kernel, cand, myBox) {
  let best = null;
  const cands = kernel.filter((k) => !k.used && k.props && Math.abs(k.volume - cand.volume) <= 0.01 * Math.max(k.volume, cand.volume))
    .sort((a, b) => boxDist(a.box, myBox) - boxDist(b.box, myBox)).slice(0, 4);
  for (const k of cands) {
    const rel = shapeDistance(rk, k, cand, unionBox(k.box, myBox));
    if (!best || rel < best.rel) best = { k, rel };
    if (rel < SAME_SHAPE) break;
  }
  return best;
}
const unionBox = (a, b) => ({ lo: a.lo.map((v, k) => Math.min(v, b.lo[k])), hi: a.hi.map((v, k) => Math.max(v, b.hi[k])) });

// The other copies of a part that matched: where the assembly puts copy i
// (Ti), the file must hold a body of the same volume with its centroid at
// Ti(local centroid) and its inertia turned by Ti. No build: the copy is an
// exact move of a body already checked. Returns, per copy, the file body it
// is (marked used) or null.
export function placeInstances(kernel, cand, T0, Ts, box) {
  const size = Math.hypot(box.hi[0] - box.lo[0], box.hi[1] - box.lo[1], box.hi[2] - box.lo[2]) || 1;
  const c = cand.props.centroid;
  const local = applyInv(T0, [c.x, c.y, c.z]);
  // the inertia in the part's own frame: R0^T I R0
  const I0 = mulM(transpose(T0.R), mulM(cand.props.inertia, T0.R));
  const loose = cand.mesh ? MESH_REL : SAME_SHAPE;
  return Ts.map((T) => {
    const want = apply(T, local);
    const Iw = mulM(T.R, mulM(I0, transpose(T.R)));
    const scale = Math.max(...Iw.flat().map(Math.abs), 1e-12);
    const k = kernel.find((k) => !k.used && k.props
      && Math.abs(k.volume - cand.volume) <= SAME_SHAPE * Math.max(k.volume, cand.volume)
      && Math.hypot(k.props.centroid.x - want[0], k.props.centroid.y - want[1], k.props.centroid.z - want[2]) <= loose * size
      && Iw.every((row, i) => row.every((v, j) => Math.abs((i === j ? v : Math.abs(v)) - (i === j ? k.props.inertia[i][j] : Math.abs(k.props.inertia[i][j]))) <= loose * 10 * scale)));
    if (k) k.used = true;
    return k ?? null;
  });
}
const apply = (T, p) => [0, 1, 2].map((i) => T.R[i][0] * p[0] + T.R[i][1] * p[1] + T.R[i][2] * p[2] + T.t[i]);
const applyInv = (T, p) => { const q = [p[0] - T.t[0], p[1] - T.t[1], p[2] - T.t[2]]; return [0, 1, 2].map((i) => T.R[0][i] * q[0] + T.R[1][i] * q[1] + T.R[2][i] * q[2]); };
const transpose = (M) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => M[j][i]));
const mulM = (A, B) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]));

// one body as its own exact STEP (a body kept as an importedSolid)
export function solidStep(rk, handle, name) {
  const buf = rk.solid_handle_to_buffer(handle);
  const solid = rk.WasmBrepSolid.from_buffer(buf.take_data(), buf.names_json());
  return solid.export_step(name, "mm", new Date().toISOString());
}

// ...and its triangles as ASCII STL: the mesh an importedSolid falls back to
// on a kernel with no STEP reader (registerImport(name, step, { mesh }))
export function solidStl(rk, handle, name, tolerance = 0.05) {
  const m = rk.tessellate_handle(handle, tolerance);
  const P = m.take_positions(), I = m.take_indices();
  const out = [`solid ${name}`];
  const f = (v) => (Math.abs(v) < 1e-12 ? 0 : +v.toPrecision(9));
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...n) || 1;
    out.push(` facet normal ${f(n[0] / l)} ${f(n[1] / l)} ${f(n[2] / l)}`, "  outer loop");
    for (const k of [a, b, c]) out.push(`   vertex ${f(P[k])} ${f(P[k + 1])} ${f(P[k + 2])}`);
    out.push("  endloop", " endfacet");
  }
  out.push(`endsolid ${name}`);
  return out.join("\n");
}

export function box(P) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of P) for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  return { lo, hi };
}
// the box of a body read by src/stepread.js (its vertices, as the kernel's box is)
export function boxOfSolid(s) {
  const P = [];
  for (const f of s.faces) for (const l of f.loops) for (const e of l.edges) { P.push(e.a, e.b); if (e.pts) P.push(...e.pts); }
  return box(P);
}
export const boxDist = (a, b) => [0, 1, 2].reduce((n, k) => n + Math.abs(a.lo[k] - b.lo[k]) + Math.abs(a.hi[k] - b.hi[k]), 0);
export function nearestByBox(kernel, b) {
  return kernel.filter((k) => !k.used && k.handle != null).sort((x, y) => boxDist(x.box, b) - boxDist(y.box, b))[0] ?? null;
}
// the reasons, each once: what a person needs to read (what was built and
// why it was not kept comes last, and matters most, so it is never cut)
export function summarize(why) {
  const out = [...new Set(why)];
  const built = out.filter((w) => /did not build|not the same shape|check failed/.test(w));
  const rest = out.filter((w) => !built.includes(w)).slice(0, Math.max(1, 4 - built.length));
  return [...rest, ...built].join("; ") || "no exact rebuild found";
}
