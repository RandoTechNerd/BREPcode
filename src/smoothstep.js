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
  // the rim of a hole left open (an odd one, see closeCage) is always a
  // crease: the patches beside it then end on the rim's own B-spline, which
  // is what the fill patches are built against
  for (const [key, e] of topo.edges) if (e.faces.length === 1) creases.add(key);
  return { creases, degree: degree() };
}

// ------------------------------------------------------ closing the cage
// QuadriFlow sometimes leaves small holes (a box corner, a thin rim: the bag
// sample has five, of 3 to 9 edges). A hole with an EVEN number of edges is
// filled here with a fan of quads round its centre (a 4-edge hole is one
// quad), so the Catmull-Clark patches see a closed cage there.
//
// A hole with an ODD number of edges cannot be filled with quads at all
// (each quad has four edges, every inner edge is counted twice). Keeping the
// cage all-quads meant splitting a strip of quads from one odd hole to
// another, which could wrap round the whole part (a Benchy's 2,448 quads
// became 5,260 faces). So odd holes are LEFT OPEN here: their rims become
// crease edges (findCreases), which gives the patches beside them a border
// that depends on the rim alone, and fillOddHoles closes each one after the
// patching, at the STEP level: one rim edge is split at its middle, so the
// face beside it has five edges (the kernel takes that: a face is a 4-sided
// surface, its loop can have any number of edges), and the hole, now even,
// is a small fan of Coons patches on the rim curves. A few faces per hole.
//
// Then every corner shared by only two quads is merged away: Catmull-Clark
// has no smooth surface round a valence-2 vertex (the two patches fold onto
// each other, and no amount of relaxing helps). QuadriFlow leaves the odd
// one (a 20k Benchy had two). Quads (v,a,x,b) and (v,b,y,a) become (a,x,b,y)
// and v goes; that can leave a or b with two quads, so it repeats. Points
// are renumbered (order kept); originalVerts counts how many are still
// QuadriFlow's, and oddLoops (each in the winding a filling face would have)
// follow the renumbering.
export function closeCage(verts, quads) {
  const closed = closeCageHoles(verts, quads);
  return dissolveValence2(closed);
}

export function dissolveValence2({ verts, quads, holes, oddLoops = [], originalVerts }) {
  const nv = verts.length / 3;
  const openBefore = cageTopology(verts, quads).open;
  let Q = Array.from(quads);
  let merged = 0;
  for (let pass = 0; pass < 20; pass++) {
    const around = Array.from({ length: nv }, () => []);
    for (let q = 0; q < Q.length; q += 4) for (let k = 0; k < 4; k++) if (Q[q] >= 0) around[Q[q + k]].push(q);
    let changed = false;
    const dead = new Set();
    for (let v = 0; v < nv; v++) {
      const fs = around[v].filter((q) => !dead.has(q));
      if (fs.length !== 2) continue;
      const [q1, q2] = fs;
      const k1 = [0, 1, 2, 3].find((k) => Q[q1 + k] === v), k2 = [0, 1, 2, 3].find((k) => Q[q2 + k] === v);
      const a = Q[q1 + ((k1 + 1) & 3)], x = Q[q1 + ((k1 + 2) & 3)], b = Q[q1 + ((k1 + 3) & 3)];
      const b2 = Q[q2 + ((k2 + 1) & 3)], y = Q[q2 + ((k2 + 2) & 3)], a2 = Q[q2 + ((k2 + 3) & 3)];
      // (a hole's rim vertex with two quads shares only one edge between them: left alone)
      if (a !== a2 || b !== b2 || x === y || new Set([a, x, b, y]).size < 4) continue;
      Q[q1] = a; Q[q1 + 1] = x; Q[q1 + 2] = b; Q[q1 + 3] = y;
      Q[q2] = -1;
      dead.add(q1); dead.add(q2);                 // touched: settle the rest next pass
      merged++; changed = true;
    }
    const keep = [];
    for (let q = 0; q < Q.length; q += 4) if (Q[q] >= 0) keep.push(Q[q], Q[q + 1], Q[q + 2], Q[q + 3]);
    Q = keep;
    if (!changed) break;
  }
  if (!merged) return { verts, quads, holes, oddLoops, originalVerts, merged: 0 };
  // renumber the points still in use, in their old order
  const used = new Uint8Array(nv);
  for (const v of Q) used[v] = 1;
  const map = new Int32Array(nv).fill(-1);
  const V = [];
  let keptOriginal = 0;
  for (let v = 0; v < nv; v++) {
    if (!used[v]) continue;
    map[v] = V.length / 3;
    V.push(verts[v * 3], verts[v * 3 + 1], verts[v * 3 + 2]);
    if (v < originalVerts) keptOriginal++;
  }
  const out = Int32Array.from(Q, (v) => map[v]);
  const check = cageTopology(V, out);
  if (check.open !== openBefore || check.over) throw new Error(`merging two-quad corners left ${check.open} open and ${check.over} overused edges`);
  return { verts: Float64Array.from(V), quads: out, holes, oddLoops: oddLoops.map((l) => l.map((v) => map[v])), originalVerts: keptOriginal, merged };
}

