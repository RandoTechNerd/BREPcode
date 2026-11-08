// Close code made of a few primitives, for a body nothing rebuilds exactly.
//
// The mesh slices (step2code-mesh.js) cover a freeform body well but write
// it as dozens of thin layers nobody would edit. This writes it as a handful
// of extrude blocks instead, and needs no boolean: the blocks are a group,
// as the slices are.
//
//   The body is voxelised in its own frame (about two million cells, so a
//   thin wall gets several). Blocks are taken biggest first: each is a 2D
//   region extruded along one axis over a run of layers, where the body
//   fills the whole run, the one that covers the most body not yet covered.
//   The search runs along the frame's three axes and along frames square to
//   the body's biggest slanted flat faces ("Slant"). A block found in voxels
//   is then drawn from the body's real sections up its run, 4x finer (or the
//   section itself, where it does not change), its ends snapped onto the
//   flat faces they stand for. Where an outline runs round one of the file's
//   own cylinders it is written as one arcTo on that cylinder's centre and
//   radius: a fillet comes back as a true arc, a round hole as circle2d.
//
// Tried and dropped on a bench of 36 real bodies (scripts kept out of the
// repo): the outline seen along three axes intersected, then pockets cut and
// bosses added (the kernel's booleans fail where the pieces share planes,
// 0 of 9 built), and the small pieces first (an opening of the body strips
// off tabs and bosses, each its own block: best on prismatic parts, worst
// on slanted ones; kept as blocksApp).
//
// primCandidate(rk, k, T, solid) -> { pieces, cat, method, vox } | null
// primTarget(rk, k, T) -> target   (the file body, voxelised in its frame)
// primMethods(target, names) -> [{ name, expr, group, vox, prims }]

import { meshGrid, gridClassify } from "./step2code-verify.js";
import { clean, area2, nest, weld, dominantFrame, bridged, sectionLoops, crosses } from "./step2code-mesh.js";

const r4 = (v) => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? 0 : r; };
const rd = (v, d) => { const r = +v.toFixed(d); return Object.is(r, -0) ? 0 : r; };
// Close code comes within a few percent of the file, so its numbers need be
// no finer than a hundredth of a millimetre (a thousandth on a part under
// 10 mm): short enough for the code to travel in a share link.
const placesFor = (t) => (t.size >= 10 ? 2 : 3);
// a loop at d decimals, with the places it was written to. The two sides of
// a hair slit would round onto one point: those points keep 4 decimals. A
// loop that rounding still spoils (an edge crossing another, its area
// moving) keeps 4 throughout.
function roundLoop(l, d) {
  const key = (p) => `${p[0]},${p[1]}`;
  const dedupe = (a) => a.filter((x, i) => { const o = a[(i + a.length - 1) % a.length]; return a.length < 2 || key(x.p) !== key(o.p); });
  // neighbours that round together are one point; others that meet are a slit
  const r = dedupe(l.map((p, i) => ({ p: [rd(p[0], d), rd(p[1], d)], i })));
  const seen = new Map();
  for (const x of r) seen.set(key(x.p), (seen.get(key(x.p)) || 0) + 1);
  const q = dedupe(r.map((x) => ({ p: seen.get(key(x.p)) > 1 ? [r4(l[x.i][0]), r4(l[x.i][1])] : x.p }))).map((x) => x.p);
  const twice = new Set(q.map(key)).size < q.length;
  if (d >= 4 || q.length < 3 || twice || crosses(q) || Math.abs(area2(q) - area2(l)) > Math.abs(area2(l)) * 0.005) return { q: l.map((p) => [r4(p[0]), r4(p[1])]), d: 4 };
  return { q, d };
}
// the two in-plane axes of a view along `ax`, so that x cross y = the axis
const PLANE = [[1, 2], [2, 0], [0, 1]];

// ------------------------------------------------------------ the target

export function primTarget(rk, k, T = null, { cells = 2e6 } = {}) {
  const b = k.box, size0 = Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) || 1;
  const m = rk.tessellate_handle(k.handle, Math.max(0.01, size0 * 3e-4));
  const P0 = m.take_positions(), I = weld(P0, m.take_indices());
  // into the part's own frame (q = R^T (p - t)), then the body's frame F
  const n = P0.length / 3, V = new Float64Array(P0.length);
  for (let i = 0; i < n; i++) {
    let x = P0[3 * i], y = P0[3 * i + 1], z = P0[3 * i + 2];
    if (T) {
      x -= T.t[0]; y -= T.t[1]; z -= T.t[2];
      const R = T.R;
      [x, y, z] = [R[0][0] * x + R[1][0] * y + R[2][0] * z, R[0][1] * x + R[1][1] * y + R[2][1] * z, R[0][2] * x + R[1][2] * y + R[2][2] * z];
    }
    V[3 * i] = x; V[3 * i + 1] = y; V[3 * i + 2] = z;
  }
  return frameTarget(V, I, dominantFrame(V, I) || [[1, 0, 0], [0, 1, 0], [0, 0, 1]], { cells });
}

