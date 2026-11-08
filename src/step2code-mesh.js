// STEP -> BREPcode, the last resort for the "close" offer: a body sliced off
// its triangles (the kernel's own tessellation of the file's solid), for the
// bodies nothing else comes near, freeform (B-spline) ones above all. Layers
// between the heights where the body has flat faces, more where the section
// changes, each its mid-height section as polygons (holes kept), extruded.
// Never exact: the checker measures it (coverage) and offers it with what it
// leaves out and adds.
//
// meshSliced({ P, I }, T) -> { kind, expr, dials, approx: true, pieces } | { why }
//   pieces: per slice, the ways to write it, best first
// slicesOf(pieces) -> the candidate for the slices that build (a slice the
//   kernel refuses is left out, and shows as missing)
//   P, I: positions and indices in file coordinates; T: the body's placement
//   (the code is written in the part's own frame, like every other candidate)

const LAYERS = 80;           // at most this many layers
const POINTS = 24000;        // and this many outline points in all

export function meshSliced({ P, I: I0 }, T = null) {
  // one vertex per position: the kernel tessellates each face on its own, so
  // two faces repeat the vertices along the edge they share
  const I = weld(P, I0);
  // into the part's own frame: q = R^T (p - t)
  const n = P.length / 3;
  const V = new Float64Array(P.length);
  for (let i = 0; i < n; i++) {
    let x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    if (T) {
      x -= T.t[0]; y -= T.t[1]; z -= T.t[2];
      const R = T.R;
      [x, y, z] = [R[0][0] * x + R[1][0] * y + R[2][0] * z, R[0][1] * x + R[1][1] * y + R[2][1] * z, R[0][2] * x + R[1][2] * y + R[2][2] * z];
    }
    V[3 * i] = x; V[3 * i + 1] = y; V[3 * i + 2] = z;
  }
  // A part drawn at an angle in its own frame (a lone body exported turned)
  // is sliced square to its biggest flat face instead: the vertices are
  // taken into that face's frame F, and the code places the slices by it.
  const F = dominantFrame(V, I);
  if (F) for (let i = 0; i < n; i++) {
    const x = V[3 * i], y = V[3 * i + 1], z = V[3 * i + 2];
    for (let k = 0; k < 3; k++) V[3 * i + k] = F[k][0] * x + F[k][1] * y + F[k][2] * z;
  }
  const basis = F || [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < V.length; i++) { const k = i % 3; if (V[i] < lo[k]) lo[k] = V[i]; if (V[i] > hi[k]) hi[k] = V[i]; }
  const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  // the axis with the most flat area square to it: the layers' direction
  const flat = [0, 0, 0], capH = [[], [], []];
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    const nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const area = Math.hypot(nx, ny, nz) / 2;
    if (!area) continue;
    [nx, ny, nz].forEach((m, k) => { if (Math.abs(m) / (2 * area) > 0.9999) { flat[k] += area; capH[k].push(V[a + k]); } });
  }
  // each axis's layers, and how far their steps would stray (the change in
  // section area across each sloping layer): the axis that strays least
  const plan = (ax) => {
    const [ux, uy] = ax === 2 ? [0, 1] : ax === 0 ? [1, 2] : [2, 0];
    const z0 = lo[ax], z1 = hi[ax], span = z1 - z0;
    if (!(span > 0)) return null;
    const eps = span * 1e-6;
    // the heights of its flat faces, then more layers where the section changes
    const caps = [z0, z1, ...capH[ax]].sort((a, b) => a - b).filter((h, i, s) => i === 0 || h - s[i - 1] > span * 1e-4);
    const runs = [];
    for (let i = 0; i + 1 < caps.length; i++) {
      const a = caps[i], b = caps[i + 1];
      // the section's area at five heights: how much it changes up the run
      const A = [1e-3, 0.25, 0.5, 0.75, 1 - 1e-3].map((f) => sectionArea(V, I, ax, ux, uy, a + (b - a) * f));
      runs.push({ a, b, change: (Math.max(...A) - Math.min(...A)) * (b - a) });
    }
    const budget = Math.max(LAYERS - caps.length, 0), total = runs.reduce((m, r) => m + r.change, 0) || 1;
    const cuts = [];
    let stray = 0;
    for (const r of runs) {
      cuts.push(r.a);
      const k = r.change > 1e-9 * total ? Math.min(Math.max(1, Math.round(budget * r.change / total)), 24) : 1;
      for (let j = 1; j < k; j++) cuts.push(r.a + (r.b - r.a) * j / k);
      stray += r.change / k;
    }
    cuts.push(z1);
    return { ax, ux, uy, span, eps, cuts, stray };
  };
  const plans = [0, 1, 2].map(plan).filter(Boolean);
  const best = plans.sort((a, b) => a.stray - b.stray || (flat[b.ax] - flat[a.ax]))[0];
  if (!best) return { why: "a flat body" };
  const { ax, ux, uy, span, eps, cuts } = best;
  let tolXY = Math.max(size * 5e-4, 0.005);
  let layers;
  for (let pass = 0; pass < 5; pass++) {
    layers = [];
    let count = 0;
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      if (b - a < eps * 10) continue;
      const raw = sectionLoops(V, I, ax, ux, uy, (a + b) / 2 + eps, size * 2e-3);
      const loops = raw.map((l) => clean(l, tolXY)).filter((l) => l && Math.abs(area2(l)) > tolXY * tolXY);
      count += loops.reduce((m, l) => m + l.length, 0);
      layers.push({ a, b, loops });
    }
    if (count <= POINTS) break;
    tolXY *= 2.5;
  }
  // neighbours whose outlines lie within the outline tolerance of each other
  // are one layer (the one written is the run's middle section): fewer,
  // taller slices build, export and edit faster; tighter and the same wall
  // simplified two ways does not merge, looser and a gentle slope merges
  // into steps that show in the match
  const near = tolXY;
  const merged = [];
  for (const L of layers) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.b - L.a) < eps * 10 && sameLoops(last.first, L.loops, near)) { last.b = L.b; last.run.push(L); }
    else merged.push({ a: L.a, b: L.b, first: L.loops, run: [L] });
  }
  for (const M of merged) {
    const mid = (M.a + M.b) / 2;
    M.loops = M.run.reduce((x, L) => (Math.abs((L.a + L.b) / 2 - mid) < Math.abs((x.a + x.b) / 2 - mid) ? L : x)).loops;
  }
  // the slices are a group, never unioned: a union of dozens of outlines
  // stacked face to face is what the kernel's boolean is weakest at, and the
  // slices together already are the shape
  const v3 = (v) => `[${v.map((c) => r3(c * 1e3) / 1e3).join(", ")}]`;
  const on = ax === 2 && !F ? "" : `, on: { normal: ${v3(basis[ax])}, x: ${v3(basis[ux])} }`;
  const pieces = [];
  merged.forEach((L, i) => {
    if (!L.loops.length) return;
    const start = L.a;
    for (const rg of nest(L.loops)) {
      const poly = (l, ccw) => { const q = (area2(l) > 0) === ccw ? l : [...l].reverse(); return `polygon([${q.map((p) => `[${p[0]}, ${p[1]}]`).join(", ")}])`; };
      const ex = (h, z, prof) => `linearExtrude({ h: ${r3(h)}, start: ${r3(z)}${on} }, ${prof})`;
      if (!rg.holes.length) { pieces.push([ex(L.b - start, start, poly(rg.outer, true))]); continue; }
      // the ways to write a slice with holes, best first: the kernel cuts a
      // profile's holes with a boolean that a mesh's ragged outline can
      // upset, so then each hole cut on its own, and last the outline alone
      const h = L.b - start, more = Math.max(h * 0.1, 0.01);
      // first: one outline, each hole joined to the outside by a slit a hair
      // wide, so the slice is a plain extrude with no boolean to fail (and
      // nothing for a STEP export to fuse)
      const w = Math.max(size * 2e-5, 0.002);
      // an outline that crosses itself (strands stitched across a gap) fails
      // every boolean, slowly: then only the slit outline, or the outline alone
      if (crosses(rg.outer)) {
        const one = bridged(rg.outer, rg.holes, w, true);
        pieces.push([...(one ? [ex(h, start, poly(one, true))] : []), ex(h, start, poly(rg.outer, true))]);
        continue;
      }
      const one = bridged(rg.outer, rg.holes, w);
      pieces.push([
        ...(one ? [ex(h, start, poly(one, true))] : []),
        ex(h, start, `region2d(${poly(rg.outer, true)}, ${rg.holes.map((x) => poly(x, false)).join(", ")})`),
        `difference(${ex(h, start, poly(rg.outer, true))}, ${rg.holes.map((x) => ex(h + 2 * more, start - more, poly(x, true))).join(", ")})`,
        ex(h, start, poly(rg.outer, true)),
      ]);
    }
  });
  if (!pieces.length) return { why: "no section" };
  return { ...slicesOf(pieces.map((w) => w[0])), pieces };
}
// the slices as one candidate (a group: never unioned)
export function slicesOf(pieces) {
  return { kind: "extrude", expr: pieces.length === 1 ? pieces[0] : `group(\n  ${pieces.join(",\n  ")},\n)`, dials: [], approx: true, group: true };
}