function closeCageHoles(verts, quads) {
  const topo = cageTopology(verts, quads);
  if (!topo.open) return { verts, quads, holes: 0, oddLoops: [], originalVerts: verts.length / 3 };
  if (topo.over) throw new Error(`the cage has ${topo.over} edges on more than two quads`);
  const next = new Map();
  for (let q = 0; q < quads.length; q += 4) for (let k = 0; k < 4; k++) {
    const a = quads[q + k], b = quads[q + ((k + 1) & 3)];
    if (topo.edges.get(topo.edgeKey(a, b)).faces.length === 1) {
      if (next.has(b)) throw new Error("the cage has a pinched hole (a vertex on two hole edges)");
      next.set(b, a);                  // the hole runs against the quad beside it
    }
  }
  const loops = [], seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop = [];
    for (let v = s; !seen.has(v); v = next.get(v)) { seen.add(v); loop.push(v); }
    loops.push(loop);
  }
  const V = Array.from(verts), Q = Array.from(quads), oddLoops = [];
  for (const loop of loops) {
    if (loop.length < 3) throw new Error(`a cage hole of ${loop.length} edges`);
    if (loop.length & 1) { oddLoops.push(loop); continue; }
    if (loop.length === 4) { Q.push(...loop); continue; }
    const ctr = V.length / 3;
    for (let a = 0; a < 3; a++) V.push(loop.reduce((s, v) => s + V[v * 3 + a], 0) / loop.length);
    for (let i = 0; i < loop.length; i += 2) Q.push(loop[i], loop[i + 1], loop[(i + 2) % loop.length], ctr);
  }
  const quadsOut = Int32Array.from(Q);
  const check = cageTopology(V, quadsOut);
  const oddEdges = oddLoops.reduce((s, l) => s + l.length, 0);
  if (check.open !== oddEdges || check.over) throw new Error(`closing the cage left ${check.open} open and ${check.over} overused edges`);
  return { verts: Float64Array.from(V), quads: quadsOut, holes: loops.length, oddLoops, originalVerts: verts.length / 3 };
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
// How bent a patch may be before it counts as folded. A CAD kernel trims a
// face by fitting its edges into the surface's (u, v) chart; a patch that
// turns almost edge-on (not even flipped) or stretches very unevenly makes
// that fit fail ("pcurve fit refused"), so the bar is set below a flip:
// minCos is the least the patch normal may agree with its quad's, minJac the
// least its local area may be next to its largest. Measured on a 20k Benchy.
export const foldLimits = { grid: 8, minCos: 0.2, minJac: 0.03 };

export function foldedPatches(patches, verts, quads, nq, { grid, minCos, minJac } = foldLimits) {
  const bad = [];
  const P = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  const B = (t) => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
  const D = (t) => [-3 * (1 - t) ** 2, 3 * (1 - t) ** 2 - 6 * t * (1 - t), 6 * t * (1 - t) - 3 * t * t, 3 * t * t];
  const tables = [];
  for (let i = 0; i <= grid; i++) { const t = i / grid; tables.push([B(t), D(t)]); }
  for (let q = 0; q < nq; q++) {
    const c = [0, 1, 2, 3].map((k) => P(quads[q * 4 + k]));
    const qn = cross(sub(c[2], c[0]), sub(c[3], c[1]));
    const ql = len(qn);
    let folded = false, lo = Infinity, hi = 0;
    for (let i = 0; i <= grid && !folded; i++) for (let j = 0; j <= grid && !folded; j++) {
      const [bu, du] = tables[i], [bv, dv] = tables[j];
      const pu = [0, 0, 0], pv = [0, 0, 0];
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
        const o = (q * 16 + a * 4 + b) * 3;
        for (let k = 0; k < 3; k++) { pu[k] += du[a] * bv[b] * patches[o + k]; pv[k] += bu[a] * dv[b] * patches[o + k]; }
      }
      const nn = cross(pu, pv), nl = len(nn);
      // a corner of an irregular or creased patch may pinch (nl ~ 0): that is fine, it is not a fold
      const corner = (i === 0 || i === grid) && (j === 0 || j === grid);
      if (corner) continue;
      if (nl < 1e-12 * ql) { folded = true; continue; }
      if (dot(nn, qn) / (nl * ql) < minCos) folded = true;
      if (nl < lo) lo = nl;
      if (nl > hi) hi = nl;
    }
    if (folded || lo < minJac * hi) bad.push(q);
  }
  return bad;
}

