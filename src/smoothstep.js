// A smooth B-spline solid from the QuadriFlow cage: the third way to open an
// STL (viewer/cage.js builds the cage; this turns it into STEP).
//
// Why: a CAD-made mesh rebuilds as real planes and cylinders ("Open as an
// exact solid"), but an organic or scanned shape has no such surfaces to
// recover, so that path hands back one flat face per triangle: huge, slow,
// and useless to edit. The cage is the shape as a few thousand quads that
// follow its curvature. Treating that cage as a Catmull-Clark control mesh
// and writing its limit surface as one bicubic patch per quad gives a small
// STEP of true curved faces a CAD program can fillet, shell and cut. It is
// an approximation (the smoothness is a cap on the quality, chosen by the
// cage's quad count), never the original triangles.
//
// Patches: Loop & Schaefer's geometry patches ("Approximating Catmull-Clark
// subdivision surfaces with bicubic patches", 2008). Around a regular vertex
// (four quads) the patch IS the exact bicubic B-spline limit surface; at an
// extraordinary vertex it is the closest bicubic. Corner and edge points are
// computed from the neighbourhood the two faces share, so neighbouring
// patches meet exactly (C0, watertight) and nearly tangent-continuous.
//
// Creases: edges of the cage whose quads bend past `creaseAngle` are kept
// sharp. Along a crease the surface is the cubic B-spline of the crease
// polyline (the Catmull-Clark boundary rule), so a box stays a box with
// smooth-but-crisp edges, and a dart or an isolated sharp edge is ignored as
// noise. A vertex where three or more creases meet is a hard corner.
//
// STEP: every patch is a B_SPLINE_SURFACE_WITH_KNOTS (degree 3 x 3, 4 x 4
// control points, one Bezier span), bounded by four B_SPLINE_CURVE_WITH_KNOTS
// that are the patch's own boundary polynomials. Edge curves are one entity
// shared by both faces, vertices one VERTEX_POINT each, so the shell is
// closed in the file, not just numerically. The Rust kernel reads this form
// (its own writer emits it), so the result builds as an exact solid through
// importedSolid(), the same door the exact-solid rebuild uses.