// the body (part-frame vertices V, triangles I) voxelised in frame B (rows)
export function frameTarget(V, I, B, { cells = 2e6 } = {}) {
  const n = V.length / 3;
  const Q = new Float64Array(V.length);
  for (let i = 0; i < n; i++) for (let a = 0; a < 3; a++) Q[3 * i + a] = B[a][0] * V[3 * i] + B[a][1] * V[3 * i + 1] + B[a][2] * V[3 * i + 2];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < Q.length; i++) { const a = i % 3; if (Q[i] < lo[a]) lo[a] = Q[i]; if (Q[i] > hi[a]) hi[a] = Q[i]; }
  const ext = [0, 1, 2].map((a) => hi[a] - lo[a]);
  const size = Math.max(...ext) || 1;
  // voxels: cubic cells, about `cells` of them through the box (so a thin
  // part gets cells across its walls), at most 400 along a side
  const c = Math.max(Math.cbrt(Math.max(ext[0], size * 1e-3) * Math.max(ext[1], size * 1e-3) * Math.max(ext[2], size * 1e-3) / cells), size / 400);
  const dims = ext.map((e) => Math.max(1, Math.ceil(e / c)));
  const grid = meshGrid(Q, I);
  const N = dims[0] * dims[1] * dims[2];
  const vox = new Uint8Array(N);
  let count = 0;
  // a layer at a time: two million points at once is a lot of small arrays
  const layer = dims[0] * dims[1];
  for (let z = 0; z < dims[2]; z++) {
    const pts = new Array(layer);
    for (let y = 0, i = 0; y < dims[1]; y++) for (let x = 0; x < dims[0]; x++, i++) pts[i] = [lo[0] + (x + 0.5) * c, lo[1] + (y + 0.5) * c, lo[2] + (z + 0.5) * c];
    const cls = gridClassify(grid, pts);
    for (let i = 0; i < layer; i++) if (cls[i] === "in") { vox[z * layer + i] = 1; count++; }
  }
  // the heights of the flat faces square to each axis (where blocks end)
  const caps = [[], [], []];
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], cc = 3 * I[t + 2];
    const u = [Q[b] - Q[a], Q[b + 1] - Q[a + 1], Q[b + 2] - Q[a + 2]], v = [Q[cc] - Q[a], Q[cc + 1] - Q[a + 1], Q[cc + 2] - Q[a + 2]];
    const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn);
    if (!l) continue;
    for (let k = 0; k < 3; k++) if (Math.abs(nn[k]) / l > 0.9999) caps[k].push(Q[a + k]);
  }
  for (const list of caps) { list.sort((x, y) => x - y); for (let i = list.length - 1; i > 0; i--) if (list[i] - list[i - 1] < size * 1e-6) list.splice(i, 1); }
  return { B, lo, hi, ext, size, c, dims, vox, count, Q, I, V, grid, caps };
}

// ------------------------------------------------------------ 2D outlines