// Patches whose own edges don't project back onto themselves. A CAD kernel
// trims a face by projecting points along each edge into the surface's
// (u, v) chart; on a patch that bends back over itself near an edge (not a
// flip: the normals can all agree) the nearest point is somewhere else on
// the patch, and the kernel refuses the file ("pcurve fit refused ...
// stations stand X off the carrier"). This does the same projection: a
// coarse grid search, then Newton, for points along all four edges, and
// flags a patch whose edge points land more than `uvTol` away in (u, v) or
// `distTol` (relative to the patch size) away in space. A 20k Benchy had 38
// such patches with no fold at all. `only` limits it to some patches.
export const strayLimits = { stations: 9, grid: 8, uvTol: 0.02, distTol: 1e-4 };

export function strayEdgePatches(patches, nq, only = null, { stations, grid, uvTol, distTol } = strayLimits) {
  const B = (t) => [(1 - t) ** 3, 3 * t * (1 - t) ** 2, 3 * t * t * (1 - t), t ** 3];
  const D = (t) => [-3 * (1 - t) ** 2, 3 * (1 - t) ** 2 - 6 * t * (1 - t), 6 * t * (1 - t) - 3 * t * t, 3 * t * t];
  const D2 = (t) => [6 * (1 - t), -12 * (1 - t) + 6 * t, 6 * (1 - t) - 12 * t, 6 * t];
  const ev = (o0, a, b) => {
    const o = [0, 0, 0];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      const w = a[i] * b[j], o1 = o0 + (i * 4 + j) * 3;
      o[0] += w * patches[o1]; o[1] += w * patches[o1 + 1]; o[2] += w * patches[o1 + 2];
    }
    return o;
  };
  const gridT = [];
  for (let i = 0; i <= grid; i++) gridT.push(B(i / grid));
  const bad = [];
  const list = only ? [...only] : Array.from({ length: nq }, (_, q) => q);
  for (const q of list) {
    const o0 = q * 48;
    // the patch's size, for the distance tolerance
    let size = 0;
    for (let k = 1; k < 16; k++) size = Math.max(size, Math.hypot(patches[o0 + k * 3] - patches[o0], patches[o0 + k * 3 + 1] - patches[o0 + 1], patches[o0 + k * 3 + 2] - patches[o0 + 2]));
    const samples = [];
    for (let i = 0; i <= grid; i++) for (let j = 0; j <= grid; j++) samples.push([i / grid, j / grid, ev(o0, gridT[i], gridT[j])]);
    let stray = false;
    for (let side = 0; side < 4 && !stray; side++) for (let k = 1; k < stations && !stray; k++) {
      const t = k / stations;
      const [u0, v0] = side === 0 ? [0, t] : side === 1 ? [1, t] : side === 2 ? [t, 0] : [t, 1];
      const p = ev(o0, B(u0), B(v0));
      let best = null, bd = Infinity;
      for (const s of samples) { const d = (s[2][0] - p[0]) ** 2 + (s[2][1] - p[1]) ** 2 + (s[2][2] - p[2]) ** 2; if (d < bd) { bd = d; best = s; } }
      let u = best[0], v = best[1];
      for (let it = 0; it < 25; it++) {
        const bu = B(u), bv = B(v), du = D(u), dv = D(v);
        const r = sub(ev(o0, bu, bv), p);
        const su = ev(o0, du, bv), sv = ev(o0, bu, dv);
        const suu = ev(o0, D2(u), bv), svv = ev(o0, bu, D2(v)), suv = ev(o0, du, dv);
        const g0 = dot(r, su), g1 = dot(r, sv);
        const h00 = dot(su, su) + dot(r, suu), h01 = dot(su, sv) + dot(r, suv), h11 = dot(sv, sv) + dot(r, svv);
        const det = h00 * h11 - h01 * h01;
        if (Math.abs(det) < 1e-30) break;
        const stepU = (h11 * g0 - h01 * g1) / det, stepV = (h00 * g1 - h01 * g0) / det;
        u = Math.min(1, Math.max(0, u - stepU)); v = Math.min(1, Math.max(0, v - stepV));
        if (Math.abs(stepU) + Math.abs(stepV) < 1e-12) break;
      }
      const dist = len(sub(ev(o0, B(u), B(v)), p));
      if (Math.hypot(u - u0, v - v0) > uvTol || dist > distTol * size) stray = true;
    }
    if (stray) bad.push(q);
  }
  return bad;
}