const fmt = (v) => {
  if (Object.is(v, -0)) v = 0;
  const s = Number.isInteger(v) ? `${v}.` : String(+v.toPrecision(15));
  return /[.eE]/.test(s) ? s.replace(/e/, "E") : `${s}.`;
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// The cage's winding, made outward: QuadriFlow keeps the input's, and an STL
// seen inside-out would otherwise give a solid with its faces reversed.
export function outwardQuads(verts, quads) {
  let vol = 0;
  for (let q = 0; q < quads.length; q += 4) {
    const p = [0, 1, 2, 3].map((k) => { const i = quads[q + k] * 3; return [verts[i], verts[i + 1], verts[i + 2]]; });
    vol += dot(p[0], cross(p[1], p[2])) + dot(p[0], cross(p[2], p[3]));
  }
  if (vol >= 0) return quads;
  const flipped = new Int32Array(quads.length);
  for (let q = 0; q < quads.length; q += 4) { flipped[q] = quads[q]; flipped[q + 1] = quads[q + 3]; flipped[q + 2] = quads[q + 2]; flipped[q + 3] = quads[q + 1]; }
  return flipped;
}

// ------------------------------------------------------------- the cage
// verts: Float64Array xyz, quads: Int32Array 4 per quad (CCW seen from
// outside, as QuadriFlow writes them). Builds the adjacency everything else
// needs: for each vertex its ring of (edge neighbour, face) in order, and
// for each edge its two faces.
export function cageTopology(verts, quads) {
  const nv = verts.length / 3, nq = quads.length / 4;
  const edgeKey = (a, b) => (a < b ? a * nv + b : b * nv + a);
  const edges = new Map();            // key -> { a, b, faces: [q, q'], flips }
  const vfaces = Array.from({ length: nv }, () => []);
  for (let q = 0; q < nq; q++) {
    for (let k = 0; k < 4; k++) {
      const a = quads[q * 4 + k], b = quads[q * 4 + ((k + 1) & 3)];
      const key = edgeKey(a, b);
      let e = edges.get(key);
      if (!e) { e = { a: Math.min(a, b), b: Math.max(a, b), faces: [] }; edges.set(key, e); }
      e.faces.push(q);
      vfaces[a].push(q);
    }
  }
  let open = 0, over = 0;
  for (const e of edges.values()) { if (e.faces.length === 1) open++; else if (e.faces.length > 2) over++; }
  return { nv, nq, edges, edgeKey, vfaces, open, over };
}

// Mark crease edges: a dihedral past the angle, chained (an edge with a
// crease-free vertex at both ends is noise, not a feature). Returns a Set of
// edge keys and per-vertex crease degree.
export function findCreases(verts, quads, topo, creaseAngle = 40, minChain = 4) {
  const P = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  const normals = new Array(topo.nq);
  for (let q = 0; q < topo.nq; q++) {
    const [a, b, c, d] = [0, 1, 2, 3].map((k) => P(quads[q * 4 + k]));
    normals[q] = norm(cross(sub(c, a), sub(d, b)));
  }
  const cosLimit = Math.cos((creaseAngle * Math.PI) / 180);
  let creases = new Set();
  for (const [key, e] of topo.edges) {
    if (e.faces.length !== 2) continue;
    if (dot(normals[e.faces[0]], normals[e.faces[1]]) < cosLimit) creases.add(key);
  }
  // Drop short chains: a run of fewer than minChain crease edges is a bumpy
  // patch of the mesh, not a feature line (a lumpy sphere throws up a few).
  const degree = () => {
    const d = new Int32Array(topo.nv);
    for (const key of creases) { const e = topo.edges.get(key); d[e.a]++; d[e.b]++; }
    return d;
  };
  const byVert = new Map();
  for (const key of creases) {
    const e = topo.edges.get(key);
    for (const v of [e.a, e.b]) { if (!byVert.has(v)) byVert.set(v, []); byVert.get(v).push(key); }
  }
  const seen = new Set(), kept = new Set();
  for (const start of creases) {
    if (seen.has(start)) continue;
    const comp = [], stack = [start];
    seen.add(start);
    while (stack.length) {
      const key = stack.pop();
      comp.push(key);
      const e = topo.edges.get(key);
      for (const v of [e.a, e.b]) for (const k of byVert.get(v)) if (!seen.has(k)) { seen.add(k); stack.push(k); }
    }
    if (comp.length >= minChain) for (const k of comp) kept.add(k);
  }
  creases = kept;
  return { creases, degree: degree() };
}

// ------------------------------------------------------ closing the cage
// QuadriFlow sometimes leaves small holes (a box corner, a thin rim: the bag
// sample has five, of 3 to 9 edges). Quads alone can only fill a hole with
// an even number of edges (each quad has four, every inner edge is counted
// twice), and odd holes always come in pairs. So: for each odd hole, walk a
// quad STRIP from one of its edges (enter a quad, leave by the opposite edge)
// until it reaches another hole; a strip from a boundary always ends on a
// boundary. Splitting every quad along that strip's midline adds one vertex
// to each end's hole, so two odd holes become even. Then every hole is filled
// with a fan of quads round its centre (a 4-edge hole is one quad).
// New points are linear (edge midpoints, hole centroids); fitCage then pulls
// the limit surface through them, so a filled hole is smooth, not exact.
export function closeCage(verts, quads) {
  let topo = cageTopology(verts, quads);
  if (!topo.open) return { verts, quads, holes: 0, split: 0, originalVerts: verts.length / 3 };
  if (topo.over) throw new Error(`the cage has ${topo.over} edges on more than two quads`);
  const nq = topo.nq;
  const holeLoops = (Q, T) => {
    const next = new Map();
    for (let q = 0; q < Q.length; q += 4) for (let k = 0; k < 4; k++) {
      const a = Q[q + k], b = Q[q + ((k + 1) & 3)];
      if (T.edges.get(T.edgeKey(a, b)).faces.length === 1) {
        if (next.has(b)) throw new Error("the cage has a pinched hole (a vertex on two hole edges)");
        next.set(b, a);                // the hole runs against the quad beside it
      }
    }
    const loops = [], seen = new Set();
    for (const s of next.keys()) {
      if (seen.has(s)) continue;
      const loop = [];
      for (let v = s; !seen.has(v); v = next.get(v)) { seen.add(v); loop.push(v); }
      loops.push(loop);
    }
    return loops;
  };

  // --- make every hole even by splitting strips between odd holes
  const loops = holeLoops(quads, topo);
  const holeOf = new Map();            // boundary edge key -> hole index
  loops.forEach((loop, h) => loop.forEach((v, i) => holeOf.set(topo.edgeKey(v, loop[(i + 1) % loop.length]), h)));
  const parity = loops.map((l) => l.length & 1);
  const splitEdges = new Set();        // edge keys to cut at their midpoint
  const sideOf = (q, a, b) => { for (let k = 0; k < 4; k++) { const x = quads[q * 4 + k], y = quads[q * 4 + ((k + 1) & 3)]; if ((x === a && y === b) || (x === b && y === a)) return k; } return -1; };
  // walk the strip that starts across boundary edge (a, b): the edges it crosses, and the hole it ends on
  const walk = (a, b) => {
    const crossed = [topo.edgeKey(a, b)];
    let q = topo.edges.get(topo.edgeKey(a, b)).faces[0];
    for (let guard = 0; guard <= 2 * nq; guard++) {
      const k = sideOf(q, a, b);
      const c = quads[q * 4 + ((k + 2) & 3)], d = quads[q * 4 + ((k + 3) & 3)];
      [a, b] = [c, d];
      const key = topo.edgeKey(a, b);
      crossed.push(key);
      const e = topo.edges.get(key);
      if (e.faces.length === 1) return { crossed, end: holeOf.get(key) };
      q = e.faces[0] === q ? e.faces[1] : e.faces[0];
    }
    return null;
  };
  for (let h = 0; h < loops.length; h++) {
    while (parity[h]) {
      // every strip leaving hole h: prefer one that lands on another odd
      // hole, and of those the SHORTEST. A strip can wrap right round the
      // part (the bag: 2,209 quads became 4,335 faces taking the first one),
      // and every quad it crosses is split in two.
      let best = null;
      const loop = loops[h];
      const better = (s, b) => !b || (parity[s.end] && !parity[b.end])
        || (!!parity[s.end] === !!parity[b.end] && s.crossed.length < b.crossed.length);
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i], b = loop[(i + 1) % loop.length];
        if (splitEdges.has(topo.edgeKey(a, b))) continue;
        const s = walk(a, b);
        if (!s || s.end === h || s.crossed.some((k) => splitEdges.has(k))) continue;
        if (better(s, best)) best = s;
      }
      if (!best) throw new Error("couldn't pair up the cage's odd holes");
      for (const k of best.crossed) splitEdges.add(k);
      parity[h] ^= 1; parity[best.end] ^= 1;
    }
  }

  // --- apply the splits
  const V = Array.from(verts);
  const mid = new Map();
  const midOf = (a, b) => {
    const key = topo.edgeKey(a, b);
    let m = mid.get(key);
    if (m === undefined) {
      m = V.length / 3;
      for (let c = 0; c < 3; c++) V.push((verts[a * 3 + c] + verts[b * 3 + c]) / 2);
      mid.set(key, m);
    }
    return m;
  };
  const Q = [];
  for (let q = 0; q < nq; q++) {
    const c = [0, 1, 2, 3].map((k) => quads[q * 4 + k]);
    const cut = [0, 1, 2, 3].map((k) => splitEdges.has(topo.edgeKey(c[k], c[(k + 1) & 3])));
    const n = cut.filter(Boolean).length;
    if (n === 0) { Q.push(...c); continue; }
    if (n === 4) {
      const m = [0, 1, 2, 3].map((k) => midOf(c[k], c[(k + 1) & 3]));
      const ctr = V.length / 3;
      for (let a = 0; a < 3; a++) V.push((verts[c[0] * 3 + a] + verts[c[1] * 3 + a] + verts[c[2] * 3 + a] + verts[c[3] * 3 + a]) / 4);
      for (let k = 0; k < 4; k++) Q.push(c[k], m[k], ctr, m[(k + 3) & 3]);
      continue;
    }
    const k = cut[0] ? 0 : 1;                   // the strip crosses sides k and k+2
    if (n !== 2 || !cut[k + 2]) throw new Error("a strip split left a quad cut on adjacent sides");
    const m1 = midOf(c[k], c[k + 1]), m2 = midOf(c[k + 2], c[(k + 3) & 3]);
    Q.push(c[k], m1, m2, c[(k + 3) & 3]);
    Q.push(m1, c[k + 1], c[k + 2], m2);
  }

  // --- fill the (now even) holes
  let quadsOut = Int32Array.from(Q);
  topo = cageTopology(V, quadsOut);
  const filled = holeLoops(quadsOut, topo);
  for (const loop of filled) {
    if (loop.length & 1) throw new Error("a cage hole stayed odd");
    if (loop.length === 2) throw new Error("a cage hole of two edges");
    if (loop.length === 4) { Q.push(...loop); continue; }
    const ctr = V.length / 3;
    for (let a = 0; a < 3; a++) V.push(loop.reduce((s, v) => s + V[v * 3 + a], 0) / loop.length);
    for (let i = 0; i < loop.length; i += 2) Q.push(loop[i], loop[i + 1], loop[(i + 2) % loop.length], ctr);
  }
  quadsOut = Int32Array.from(Q);
  const check = cageTopology(V, quadsOut);
  if (check.open || check.over) throw new Error(`closing the cage left ${check.open} open and ${check.over} overused edges`);
  return { verts: Float64Array.from(V), quads: quadsOut, holes: filled.length, split: splitEdges.size, originalVerts: verts.length / 3 };
}