// the boundary of an image's set pixels as loops (pixel corners), outer
// loops counter-clockwise and holes clockwise, the material on their left
export function contours(img, W, H) {
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && img[y * W + x] === 1;
  const out = new Map();     // start vertex -> [end vertices]
  const key = (x, y) => y * (W + 1) + x;
  const addE = (x0, y0, x1, y1) => { const k = key(x0, y0); if (!out.has(k)) out.set(k, []); out.get(k).push([x1, y1]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!at(x, y)) continue;
    if (!at(x, y - 1)) addE(x, y, x + 1, y);
    if (!at(x + 1, y)) addE(x + 1, y, x + 1, y + 1);
    if (!at(x, y + 1)) addE(x + 1, y + 1, x, y + 1);
    if (!at(x - 1, y)) addE(x, y + 1, x, y);
  }
  const loops = [];
  for (const [k0, list] of out) {
    while (list.length) {
      const sx = k0 % (W + 1), sy = Math.floor(k0 / (W + 1));
      const loop = [[sx, sy]];
      let [cx, cy] = list.pop();
      let dx = cx - sx, dy = cy - sy;
      for (let guard = 0; guard < 4 * (W + 1) * (H + 1) && key(cx, cy) !== k0; guard++) {
        const next = out.get(key(cx, cy));
        if (!next?.length) break;
        // at a pinch (two pixels touching corner to corner) turn left
        let pick = 0;
        if (next.length > 1) { const li = next.findIndex(([ex, ey]) => ex - cx === -dy && ey - cy === dx); if (li >= 0) pick = li; }
        const [ex, ey] = next.splice(pick, 1)[0];
        if (ex - cx !== dx || ey - cy !== dy) loop.push([cx, cy]);
        dx = ex - cx; dy = ey - cy; cx = ex; cy = ey;
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

// regions (outer + holes) of an image, in the view's plane coordinates
function regionsOf(img, W, H, s, u0, v0, minPx = 3, tol = 0.75) {
  const loops = contours(img, W, H).filter((l) => Math.abs(area2(l)) / 2 >= minPx);
  const cl = loops.map((l) => clean(l.map(([x, y]) => [x, y]), tol)).filter(Boolean).filter((l) => l.length >= 3);
  return nest(cl).map((rg) => ({
    outer: rg.outer.map(([x, y]) => [r4(u0 + x * s), r4(v0 + y * s)]),
    holes: rg.holes.map((h) => h.map(([x, y]) => [r4(u0 + x * s), r4(v0 + y * s)])),
  }));
}

// ------------------------------------------------------------ code

// a loop moved d out (counter-clockwise loops; d < 0 moves it in), each
// corner along its bisector
function offsetLoop(l0, d) {
  const l = area2(l0) > 0 ? l0 : [...l0].reverse();
  const n = l.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = l[(i + n - 1) % n], q = l[i], r = l[(i + 1) % n];
    const e1 = [q[0] - p[0], q[1] - p[1]], e2 = [r[0] - q[0], r[1] - q[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2];
    let m = [n1[0] + n2[0], n1[1] + n2[1]];
    const lm = Math.hypot(...m);
    if (lm < 1e-9) { out.push(q); continue; }
    m = [m[0] / lm, m[1] / lm];
    const k = d / Math.max(0.25, m[0] * n1[0] + m[1] * n1[1]);
    out.push([r4(q[0] + m[0] * k), r4(q[1] + m[1] * k)]);
  }
  return out;
}
// regions grown by d: outlines out, holes in. Pieces that meet face to face
// are what the kernel's booleans fail on, so each piece is grown by its own
// hair and no two share a plane.
const grow = (rgs, d) => (d ? rgs.map((rg) => ({ outer: offsetLoop(rg.outer, d), holes: rg.holes.map((h) => offsetLoop(h, -d)) })) : rgs);

const v3 = (v) => `[${v.map((c) => rd(c, 5)).join(", ")}]`;
const polyCode = (l, ccw, circles = null, places = 4) => {
  const { q, d } = roundLoop((area2(l) > 0) === ccw ? l : [...l].reverse(), places);
  return (circles?.length && arcCode(q, circles, d)) || `polygon([${q.map((p) => `[${p[0]}, ${p[1]}]`).join(", ")}])`;
};

// Fillets and round walls along the extrude: where an outline runs round
// one of the file's own cylinders (square to the profile), the run is
// written as one arcTo on that cylinder's exact centre and radius, not as
// the polyline the section gave. null when no run is found.
function arcCode(l, circles, d = 4) {
  const n = l.length;
  const tol = (c) => Math.max(c.r * 0.02, 0.01);
  const on = l.map((p) => {
    let best = -1, d = Infinity;
    circles.forEach((c, k) => { const e = Math.abs(Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) - c.r); if (e < tol(c) && e < d) { d = e; best = k; } });
    return best;
  });
  // a loop wholly on one circle: the circle itself
  if (on.every((k) => k >= 0 && k === on[0])) { const c = circles[on[0]]; return `circle2d({ r: ${r4(c.r)}, center: [${rd(c.c[0], d)}, ${rd(c.c[1], d)}] })`; }
  // start where a run begins, so no run wraps past the end
  let s0 = on.findIndex((k, i) => k !== on[(i + n - 1) % n]);
  if (s0 < 0) return null;
  const ord = [...l.slice(s0), ...l.slice(0, s0)], ok = [...on.slice(s0), ...on.slice(0, s0)];
  // the ends on the circle, then rounded: an arc written by its radius
  // (arcTo(end, { r })) needs no more than that
  const snap = (p, c) => { const e = Math.hypot(p[0] - c.c[0], p[1] - c.c[1]) || 1; return [rd(c.c[0] + (p[0] - c.c[0]) * c.r / e, d), rd(c.c[1] + (p[1] - c.c[1]) * c.r / e, d)]; };
  const items = [];
  let arcs = 0;
  for (let i = 0; i < n;) {
    let j = i;
    while (j + 1 < n && ok[j + 1] === ok[i] && ok[i] >= 0) j++;
    if (ok[i] >= 0 && j - i >= 2) {
      const c = circles[ok[i]], a = snap(ord[i], c), b = snap(ord[j], c);
      let turn = 0;
      for (let q = i; q < j; q++) { const u = [ord[q][0] - c.c[0], ord[q][1] - c.c[1]], v = [ord[q + 1][0] - c.c[0], ord[q + 1][1] - c.c[1]]; turn += Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]); }
      if (Math.abs(turn) > 0.08 && Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-3) {
        // by its radius; an arc near a half turn by a point it passes
        // through instead, since rounding can stretch its chord past 2r
        const chord = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (chord < 2 * c.r * 0.999) items.push(`[${a[0]}, ${a[1]}]`, `arcTo([${b[0]}, ${b[1]}], { r: ${r4(c.r)}${turn < 0 ? ", cw: true" : ""}${Math.abs(turn) > Math.PI ? ", large: true" : ""} })`);
        else {
          const m = Math.atan2(a[1] - c.c[1], a[0] - c.c[0]) + turn / 2;
          items.push(`[${a[0]}, ${a[1]}]`, `arcTo([${rd(c.c[0] + c.r * Math.cos(m), d)}, ${rd(c.c[1] + c.r * Math.sin(m), d)}], [${b[0]}, ${b[1]}])`);
        }
        arcs++;
        i = j + 1;
        continue;
      }
    }
    for (let q = i; q <= j; q++) items.push(`[${ord[q][0]}, ${ord[q][1]}]`);
    i = j + 1;
  }
  if (!arcs) return null;
  // two arcs meeting leave the same point twice: once is enough
  const tidy = items.filter((x, i) => x !== items[i - 1]);
  return `path2d(${tidy.join(", ")})`;
}
// the file's cylinders square to the frame axis ax, in that view's plane
function circlesFor(t, ax) {
  if (!t.hints) return null;
  t.circleCache ||= [];
  if (t.circleCache[ax]) return t.circleCache[ax];
  const [ux, uy] = PLANE[ax], out = [];
  for (const cy of t.hints.cylinders) {
    const z = [0, 1, 2].map((a) => t.B[a][0] * cy.z[0] + t.B[a][1] * cy.z[1] + t.B[a][2] * cy.z[2]);
    if (Math.abs(Math.abs(z[ax]) - 1) > 1e-6) continue;
    const o = [0, 1, 2].map((a) => t.B[a][0] * cy.o[0] + t.B[a][1] * cy.o[1] + t.B[a][2] * cy.o[2]);
    if (!out.some((c) => Math.hypot(c.c[0] - o[ux], c.c[1] - o[uy]) < 1e-6 && Math.abs(c.r - cy.r) < 1e-6)) out.push({ c: [o[ux], o[uy]], r: cy.r });
  }
  return (t.circleCache[ax] = out);
}
// the file's own surfaces (its cylinders), in the part's frame, as hints
export function primHints(t, solid, T = null) {
  const inv = (p) => (T ? [0, 1, 2].map((a) => T.R[0][a] * (p[0] - T.t[0]) + T.R[1][a] * (p[1] - T.t[1]) + T.R[2][a] * (p[2] - T.t[2])) : p);
  const invD = (d) => (T ? [0, 1, 2].map((a) => T.R[0][a] * d[0] + T.R[1][a] * d[1] + T.R[2][a] * d[2]) : d);
  t.hints = { cylinders: solid.faces.filter((f) => f.surface.type === "cylinder").map((f) => ({ o: inv(f.surface.o), z: invD(f.surface.z), r: f.surface.r })) };
  for (const f of t.frames || []) f.hints = t.hints;
  return t;
}
// regions extruded along frame axis ax from z0 to z1 (frame units)
function extrudeCode(t, ax, regions, z0, z1) {
  const [ux] = PLANE[ax];
  const ident = t.B.every((r, i) => r.every((x, j) => Math.abs(x - (i === j ? 1 : 0)) < 1e-12));
  const on = ax === 2 && ident ? "" : `, on: { normal: ${v3(t.B[ax])}, x: ${v3(t.B[ux])} }`;
  const d = placesFor(t);
  // holes joined to the outside by a hair slit: one outline, no boolean
  const prof = (rg) => {
    const cs = circlesFor(t, ax);
    if (!rg.holes.length) return polyCode(rg.outer, true, cs, d);
    // round holes as true circles in a region (a hole the file has as a
    // cylinder); otherwise holes joined to the outside by a hair slit
    if (cs?.length) {
      const hs = rg.holes.map((h) => polyCode(h, false, cs, d));
      if (hs.every((h) => h.startsWith("circle2d"))) return `region2d(${polyCode(rg.outer, true, cs, d)}, ${hs.join(", ")})`;
    }
    const w = Math.max(t.size * 2e-5, 0.002);
    const sl = bridged(rg.outer, rg.holes, w);
    return sl ? polyCode(sl, true, cs, d) : `region2d(${polyCode(rg.outer, true, null, d)}, ${rg.holes.map((h) => polyCode(h, false, null, d)).join(", ")})`;
  };
  // the ends rounded and the height between them, so the block ends where
  // its neighbours start; a block thinner than that keeps 4 decimals
  let s0 = rd(z0, d), h = rd(rd(z1, d) - s0, d);
  if (!(h > 0)) { s0 = r4(z0); h = r4(z1 - z0); }
  const one = (rg) => `linearExtrude({ h: ${h}, start: ${s0}${on} }, ${prof(rg)})`;
  const list = regions.map(one);
  return list.length === 1 ? list[0] : `union(${list.join(", ")})`;
}

// ------------------------------------------------------------ voxel sets

const idx = (t, x, y, z) => x + t.dims[0] * (y + t.dims[1] * z);
// how near a voxel cover C comes to the body (as coverage() counts it)
function score(t, C) {
  let miss = 0, extra = 0;
  for (let i = 0; i < C.length; i++) { if (t.vox[i] && !C[i]) miss++; else if (!t.vox[i] && C[i]) extra++; }
  return { match: Math.max(0, 1 - (miss + extra) / t.count), miss, extra };
}

// 6-connected components of a mask, biggest first: [{ cells: Int32Array, lo, hi }]
function components(t, mask, minVox) {
  const [nx, ny] = t.dims, N = mask.length;
  const seen = new Uint8Array(N), out = [];
  const q = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!mask[s] || seen[s]) continue;
    let h = 0, e = 0;
    q[e++] = s; seen[s] = 1;
    const lo = [Infinity, Infinity, Infinity], hi = [-1, -1, -1];
    while (h < e) {
      const i = q[h++];
      const x = i % nx, y = Math.floor(i / nx) % ny, z = Math.floor(i / (nx * ny));
      const p = [x, y, z];
      for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
      const nb = [x > 0 ? i - 1 : -1, x < nx - 1 ? i + 1 : -1, y > 0 ? i - nx : -1, y < ny - 1 ? i + nx : -1, z > 0 ? i - nx * ny : -1, z < t.dims[2] - 1 ? i + nx * ny : -1];
      for (const j of nb) if (j >= 0 && mask[j] && !seen[j]) { seen[j] = 1; q[e++] = j; }
    }
    if (e >= minVox) out.push({ cells: q.slice(0, e), lo, hi });
  }
  return out.sort((a, b) => b.cells.length - a.cells.length);
}