// Last resort for a patch that still folds: keep its four edges (shared with
// its neighbours, so the shell stays closed) and rebuild its four inner
// control points as the bicubic Coons patch of those edges. That gives up
// tangent continuity across this one patch, but a sharp feature running
// diagonally through a quad (a Benchy's hull edge, where no crease can
// follow it) no longer folds. Returns the patches that are still bad.
export function coonsPatches(patches, verts, quads, nq, list) {
  const G = (q, i, j) => { const o = (q * 16 + i * 4 + j) * 3; return [patches[o], patches[o + 1], patches[o + 2]]; };
  const set = (q, i, j, p) => patches.set(p, (q * 16 + i * 4 + j) * 3);
  const mix = (terms) => [0, 1, 2].map((c) => terms.reduce((s, [w, p]) => s + w * p[c], 0) / 9);
  for (const q of list) {
    const p = (i, j) => G(q, i, j);
    set(q, 1, 1, mix([[-4, p(0, 0)], [6, p(0, 1)], [6, p(1, 0)], [-2, p(0, 3)], [-2, p(3, 0)], [3, p(3, 1)], [3, p(1, 3)], [-1, p(3, 3)]]));
    set(q, 1, 2, mix([[-4, p(0, 3)], [6, p(0, 2)], [6, p(1, 3)], [-2, p(0, 0)], [-2, p(3, 3)], [3, p(3, 2)], [3, p(1, 0)], [-1, p(3, 0)]]));
    set(q, 2, 1, mix([[-4, p(3, 0)], [6, p(3, 1)], [6, p(2, 0)], [-2, p(3, 3)], [-2, p(0, 0)], [3, p(0, 1)], [3, p(2, 3)], [-1, p(0, 3)]]));
    set(q, 2, 2, mix([[-4, p(3, 3)], [6, p(3, 2)], [6, p(2, 3)], [-2, p(3, 0)], [-2, p(0, 3)], [3, p(0, 2)], [3, p(2, 0)], [-1, p(0, 0)]]));
  }
  const only = new Set(list);
  const still = new Set(foldedPatches(patches, verts, quads, nq).filter((q) => only.has(q)));
  for (const q of strayEdgePatches(patches, nq, only)) still.add(q);
  return [...still];
}

// The last two steps for patches that still fold after fitting and relaxing:
// first a Coons interior on the patch's own edges; if that still folds, the
// edges themselves bulge (they follow smooth neighbours round a sharp turn),
// so the patch goes BILINEAR over its four corner points, straight edges and
// all, and each neighbour's shared edge row is straightened to match (the
// corners are shared, so nothing else moves). A neighbour that then folds
// gets a Coons interior on its new edges. A bilinear patch cannot fold unless
// its quad is a bow-tie. Returns how many patches are still bad.
export function repairPatches(patches, verts, quads, topo, bad) {
  if (!bad?.length) return 0;
  let still = coonsPatches(patches, verts, quads, topo.nq, bad);
  if (!still.length) return 0;
  const G = (q, i, j) => { const o = (q * 16 + i * 4 + j) * 3; return [patches[o], patches[o + 1], patches[o + 2]]; };
  const set = (q, i, j, p) => patches.set(p, (q * 16 + i * 4 + j) * 3);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // the grid cells along side k of a quad, from corner k to corner k+1
  const sideCells = [
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[3, 0], [3, 1], [3, 2], [3, 3]],
    [[3, 3], [2, 3], [1, 3], [0, 3]],
    [[0, 3], [0, 2], [0, 1], [0, 0]],
  ];
  const touched = new Set();
  for (const q of still) {
    const c = [G(q, 0, 0), G(q, 3, 0), G(q, 3, 3), G(q, 0, 3)];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) set(q, i, j, lerp(lerp(c[0], c[1], i / 3), lerp(c[3], c[2], i / 3), j / 3));
    for (let k = 0; k < 4; k++) {
      const a = quads[q * 4 + k], b = quads[q * 4 + ((k + 1) & 3)];
      const e = topo.edges.get(topo.edgeKey(a, b));
      const g = e.faces[0] === q ? e.faces[1] : e.faces[0];
      if (g == null || still.includes(g)) continue;
      const kg = [0, 1, 2, 3].find((s) => {
        const x = quads[g * 4 + s], y = quads[g * 4 + ((s + 1) & 3)];
        return (x === a && y === b) || (x === b && y === a);
      });
      const from = quads[g * 4 + kg] === a ? c[k] : c[(k + 1) & 3];
      const to = quads[g * 4 + kg] === a ? c[(k + 1) & 3] : c[k];
      sideCells[kg].forEach(([i, j], t) => set(g, i, j, lerp(from, to, t / 3)));
      touched.add(g);
    }
  }
  const reb = new Set(foldedPatches(patches, verts, quads, topo.nq).filter((q) => touched.has(q)));
  for (const q of strayEdgePatches(patches, topo.nq, touched)) reb.add(q);
  const left = reb.size ? coonsPatches(patches, verts, quads, topo.nq, [...reb]) : [];
  const onlyStill = new Set(still);
  const after = new Set(foldedPatches(patches, verts, quads, topo.nq).filter((q) => onlyStill.has(q)));
  for (const q of strayEdgePatches(patches, topo.nq, onlyStill)) after.add(q);
  return after.size + left.length;
}