// ------------------------------------------------- Catmull-Clark patches
// One 4x4 Bezier control grid per quad. Returns { patches: Float64Array
// (nq * 16 * 3), corners: Float64Array (nv * 3) }: patches[q][i][j] with i
// along the quad's first edge (c0 -> c1) and j along its last (c0 -> c3), so
// the surface normal dS/du x dS/dv points outward with the quad's winding.
export function catmullClarkPatches(verts, quads, topo, crease = null) {
  const { nv, nq, edges, edgeKey, vfaces } = topo;
  const P = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  const creases = crease?.creases || new Set();
  const cdeg = crease?.degree || new Int32Array(nv);
  const isCrease = (a, b) => creases.has(edgeKey(a, b));

  // the quad's corner index of vertex v, and the vertices before/after it
  const cornerOf = (q, v) => { for (let k = 0; k < 4; k++) if (quads[q * 4 + k] === v) return k; return -1; };
  const at = (q, k) => quads[q * 4 + ((k + 4) & 3)];

  // ring of vertex v: its edge neighbours (each once) and the far corner of
  // each face around it
  const valence = new Int32Array(nv);
  const ringSum = new Float64Array(nv * 3);     // 4 * sum(edge neighbours) + sum(far corners)
  for (let v = 0; v < nv; v++) {
    const seen = new Set();
    let e = [0, 0, 0], f = [0, 0, 0];
    for (const q of vfaces[v]) {
      const k = cornerOf(q, v);
      const n1 = at(q, k + 1), n3 = at(q, k - 1), far = at(q, k + 2);
      for (const n of [n1, n3]) if (!seen.has(n)) { seen.add(n); const p = P(n); e = [e[0] + p[0], e[1] + p[1], e[2] + p[2]]; }
      const p = P(far); f = [f[0] + p[0], f[1] + p[1], f[2] + p[2]];
    }
    valence[v] = seen.size;
    for (let c = 0; c < 3; c++) ringSum[v * 3 + c] = 4 * e[c] + f[c];
  }

  // corner (limit) points, shared by every patch at the vertex
  const corners = new Float64Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const p = P(v), n = valence[v];
    let out;
    if (cdeg[v] >= 3) out = p;                                  // hard corner
    else if (cdeg[v] === 2) {                                   // on a crease: cubic B-spline of the crease
      const nb = [];
      for (const q of vfaces[v]) {
        const k = cornerOf(q, v);
        for (const n of [at(q, k + 1), at(q, k - 1)]) if (isCrease(v, n) && !nb.includes(n)) nb.push(n);
      }
      const [e1, e2] = [P(nb[0]), P(nb[1])];
      out = [0, 1, 2].map((c) => (e1[c] + 4 * p[c] + e2[c]) / 6);
    } else {
      const d = n * (n + 5);
      out = [0, 1, 2].map((c) => (n * n * p[c] + ringSum[v * 3 + c]) / d);
    }
    corners.set(out, v * 3);
  }

  // edge point next to v along edge (v -> w), inside face q
  const edgePoint = (v, w, q) => {
    const pv = P(v), pw = P(w);
    if (isCrease(v, w)) return [0, 1, 2].map((c) => (2 * pv[c] + pw[c]) / 3);
    const e = edges.get(edgeKey(v, w));
    const other = e.faces[0] === q ? e.faces[1] : e.faces[0];
    const n = valence[v];
    let acc = [0, 1, 2].map((c) => 2 * n * pv[c] + 4 * pw[c]);
    for (const g of [q, other]) {
      if (g == null) continue;
      const k = cornerOf(g, v);
      const side = at(g, k + 1) === w ? at(g, k - 1) : at(g, k + 1);   // v's other neighbour in g
      const far = at(g, k + 2);
      const ps = P(side), pf = P(far);
      acc = acc.map((x, c) => x + 2 * ps[c] + pf[c]);
    }
    const d = 2 * n + 10;
    return acc.map((x) => x / d);
  };
  // interior point nearest corner v of face q
  const innerPoint = (v, q) => {
    const k = cornerOf(q, v);
    const pv = P(v), pw = P(at(q, k + 1)), pe = P(at(q, k - 1)), pf = P(at(q, k + 2));
    const n = valence[v], d = n + 5;
    return [0, 1, 2].map((c) => (n * pv[c] + 2 * pw[c] + 2 * pe[c] + pf[c]) / d);
  };

  const patches = new Float64Array(nq * 16 * 3);
  const set = (q, i, j, p) => patches.set(p, (q * 16 + i * 4 + j) * 3);
  for (let q = 0; q < nq; q++) {
    const c = [0, 1, 2, 3].map((k) => quads[q * 4 + k]);
    const cp = (v) => [corners[v * 3], corners[v * 3 + 1], corners[v * 3 + 2]];
    // grid (i, j): i along c0->c1 (and c3->c2), j along c0->c3 (and c1->c2)
    set(q, 0, 0, cp(c[0])); set(q, 3, 0, cp(c[1])); set(q, 3, 3, cp(c[2])); set(q, 0, 3, cp(c[3]));
    set(q, 1, 0, edgePoint(c[0], c[1], q)); set(q, 2, 0, edgePoint(c[1], c[0], q));
    set(q, 3, 1, edgePoint(c[1], c[2], q)); set(q, 3, 2, edgePoint(c[2], c[1], q));
    set(q, 2, 3, edgePoint(c[2], c[3], q)); set(q, 1, 3, edgePoint(c[3], c[2], q));
    set(q, 0, 2, edgePoint(c[3], c[0], q)); set(q, 0, 1, edgePoint(c[0], c[3], q));
    set(q, 1, 1, innerPoint(c[0], q)); set(q, 2, 1, innerPoint(c[1], q));
    set(q, 2, 2, innerPoint(c[2], q)); set(q, 1, 2, innerPoint(c[3], q));
  }
  return { patches, corners, valence };
}