const r3 = (v) => { const r = Math.round(v * 1e4) / 1e4; return Object.is(r, -0) ? 0 : r; };

// a section loop made fit to write: repeats dropped, simplified to tol, and
// only if it does not cross itself (less simplified, or as it came, if it does)
export function clean(loop, tol) {
  const pts = loop.filter((p, i) => { const q = loop[(i + loop.length - 1) % loop.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6; });
  if (pts.length < 3) return null;
  for (const t of [tol, tol / 4, 0]) {
    const l = tidy((t ? simplify(pts, t) : pts).map((p) => [r3(p[0]), r3(p[1])]));
    if (l.length >= 3 && !crosses(l)) return l;
  }
  // crossing even as it came (two strands stitched across a gap): kept as
  // it came, rather than losing a whole outline
  const l = tidy(pts.map((p) => [r3(p[0]), r3(p[1])]));
  return l.length >= 3 ? l : null;
}
// no repeated point (wrapping round too) and no point a straight run or a
// spike passes through: an edge of no length is no edge to the kernel
function tidy(l) {
  let out = l;
  for (let changed = true; changed && out.length >= 3;) {
    changed = false;
    const keep = [];
    for (let i = 0; i < out.length; i++) {
      const p = out[(i + out.length - 1) % out.length], q = out[i], r = out[(i + 1) % out.length];
      const same = q[0] === p[0] && q[1] === p[1];
      const flat = Math.abs((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])) < 1e-9;
      if (same || flat) { changed = true; continue; }
      keep.push(q);
    }
    out = keep;
  }
  return out;
}
// does a closed loop cross itself (any two edges that are not neighbours)
export function crosses(l) {
  const n = l.length;
  if (n > 3000) return false;
  const o = (a, b, c) => Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
  for (let i = 0; i < n; i++) {
    const a = l[i], b = l[(i + 1) % n];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = l[j], d = l[(j + 1) % n];
      if (Math.max(c[0], d[0]) < x0 || Math.min(c[0], d[0]) > x1 || Math.max(c[1], d[1]) < y0 || Math.min(c[1], d[1]) > y1) continue;
      // a real crossing only: a loop may touch itself where two faces meet
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
    }
  }
  return false;
}