// Fit, then make sure no patch folds. First undo the fit at the corners of
// any patch it folded; if a patch still folds, the cage itself is twisted
// there (a crease or crinkle tighter than the quads can follow), so relax
// those corners and their neighbours toward the average of their ring, a
// little at a time, until it untwists. Returns how many cage points had to
// be relaxed: those spots are smoothed past the original shape.
export function fitSafely(verts, quads, topo, crease, passes, fitBelow) {
  let fitted = passes ? fitCage(verts, quads, topo, crease, passes, { fitBelow }) : Float64Array.from(verts);
  let folded = [];
  // bad = folded, or edges that project elsewhere; `near` limits the costly
  // projection test to patches around the points just moved
  const check = (pts, near = null) => {
    const { patches } = catmullClarkPatches(pts, quads, topo, crease);
    const out = new Set(foldedPatches(patches, pts, quads, topo.nq));
    let only = null;
    if (near) { only = new Set(); for (const v of near) for (const q of topo.vfaces[v]) only.add(q); }
    for (const q of strayEdgePatches(patches, topo.nq, only)) out.add(q);
    return [...out];
  };
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
  if (!folded.length) return { fitted, folded: 0, bad: [], relaxed: 0, uncreased };
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
      folded = check(fitted, move);
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
      if (e.faces.length === 1) continue;                 // a hole rim stays a crease: the fill is built on it
      if (near.has(e.a) || near.has(e.b)) { crease.creases.delete(key); uncreased++; }
    }
    crease.degree.fill(0);
    for (const key of crease.creases) { const e = topo.edges.get(key); crease.degree[e.a]++; crease.degree[e.b]++; }
    folded = check(fitted);
    relax(40);
  }
  return { fitted, folded: folded.length, bad: folded, relaxed: relaxed.size, uncreased };
}

// ------------------------------------------------- filling the odd holes
// The 4x4 grid cells along side k of a patch, from its corner k to corner k+1.
const SIDE_CELLS = [
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[3, 0], [3, 1], [3, 2], [3, 3]],
  [[3, 3], [2, 3], [1, 3], [0, 3]],
  [[0, 3], [0, 2], [0, 1], [0, 0]],
];

// A grid's four inner control points as the bicubic Coons patch of its edges.
function coonsInterior(g) {
  const p = (i, j) => [g[(i * 4 + j) * 3], g[(i * 4 + j) * 3 + 1], g[(i * 4 + j) * 3 + 2]];
  const put = (i, j, terms) => { for (let c = 0; c < 3; c++) g[(i * 4 + j) * 3 + c] = terms.reduce((s, [w, q]) => s + w * q[c], 0) / 9; };
  put(1, 1, [[-4, p(0, 0)], [6, p(0, 1)], [6, p(1, 0)], [-2, p(0, 3)], [-2, p(3, 0)], [3, p(3, 1)], [3, p(1, 3)], [-1, p(3, 3)]]);
  put(1, 2, [[-4, p(0, 3)], [6, p(0, 2)], [6, p(1, 3)], [-2, p(0, 0)], [-2, p(3, 3)], [3, p(3, 2)], [3, p(1, 0)], [-1, p(3, 0)]]);
  put(2, 1, [[-4, p(3, 0)], [6, p(3, 1)], [6, p(2, 0)], [-2, p(3, 3)], [-2, p(0, 0)], [3, p(0, 1)], [3, p(2, 3)], [-1, p(0, 3)]]);
  put(2, 2, [[-4, p(3, 3)], [6, p(3, 2)], [6, p(2, 3)], [-2, p(3, 0)], [-2, p(0, 3)], [3, p(0, 2)], [3, p(2, 0)], [-1, p(0, 0)]]);
}