// A point on patch q at (u, v) in [0,1]^2: for tests and previews.
export function evalPatch(patches, q, u, v) {
  const B = (t) => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
  const bu = B(u), bv = B(v);
  const out = [0, 0, 0];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const w = bu[i] * bv[j], o = (q * 16 + i * 4 + j) * 3;
    out[0] += w * patches[o]; out[1] += w * patches[o + 1]; out[2] += w * patches[o + 2];
  }
  return out;
}

// Fit the cage so its LIMIT surface passes through the cage's own points.
// QuadriFlow puts every cage vertex on the input surface, but a Catmull-Clark
// limit surface sits inside its control cage (a cube cage gives a rounded
// blob), so the raw patches shrink the shape by up to a few percent. Each
// pass moves every control point by how far its limit point misses its
// target; the limit point is a fixed local average, so this converges in a
// handful of passes. Returns new vertex positions; the input is untouched.
export function fitCage(verts, quads, topo, crease, passes = 8, { fitBelow = Infinity } = {}) {
  const nv = verts.length / 3;
  const target = Float64Array.from(verts);
  let cur = Float64Array.from(verts);
  // the longest a vertex may move in one pass: a quarter of its shortest edge
  const reach = new Float64Array(nv).fill(Infinity);
  for (const e of topo.edges.values()) {
    const d = Math.hypot(verts[e.a * 3] - verts[e.b * 3], verts[e.a * 3 + 1] - verts[e.b * 3 + 1], verts[e.a * 3 + 2] - verts[e.b * 3 + 2]) / 4;
    if (d < reach[e.a]) reach[e.a] = d;
    if (d < reach[e.b]) reach[e.b] = d;
  }
  for (let it = 0; it < passes; it++) {
    const { corners } = catmullClarkPatches(cur, quads, topo, crease);
    const next = Float64Array.from(cur);
    // only QuadriFlow's own points are on the input surface; a hole-fill point is not, so it stays put
    for (let v = 0; v < Math.min(nv, fitBelow); v++) {
      const dx = target[v * 3] - corners[v * 3], dy = target[v * 3 + 1] - corners[v * 3 + 1], dz = target[v * 3 + 2] - corners[v * 3 + 2];
      const d = Math.hypot(dx, dy, dz), k = d > reach[v] ? reach[v] / d : 1;
      next[v * 3] += dx * k; next[v * 3 + 1] += dy * k; next[v * 3 + 2] += dz * k;
    }
    cur = next;
  }
  return cur;
}