// the loops where the plane (axis ax) = h cuts the triangles: each crossing
// sits on a mesh edge, named by its two vertices, so the pieces chain exactly
export function sectionLoops(V, I, ax, ux, uy, h, gap = Infinity) {
  const next = new Map(), pt = new Map();
  const key = (i, j) => (i < j ? `${i},${j}` : `${j},${i}`);
  const at = (i, j) => {
    const k = key(i, j);
    if (!pt.has(k)) {
      const hi = V[3 * i + ax] - h, hj = V[3 * j + ax] - h, t = hi / (hi - hj);
      pt.set(k, [V[3 * i + ux] + (V[3 * j + ux] - V[3 * i + ux]) * t, V[3 * i + uy] + (V[3 * j + uy] - V[3 * i + uy]) * t]);
    }
    return k;
  };
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]];
    const s = v.map((i) => V[3 * i + ax] > h);
    if (s[0] === s[1] && s[1] === s[2]) continue;
    // the two edges that cross, in the triangle's own turning order, so every
    // loop runs one way round (material on its left)
    const cross = [];
    for (let e = 0; e < 3; e++) if (s[e] !== s[(e + 1) % 3]) cross.push([v[e], v[(e + 1) % 3], s[e]]);
    const [p, q] = cross[0][2] ? [cross[0], cross[1]] : [cross[1], cross[0]];
    next.set(at(p[0], p[1]), at(q[0], q[1]));
  }
  // follow each chain from its head (a strand's start: no piece runs into
  // it) or, for a closed one, from anywhere
  const into = new Set(next.values());
  const loops = [], strands = [], seen = new Set();
  const walk = (k0) => {
    const line = [];
    let k = k0, guard = 0;
    while (k != null && !seen.has(k) && guard++ < 1e6) { seen.add(k); line.push(pt.get(k)); k = next.get(k); }
    return { line, closed: k === k0 };
  };
  for (const k0 of next.keys()) if (!into.has(k0)) { const w = walk(k0); if (w.line.length) strands.push(w.line); }
  for (const k0 of next.keys()) if (!seen.has(k0)) { const w = walk(k0); if (w.closed && w.line.length >= 3) loops.push(w.line); else if (w.line.length) strands.push(w.line); }
  // The kernel meshes each face on its own: where two faces meet, one may
  // split the edge where the other does not, so the cut breaks into strands
  // whose ends sit a chord's width apart. Each strand runs on into the one
  // whose start is nearest its end, until it comes back to its own start.
  if (strands.length) loops.push(...stitch(strands, gap));
  return loops;
}
function stitch(strands, gap) {
  const out = [];
  const left = strands.map((l) => l.slice());
  const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  while (left.length) {
    let cur = left.pop();
    for (let guard = 0; guard < 10000; guard++) {
      const end = cur[cur.length - 1];
      let bi = -1, bd = d(end, cur[0]);
      for (let i = 0; i < left.length; i++) { const x = d(end, left[i][0]); if (x < bd) { bd = x; bi = i; } }
      if (bi < 0) { if (bd <= gap && cur.length >= 3) out.push(cur); break; }
      if (bd > gap) break;
      cur = cur.concat(left.splice(bi, 1)[0]);
    }
  }
  return out;
}
// An outline with holes as ONE loop: each hole (rightmost first) is joined
// to the outline by a slit w wide, from its rightmost point straight across
// to the nearest edge on its right (nothing can sit between: holes further
// left come later, the ones further right are already part of the outline).
// Null when the result crosses itself (unless loose: the outline already did).
export function bridged(outer, holes, w, loose = false) {
  const ccw = (l, want) => ((area2(l) > 0) === want ? l : [...l].reverse());
  let out = ccw(outer, true).map((p) => [p[0], p[1]]);
  const order = holes.map((h) => ccw(h, false)).sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])));
  const near = (p, q, d) => { const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, t = Math.min(d, l / 3) / l; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
  for (const hole of order) {
    const hi = hole.reduce((m, p, i) => (p[0] > hole[m][0] ? i : m), 0), H = hole[hi];
    // the nearest edge the ray y = H.y, x > H.x crosses
    let best = -1, bx = Infinity;
    for (let i = 0; i < out.length; i++) {
      const a = out[i], b = out[(i + 1) % out.length];
      if ((a[1] > H[1]) === (b[1] > H[1])) continue;
      const x = a[0] + (H[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
      if (x > H[0] && x < bx) { bx = x; best = i; }
    }
    if (best < 0) return null;
    const A = out[best], B = out[(best + 1) % out.length], M = [bx, H[1]];
    const n = hole.length, Hn = hole[(hi + 1) % n], Hp = hole[(hi + n - 1) % n];
    const loop = [near(M, A, w / 2)];
    loop.push(near(H, Hn, w / 2));
    for (let k = 1; k < n; k++) loop.push(hole[(hi + k) % n]);
    loop.push(near(H, Hp, w / 2), near(M, B, w / 2));
    out = [...out.slice(0, best + 1), ...loop, ...out.slice(best + 1)];
  }
  out = tidy(out.map((p) => [r3(p[0]), r3(p[1])]));
  // its area must be the outline's less the holes' (less the slits): a hole
  // the slit did not open (a strand the stitching ran the wrong way) fills in
  const want = Math.abs(area2(outer)) - holes.reduce((m, h) => m + Math.abs(area2(h)), 0);
  if (!(Math.abs(area2(out) - want) <= Math.max(want * 5e-3, w * perimeter(outer) * 2))) return null;
  return out.length >= 3 && (loose || !crosses(out)) ? out : null;
}
// two layers' loops, one for one, each point within d of the other's outline
function sameLoops(A, B, d) {
  if (A.length !== B.length) return false;
  const used = new Set();
  for (const a of A) {
    const j = B.findIndex((b, k) => !used.has(k) && Math.abs(Math.abs(area2(a)) - Math.abs(area2(b))) <= d * perimeter(a) && within(a, b, d) && within(b, a, d));
    if (j < 0) return false;
    used.add(j);
  }
  return true;
}
function perimeter(l) { let m = 0; for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; m += Math.hypot(p[0] - q[0], p[1] - q[1]); } return m; }
function within(a, b, d) {
  for (const p of a) {
    let ok = false;
    for (let i = 0; i < b.length && !ok; i++) if (segDist(p, b[i], b[(i + 1) % b.length]) <= d) ok = true;
    if (!ok) return false;
  }
  return true;
}
function sectionArea(V, I, ax, ux, uy, h) {
  return sectionLoops(V, I, ax, ux, uy, h, Infinity).reduce((m, l) => m + area2(l), 0);
}
export function area2(l) {
  let a = 0;
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
// Douglas-Peucker on a closed loop
function simplify(loop, tol) {
  if (loop.length < 8) return loop;
  // split at the two points farthest apart, simplify each half
  let far = 0, best = -1;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > best) { best = d; far = i; } }
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    const a = pts[0], b = pts[pts.length - 1];
    let k = -1, dm = -1;
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], a, b); if (d > dm) { dm = d; k = i; } }
    if (dm <= tol) return [a, b];
    return [...dp(pts.slice(0, k + 1)).slice(0, -1), ...dp(pts.slice(k))];
  };
  const A = dp(loop.slice(0, far + 1)), B = dp([...loop.slice(far), loop[0]]);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function inside(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// loops -> outers with their holes, by how many others hold each
export function nest(loops) {
  const depth = loops.map((l, i) => loops.reduce((n, m, j) => n + (j !== i && inside(l[0], m) ? 1 : 0), 0));
  const out = loops.map((l, i) => ({ l, d: depth[i] })).filter((x) => x.d % 2 === 0).map((x) => ({ outer: x.l, d: x.d, holes: [] }));
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) return;
    const owner = out.filter((o) => o.d === depth[i] - 1 && inside(l[0], o.outer)).sort((a, b) => Math.abs(area2(a.outer)) - Math.abs(area2(b.outer)))[0];
    if (owner) owner.holes.push(l);
  });
  return out;
}