// Close each odd hole after the patching. Its rim curves are read off the
// patches beside it (rim edges are creases, so each is the cubic B-spline of
// the rim polyline). The longest rim curve is cut at t = 1/2 (exact de
// Casteljau halves) with a new vertex there, which makes the rim even; then
// a 4-edge rim is one patch, a longer one a fan of patches round its centre
// with straight spokes. Every fill patch takes its edges as given and gets a
// Coons interior. Returns the fill patches (a grid and four sides each), the
// split edges (the face beside one gets five edges in the STEP), and the new
// vertex positions, numbered from firstId.
export function fillOddHoles(patches, corners, quads, topo, oddLoops, firstId) {
  const G = (q, i, j) => { const o = (q * 16 + i * 4 + j) * 3; return [patches[o], patches[o + 1], patches[o + 2]]; };
  const C = (v) => [corners[v * 3], corners[v * 3 + 1], corners[v * 3 + 2]];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // the rim curve a -> b, as the patch beside it has it
  const rimCurve = (a, b) => {
    const g = topo.edges.get(topo.edgeKey(a, b)).faces[0];
    const k = [0, 1, 2, 3].find((s) => {
      const x = quads[g * 4 + s], y = quads[g * 4 + ((s + 1) & 3)];
      return (x === a && y === b) || (x === b && y === a);
    });
    const pts = SIDE_CELLS[k].map(([i, j]) => G(g, i, j));
    return quads[g * 4 + k] === a ? pts : pts.reverse();
  };
  const fills = [], splits = new Map(), extra = [];
  let nextId = firstId;
  const newVertex = (p) => { extra.push(p); return nextId++; };
  for (const loop of oddLoops) {
    const L = loop.length;
    // rim nodes and the curves between them, in the fill's winding
    let longest = 0, best = -1;
    for (let i = 0; i < L; i++) {
      const d = len(sub(C(loop[(i + 1) % L]), C(loop[i])));
      if (d > longest) { longest = d; best = i; }
    }
    const nodes = [], curves = [];
    for (let i = 0; i < L; i++) {
      const a = loop[i], b = loop[(i + 1) % L], ctrl = rimCurve(a, b);
      nodes.push({ id: a, p: C(a) });
      if (i !== best) { curves.push(ctrl); continue; }
      const [p0, p1, p2, p3] = ctrl;
      const a1 = lerp(p0, p1, 0.5), a2 = lerp(p1, p2, 0.5), a3 = lerp(p2, p3, 0.5);
      const b1 = lerp(a1, a2, 0.5), b2 = lerp(a2, a3, 0.5), m = lerp(b1, b2, 0.5);
      const mid = newVertex(m);
      const h1 = [p0, a1, b1, m], h2 = [m, b2, a3, p3];
      splits.set(topo.edgeKey(a, b), { a, b, mid, h1, h2 });     // halves run a -> mid -> b
      curves.push(h1);
      nodes.push({ id: mid, p: m });
      curves.push(h2);
    }
    const n = nodes.length;                                        // even now
    const patchOf = (corner4, side4) => {
      const g = new Float64Array(48);
      side4.forEach((ctrl, k) => SIDE_CELLS[k].forEach(([i, j], t) => g.set(ctrl[t], (i * 4 + j) * 3)));
      coonsInterior(g);
      return { grid: g, sides: side4.map((ctrl, k) => ({ a: corner4[k], b: corner4[(k + 1) & 3], ctrl })) };
    };
    if (n === 4) {
      fills.push(patchOf(nodes.map((x) => x.id), curves));
      continue;
    }
    // The fan's centre: the rim's centroid, unless that folds a patch (a
    // long rim that is far from flat: a Benchy's 9-edge hole). Then the
    // centre moves along the rim's mean normal (Newell, in the fill's own
    // winding, so +normal is outward), in steps of the mean rim edge, and
    // the first fan that passes the kernel-like checks wins (else the best).
    const cen = nodes.reduce((s, x) => [s[0] + x.p[0] / n, s[1] + x.p[1] / n, s[2] + x.p[2] / n], [0, 0, 0]);
    let nrm = [0, 0, 0], rimLen = 0;
    for (let i = 0; i < n; i++) {
      const p = nodes[i].p, q = nodes[(i + 1) % n].p;
      nrm = [nrm[0] + (p[1] - q[1]) * (p[2] + q[2]), nrm[1] + (p[2] - q[2]) * (p[0] + q[0]), nrm[2] + (p[0] - q[0]) * (p[1] + q[1])];
      rimLen += len(sub(q, p));
    }
    nrm = norm(nrm);
    const step = rimLen / n;
    const spoke = (p, q) => [p, lerp(p, q, 1 / 3), lerp(p, q, 2 / 3), q];
    const fanAt = (ctr, c) => {
      const fan = [];
      for (let i = 0; i < n; i += 2) {
        const A = nodes[i], B = nodes[i + 1], D = nodes[(i + 2) % n];
        fan.push(patchOf([A.id, B.id, D.id, c], [curves[i], curves[i + 1], spoke(D.p, ctr), spoke(ctr, A.p)]));
      }
      return fan;
    };
    const badIn = (fan) => {
      const fp = new Float64Array(fan.length * 48), fv = [], fq = [];
      fan.forEach((f, i) => { fp.set(f.grid, i * 48); for (const [ci, cj] of [[0, 0], [3, 0], [3, 3], [0, 3]]) { fq.push(fv.length / 3); fv.push(...f.grid.subarray((ci * 4 + cj) * 3, (ci * 4 + cj) * 3 + 3)); } });
      const s = new Set(foldedPatches(fp, fv, fq, fan.length, { grid: 8, minCos: 0, minJac: 0 }));
      for (const q of strayEdgePatches(fp, fan.length)) s.add(q);
      return s.size;
    };
    // A LADDER across the hole: rungs straight between opposite rim nodes,
    // from node s round both ways (n/2 - 1 patches, no centre point). Suits
    // a long rim that a fan folds over.
    const ladderFrom = (s) => {
      const k = (i) => nodes[(s + i) % n];
      const rim = (i) => curves[(s + i) % n];                // rim curve k(i) -> k(i+1)
      const out = [];
      for (let i = 0; i <= n / 2 - 2; i++) {
        const a = k(i), b = k(i + 1), d = k(n - 2 - i), e = k(n - 1 - i);
        const side1 = n - 2 - i === i + 2 ? rim(i + 1) : spoke(b.p, d.p);
        const side3 = i === 0 ? rim(n - 1) : spoke(e.p, a.p);
        out.push(patchOf([a.id, b.id, d.id, e.id], [rim(i), side1, rim(n - 2 - i), side3]));
      }
      return out;
    };
    const c = nextId;
    const tries = [];
    for (let s = 0; s < n; s++) tries.push({ fan: ladderFrom(s), ctr: null });
    for (const k of [0, 0.25, 0.5, -0.25, 0.75, 1, -0.5, 1.5]) {
      const ctr = [cen[0] + nrm[0] * step * k, cen[1] + nrm[1] * step * k, cen[2] + nrm[2] * step * k];
      tries.push({ fan: fanAt(ctr, c), ctr });
    }
    let pick = null;
    for (const t of tries) {
      const nb = badIn(t.fan);
      if (!pick || nb < pick.nb) pick = { ...t, nb };
      if (!nb) break;
    }
    if (pick.ctr) newVertex(pick.ctr);
    fills.push(...pick.fan);
  }
  return { fills, splits, extra };
}