// Patches whose surface turns over (its normal against the quad's own) at
// any of a 5 x 5 grid of points, or pinches to nothing: a CAD kernel refuses
// to trim those, so the caller unfits them.
export function foldedPatches(patches, verts, quads, nq) {
  const bad = [];
  const P = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  const B = (t) => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
  const D = (t) => [-3 * (1 - t) ** 2, 3 * (1 - t) ** 2 - 6 * t * (1 - t), 6 * t * (1 - t) - 3 * t * t, 3 * t * t];
  for (let q = 0; q < nq; q++) {
    const c = [0, 1, 2, 3].map((k) => P(quads[q * 4 + k]));
    const qn = cross(sub(c[2], c[0]), sub(c[3], c[1]));
    const ql = len(qn);
    let folded = false;
    for (let i = 0; i <= 4 && !folded; i++) for (let j = 0; j <= 4 && !folded; j++) {
      const u = i / 4, v = j / 4, bu = B(u), bv = B(v), du = D(u), dv = D(v);
      const pu = [0, 0, 0], pv = [0, 0, 0];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const o = (q * 16 + a * 4 + b) * 3;
        for (let k = 0; k < 3; k++) { pu[k] += du[a] * bv[b] * patches[o + k]; pv[k] += bu[a] * dv[b] * patches[o + k]; }
      }
      const nn = cross(pu, pv), nl = len(nn);
      // a corner of an irregular or creased patch may pinch (nl ~ 0): that is fine, it is not a fold
      const corner = (i === 0 || i === 4) && (j === 0 || j === 4);
      if (nl < 1e-12 * ql) { if (!corner) folded = true; continue; }
      if (dot(nn, qn) / (nl * ql) < 0) folded = true;
    }
    if (folded) bad.push(q);
  }
  return bad;
}