// a mask shrunk by r cells, then grown back (an opening: strips off what
// is thinner than 2r)
function opening(t, mask, r) {
  const [nx, ny] = t.dims;
  const pass = (M, keepIf) => {
    let A = M;
    for (let a = 0; a < 3; a++) {
      const Bm = new Uint8Array(A.length);
      const step = a === 0 ? 1 : a === 1 ? nx : nx * ny, n = t.dims[a];
      for (let i = 0; i < A.length; i++) {
        const p = a === 0 ? i % nx : a === 1 ? Math.floor(i / nx) % ny : Math.floor(i / (nx * ny));
        let any = 0, all = 1;
        for (let d = -r; d <= r; d++) { const q = p + d; const v = q >= 0 && q < n ? A[i + d * step] : 0; if (v) any = 1; else all = 0; }
        Bm[i] = keepIf === "all" ? all : any;
      }
      A = Bm;
    }
    return A;
  };

  return pass(pass(mask, "all"), "any");
}

// ------------------------------------------------------------ blocks

// The body covered by extrude blocks, no boolean anywhere: each block is a
// 2D region extruded along one frame axis over [a, b] (in cells), kept as a
// group with the rest. The region is where the body fills at least (1 - tau)
// of the run, so tau = 0 never adds material and a little lets a block run
// over a fillet or a draft. pick: "gain" takes the block that covers the
// most body not yet covered.
function bestBlock(t, R, tau, lambda, minVox, axes = [0, 1, 2]) {
  let best = null;
  for (const ax of axes) {
    const ad = axisData(t, ax), { W, H, n, TP, ev } = ad;
    const A = W * H;
    // the uncovered part's running count up the axis, per column (one
    // buffer per axis, refilled each pick)
    const RP = (ad.RP ||= new Uint32Array((n + 1) * A));
    const [ux, uy] = PLANE[ax];
    const st = [1, t.dims[0], t.dims[0] * t.dims[1]];
    for (let w = 0; w < n; w++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = y * W + x;
      RP[(w + 1) * A + c] = RP[w * A + c] + R[x * st[ux] + y * st[uy] + w * st[ax]];
    }
    // runs start and end where the section changes: inside a stretch of one
    // section a longer run only covers more
    for (let i = 0; i < ev.length; i++) {
      const a = ev[i];
      for (let j = i + 1; j < ev.length; j++) {
        const b = ev[j] - 1, len = b - a + 1, need = Math.ceil((1 - tau) * len - 1e-9);
        let gain = 0, extra = 0, cells = 0;
        const o1 = (b + 1) * A, o0 = a * A;
        for (let c = 0; c < A; c++) {
          const tc = TP[o1 + c] - TP[o0 + c];
          if (tc >= need && tc) { gain += RP[o1 + c] - RP[o0 + c]; extra += len - tc; cells++; }
        }
        if (!cells && tau === 0) break;
        const g = gain - lambda * extra;
        if (g >= minVox && (!best || g > best.g)) best = { g, gain, extra, ax, a, b, need, W, H };
      }
    }
  }
  if (best) {
    const { W, H, TP } = axisData(t, best.ax), A = W * H;
    const img = new Uint8Array(A);
    for (let c = 0; c < A; c++) { const tc = TP[(best.b + 1) * A + c] - TP[best.a * A + c]; img[c] = tc >= best.need && tc ? 1 : 0; }
    best.img = img;
  }
  return best;
}
// per axis, once: the body's running count up the axis per column, and the
// layers where its section changes (at most 64 of them, the biggest changes)
function axisData(t, ax) {
  t.axisCache ||= [];
  if (t.axisCache[ax]) return t.axisCache[ax];
  const [ux, uy] = PLANE[ax];
  const W = t.dims[ux], H = t.dims[uy], n = t.dims[ax], A = W * H;
  const st = [1, t.dims[0], t.dims[0] * t.dims[1]];
  const TP = new Uint32Array((n + 1) * A);
  const change = new Float64Array(n + 1);
  for (let w = 0; w < n; w++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = y * W + x;
    const v = t.vox[x * st[ux] + y * st[uy] + w * st[ax]];
    TP[(w + 1) * A + c] = TP[w * A + c] + v;
    if (w > 0 && v !== t.vox[x * st[ux] + y * st[uy] + (w - 1) * st[ax]]) change[w]++;
  }
  const cand = [];
  for (let w = 1; w < n; w++) if (change[w] >= 2) cand.push(w);
  cand.sort((p, q) => change[q] - change[p]);
  const ev = [0, ...cand.slice(0, 62).sort((p, q) => p - q), n];
  return (t.axisCache[ax] = { W, H, n, TP, ev });
}
// the cells of a block's voxel region, over its run
function blockCells(t, blk, fn) {
  const [ux, uy] = PLANE[blk.ax];
  for (let y = 0; y < blk.H; y++) for (let x = 0; x < blk.W; x++) {
    if (!blk.img[y * blk.W + x]) continue;
    for (let w = blk.a; w <= blk.b; w++) { const p = [0, 0, 0]; p[ux] = x; p[uy] = y; p[blk.ax] = w; fn(idx(t, p[0], p[1], p[2])); }
  }
}
// a cell-boundary height moved to the flat face it stands for, if one is near
function snapCap(t, ax, h) {
  const list = t.caps[ax];
  let best = h, d = t.c * 0.75;
  for (const v of list) if (Math.abs(v - h) < d) { d = Math.abs(v - h); best = v; }
  return best;
}
// a block as code: its outline taken from the body's real section halfway
// up it (the voxels only found it), its ends moved onto the flat faces
// they stand for, a hair over so neighbouring blocks overlap, not part
function blockCode(t, blk) {
  const [ux, uy] = PLANE[blk.ax];
  const ax = blk.ax;
  let z0 = t.lo[ax] + blk.a * t.c, z1 = t.lo[ax] + (blk.b + 1) * t.c;
  z0 = snapCap(t, ax, z0); z1 = snapCap(t, ax, z1);
  const hair = t.size * 2e-5;
  let rgs = null;
  if (z1 - z0 > t.size * 1e-4) {
    // the block's outline drawn 4x finer than the voxels: the overlap of the
    // body's real sections up its run (what it fills all the way up), kept
    // to the block's own region grown by a cell
    const k = 4, s = t.c / k, Wf = blk.W * k, Hf = blk.H * k;
    let fine = null;
    const imgs = [], raws = [];
    for (const f of [0.04, 0.2, 0.35, 0.5, 0.65, 0.8, 0.96]) {
      const raw = sectionLoops(t.Q, t.I, ax, ux, uy, z0 + (z1 - z0) * f + t.size * 1.3e-7, t.size * 2e-3);
      const img = scanFill(raw, Wf, Hf, s, t.lo[ux], t.lo[uy]);
      imgs.push(img); raws.push(raw);
      if (!fine) fine = img.slice(); else for (let i = 0; i < img.length; i++) fine[i] &= img[i];
    }
    const near = dilate(blk.img, blk.W, blk.H, 1);
    for (let y = 0; y < Hf; y++) for (let x = 0; x < Wf; x++) if (!near[Math.floor(y / k) * blk.W + Math.floor(x / k)]) fine[y * Wf + x] = 0;
    // the section the same all the way up (a prism): its real outline, each
    // of its regions that lies in the block, rather than the raster's steps
    const mid = imgs[3];
    let same = true;
    for (const img of imgs) { let d = 0, n = 0; for (let i = 0; i < img.length; i++) { if (img[i] !== mid[i]) d++; if (mid[i]) n++; } if (d > Math.max(n * 0.004, 8)) { same = false; break; } }
    if (same) {
      const tol = Math.max(t.size * 5e-4, 0.005);
      const loops = raws[3].map((l) => clean(l, tol)).filter((l) => l && Math.abs(area2(l)) > tol * tol);
      const mine = [];
      let covered = 0, total = 0;
      for (let i = 0; i < fine.length; i++) if (fine[i]) total++;
      for (const rg of nest(loops)) {
        const R = scanFill([rg.outer, ...rg.holes], Wf, Hf, s, t.lo[ux], t.lo[uy]);
        let n = 0, hit = 0;
        for (let i = 0; i < R.length; i++) if (R[i]) { n++; if (fine[i]) hit++; }
        if (n && hit / n > 0.9) { mine.push(rg); covered += hit; }
      }
      if (mine.length && covered > total * 0.9) rgs = mine;
    }
    // a staircase only straightens past a pixel's tolerance
    if (!rgs) { const r = regionsOf(fine, Wf, Hf, s, t.lo[ux], t.lo[uy], k * k, 1.25); if (r.length) rgs = r; }
  }
  if (!rgs) rgs = regionsOf(blk.img, blk.W, blk.H, t.c, t.lo[ux], t.lo[uy], 2);
  if (!rgs.length) return { codes: [], rgs, z0, z1 };
  return { codes: rgs.map((rg) => extrudeCode(t, ax, grow([rg], hair), z0 - hair, z1 + hair)), rgs, z0, z1 };
}
// the cells a written block covers (centres inside its regions, in its run)
function writtenCells(t, ax, rgs, z0, z1, fn) {
  const [ux, uy] = PLANE[ax];
  const w0 = Math.max(0, Math.round((z0 - t.lo[ax]) / t.c)), w1 = Math.min(t.dims[ax] - 1, Math.round((z1 - t.lo[ax]) / t.c) - 1);
  for (const rg of rgs) {
    const xs = rg.outer.map((p) => p[0]), ys = rg.outer.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor((Math.min(...xs) - t.lo[ux]) / t.c)), x1 = Math.min(t.dims[ux] - 1, Math.floor((Math.max(...xs) - t.lo[ux]) / t.c));
    const y0 = Math.max(0, Math.floor((Math.min(...ys) - t.lo[uy]) / t.c)), y1 = Math.min(t.dims[uy] - 1, Math.floor((Math.max(...ys) - t.lo[uy]) / t.c));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const p = [t.lo[ux] + (x + 0.5) * t.c, t.lo[uy] + (y + 0.5) * t.c];
      if (!inPoly(p, rg.outer) || rg.holes.some((h) => inPoly(p, h))) continue;
      for (let w = w0; w <= w1; w++) { const q = [0, 0, 0]; q[ux] = x; q[uy] = y; q[ax] = w; fn(idx(t, q[0], q[1], q[2])); }
    }
  }
}
// loops filled into an image (even-odd, so holes stay empty), by scanlines
function scanFill(loops, W, H, s, u0, v0) {
  const img = new Uint8Array(W * H);
  const rows = Array.from({ length: H }, () => []);
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const p = l[i], q = l[(i + 1) % l.length];
    const y0 = (p[1] - v0) / s - 0.5, y1 = (q[1] - v0) / s - 0.5;
    if (y0 === y1) continue;
    const lo = Math.max(0, Math.ceil(Math.min(y0, y1))), hi = Math.min(H - 1, Math.floor(Math.max(y0, y1) - 1e-12));
    for (let y = lo; y <= hi; y++) rows[y].push(((p[0] - u0) / s - 0.5) + ((y - y0) / (y1 - y0)) * ((q[0] - p[0]) / s));
  }
  for (let y = 0; y < H; y++) {
    const xs = rows[y].sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const a = Math.max(0, Math.ceil(xs[i])), b = Math.min(W - 1, Math.floor(xs[i + 1]));
      for (let x = a; x <= b; x++) img[y * W + x] = 1;
    }
  }
  return img;
}
function dilate(img, W, H, r) {
  const out = new Uint8Array(img.length);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!img[y * W + x]) continue;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) out[Y * W + X] = 1; }
  }
  return out;
}
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
function coverBlocks(t, { tau = 0, lambda = 1, max = 30, until = 0.995, order = null, R: R0 = null } = {}) {
  const minVox = Math.max(4, Math.round(t.count * 0.001));
  const R = R0 || t.vox.slice(), C = new Uint8Array(t.vox.length);
  let left = R0 ? R0.reduce((m, v) => m + v, 0) : t.count;
  const pieces = [], written = [];
  const take = (blk) => {
    const w = blockCode(t, blk);
    const mark = (i) => { C[i] = 1; if (R[i]) { R[i] = 0; left--; } };
    // what was written is what is covered (a block found in voxels but
    // written from the real section covers what the section does)
    const before = left;
    writtenCells(t, blk.ax, w.rgs, w.z0, w.z1, mark);
    // a block whose outline covers nothing new is not written; its voxels
    // are let go so the search moves on
    if (left === before) { blockCells(t, blk, (i) => { if (R[i]) { R[i] = 0; left--; } }); return; }
    pieces.push(...w.codes);
    written.push({ B: t.B, ax: blk.ax, rgs: w.rgs, z0: w.z0, z1: w.z1 });
  };
  // the small pieces first: each region an opening strips off, covered by
  // its own best block before the core
  if (order === "appendages") {
    const core = opening(t, t.vox, 2);
    const app = new Uint8Array(t.vox.length);
    for (let i = 0; i < app.length; i++) app[i] = t.vox[i] && !core[i] ? 1 : 0;
    for (const comp of components(t, app, minVox).slice(0, 12)) {
      const M = new Uint8Array(t.vox.length);
      for (const i of comp.cells) M[i] = R[i];
      const blk = bestBlock(t, M, tau, lambda, minVox / 2);
      if (blk) take(blk);
    }
  }
  while (pieces.length < max && left > t.count * (1 - until)) {
    const blk = bestBlock(t, R, tau, lambda, minVox);
    if (!blk) break;
    take(blk);
  }
  return { pieces, C, written };
}