export function weld(P, I) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < P.length; i++) { if (P[i] < lo) lo = P[i]; if (P[i] > hi) hi = P[i]; }
  const q = Math.max(hi - lo, 1) * 1e-7;
  const ids = new Map(), map = new Int32Array(P.length / 3);
  for (let i = 0; i < map.length; i++) {
    const k = `${Math.round(P[3 * i] / q)},${Math.round(P[3 * i + 1] / q)},${Math.round(P[3 * i + 2] / q)}`;
    let id = ids.get(k);
    if (id == null) { id = i; ids.set(k, id); }
    map[i] = id;
  }
  const out = [];
  for (let t = 0; t < I.length; t += 3) {
    const a = map[I[t]], b = map[I[t + 1]], c = map[I[t + 2]];
    if (a !== b && b !== c && a !== c) out.push(a, b, c);
  }
  return out;
}

// the frame of the biggest flat face's direction, when that is not one of
// the part's own axes (rows: in-plane x, in-plane y, normal); else null
export function dominantFrame(V, I) {
  const bins = new Map();
  for (let t = 0; t < I.length; t += 3) {
    const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
    const u = [V[b] - V[a], V[b + 1] - V[a + 1], V[b + 2] - V[a + 2]], v = [V[c] - V[a], V[c + 1] - V[a + 1], V[c + 2] - V[a + 2]];
    let nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(...nrm);
    if (!l) continue;
    nrm = nrm.map((x) => x / l);
    const k = [0, 1, 2].reduce((m, i) => (Math.abs(nrm[i]) > Math.abs(nrm[m]) ? i : m), 0);
    if (nrm[k] < 0) nrm = nrm.map((x) => -x);
    const key = nrm.map((x) => Math.round(x * 1e4)).join(",");
    const e = bins.get(key) || { n: nrm, area: 0 };
    e.area += l / 2;
    bins.set(key, e);
  }
  const top = [...bins.values()].sort((a, b) => b.area - a.area)[0];
  if (!top || top.n.some((x) => Math.abs(Math.abs(x) - 1) < 1e-4)) return null;
  const d = top.n;
  let x = Math.abs(d[2]) < 0.9 ? [-d[1], d[0], 0] : [0, -d[2], d[1]];
  const lx = Math.hypot(...x); x = x.map((c) => c / lx);
  const y = [d[1] * x[2] - d[2] * x[1], d[2] * x[0] - d[0] * x[2], d[0] * x[1] - d[1] * x[0]];
  return [x, y, d];
}