// Fit, then make sure no patch folds. First undo the fit at the corners of
// any patch it folded; if a patch still folds, the cage itself is twisted
// there (a crease or crinkle tighter than the quads can follow), so relax
// those corners and their neighbours toward the average of their ring, a
// little at a time, until it untwists. Returns how many cage points had to
// be relaxed: those spots are smoothed past the original shape.
function fitSafely(verts, quads, topo, crease, passes, fitBelow) {
  let fitted = passes ? fitCage(verts, quads, topo, crease, passes, { fitBelow }) : Float64Array.from(verts);
  let folded = [];
  const check = (pts) => foldedPatches(catmullClarkPatches(pts, quads, topo, crease).patches, pts, quads, topo.nq);
  for (let round = 0; round < 4 && passes; round++) {
    folded = check(fitted);
    if (!folded.length) break;
    for (const q of folded) for (let k = 0; k < 4; k++) {
      const v = quads[q * 4 + k];
      for (let c = 0; c < 3; c++) fitted[v * 3 + c] = verts[v * 3 + c];
    }
  }
  folded = check(fitted);
  const relaxed = new Set();
  let uncreased = 0;
  if (!folded.length) return { fitted, folded: 0, relaxed: 0, uncreased };
  const ring = Array.from({ length: topo.nv }, () => []);
  for (const e of topo.edges.values()) { ring[e.a].push(e.b); ring[e.b].push(e.a); }
  const relax = (rounds) => {
    for (let round = 0; round < rounds && folded.length; round++) {
      const move = new Set();
      for (const q of folded) for (let k = 0; k < 4; k++) {
        const v = quads[q * 4 + k];
        move.add(v);
        if (round >= 10) for (const w of ring[v]) move.add(w);     // widen if the first rounds don't do it
      }
      const next = Float64Array.from(fitted);
      for (const v of move) {
        relaxed.add(v);
        const r = ring[v];
        for (let c = 0; c < 3; c++) {
          let avg = 0;
          for (const w of r) avg += fitted[w * 3 + c];
          next[v * 3 + c] = 0.5 * fitted[v * 3 + c] + 0.5 * avg / r.length;
        }
      }
      fitted = next;
      folded = check(fitted);
    }
  };
  relax(40);
  // Still folded: the crease rule itself is holding the twist (a crease
  // through a crinkle tighter than its quads). Let those edges go smooth,
  // then relax again. The tags are dropped from `crease` itself, so the
  // patches the caller builds next agree with what was checked here.
  if (folded.length && crease?.creases.size) {
    const near = new Set();
    for (const q of folded) for (let k = 0; k < 4; k++) {
      const v = quads[q * 4 + k];
      near.add(v);
      for (const w of ring[v]) near.add(w);
    }
    for (const key of [...crease.creases]) {
      const e = topo.edges.get(key);
      if (near.has(e.a) || near.has(e.b)) { crease.creases.delete(key); uncreased++; }
    }
    crease.degree.fill(0);
    for (const key of crease.creases) { const e = topo.edges.get(key); crease.degree[e.a]++; crease.degree[e.b]++; }
    folded = check(fitted);
    relax(40);
  }
  return { fitted, folded: folded.length, relaxed: relaxed.size, uncreased };
}