// The plane normals of the body's biggest flat faces that are not square
// to its frame, as frames of their own: slanted walls get blocks along
// them. A frame row is unit, the third row the normal.
function slantFrames(t, max = 2) {
  const { V, I } = t, bins = [];
  for (let i = 0; i < I.length; i += 3) {
    const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2];
    const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    let nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nn);
    if (!l) continue;
    nn = nn.map((x) => x / l);
    if (t.B.some((r) => Math.abs(r[0] * nn[0] + r[1] * nn[1] + r[2] * nn[2]) > 0.9998)) continue;
    const hit = bins.find((x) => Math.abs(x.n[0] * nn[0] + x.n[1] * nn[1] + x.n[2] * nn[2]) > 0.9999);
    if (hit) hit.area += l / 2; else bins.push({ n: nn, area: l / 2 });
  }
  bins.sort((p, q) => q.area - p.area);
  // a real flat face, not the facets of a curved one (each facet its own
  // normal, each a sliver of the surface)
  let total = 0;
  for (let i = 0; i < I.length; i += 3) {
    const a = 3 * I[i], b = 3 * I[i + 1], c = 3 * I[i + 2];
    const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    total += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  const out = [];
  for (const { n: d, area } of bins) {
    if (out.length >= max || area < total * 0.02) break;
    // skip a normal at right angles to one already taken: its blocks run
    // along that frame's own axes
    if (out.some((F) => F.some((r) => Math.abs(r[0] * d[0] + r[1] * d[1] + r[2] * d[2]) > 0.9998))) continue;
    // x: the frame axis least along d, made square to it
    const base = [...t.B].sort((p, q) => Math.abs(p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) - Math.abs(q[0] * d[0] + q[1] * d[1] + q[2] * d[2]))[0];
    const k = base[0] * d[0] + base[1] * d[1] + base[2] * d[2];
    let x = [base[0] - k * d[0], base[1] - k * d[1], base[2] - k * d[2]];
    const lx = Math.hypot(...x); x = x.map((q) => q / lx);
    const y = [d[1] * x[2] - d[2] * x[1], d[2] * x[0] - d[0] * x[2], d[0] * x[1] - d[1] * x[0]];
    out.push([x, y, d]);
  }
  return out;
}
// is a part-frame point inside a written block (regions in its frame)
function inWritten(w, p) {
  const q = [0, 1, 2].map((a) => w.B[a][0] * p[0] + w.B[a][1] * p[1] + w.B[a][2] * p[2]);
  if (q[w.ax] < w.z0 || q[w.ax] > w.z1) return false;
  const [ux, uy] = PLANE[w.ax], pt = [q[ux], q[uy]];
  return w.rgs.some((rg) => inPoly(pt, rg.outer) && !rg.holes.some((h) => inPoly(pt, h)));
}