// ------------------------------------------------------------ STEP text
// solid name, cage, options -> { step, faces, ... }.
// The cage as bicubic patches, before any STEP is written: the corner
// points, the patch grids, and the odd-hole fills with their split rim edges.
// cageToStep writes these; src/adaptsmooth.js refines them first.
export function cagePatches(verts, quads, { creaseAngle = 40, creases: wantCreases = true, fit = 8 } = {}) {
  const closed = closeCage(verts, quads);
  verts = closed.verts;
  quads = outwardQuads(verts, closed.quads);
  const topo = cageTopology(verts, quads);
  if (topo.nq < 1) throw new Error("the cage has no quads");
  // creases off still creases the rims of odd holes (findCreases always does)
  const crease = findCreases(verts, quads, topo, wantCreases ? creaseAngle : 181);
  const { fitted, bad, relaxed, uncreased } = fitSafely(verts, quads, topo, crease, fit, closed.originalVerts);
  const { patches, corners } = catmullClarkPatches(fitted, quads, topo, crease);
  const flattened = bad?.length || 0;
  const folded = repairPatches(patches, fitted, quads, topo, bad);
  let fillFolded = 0;
  const { fills, splits, extra } = fillOddHoles(patches, corners, quads, topo, closed.oddLoops || [], topo.nv);
  // Fill patches that look doubtful (a real flip, or the kernel-like edge
  // projection test) are counted apart, as fillFolded, and do not stop the
  // export: a hole whose rim wraps round a thin wall edge (a Benchy's 9-edge
  // hole) is U-shaped, no fan or ladder of Coons patches fits it cleanly,
  // and the Rust kernel still takes the result. It has the last word.
  if (fills.length) {
    const fv = [], fq = [], fp = new Float64Array(fills.length * 48);
    fills.forEach((f, i) => {
      fp.set(f.grid, i * 48);
      for (const [ci, cj] of [[0, 0], [3, 0], [3, 3], [0, 3]]) { fq.push(fv.length / 3); fv.push(...f.grid.subarray((ci * 4 + cj) * 3, (ci * 4 + cj) * 3 + 3)); }
    });
    const fillBad = new Set(foldedPatches(fp, fv, fq, fills.length, { grid: 8, minCos: 0, minJac: 0 }));
    for (const q of strayEdgePatches(fp, fills.length)) fillBad.add(q);
    fillFolded = fillBad.size;
  }
  return { verts, quads, topo, crease, closed, patches, corners, fills, splits, extra, flattened, folded, fillFolded, relaxed, uncreased };
}