// ------------------------------------------------------------ STEP text
// solid name, cage, options -> { step, faces, creases, open }.
export function cageToStep(verts, quads, { name = "smooth", creaseAngle = 40, creases: wantCreases = true, fit = 8, mesh = false } = {}) {
  const closed = closeCage(verts, quads);
  verts = closed.verts;
  quads = outwardQuads(verts, closed.quads);
  const topo = cageTopology(verts, quads);
  if (topo.nq < 1) throw new Error("the cage has no quads");
  const crease = wantCreases ? findCreases(verts, quads, topo, creaseAngle) : null;
  const { fitted, folded, relaxed, uncreased } = fitSafely(verts, quads, topo, crease, fit, closed.originalVerts);
  const { patches, corners } = catmullClarkPatches(fitted, quads, topo, crease);
  const G = (q, i, j) => { const o = (q * 16 + i * 4 + j) * 3; return [patches[o], patches[o + 1], patches[o + 2]]; };

  const out = [];
  let n = 0;
  const add = (s) => { out.push(`#${++n}=${s};`); return n; };
  const pt = (p) => add(`CARTESIAN_POINT('',(${fmt(p[0])},${fmt(p[1])},${fmt(p[2])}))`);
  const dir = (d) => add(`DIRECTION('',(${fmt(d[0])},${fmt(d[1])},${fmt(d[2])}))`);
  const ctx1 = add("APPLICATION_CONTEXT('managed model based 3d engineering')");
  add(`APPLICATION_PROTOCOL_DEFINITION('international standard','ap242_managed_model_based_3d_engineering',2014,#${ctx1})`);
  const pctx = add(`PRODUCT_CONTEXT('',#${ctx1},'mechanical')`);
  const pdctx = add(`PRODUCT_DEFINITION_CONTEXT('part definition',#${ctx1},'design')`);
  const lenU = add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
  const ang = add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
  const sol = add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
  const unc = add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-6),#${lenU},'distance_accuracy_value','')`);
  const gctx = add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${unc}))GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lenU},#${ang},#${sol}))REPRESENTATION_CONTEXT('',''))`);
  const origin = add(`AXIS2_PLACEMENT_3D('',#${pt([0, 0, 0])},#${dir([0, 0, 1])},#${dir([1, 0, 0])})`);

  // one VERTEX_POINT per cage vertex, at its limit position
  const vp = new Int32Array(topo.nv);
  for (let v = 0; v < topo.nv; v++) vp[v] = add(`VERTEX_POINT('',#${pt([corners[v * 3], corners[v * 3 + 1], corners[v * 3 + 2]])})`);

  // one EDGE_CURVE per cage edge: the cubic Bezier boundary both patches
  // share, written once, running from the lower vertex id to the higher
  const edgeIds = new Map();
  const edgeCurve = (a, b, ctrl) => {           // ctrl: 4 points a -> b
    const key = topo.edgeKey(a, b);
    let id = edgeIds.get(key);
    if (id) return id;
    const run = a < b ? ctrl : [...ctrl].reverse();
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const pts = run.map(pt);
    const curve = add(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${pts.map((i) => `#${i}`).join(",")}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.)`);
    id = add(`EDGE_CURVE('',#${vp[lo]},#${vp[hi]},#${curve},.T.)`);
    edgeIds.set(key, id);
    return id;
  };

  const faceIds = [];
  for (let q = 0; q < topo.nq; q++) {
    const c = [0, 1, 2, 3].map((k) => quads[q * 4 + k]);
    // the four boundary curves in loop order c0->c1->c2->c3->c0
    const sides = [
      [c[0], c[1], [G(q, 0, 0), G(q, 1, 0), G(q, 2, 0), G(q, 3, 0)]],
      [c[1], c[2], [G(q, 3, 0), G(q, 3, 1), G(q, 3, 2), G(q, 3, 3)]],
      [c[2], c[3], [G(q, 3, 3), G(q, 2, 3), G(q, 1, 3), G(q, 0, 3)]],
      [c[3], c[0], [G(q, 0, 3), G(q, 0, 2), G(q, 0, 1), G(q, 0, 0)]],
    ];
    const oes = sides.map(([a, b, ctrl]) => add(`ORIENTED_EDGE('',*,*,#${edgeCurve(a, b, ctrl)},${a < b ? ".T." : ".F."})`));
    const loop = add(`EDGE_LOOP('',(${oes.map((i) => `#${i}`).join(",")}))`);
    const rows = [];
    for (let i = 0; i < 4; i++) rows.push(`(${[0, 1, 2, 3].map((j) => `#${pt(G(q, i, j))}`).join(",")})`);
    const surf = add(`B_SPLINE_SURFACE_WITH_KNOTS('',3,3,(${rows.join(",")}),.UNSPECIFIED.,.F.,.F.,.F.,(4,4),(4,4),(0.,1.),(0.,1.),.UNSPECIFIED.)`);
    faceIds.push(add(`ADVANCED_FACE('',(#${add(`FACE_OUTER_BOUND('',#${loop},.T.)`)}),#${surf},.T.)`));
  }
  const shell = add(`CLOSED_SHELL('',(${faceIds.map((i) => `#${i}`).join(",")}))`);
  const brep = add(`MANIFOLD_SOLID_BREP('${name}',#${shell})`);
  const rep = add(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${origin},#${brep}),#${gctx})`);
  const prod = add(`PRODUCT('${name}','${name}','',(#${pctx}))`);
  add(`PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(#${prod}))`);
  const pdf = add(`PRODUCT_DEFINITION_FORMATION('','',#${prod})`);
  const pd = add(`PRODUCT_DEFINITION('design','',#${pdf},#${pdctx})`);
  const pds = add(`PRODUCT_DEFINITION_SHAPE('','',#${pd})`);
  add(`SHAPE_DEFINITION_REPRESENTATION(#${pds},#${rep})`);
  return {
    faces: topo.nq,
    creases: crease ? crease.creases.size : 0,
    mesh: mesh ? patchesToStl(patches, topo.nq, name) : undefined,
    holesFilled: closed.holes,
    folded,
    relaxed,
    uncreased,
    vertices: topo.nv,
    step: "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n"
      + `FILE_NAME('${name}.step','',(''),(''),'brepcode','brepcode','');\n`
      + "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));\nENDSEC;\nDATA;\n"
      + out.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n",
  };
}

// The limit surface as triangles (an ASCII STL), `segs` per patch side: the
// mesh an importedSolid() carries for the JS kernel, which has no STEP reader.
export function patchesToStl(patches, nq, name = "smooth", segs = 3) {
  const out = [`solid ${name}`];
  const r = (x) => +x.toFixed(6);
  const tri = (a, b, c) => {
    out.push(" facet normal 0 0 0", "  outer loop", `   vertex ${a.map(r).join(" ")}`, `   vertex ${b.map(r).join(" ")}`, `   vertex ${c.map(r).join(" ")}`, "  endloop", " endfacet");
  };
  for (let q = 0; q < nq; q++) {
    const grid = [];
    for (let i = 0; i <= segs; i++) { grid.push([]); for (let j = 0; j <= segs; j++) grid[i].push(evalPatch(patches, q, i / segs, j / segs)); }
    for (let i = 0; i < segs; i++) for (let j = 0; j < segs; j++) {
      tri(grid[i][j], grid[i + 1][j], grid[i + 1][j + 1]);
      tri(grid[i][j], grid[i + 1][j + 1], grid[i][j + 1]);
    }
  }
  out.push(`endsolid ${name}`);
  return out.join("\n");
}

export function cageToStl(verts, quads, { name = "smooth", segs = 3, creaseAngle = 40, creases = true, fit = 8 } = {}) {
  const closed = closeCage(verts, quads);
  verts = closed.verts;
  quads = outwardQuads(verts, closed.quads);
  const topo = cageTopology(verts, quads);
  const crease = creases ? findCreases(verts, quads, topo, creaseAngle) : null;
  const { patches } = catmullClarkPatches(fitSafely(verts, quads, topo, crease, fit, closed.originalVerts).fitted, quads, topo, crease);
  return patchesToStl(patches, topo.nq, name, segs);
}