// Every pick the best block of any frame (by the volume it covers): the
// body's own frame and its slanted ones, each with its own voxels, all kept
// up to date with what has been written.
function coverInterleaved(t, { max = 30, until = 0.995, tau = 0, lambda = 1, slants = 2 } = {}) {
  const frames = [t, ...slantFrames(t, slants).map((F) => Object.assign(frameTarget(t.V, t.I, F, { cells: 1e6 }), { hints: t.hints }))];
  const Rs = frames.map((f) => f.vox.slice());
  const lefts = frames.map((f) => f.count);
  const pieces = [];
  const written = [];
  const vol = t.count * t.c ** 3;
  while (pieces.length < max && lefts[0] > t.count * (1 - until)) {
    let best = null;
    frames.forEach((f, k) => {
      const blk = bestBlock(f, Rs[k], tau, lambda, Math.max(4, Math.round(f.count * 0.001)));
      // the body's own frame wins a near tie (its blocks are square to it)
      const v = blk ? blk.g * f.c ** 3 * (k ? 1 / 1.02 : 1) : 0;
      if (blk && (!best || v > best.v)) best = { blk, k, v };
    });
    if (!best || best.v < vol * 1e-3) break;
    const f = frames[best.k];
    const w = blockCode(f, best.blk);
    const rec = { B: f.B, ax: best.blk.ax, rgs: w.rgs, z0: w.z0, z1: w.z1 };
    // mark it covered in every frame (its own by cells, the others by test)
    let gained = 0;
    frames.forEach((g, k) => {
      const R = Rs[k], [nx, ny] = g.dims;
      if (k === best.k) {
        writtenCells(g, rec.ax, rec.rgs, rec.z0, rec.z1, (i) => { if (R[i]) { R[i] = 0; lefts[k]--; gained++; } });
        return;
      }
      for (let i = 0; i < R.length; i++) {
        if (!R[i]) continue;
        const x = i % nx, y = Math.floor(i / nx) % ny, z = Math.floor(i / (nx * ny));
        const q = [g.lo[0] + (x + 0.5) * g.c, g.lo[1] + (y + 0.5) * g.c, g.lo[2] + (z + 0.5) * g.c];
        const pp = [0, 1, 2].map((a) => g.B[0][a] * q[0] + g.B[1][a] * q[1] + g.B[2][a] * q[2]);
        if (inWritten(rec, pp)) { R[i] = 0; lefts[k]--; }
      }
    });
    if (!gained) { blockCells(f, best.blk, (i) => { if (Rs[best.k][i]) { Rs[best.k][i] = 0; lefts[best.k]--; } }); continue; }
    pieces.push(...w.codes);
    written.push(rec);
  }
  const C = new Uint8Array(t.vox.length);
  for (let i = 0; i < C.length; i++) if (t.vox[i] && !Rs[0][i]) C[i] = 1;
  return { pieces, C };
}