export function cageToStep(verts, quads, { name = "smooth", creaseAngle = 40, creases: wantCreases = true, fit = 8, mesh = false } = {}) {
  let topo, crease, closed, patches, corners, fills, splits, extra, flattened, folded, fillFolded, relaxed, uncreased;
  ({ verts, quads, topo, crease, closed, patches, corners, fills, splits, extra, flattened, folded, fillFolded, relaxed, uncreased }
    = cagePatches(verts, quads, { creaseAngle, creases: wantCreases, fit }));
  const G = (q, i, j) => { const o = (q * 16 + i * 4 + j) * 3; return [patches[o], patches[o + 1], patches[o + 2]]; };
  const posOf = (v) => (v < topo.nv ? [corners[v * 3], corners[v * 3 + 1], corners[v * 3 + 2]] : extra[v - topo.nv]);

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

  // one VERTEX_POINT per vertex (cage limit points, then split and fan points), made when first used
  const vp = new Map();
  const vertexPoint = (v) => { let id = vp.get(v); if (!id) { id = add(`VERTEX_POINT('',#${pt(posOf(v))})`); vp.set(v, id); } return id; };

  // one EDGE_CURVE per edge, written once and shared by the faces either
  // side, running from the lower vertex id to the higher
  const edgeIds = new Map();
  const edgeCurve = (a, b, ctrl) => {           // ctrl: 4 points a -> b
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    let id = edgeIds.get(key);
    if (id) return id;
    const run = a < b ? ctrl : [...ctrl].reverse();
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const pts = run.map(pt);
    const curve = add(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${pts.map((i) => `#${i}`).join(",")}),.UNSPECIFIED.,.F.,.F.,(4,4),(0.,1.),.UNSPECIFIED.)`);
    id = add(`EDGE_CURVE('',#${vertexPoint(lo)},#${vertexPoint(hi)},#${curve},.T.)`);
    edgeIds.set(key, id);
    return id;
  };
  const oriented = (a, b, ctrl) => add(`ORIENTED_EDGE('',*,*,#${edgeCurve(a, b, ctrl)},${a < b ? ".T." : ".F."})`);
  // a side a -> b: one oriented edge, or two where the rim edge was split
  const sideEdges = (a, b, ctrl) => {
    const s = a < topo.nv && b < topo.nv ? splits.get(topo.edgeKey(a, b)) : null;
    if (!s) return [oriented(a, b, ctrl)];
    if (s.a === a) return [oriented(a, s.mid, s.h1), oriented(s.mid, b, s.h2)];
    return [oriented(a, s.mid, [...s.h2].reverse()), oriented(s.mid, b, [...s.h1].reverse())];
  };

  const faceIds = [];
  const face = (grid, sides) => {
    const oes = sides.flatMap(({ a, b, ctrl }) => sideEdges(a, b, ctrl));
    const loop = add(`EDGE_LOOP('',(${oes.map((i) => `#${i}`).join(",")}))`);
    const rows = [];
    for (let i = 0; i < 4; i++) rows.push(`(${[0, 1, 2, 3].map((j) => `#${pt(grid(i, j))}`).join(",")})`);
    const surf = add(`B_SPLINE_SURFACE_WITH_KNOTS('',3,3,(${rows.join(",")}),.UNSPECIFIED.,.F.,.F.,.F.,(4,4),(4,4),(0.,1.),(0.,1.),.UNSPECIFIED.)`);
    faceIds.push(add(`ADVANCED_FACE('',(#${add(`FACE_OUTER_BOUND('',#${loop},.T.)`)}),#${surf},.T.)`));
  };
  for (let q = 0; q < topo.nq; q++) {
    const c = [0, 1, 2, 3].map((k) => quads[q * 4 + k]);
    face((i, j) => G(q, i, j), [0, 1, 2, 3].map((k) => ({ a: c[k], b: c[(k + 1) & 3], ctrl: SIDE_CELLS[k].map(([i, j]) => G(q, i, j)) })));
  }
  for (const f of fills) {
    // a fill side on the split edge already IS a half: write it as itself
    face((i, j) => [f.grid[(i * 4 + j) * 3], f.grid[(i * 4 + j) * 3 + 1], f.grid[(i * 4 + j) * 3 + 2]], f.sides);
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
  let allPatches = patches;
  if (fills.length) {
    allPatches = new Float64Array(patches.length + fills.length * 48);
    allPatches.set(patches);
    fills.forEach((f, i) => allPatches.set(f.grid, patches.length + i * 48));
  }
  return {
    faces: faceIds.length,
    creases: crease.creases.size,
    mesh: mesh ? patchesToStl(allPatches, topo.nq + fills.length, name) : undefined,
    holesFilled: closed.holes,
    oddHoles: (closed.oddLoops || []).length,
    merged: closed.merged || 0,
    flattened,
    folded,
    fillFolded,
    relaxed,
    uncreased,
    vertices: topo.nv + extra.length,
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

export function cageToStl(verts, quads, { name = "smooth", creaseAngle = 40, creases = true, fit = 8 } = {}) {
  return cageToStep(verts, quads, { name, creaseAngle, creases, fit, mesh: true }).mesh;
}