// ------------------------------------------------------------ methods

export const METHODS = {};

const blockMethod = (o) => (t, opts) => { const r = coverBlocks(t, { ...o, ...opts }); return { group: r.pieces, C: r.C }; };
Object.assign(METHODS, {
  blocks: blockMethod({}),
  blocksApp: blockMethod({ order: "appendages" }),
  blocksSlant: (t, opts) => { const r = coverInterleaved(t, { ...opts }); return { group: r.pieces, C: r.C }; },
  blocksSlant60: (t, opts) => { const r = coverInterleaved(t, { max: 60, until: 0.998, ...opts }); return { group: r.pieces, C: r.C }; },
});
export const groupOf = (pieces) => (pieces.length === 1 ? pieces[0] : `group(\n  ${pieces.join(",\n  ")},\n)`);

export function primMethods(t, names = Object.keys(METHODS), opts = {}) {
  return names.map((name) => {
    const t0 = Date.now();
    const r = METHODS[name](t, opts[name] || {});
    const expr = groupOf(r.group);
    const prims = (expr.match(/linearExtrude\(/g) || []).length;
    return { name, expr, group: r.group, vox: score(t, r.C), prims, ms: Date.now() - t0 };
  });
}

// ------------------------------------------------------------ categories

// What kind of body this is, from its faces (as read from the STEP file)
// and its voxels: the method to try first follows from it.
//   turned:    most of its face weight turns about one axis
//   prismatic: flat faces and cylinders square to its frame
//   plate:     thin across one axis
//   freeform:  mostly spline faces
//   mixed:     the rest
// A face's weight is the vector area of its outer loop (exact for a flat
// face, its shadow for a curved one): a rough share, enough to sort by.
export function categorize(solid, t) {
  const w = { plane: 0, planeAx: 0, cyl: 0, cylAx: 0, rev: 0, spline: 0, other: 0, total: 0 };
  const axes = [];
  const along = (d) => t.B.some((b) => Math.abs(Math.abs(b[0] * d[0] + b[1] * d[1] + b[2] * d[2]) - 1) < 1e-3);
  for (const f of solid.faces) {
    const l = f.loops?.[0];
    if (!l) continue;
    const pts = l.edges.flatMap((e) => (e.pts?.length ? [e.a, ...e.pts.slice(1, -1)] : [e.a]));
    const nrm = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      nrm[0] += (p[1] - q[1]) * (p[2] + q[2]); nrm[1] += (p[2] - q[2]) * (p[0] + q[0]); nrm[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    // a closed curved face (a full cylinder) has no shadow: its size instead
    let a = Math.hypot(...nrm) / 2;
    const s = f.surface;
    if (a < 1e-9 && s.r) a = Math.PI * s.r * s.r;
    w.total += a;
    if (s.type === "plane") { w.plane += a; if (along(s.z)) w.planeAx += a; }
    else if (s.type === "cylinder") { w.cyl += a; if (along(s.z)) w.cylAx += a; }
    else if (s.type === "bspline" || s.type === "other") w.spline += a;
    else w.other += a;
    if (s.type === "cylinder" || s.type === "cone" || s.type === "torus" || (s.type === "sphere")) {
      const hit = axes.find((x) => Math.abs(Math.abs(x.z[0] * s.z[0] + x.z[1] * s.z[1] + x.z[2] * s.z[2]) - 1) < 1e-4 && lineDist(x, s.o) < t.size * 1e-3);
      if (hit) hit.a += a; else axes.push({ z: s.z, o: s.o, a });
    }
  }
  const tot = w.total || 1;
  const turnedA = Math.max(0, ...axes.map((x) => x.a));
  const flat = [...t.ext].sort((p, q) => p - q);
  const feats = {
    plane: w.plane / tot, planeAx: w.planeAx / tot, cyl: w.cyl / tot, cylAx: w.cylAx / tot, spline: w.spline / tot, curved: w.other / tot,
    turned: turnedA / tot, thin: flat[0] / (flat[2] || 1), fill: t.count / (t.dims[0] * t.dims[1] * t.dims[2]), faces: solid.faces.length,
  };
  let cat = "mixed";
  if (feats.spline > 0.5) cat = "freeform";
  else if (feats.turned > 0.6 && feats.plane < 0.4) cat = "turned";
  else if (feats.planeAx + feats.cylAx > 0.8) cat = feats.thin < 0.15 ? "plate" : "prismatic";
  else if (feats.thin < 0.15) cat = "plate";
  return { cat, feats };
}
function lineDist(L, p) {
  const d = [p[0] - L.o[0], p[1] - L.o[1], p[2] - L.o[2]];
  const h = d[0] * L.z[0] + d[1] * L.z[1] + d[2] * L.z[2];
  return Math.hypot(d[0] - h * L.z[0], d[1] - h * L.z[1], d[2] - h * L.z[2]);
}

// ------------------------------------------------------------ the candidate

// which method each kind of body gets, from a bench of 36 real bodies no
// exact rebuild covers: on prismatic parts 30 blocks came within a point of
// the slices 11 times in 12 (0.982 mean, 24 blocks against 112 slices);
// plates, mixed and freeform bodies need the 60 (0.965, 0.936, 0.950)
const PICK = { prismatic: "blocksSlant", plate: "blocksSlant60", mixed: "blocksSlant60", freeform: "blocksSlant60", turned: "blocksSlant60" };

// The file body k (placed by T) as primitive blocks: { pieces, cat, method,
// vox } or null. solid: the body as read (its cylinders become exact arcs).
export function primCandidate(rk, k, T, solid, { method = null } = {}) {
  if (k?.handle == null) return null;
  try {
    const t = primTarget(rk, k, T);
    if (!t.count) return null;
    if (solid) primHints(t, solid, T);
    const cat = solid ? categorize(solid, t).cat : "mixed";
    const name = method || PICK[cat] || "blocksSlant";
    const [m] = primMethods(t, [name]);
    return m?.group?.length ? { pieces: m.group, cat, method: name, vox: m.vox.match } : null;
  } catch { return null; }
}
