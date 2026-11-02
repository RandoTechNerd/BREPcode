// Coarse to fine smooth surface ("bondo"): the B-spline solid that
// src/smoothstep.js writes, but sized by where the mesh needs it.
//
// The one-patch-per-quad surface puts the same detail everywhere: a flat side
// of a Benchy costs as many faces as its bow, and the Rust kernel's import
// time grows with the face count (about 8 ms a face), so detail is paid for
// across the whole shape. Here the cage is COARSE (a few hundred quads) and
// each face's surface is a uniform cubic B-spline whose span count grows only
// where the surface misses the mesh:
//
//   pass 0  the coarse cage as Catmull-Clark bicubics (smoothstep.js's own
//           patches): seconds, and a preview straight away.
//   pass k  measure every face against the mesh (each mesh vertex projects to
//           the face it belongs to) and every edge (points along it to the
//           mesh). A face or edge over tolerance doubles its spans and is
//           refitted to the mesh by least squares with a smoothing term;
//           everything under tolerance is left exactly as it is. Each pass
//           works on fewer faces than the one before.
//
// Topology never changes: a face keeps its four edges, so the shell stays
// closed however far a face refines. Neighbouring faces share each edge
// curve; an edge's knots are a dyadic subset of both faces' knots, so a face
// is always refined to at least its edges' spans and its boundary row IS the
// edge curve (knot insertion is exact). Faces meet C0 exactly and, since both
// sides are fitted to the same mesh, close to tangent.
//
// Where the mesh has no data (an open hole, a gap the cage bridged) a face
// has nothing to fit and keeps its smooth Catmull-Clark fill: the bondo.

import { cagePatches } from "./smoothstep.js";

const DEG = 3;
const MAX_LEVEL = 4;                       // 16 spans a side, 19 x 19 control points

// ------------------------------------------------------------ B-splines
export const knotsFor = (level) => {
  const s = 1 << level, k = [0, 0, 0, 0];
  for (let i = 1; i < s; i++) k.push(i / s);
  k.push(1, 1, 1, 1);
  return k;
};
const spanOf = (level, t) => Math.min((1 << level) - 1, Math.max(0, Math.floor(t * (1 << level)))) + DEG;

// basis N[0..3] and first derivative dN[0..3] at t in span s (NURBS book A2.2/A2.3, p = 3)
function basis(K, s, t, N, dN) {
  const left = [0, 0, 0, 0], right = [0, 0, 0, 0];
  const ndu = [[1, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let j = 1; j <= DEG; j++) {
    left[j] = t - K[s + 1 - j]; right[j] = K[s + j] - t;
    let saved = 0;
    for (let r = 0; r < j; r++) {
      ndu[j][r] = right[r + 1] + left[j - r];
      const tmp = ndu[r][j - 1] / ndu[j][r];
      ndu[r][j] = saved + right[r + 1] * tmp;
      saved = left[j - r] * tmp;
    }
    ndu[j][j] = saved;
  }
  for (let r = 0; r <= DEG; r++) N[r] = ndu[r][DEG];
  if (dN) for (let r = 0; r <= DEG; r++) {
    const a = r >= 1 ? ndu[r - 1][DEG - 1] / ndu[DEG][r - 1] : 0;
    const b = r <= DEG - 1 ? ndu[r][DEG - 1] / ndu[DEG][r] : 0;
    dN[r] = DEG * (a - b);
  }
}

// insert every knot of level `to` missing from level `from` into a control
// polygon (array of [x,y,z]); exact, the curve does not move
export function refineCurve(P, from, to) {
  let K = knotsFor(from), Q = P.map((p) => [...p]);
  for (let lv = from + 1; lv <= to; lv++) {
    const s = 1 << lv;
    for (let m = 1; m < s; m += 2) {
      const t = m / s;
      let k = DEG; while (K[k + 1] <= t) k++;
      const R = [];
      for (let i = 0; i <= Q.length; i++) {
        if (i <= k - DEG) R.push(Q[i]);
        else if (i > k) R.push(Q[i - 1]);
        else {
          const a = (t - K[i]) / (K[i + DEG] - K[i]);
          R.push([0, 1, 2].map((c) => a * Q[i][c] + (1 - a) * Q[i - 1][c]));
        }
      }
      K = [...K.slice(0, k + 1), t, ...K.slice(k + 1)];
      Q = R;
    }
  }
  return Q;
}

// a face surface: lu x lv levels, control grid (nu x nv), P[(i * nv + j) * 3]
// i runs along corner0 -> corner1, j along corner0 -> corner3
function makeSurf(lu, lv, P) { return { lu, lv, nu: (1 << lu) + 3, nv: (1 << lv) + 3, P, U: knotsFor(lu), V: knotsFor(lv) }; }
const ctrl = (S, i, j) => { const o = (i * S.nv + j) * 3; return [S.P[o], S.P[o + 1], S.P[o + 2]]; };

export function refineSurf(S, lu, lv) {
  if (lu === S.lu && lv === S.lv) return S;
  // along u: every column j
  let nu = (1 << lu) + 3;
  const A = [];
  for (let j = 0; j < S.nv; j++) {
    const col = []; for (let i = 0; i < S.nu; i++) col.push(ctrl(S, i, j));
    A.push(refineCurve(col, S.lu, lu));
  }
  const nv = (1 << lv) + 3, P = new Float64Array(nu * nv * 3);
  for (let i = 0; i < nu; i++) {
    const row = []; for (let j = 0; j < S.nv; j++) row.push(A[j][i]);
    refineCurve(row, S.lv, lv).forEach((p, j) => P.set(p, (i * nv + j) * 3));
  }
  return makeSurf(lu, lv, P);
}

const Nu = [0, 0, 0, 0], dNu = [0, 0, 0, 0], Nv = [0, 0, 0, 0], dNv = [0, 0, 0, 0];
export function evalSurf(S, u, v, ders = false) {
  const su = spanOf(S.lu, u), sv = spanOf(S.lv, v);
  basis(S.U, su, u, Nu, ders ? dNu : null); basis(S.V, sv, v, Nv, ders ? dNv : null);
  const p = [0, 0, 0], du = [0, 0, 0], dv = [0, 0, 0];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) {
    const o = ((su - DEG + a) * S.nv + (sv - DEG + b)) * 3, w = Nu[a] * Nv[b];
    for (let c = 0; c < 3; c++) p[c] += w * S.P[o + c];
    if (ders) {
      const wu = dNu[a] * Nv[b], wv = Nu[a] * dNv[b];
      for (let c = 0; c < 3; c++) { du[c] += wu * S.P[o + c]; dv[c] += wv * S.P[o + c]; }
    }
  }
  return ders ? { p, du, dv } : p;
}

export function evalCurve(P, level, t) {
  const K = knotsFor(level), s = spanOf(level, t), N = [0, 0, 0, 0];
  basis(K, s, t, N, null);
  const out = [0, 0, 0];
  for (let a = 0; a < 4; a++) for (let c = 0; c < 3; c++) out[c] += N[a] * P[s - DEG + a][c];
  return out;
}

// closest (u, v) on S to p, Gauss-Newton from a start, clamped to the square
function project(S, p, u, v, iters = 6) {
  for (let it = 0; it < iters; it++) {
    const { p: q, du, dv } = evalSurf(S, u, v, true);
    const r = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    const a = dot(du, du), b = dot(du, dv), c = dot(dv, dv), e = dot(r, du), f = dot(r, dv);
    const det = a * c - b * b;
    if (!(Math.abs(det) > 1e-18)) break;
    const x = (c * e - b * f) / det, y = (a * f - b * e) / det;
    u = Math.min(1, Math.max(0, u + x)); v = Math.min(1, Math.max(0, v + y));
    if (Math.abs(x) + Math.abs(y) < 1e-7) break;
  }
  return [u, v];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ------------------------------------------------------- the input mesh
// closest point on the input triangles, through a uniform grid
function meshIndex(verts, tris, cell) {
  const grid = new Map();
  const key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  const nt = tris.length / 3;
  for (let t = 0; t < nt; t++) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) { const x = verts[tris[t * 3 + k] * 3 + c]; lo[c] = Math.min(lo[c], x); hi[c] = Math.max(hi[c], x); }
    for (let x = Math.floor(lo[0] / cell); x <= Math.floor(hi[0] / cell); x++)
      for (let y = Math.floor(lo[1] / cell); y <= Math.floor(hi[1] / cell); y++)
        for (let z = Math.floor(lo[2] / cell); z <= Math.floor(hi[2] / cell); z++) {
          const k = key(x, y, z); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(t);
        }
  }
  const V = (i) => [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]];
  return function closest(p, maxR = 4) {
    const g = p.map((x) => Math.floor(x / cell));
    let best = Infinity, bq = null, bt = -1;
    const seen = new Set();
    for (let r = 0; r <= maxR; r++) {
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        for (const t of grid.get(key(g[0] + dx, g[1] + dy, g[2] + dz)) || []) {
          if (seen.has(t)) continue; seen.add(t);
          const q = closestOnTri(p, V(tris[t * 3]), V(tris[t * 3 + 1]), V(tris[t * 3 + 2]));
          const d = dist(p, q);
          if (d < best) { best = d; bq = q; bt = t; }
        }
      }
      if (best <= r * cell) break;
    }
    return { d: best, q: bq, t: bt };
  };
}
function closestOnTri(p, a, b, c) {          // Ericson
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap); if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp); if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp); if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
function vertexNormals(verts, tris) {
  const n = new Float64Array(verts.length);
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const A = [verts[a * 3], verts[a * 3 + 1], verts[a * 3 + 2]];
    const f = cross(sub([verts[b * 3], verts[b * 3 + 1], verts[b * 3 + 2]], A), sub([verts[c * 3], verts[c * 3 + 1], verts[c * 3 + 2]], A));
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v * 3 + k] += f[k];
  }
  for (let v = 0; v < n.length; v += 3) { const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1; n[v] /= l; n[v + 1] /= l; n[v + 2] /= l; }
  return n;
}

// ------------------------------------------------------ dense SPD solve
function cholSolve(A, m, B, nrhs) {          // A m x m row-major (destroyed), B m x nrhs
  for (let j = 0; j < m; j++) {
    let s = A[j * m + j];
    for (let k = 0; k < j; k++) s -= A[j * m + k] ** 2;
    if (!(s > 0)) return false;
    const d = Math.sqrt(s); A[j * m + j] = d;
    for (let i = j + 1; i < m; i++) {
      let t = A[i * m + j];
      for (let k = 0; k < j; k++) t -= A[i * m + k] * A[j * m + k];
      A[i * m + j] = t / d;
    }
  }
  for (let r = 0; r < nrhs; r++) {
    for (let i = 0; i < m; i++) { let t = B[i * nrhs + r]; for (let k = 0; k < i; k++) t -= A[i * m + k] * B[k * nrhs + r]; B[i * nrhs + r] = t / A[i * m + i]; }
    for (let i = m - 1; i >= 0; i--) { let t = B[i * nrhs + r]; for (let k = i + 1; k < m; k++) t -= A[k * m + i] * B[k * nrhs + r]; B[i * nrhs + r] = t / A[i * m + i]; }
  }
  return true;
}

// ------------------------------------------------------------- the model
// Build the coarse model from a QuadriFlow cage.
export function coarseModel(verts, quads, mesh, opts = {}) {
  const cp = cagePatches(verts, quads, opts);
  const { topo, patches, corners, fills, splits, extra } = cp;
  const G = (q, i, j) => { const o = (q * 16 + i * 4 + j) * 3; return [patches[o], patches[o + 1], patches[o + 2]]; };
  const faces = [];
  for (let q = 0; q < topo.nq; q++) {
    const P = new Float64Array(48);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) P.set(G(q, i, j), (i * 4 + j) * 3);
    faces.push({ q, c: [0, 1, 2, 3].map((k) => cp.quads[q * 4 + k]), S: makeSurf(0, 0, P), err: null, data: null });
  }
  // edges: the shared boundary curves, stored a -> b with a < b
  const edges = new Map();
  const sideCtrl = (S, k) => {          // control polygon of side k (corner k -> k+1) at the surface's levels
    const out = [];
    if (k === 0) for (let i = 0; i < S.nu; i++) out.push(ctrl(S, i, 0));
    if (k === 1) for (let j = 0; j < S.nv; j++) out.push(ctrl(S, S.nu - 1, j));
    if (k === 2) for (let i = S.nu - 1; i >= 0; i--) out.push(ctrl(S, i, S.nv - 1));
    if (k === 3) for (let j = S.nv - 1; j >= 0; j--) out.push(ctrl(S, 0, j));
    return out;
  };
  for (const f of faces) {
    f.edges = [];
    for (let k = 0; k < 4; k++) {
      const a = f.c[k], b = f.c[(k + 1) & 3], key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edges.has(key)) {
        const P = sideCtrl(f.S, k);
        edges.set(key, { key, a: Math.min(a, b), b: Math.max(a, b), level: 0, P: a < b ? P : P.reverse(), frozen: splits.has(topo.edgeKey(a, b)), faces: [], err: null });
      }
      const e = edges.get(key);
      e.faces.push(f);
      f.edges.push({ e, fwd: a < b });
    }
  }
  // an odd-hole fill keeps its own bicubic, so the edges it shares must not move
  for (const fl of fills) for (const { a, b } of fl.sides) { const e = edges.get(a < b ? `${a},${b}` : `${b},${a}`); if (e) e.frozen = true; }
  const posOf = (v) => (v < topo.nv ? [corners[v * 3], corners[v * 3 + 1], corners[v * 3 + 2]] : extra[v - topo.nv]);
  return { cp, faces, edges, fills, splits, extra, corners, topo, sideCtrl, mesh, posOf };
}

// Mesh vertices -> (face, u, v): nearest of a sampled grid on every face
// whose normal agrees with the vertex's, then projected onto that face.
function associate(model, faces, maxPts) {
  const { mesh } = model;
  const nv = mesh.verts.length / 3;
  model.vn ??= vertexNormals(mesh.verts, mesh.tris);
  const g = 6, samples = [];
  let edgeLen = 0, ne = 0;
  for (const f of faces) {
    const row = [];
    for (let a = 0; a <= g; a++) for (let b = 0; b <= g; b++) {
      const { p, du, dv } = evalSurf(f.S, a / g, b / g, true);
      const n = cross(du, dv), l = Math.hypot(...n) || 1;
      row.push(p); samples.push({ f, u: a / g, v: b / g, p, n: [n[0] / l, n[1] / l, n[2] / l] });
    }
    edgeLen += dist(row[0], row[g * (g + 1)]) + dist(row[0], row[g]); ne += 2;
  }
  const cell = Math.max(1e-6, edgeLen / ne / g * 1.5);
  const key = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  const grid = new Map();
  for (const s of samples) { const k = key(...s.p.map((x) => Math.floor(x / cell))); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(s); }
  for (const f of faces) f.data = [];
  const want = new Set(faces);
  const step = Math.max(1, Math.floor(nv / maxPts));
  for (let i = 0; i < nv; i += step) {
    const p = [mesh.verts[i * 3], mesh.verts[i * 3 + 1], mesh.verts[i * 3 + 2]];
    const n = [model.vn[i * 3], model.vn[i * 3 + 1], model.vn[i * 3 + 2]];
    const gp = p.map((x) => Math.floor(x / cell));
    let best = null, bd = Infinity;
    for (let r = 0; r <= 3 && !best; r++)
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        for (const s of grid.get(key(gp[0] + dx, gp[1] + dy, gp[2] + dz)) || []) {
          if (dot(s.n, n) < 0.3) continue;
          const d = dist(s.p, p); if (d < bd) { bd = d; best = s; }
        }
      }
    if (!best || !want.has(best.f)) continue;
    const [u, v] = project(best.f.S, p, best.u, best.v);
    best.f.data.push({ p, u, v, i });
  }
}

// residuals of a face's data against its surface (re-projecting each point)
function faceError(f) {
  if (!f.data.length) return { p95: 0, max: 0, n: 0 };
  const ds = [];
  for (const d of f.data) {
    [d.u, d.v] = project(f.S, d.p, d.u, d.v);
    // a point that projects onto the rim belongs to a neighbour as much as here
    const rim = d.u <= 0 || d.u >= 1 || d.v <= 0 || d.v >= 1;
    if (!rim) ds.push(dist(evalSurf(f.S, d.u, d.v), d.p));
  }
  if (!ds.length) return { p95: 0, max: 0, n: 0 };
  ds.sort((a, b) => a - b);
  return { p95: ds[Math.floor(ds.length * 0.95)], max: ds.at(-1), n: ds.length };
}

function edgeError(e, closest) {
  const n = 6 * (1 << e.level) + 1;
  let max = 0, s = 0;
  for (let k = 1; k < n; k++) { const d = closest(evalCurve(e.P, e.level, k / n)).d; max = Math.max(max, d); s += d * d; }
  return { max, rms: Math.sqrt(s / (n - 1)) };
}

// least squares with a second-difference smoothing term over a 1D or 2D
// control net; fixed[] entries enter the right-hand side
function fitNet(nI, nJ, isFree, current, rows, lambda, mu) {
  const idx = new Int32Array(nI * nJ).fill(-1);
  let m = 0;
  for (let k = 0; k < nI * nJ; k++) if (isFree(k)) idx[k] = m++;
  if (!m) return null;
  const A = new Float64Array(m * m), B = new Float64Array(m * 3);
  const addRow = (cols, ws, rhs, wt) => {        // wt * (sum ws_k x_cols_k - rhs)^2
    const fr = [], fw = []; const r = [rhs[0], rhs[1], rhs[2]];
    for (let k = 0; k < cols.length; k++) {
      const c = cols[k], w = ws[k];
      if (idx[c] >= 0) { fr.push(idx[c]); fw.push(w); }
      else for (let d = 0; d < 3; d++) r[d] -= w * current[c * 3 + d];
    }
    for (let a = 0; a < fr.length; a++) {
      for (let b = 0; b < fr.length; b++) A[fr[a] * m + fr[b]] += wt * fw[a] * fw[b];
      for (let d = 0; d < 3; d++) B[fr[a] * 3 + d] += wt * fw[a] * r[d];
    }
  };
  let nData = 0;
  for (const { cols, ws, p } of rows) { addRow(cols, ws, p, 1); nData++; }
  // smoothing: second differences along I and J, scaled so it weighs like
  // `lambda` of the data whatever the net size
  const sm = [];
  for (let i = 0; i < nI; i++) for (let j = 0; j < nJ; j++) {
    if (i > 0 && i < nI - 1) sm.push([(i - 1) * nJ + j, i * nJ + j, (i + 1) * nJ + j]);
    if (nJ > 1 && j > 0 && j < nJ - 1) sm.push([i * nJ + j - 1, i * nJ + j, i * nJ + j + 1]);
  }
  const ws = lambda * Math.max(nData, m) / Math.max(1, sm.length);
  for (const c of sm) addRow(c, [1, -2, 1], [0, 0, 0], ws);
  // a whisper of "stay where you are", so a net with little data is still solvable
  const wm = mu * Math.max(nData, m) / m;
  for (let k = 0; k < nI * nJ; k++) if (idx[k] >= 0) addRow([k], [1], [current[k * 3], current[k * 3 + 1], current[k * 3 + 2]], wm);
  if (!cholSolve(A, m, B, 3)) return null;
  const out = Float64Array.from(current);
  for (let k = 0; k < nI * nJ; k++) if (idx[k] >= 0) out.set([B[idx[k] * 3], B[idx[k] * 3 + 1], B[idx[k] * 3 + 2]], k * 3);
  return out;
}

function fitEdge(e, closest, lambda) {
  const n = e.P.length, cur = new Float64Array(n * 3);
  e.P.forEach((p, k) => cur.set(p, k * 3));
  const K = knotsFor(e.level), N = [0, 0, 0, 0];
  for (let it = 0; it < 2; it++) {
    const rows = [], ns = 10 * (1 << e.level);
    const P = []; for (let k = 0; k < n; k++) P.push([cur[k * 3], cur[k * 3 + 1], cur[k * 3 + 2]]);
    for (let k = 1; k < ns; k++) {
      const t = k / ns, s = spanOf(e.level, t);
      const q = closest(evalCurve(P, e.level, t)).q;
      if (!q) continue;
      basis(K, s, t, N, null);
      rows.push({ cols: [0, 1, 2, 3].map((a) => s - DEG + a), ws: [...N], p: q });
    }
    const out = fitNet(n, 1, (k) => k > 0 && k < n - 1, cur, rows, lambda, 1e-4);
    if (!out) break;
    cur.set(out);
  }
  e.P = []; for (let k = 0; k < n; k++) e.P.push([cur[k * 3], cur[k * 3 + 1], cur[k * 3 + 2]]);
}

// the face's levels: its own, and never fewer spans than an edge along it
function faceLevels(f) {
  const [e0, e1, e2, e3] = f.edges.map((x) => x.e.level);
  return [Math.max(f.level ?? 0, e0, e2), Math.max(f.level ?? 0, e1, e3)];
}

// put the (refined) edge curves into the face's boundary rows
function stampBoundary(f, model) {
  const S = f.S;
  f.edges.forEach(({ e, fwd }, k) => {
    const along = k === 0 || k === 2 ? S.lu : S.lv;
    let P = refineCurve(e.P, e.level, along);
    // side k runs corner k -> k+1; the edge is stored low id -> high id
    if (!fwd) P = [...P].reverse();
    const n = P.length;
    for (let t = 0; t < n; t++) {
      const [i, j] = k === 0 ? [t, 0] : k === 1 ? [S.nu - 1, t] : k === 2 ? [S.nu - 1 - t, S.nv - 1] : [0, S.nv - 1 - t];
      S.P.set(P[t], (i * S.nv + j) * 3);
    }
  });
}

function fitFace(f, lambda) {        // with no data: the smoothest interior for its boundary
  const S = f.S;
  const rows = [];
  for (const d of f.data) {
    const su = spanOf(S.lu, d.u), sv = spanOf(S.lv, d.v);
    basis(S.U, su, d.u, Nu, null); basis(S.V, sv, d.v, Nv, null);
    const cols = [], ws = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) { cols.push((su - DEG + a) * S.nv + (sv - DEG + b)); ws.push(Nu[a] * Nv[b]); }
    rows.push({ cols, ws, p: d.p });
  }
  const free = (k) => { const i = Math.floor(k / S.nv), j = k % S.nv; return i > 0 && i < S.nu - 1 && j > 0 && j < S.nv - 1; };
  const out = fitNet(S.nu, S.nv, free, S.P, rows, lambda, 1e-3);
  if (out) S.P = out;
  return !!out;
}

// a face whose surface turns against its corners' normal, or pinches
function folded(S, ref) {
  const g = 6; let maxA = 0; const js = [];
  for (let a = 0; a <= g; a++) for (let b = 0; b <= g; b++) {
    const { du, dv } = evalSurf(S, Math.min(0.999, Math.max(0.001, a / g)), Math.min(0.999, Math.max(0.001, b / g)), true);
    const n = cross(du, dv), l = Math.hypot(...n);
    js.push(dot(n, ref) / (l || 1) < 0.1 ? -1 : l); maxA = Math.max(maxA, l);
  }
  return js.some((j) => j < 0 || j < 0.01 * maxA);
}
// The kernel's edge check, for any span count (smoothstep.js's
// strayEdgePatches does it for one Bezier): it trims a face by inverting
// stations along each edge into the surface's (u, v), starting from the
// nearest of a sampled grid. A fitted face that curls back near its edge (a
// thin wall) sends a station to the wrong place, and the import is refused
// with "pcurve fit refused". A face that fails here counts as folded.
function strayEdges(S, { stations = 9, uvTol = 0.02, distTol = 1e-4 } = {}) {
  const g = Math.min(32, 8 << Math.max(S.lu, S.lv)), samples = [];
  for (let a = 0; a <= g; a++) for (let b = 0; b <= g; b++) samples.push([a / g, b / g, evalSurf(S, a / g, b / g)]);
  let size = 0;
  for (const s of samples) size = Math.max(size, dist(s[2], samples[0][2]));
  const n = stations * (1 << Math.max(S.lu, S.lv));
  for (let side = 0; side < 4; side++) for (let k = 1; k < n; k++) {
    const t = k / n;
    const [u0, v0] = side === 0 ? [0, t] : side === 1 ? [1, t] : side === 2 ? [t, 0] : [t, 1];
    const p = evalSurf(S, u0, v0);
    let best = samples[0], bd = Infinity;
    for (const s of samples) { const d = dist(s[2], p); if (d < bd) { bd = d; best = s; } }
    const [u, v] = project(S, p, best[0], best[1], 25);
    if (Math.hypot(u - u0, v - v0) > uvTol || dist(evalSurf(S, u, v), p) > distTol * size) return true;
  }
  return false;
}

function quadNormal(model, f) {
  const C = (v) => model.posOf(v);
  const [a, b, c, d] = f.c.map(C);
  const n = cross(sub(c, a), sub(d, b)), l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

// Pass 0: index the mesh, hand every mesh vertex to its face, and measure
// every face and edge of the coarse surface. Cheap (a second or two), and
// all estimate() needs.
export function prepare(model, { maxPts = 120000 } = {}) {
  if (model.prepared) return model;
  const t0 = performance.now();
  const { mesh, faces, edges } = model;
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.verts.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], mesh.verts[i + k]); hi[k] = Math.max(hi[k], mesh.verts[i + k]); }
  model.diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const avgEdge = [...edges.values()].reduce((s, e) => s + dist(e.P[0], e.P.at(-1)), 0) / edges.size;
  model.closest = meshIndex(mesh.verts, mesh.tris, Math.max(avgEdge / 3, model.diag / 400));
  associate(model, faces, maxPts);
  for (const f of faces) { f.err = faceError(f); f.hist = [f.err.p95]; }
  for (const e of edges.values()) { e.err = edgeError(e, model.closest); e.hist = [e.err.max]; }
  model.prepared = true;
  model.prepareMs = Math.round(performance.now() - t0);
  return model;
}

// What each tolerance would cost, from pass 0 alone (no refining yet): a
// face or edge over tolerance needs about log(err / tol) / log(gain) more
// levels, where `gain` is how much one level (spans doubled) cuts the error.
// The kernel's import time is mostly per control point, and how much each
// one costs depends on how wrinkled the fitted faces get: faces that would
// need more than maxLevel (they end up fitting noise at the cap) make the
// pcurve fits slow. Calibrated on 8 runs (wobbly, heart, bag, Benchy at 2
// sizes each, 2026-11-02, Node): kernel within ~1.5x on 6 of 7, 2.3x high
// on a smooth Wobbly at 387 faces (the safe side).
export const timeCoef = { adaptBase: 900, adaptPerFaceLevel: 5.5, adaptPerData: 0.0045, kernelBase: 3000, kernelPerFace: 4,
  kernelPerCtrl: 0.05, kernelPerCtrlRough: 2.5, kernelRoughMax: 1 };
export function estimate(model, tols, { maxLevel = MAX_LEVEL, gain = 2, coef = timeCoef } = {}) {
  prepare(model);
  const nFaces = model.faces.length + model.fills.length;
  return tols.map((tol) => {
    const raw = (err) => (err <= tol ? 0 : Math.ceil(Math.log(err / tol) / Math.log(gain)));
    let ctrlPts = 0, refined = 0, capped = 0, faceLevels = 0, dataWork = 0;
    const byLevel = new Array(maxLevel + 1).fill(0);
    for (const f of model.faces) {
      let R = f.err.n >= 4 ? Math.max(raw(f.err.p95), raw(f.err.max / 4)) : 0;
      for (const { e } of f.edges) if (!e.frozen) R = Math.max(R, raw(e.err.max));
      if (R > maxLevel) capped++;
      const L = Math.min(maxLevel, R);
      byLevel[L]++;
      ctrlPts += ((1 << L) + 3) ** 2;
      if (L) { refined++; faceLevels += L; dataWork += L * f.data.length; }
    }
    const adaptMs = coef.adaptBase + coef.adaptPerFaceLevel * faceLevels + coef.adaptPerData * dataWork;
    const rough = Math.min(coef.kernelRoughMax, coef.kernelPerCtrlRough * capped / nFaces);
    const kernelMs = coef.kernelBase + coef.kernelPerFace * nFaces + (coef.kernelPerCtrl + rough) * ctrlPts;
    return { tol, refined, capped, byLevel, ctrlPts, adaptMs: Math.round(adaptMs), kernelMs: Math.round(kernelMs), ms: Math.round(adaptMs + kernelMs) };
  });
}

// ------------------------------------------------- analytic regions (hybrid)
// Where another recogniser (next.BREP.io's kernel segmentation, called
// unchanged through our wasm) says a region of the mesh IS a plane, the faces
// of ours that sit in it are put exactly on that plane: their control points
// projected onto it (a projection is affine, so the B-spline stays exact),
// edges between two planes onto the planes' line, corners where three or more
// meet onto their common point. Those edges freeze, so the freeform faces
// beside them refit to a boundary that lies on the plane, and modelToStep can
// write the whole region as ONE true PLANE face. regionOf(i) gives mesh
// vertex i's region: { id, carrier } or null.
const onPlane = (p, { origin: o, normal: n }) => { const d = (p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1] + (p[2] - o[2]) * n[2]; return [p[0] - d * n[0], p[1] - d * n[1], p[2] - d * n[2]]; };
function onPlanes(p, planes) {
  if (planes.length === 1) return onPlane(p, planes[0]);
  // least squares: sum (n.x - n.o)^2 + eps |x - p|^2, so two planes give their
  // line (nearest point on it), three or more their common point
  const A = [[1e-6, 0, 0], [0, 1e-6, 0], [0, 0, 1e-6]], b = [1e-6 * p[0], 1e-6 * p[1], 1e-6 * p[2]];
  for (const { origin: o, normal: n } of planes) {
    const d = dot(n, o);
    for (let r = 0; r < 3; r++) { for (let c = 0; c < 3; c++) A[r][c] += n[r] * n[c]; b[r] += n[r] * d; }
  }
  if (planes.length === 2) {
    // exact: the nearest point on the line, from p
    const [n1, n2] = planes.map((q) => q.normal), u = cross(n1, n2), uu = dot(u, u);
    if (uu < 1e-6) return onPlane(p, planes[0]);       // near parallel: one plane
    const d1 = dot(n1, planes[0].origin), d2 = dot(n2, planes[1].origin);
    const q = cross(u, [0, 1, 2].map((k) => d1 * n2[k] - d2 * n1[k])).map((x) => -x / uu);   // a point on the line
    const t = dot(sub(p, q), u) / uu;
    return [q[0] + t * u[0], q[1] + t * u[1], q[2] + t * u[2]];
  }
  const M = A.map((r) => [...r]), x = [...b];
  for (let i = 0; i < 3; i++) {
    let piv = i; for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
    [M[i], M[piv]] = [M[piv], M[i]]; [x[i], x[piv]] = [x[piv], x[i]];
    for (let r = 0; r < 3; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = 0; c < 3; c++) M[r][c] -= f * M[i][c]; x[r] -= f * x[i]; }
  }
  return x.map((v, i) => v / M[i][i]);
}

// A cylinder carrier: { kind: "cyl", point, axis (unit), radius }. Unlike a
// plane, projecting a B-spline's control points onto it does not put the
// curve on it, so curves and faces on a cylinder are FITTED to points
// projected onto it (finely enough that they stay within ~1e-5 of it).
const onCyl = (p, { point: o, axis: a, radius: r }) => {
  const v = sub(p, o), t = dot(v, a), w = [v[0] - t * a[0], v[1] - t * a[1], v[2] - t * a[2]], l = Math.hypot(...w);
  if (l < 1e-12) return p;
  return [o[0] + t * a[0] + w[0] * r / l, o[1] + t * a[1] + w[1] * r / l, o[2] + t * a[2] + w[2] * r / l];
};
const offCarrier = (p, c) => (c.kind === "cyl" ? dist(onCyl(p, c), p) : Math.abs(dot(sub(p, c.origin), c.normal)));
// onto every carrier at once: planes exactly (their line, their point);
// with a cylinder among them, alternating projections (they meet at an
// angle, so this settles in a few rounds)
function onCarriers(p, cs) {
  const pls = cs.filter((c) => c.kind !== "cyl"), cyl = cs.filter((c) => c.kind === "cyl");
  if (!cyl.length) return onPlanes(p, pls);
  let q = p;
  for (let it = 0; it < 60; it++) {
    for (const c of cyl) q = onCyl(q, c);
    if (pls.length) q = onPlanes(q, pls);
  }
  return q;
}

// an edge curve put on its carriers: exact for planes; on a cylinder, refitted
// to points projected onto it, refined until it stays within `acc`
function edgeOntoCarriers(e, cs, acc) {
  if (cs.every((c) => c.kind !== "cyl")) {
    e.P = e.P.map((p) => onCarriers(p, cs));
    return 0;
  }
  if (e.level < 2) { e.P = refineCurve(e.P, e.level, 2); e.level = 2; }
  let worst = Infinity;
  for (let round = 0; round < 3; round++) {
    const n = e.P.length, cur = new Float64Array(n * 3);
    e.P.forEach((p, k) => cur.set(p, k * 3));
    const K = knotsFor(e.level), N = [0, 0, 0, 0], rows = [], ns = 16 * (1 << e.level);
    for (let k = 1; k < ns; k++) {
      const t = k / ns, s = spanOf(e.level, t);
      basis(K, s, t, N, null);
      rows.push({ cols: [0, 1, 2, 3].map((a) => s - DEG + a), ws: [...N], p: onCarriers(evalCurve(e.P, e.level, t), cs) });
    }
    const out = fitNet(n, 1, (k) => k > 0 && k < n - 1, cur, rows, 1e-6, 1e-9);
    if (out) { e.P = []; for (let k = 0; k < n; k++) e.P.push([out[k * 3], out[k * 3 + 1], out[k * 3 + 2]]); }
    worst = 0;
    for (let k = 1; k < 4 * ns; k++) { const p = evalCurve(e.P, e.level, k / (4 * ns)); worst = Math.max(worst, dist(onCarriers(p, cs), p)); }
    if (worst <= acc || e.level >= MAX_LEVEL) break;
    e.P = refineCurve(e.P, e.level, e.level + 1); e.level++;
  }
  return worst;
}

// a face's interior put on its cylinder (its boundary rows are already the
// edge curves): least squares to a grid of its own points projected on it
function faceOntoCylinder(f, c) {
  const S = f.S;
  for (let it = 0; it < 3; it++) {
    const g = 6 * Math.max(S.nu, S.nv), rows = [];
    for (let a = 1; a < g; a++) for (let b = 1; b < g; b++) {
      const u = a / g, v = b / g, su = spanOf(S.lu, u), sv = spanOf(S.lv, v);
      basis(S.U, su, u, Nu, null); basis(S.V, sv, v, Nv, null);
      const cols = [], ws = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { cols.push((su - DEG + i) * S.nv + (sv - DEG + j)); ws.push(Nu[i] * Nv[j]); }
      rows.push({ cols, ws, p: onCyl(evalSurf(S, u, v), c) });
    }
    const free = (k) => { const i = Math.floor(k / S.nv), j = k % S.nv; return i > 0 && i < S.nu - 1 && j > 0 && j < S.nv - 1; };
    const out = fitNet(S.nu, S.nv, free, S.P, rows, 1e-6, 1e-9);
    if (out) S.P = out;
  }
  let worst = 0;
  for (let a = 0; a <= 12; a++) for (let b = 0; b <= 12; b++) { const p = evalSurf(S, a / 12, b / 12); worst = Math.max(worst, dist(onCyl(p, c), p)); }
  return worst;
}

export function snapToCarriers(model, regionOf, { share = 0.8, looseShare = 0.5, flatFrac = 0.001, tolFrac = 0.004, accFrac = 1e-6, lambda = 0.2, grid = 4, kinds = ["Plane", "Cylinder"] } = {}) {
  prepare(model);
  const { faces, edges, topo } = model;
  const t0 = performance.now();
  const tol = tolFrac * model.diag, acc = accFrac * model.diag;
  let straddle = 0;          // faces partly (30-80%) in a region that stayed curved: the border runs through them
  const carrierOf = (r) => (r.carrier.type === "Plane"
    ? { id: r.id, kind: "plane", origin: r.carrier.origin, normal: norm(r.carrier.normal) }
    : { id: r.id, kind: "cyl", point: r.carrier.axis_point, axis: norm(r.carrier.axis_dir), radius: r.carrier.radius });
  // 1. a face joins a region when nearly all of it (a grid of points over
  //    the face, each taking the region of the mesh triangle nearest to it)
  //    is in that region and its corners lie near the carrier; never next to
  //    a hole fill. Mesh VERTICES would not do: a CAD mesh's flat side is a
  //    few big triangles whose vertices all sit on its edges.
  for (const f of faces) {
    f.carrier = null;
    if (f.edges.some(({ e }) => e.frozen)) continue;
    const count = new Map(), hits = [];
    let n = 0;
    for (let a = 0; a <= grid; a++) for (let b = 0; b <= grid; b++) {
      const hit = model.closest(evalSurf(f.S, (a + 0.5) / (grid + 1), (b + 0.5) / (grid + 1)));
      n++; hits.push(hit);
      const r = hit.t >= 0 ? regionOf(hit.t) : null;
      if (r) count.set(r, (count.get(r) || 0) + 1);
    }
    let best = null, m = 0;
    for (const [r, k] of count) if (k > m) { best = r; m = k; }
    if (!best || !kinds.includes(best.carrier.type) || m < looseShare * n) continue;
    const c = carrierOf(best);
    // a face only partly in the region (the border runs through it) joins
    // when the mesh under ALL of it lies on that carrier anyway (planes only)
    if (m < share * n) {
      const off = c.kind === "plane" ? Math.max(...hits.map((h) => (h.q ? offCarrier(h.q, c) : Infinity))) : Infinity;
      if (!(off <= flatFrac * model.diag)) { straddle++; continue; }
    }
    if (!(Math.max(...f.c.map((v) => offCarrier(model.posOf(v), c))) <= tol)) continue;
    f.carrier = c;
  }
  // 2. corners, then edges, then the faces' own control points
  const carriersAt = (v) => { const m = new Map(); for (const q of topo.vfaces[v] || []) { const f = faces[q]; if (f?.carrier) m.set(f.carrier.id, f.carrier); } return [...m.values()]; };
  const carriersOn = (e) => { const m = new Map(); for (const f of e.faces) if (f.carrier) m.set(f.carrier.id, f.carrier); return [...m.values()]; };
  // A corner or edge pulled far to reach its carriers is not where they meet
  // (two planes at a shallow angle meet well off the part): the faces around
  // it give up their carrier, and the check runs again until nothing jumps.
  // A corner on a frozen edge (next to a hole fill, which keeps its own
  // bicubic) must not move at all.
  const maxMove = 3 * tol;
  const pinned = new Set();
  for (const e of edges.values()) if (e.frozen) { pinned.add(e.a); pinned.add(e.b); }
  for (let round = 0; round < 8; round++) {
    const drop = new Set();
    for (const v of pinned) for (const q of topo.vfaces[v] || []) if (faces[q]?.carrier) drop.add(faces[q]);
    for (let v = 0; v < topo.nv; v++) {
      const cs = carriersAt(v);
      if (cs.length > 1 && dist(onCarriers(model.posOf(v), cs), model.posOf(v)) > maxMove) for (const q of topo.vfaces[v]) if (faces[q]?.carrier) drop.add(faces[q]);
    }
    for (const e of edges.values()) {
      const cs = carriersOn(e);
      if (cs.length < 2) continue;
      if (e.P.some((p) => dist(onCarriers(p, cs), p) > maxMove)) for (const f of e.faces) drop.add(f);
    }
    if (!drop.size) break;
    for (const f of drop) f.carrier = null;
  }
  const moved = new Set(), shifted = new Map();       // vertex -> how far it moved
  for (let v = 0; v < topo.nv; v++) {
    const cs = carriersAt(v);
    if (!cs.length) continue;
    const before = model.posOf(v), after = onCarriers(before, cs);
    model.corners.set(after, v * 3);
    shifted.set(v, sub(after, before));
  }
  // an edge off the carriers whose end moved: its end control points follow
  // (the end and the next one, so it leaves the corner the way it did)
  for (const e of edges.values()) {
    for (const [v, end, nxt] of [[e.a, 0, 1], [e.b, e.P.length - 1, e.P.length - 2]]) {
      const d = shifted.get(v);
      if (!d) continue;
      for (const k of [end, nxt]) e.P[k] = [e.P[k][0] + d[0], e.P[k][1] + d[1], e.P[k][2] + d[2]];
      for (const f of e.faces) moved.add(f);
    }
  }
  let edgeOff = 0;
  for (const e of edges.values()) {
    const cs = carriersOn(e);
    if (!cs.length) continue;
    e.P[0] = model.posOf(e.a); e.P[e.P.length - 1] = model.posOf(e.b);
    edgeOff = Math.max(edgeOff, edgeOntoCarriers(e, cs, acc));
    e.P[0] = model.posOf(e.a); e.P[e.P.length - 1] = model.posOf(e.b);
    e.frozen = true; e.carrierEdge = true;
    for (const f of e.faces) moved.add(f);
  }
  let planar = 0, round = 0, refit = 0, folds = 0, faceOff = 0;
  for (const f of moved) {
    const [lu, lv] = faceLevels(f);
    f.S = refineSurf(f.S, lu, lv);
    stampBoundary(f, model);
    if (f.carrier?.kind === "plane") {
      for (let i = 1; i < f.S.nu - 1; i++) for (let j = 1; j < f.S.nv - 1; j++) f.S.P.set(onPlane(ctrl(f.S, i, j), f.carrier), (i * f.S.nv + j) * 3);
      planar++;
    } else if (f.carrier?.kind === "cyl") {
      faceOff = Math.max(faceOff, faceOntoCylinder(f, f.carrier));
      round++;
    } else {
      let ok = false;
      for (const lam of [lambda, lambda * 8, lambda * 64]) {
        const keep = Float64Array.from(f.S.P);
        fitFace(f, lam);
        if (!folded(f.S, quadNormal(model, f)) && !strayEdges(f.S)) { ok = true; break; }
        f.S.P = keep;
      }
      refit++; if (!ok) folds++;
      f.err = faceError(f);
    }
  }
  // regions: the plane faces grouped by region id, for modelToStep
  const groups = new Map();
  for (const f of faces) if (f.carrier?.kind === "plane") { let g = groups.get(f.carrier.id); if (!g) groups.set(f.carrier.id, g = { id: f.carrier.id, origin: f.carrier.origin, normal: f.carrier.normal, faces: new Set() }); g.faces.add(f); }
  model.planeGroups = [...groups.values()];
  return { straddle, planeFaces: planar, planeRegions: groups.size, cylinderFaces: round, edgeOffCylinder: +edgeOff.toExponential(2), faceOffCylinder: +faceOff.toExponential(2), refitNeighbours: refit, neighbourFolds: folds, ms: Math.round(performance.now() - t0) };
}
export const snapToPlanes = (model, regionOf, opts = {}) => snapToCarriers(model, regionOf, { ...opts, kinds: ["Plane"] });

// ---------------------------------------------------------------- passes
// adapt(model, { tol, maxLevel, lambda, onPass }) refines in place.
// onPass({ pass, faces touched, ms, ... }) after each pass: a live preview hook.
export function adapt(model, { tol, maxLevel = MAX_LEVEL, lambda = 0.2, maxPts = 120000, onPass = null } = {}) {
  const { faces, edges } = model;
  const t0 = performance.now();
  prepare(model, { maxPts });
  const { diag, closest } = model;
  tol ??= 0.001 * diag;
  const passes = [];
  let todoF = [], todoE = [];
  for (let pass = 1; pass <= maxLevel + 1; pass++) {
    const tp = performance.now();
    // measure what the last pass touched
    for (const f of todoF) f.err = faceError(f);
    for (const e of todoE) e.err = edgeError(e, closest);
    const badF = faces.filter((f) => !f.carrier && f.err.n >= 4 && (f.err.p95 > tol || f.err.max > 4 * tol) && (f.level ?? 0) < maxLevel && !f.stuck);
    const badE = [...edges.values()].filter((e) => !e.frozen && e.err.max > tol && e.level < maxLevel && !e.stuck);
    const measureMs = performance.now() - tp;
    if (!badF.length && !badE.length) { passes.push({ pass, faces: 0, edges: 0, measureMs: Math.round(measureMs), ms: 0 }); break; }
    // refine: edges first, then every face they or their own error touch
    const touched = new Set(badF);
    for (const f of badF) f.level = (f.level ?? 0) + 1;
    const oldP = new Map();               // edge -> its curve before this pass, at the new level
    for (const e of badE) {
      e.level++;
      e.P = refineCurve(e.P, e.level - 1, e.level);
      oldP.set(e, e.P.map((p) => [...p]));
      fitEdge(e, closest, lambda);
      for (const f of e.faces) touched.add(f);
    }
    const oldS = new Map([...touched].map((f) => [f, f.S]));
    // Fit every touched face to its new boundary. A face that folds however
    // smooth it is asked to be gets the edges this pass moved put back (each
    // exactly as it was, refined), and every face on those edges is fitted
    // again; a face that still folds goes back to its old surface whole.
    let fitList = [...touched];
    for (let round = 0; round < 3 && fitList.length; round++) {
      const foldedNow = [];
      for (const f of fitList) {
        const [lu, lv] = faceLevels(f);
        f.S = refineSurf(oldS.get(f) ?? f.S, lu, lv);
        stampBoundary(f, model);
        let ok = false;
        for (const lam of [lambda, lambda * 8, lambda * 64]) {
          const keep = Float64Array.from(f.S.P);
          fitFace(f, lam);
          if (!folded(f.S, quadNormal(model, f)) && !strayEdges(f.S)) { ok = true; break; }
          f.S.P = keep;
        }
        if (!ok) foldedNow.push(f);
      }
      fitList = new Set();
      for (const f of foldedNow) {
        f.stuck = true;
        let reverted = 0;
        for (const { e } of f.edges) {
          if (!oldP.has(e)) continue;
          e.P = oldP.get(e); oldP.delete(e); e.stuck = true; reverted++;
          for (const g of e.faces) { fitList.add(g); if (!oldS.has(g)) oldS.set(g, g.S); }
        }
        if (!reverted || round === 2) f.foldedFit = true;
      }
      fitList = [...fitList];
    }
    for (const f of touched) if (f.foldedFit && (folded(f.S, quadNormal(model, f)) || strayEdges(f.S))) {
      // last resort: the old surface, refined, with its old boundary (every
      // edge it touched this pass has been put back by now, or never moved)
      if (f.edges.every(({ e }) => !oldP.has(e))) {
        const [lu, lv] = faceLevels(f);
        f.S = refineSurf(oldS.get(f), lu, lv);
        stampBoundary(f, model);
      }
    }
    // a face that got no better from the last pass stops asking for more
    for (const f of touched) {
      const prev = f.err;
      f.err = faceError(f);
      f.hist.push(f.err.p95);
      if (prev && f.err.p95 > 0.9 * prev.p95 && (f.level ?? 0) >= 2) f.stuck = true;
    }
    for (const e of badE) {
      const prev = e.err; e.err = edgeError(e, closest); e.hist.push(e.err.max);
      if (prev && e.err.max > 0.9 * prev.max && e.level >= 2) e.stuck = true;
    }
    todoF = []; todoE = [];
    const info = { pass, faces: badF.length, edges: badE.length, touched: touched.size, measureMs: Math.round(measureMs), ms: Math.round(performance.now() - tp) };
    passes.push(info);
    onPass?.(info, model);
  }
  // how much one level cut the error, face by face (feeds estimate()'s gain)
  const ratios = [];
  for (const f of faces) for (let i = 1; i < (f.hist?.length || 0); i++) if (f.hist[i] > 0 && f.hist[i - 1] > tol) ratios.push(f.hist[i - 1] / f.hist[i]);
  ratios.sort((a, b) => a - b);
  const gain = ratios.length ? +ratios[ratios.length >> 1].toFixed(2) : null;
  return { tol, diag, passes, prepareMs: model.prepareMs, gain, ms: Math.round(performance.now() - t0), ...summary(model) };
}

// Make edge knots match face knots, by knot insertion only (exact, nothing
// moves). The Rust kernel fits a pcurve for every edge on both of its faces;
// when the edge's knots are the face boundary's own, that fit is quick, and
// when they differ it samples and inverts much more (measured: the same
// fitted Wobbly imports in about half the time once matched).
//   "max":   each edge takes the finer of its two faces
//   "chord": every face and edge along a quad strip shares one level, so
//            every edge matches both faces exactly (costs control points)
export function conform(model, mode = "chord") {
  const { faces, edges } = model;
  const along = (f, k) => (k === 0 || k === 2 ? f.S.lu : f.S.lv);
  if (mode === "chord") {
    const parent = new Map([...edges.values()].map((e) => [e, e]));
    const find = (e) => { while (parent.get(e) !== e) { parent.set(e, parent.get(parent.get(e))); e = parent.get(e); } return e; };
    const join = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };
    for (const f of faces) { join(f.edges[0].e, f.edges[2].e); join(f.edges[1].e, f.edges[3].e); }
    const lvl = new Map();
    for (const f of faces) for (let k = 0; k < 4; k++) { const r = find(f.edges[k].e); lvl.set(r, Math.max(lvl.get(r) ?? 0, along(f, k), f.edges[k].e.level)); }
    for (const f of faces) {
      if (f.edges.some(({ e }) => e.frozen)) continue;      // a split rim edge stays one Bezier
      const lu = lvl.get(find(f.edges[0].e)), lv = lvl.get(find(f.edges[1].e));
      f.S = refineSurf(f.S, lu, lv);
    }
  }
  for (const e of edges.values()) {
    if (e.frozen) continue;
    let want = e.level;
    for (const f of e.faces) { const k = f.edges.findIndex((x) => x.e === e); want = Math.max(want, along(f, k)); }
    if (want > e.level) { e.P = refineCurve(e.P, e.level, want); e.level = want; }
  }
  return summary(model);
}

export function summary(model) {
  const lv = [0, 0, 0, 0, 0];
  let ctrlPts = 0, stuck = 0, noData = 0;
  for (const f of model.faces) { lv[Math.max(f.S.lu, f.S.lv)]++; ctrlPts += f.S.nu * f.S.nv; if (f.stuck) stuck++; if (!f.data?.length) noData++; }
  return { facesByLevel: lv, ctrlPts, stuck, noData, fills: model.fills.length };
}

// ------------------------------------------------------------ STEP + STL
const fmt = (v) => {
  if (Object.is(v, -0)) v = 0;
  const s = Number.isInteger(v) ? `${v}.` : String(+v.toPrecision(15));
  return /[.eE]/.test(s) ? s.replace(/e/, "E") : `${s}.`;
};
const knotList = (level) => {
  const s = 1 << level, mult = [4], val = [0];
  for (let i = 1; i < s; i++) { mult.push(1); val.push(i / s); }
  mult.push(4); val.push(1);
  return `(${mult.join(",")}),(${val.map(fmt).join(",")})`;
};

export function modelToStep(model, name = "smooth") {
  const { faces, edges, fills, splits, topo } = model;
  const posOf = model.posOf;
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
  const vp = new Map();
  const vertexPoint = (v) => { let id = vp.get(v); if (!id) { id = add(`VERTEX_POINT('',#${pt(posOf(v))})`); vp.set(v, id); } return id; };
  // edge curves, low id -> high id, written once
  const curveIds = new Map();
  const curve = (key, lo, hi, P, level) => {
    let id = curveIds.get(key);
    if (id) return id;
    const c = add(`B_SPLINE_CURVE_WITH_KNOTS('',3,(${P.map((p) => `#${pt(p)}`).join(",")}),.UNSPECIFIED.,.F.,.F.,${knotList(level)},.UNSPECIFIED.)`);
    id = add(`EDGE_CURVE('',#${vertexPoint(lo)},#${vertexPoint(hi)},#${c},.T.)`);
    curveIds.set(key, id);
    return id;
  };
  const oriented = (a, b, P, level) => {      // P runs a -> b
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const id = curve(`${lo},${hi}`, lo, hi, a < b ? P : [...P].reverse(), level);
    return add(`ORIENTED_EDGE('',*,*,#${id},${a < b ? ".T." : ".F."})`);
  };
  const sideEdges = (a, b, P, level) => {
    const s = a < topo.nv && b < topo.nv ? splits.get(topo.edgeKey(a, b)) : null;
    if (!s) return [oriented(a, b, P, level)];
    if (s.a === a) return [oriented(a, s.mid, s.h1, 0), oriented(s.mid, b, s.h2, 0)];
    return [oriented(a, s.mid, [...s.h2].reverse(), 0), oriented(s.mid, b, [...s.h1].reverse(), 0)];
  };
  const faceIds = [];
  const surfaceEntity = (S) => {
    const rows = [];
    for (let i = 0; i < S.nu; i++) { const r = []; for (let j = 0; j < S.nv; j++) r.push(`#${pt(ctrl(S, i, j))}`); rows.push(`(${r.join(",")})`); }
    const ku = knotList(S.lu), kv = knotList(S.lv);
    const [mu, vu] = ku.slice(1, -1).split("),("), [mv, vv] = kv.slice(1, -1).split("),(");
    return add(`B_SPLINE_SURFACE_WITH_KNOTS('',3,3,(${rows.join(",")}),.UNSPECIFIED.,.F.,.F.,.F.,(${mu}),(${mv}),(${vu}),(${vv}),.UNSPECIFIED.)`);
  };
  const face = (S, sides) => {
    const oes = sides.flatMap(({ a, b, P, level }) => sideEdges(a, b, P, level));
    const loop = add(`EDGE_LOOP('',(${oes.map((i) => `#${i}`).join(",")}))`);
    const surf = surfaceEntity(S);
    faceIds.push(add(`ADVANCED_FACE('',(#${add(`FACE_OUTER_BOUND('',#${loop},.T.)`)}),#${surf},.T.)`));
  };
  const sidesOf = (f) => f.edges.map(({ e, fwd }, k) => ({ a: f.c[k], b: f.c[(k + 1) & 3], P: fwd ? e.P : [...e.P].reverse(), level: e.level, e }));
  // A plane region (snapToPlanes) is written as ONE face on a true PLANE:
  // its member faces' edges that border the outside, chained into loops (the
  // largest the outer bound, the rest holes). Edges inside the region are
  // left out. A region whose boundary pinches (a vertex where it touches
  // itself) or falls apart into pieces is written face by face instead.
  const grouped = new Set();
  let planeFaces = 0;
  const why = { pinch: 0, open: 0, pieces: 0 };
  // each connected patch of a region is its own plane face (a region split by
  // faces that stayed curved is still the same plane, in pieces)
  const patches = [];
  for (const g of model.planeGroups || []) {
    const left = new Set(g.faces);
    while (left.size) {
      const f0 = left.values().next().value, part = new Set([f0]), todo = [f0];
      left.delete(f0);
      while (todo.length) {
        const f = todo.pop();
        for (const { e } of f.edges) for (const h of e.faces) if (left.has(h)) { left.delete(h); part.add(h); todo.push(h); }
      }
      patches.push({ ...g, faces: part });
    }
  }
  for (const g of patches) {
    const runs = [];          // { a, b, oe } boundary pieces, in face orientation
    for (const f of g.faces) for (const sd of sidesOf(f)) {
      if (sd.e.faces.every((h) => g.faces.has(h))) continue;
      runs.push(sd);
    }
    const from = new Map();
    let pinch = false;
    for (const r of runs) { if (from.has(r.a)) pinch = true; from.set(r.a, r); }
    if (pinch || !runs.length) { why.pinch++; continue; }
    const loops = [], used = new Set();
    for (const r0 of runs) {
      if (used.has(r0)) continue;
      const loop = [];
      let r = r0;
      while (r && !used.has(r)) { used.add(r); loop.push(r); r = from.get(r.b); }
      if (loop.at(-1).b !== r0.a) { pinch = true; break; }
      loops.push(loop);
    }
    if (pinch) { why.open++; continue; }
    // orientation: outward = the member faces' own normal side
    let nsum = [0, 0, 0];
    for (const f of g.faces) { const { du, dv } = evalSurf(f.S, 0.5, 0.5, true); const c = cross(du, dv); nsum = [nsum[0] + c[0], nsum[1] + c[1], nsum[2] + c[2]]; }
    const n = dot(nsum, g.normal) >= 0 ? g.normal : g.normal.map((x) => -x);
    const ref = norm(Math.abs(n[0]) < 0.9 ? cross(n, [1, 0, 0]) : cross(n, [0, 1, 0])), ref2 = cross(n, ref);
    const area = (loop) => {
      const P = loop.flatMap((r) => r.P.slice(0, -1)).map((p) => [dot(p, ref), dot(p, ref2)]);
      let a = 0; for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; a += x1 * y2 - x2 * y1; }
      return a / 2;
    };
    const areas = loops.map(area);
    const outer = areas.filter((a) => a > 0).length;
    if (outer !== 1) { why.pieces++; continue; }       // pieces, or turned inside out: face by face
    const bounds = loops.map((loop, i) => {
      const oes = loop.flatMap(({ a, b, P, level }) => sideEdges(a, b, P, level));
      const id = add(`EDGE_LOOP('',(${oes.map((x) => `#${x}`).join(",")}))`);
      return add(`${areas[i] > 0 ? "FACE_OUTER_BOUND" : "FACE_BOUND"}('',#${id},.T.)`);
    });
    const o = g.origin;
    const plane = add(`PLANE('',#${add(`AXIS2_PLACEMENT_3D('',#${pt(o)},#${dir(n)},#${dir(ref)})`)})`);
    faceIds.push(add(`ADVANCED_FACE('',(${bounds.map((x) => `#${x}`).join(",")}),#${plane},.T.)`));
    for (const f of g.faces) grouped.add(f);
    planeFaces++;
  }
  let cylFaces = 0;
  for (const f of faces) {
    if (grouped.has(f)) continue;
    if (f.carrier?.kind === "cyl") {
      // a true CYLINDRICAL_SURFACE, trimmed by the same edge curves
      const c = f.carrier, { p, du, dv } = evalSurf(f.S, 0.5, 0.5, true);
      const w = sub(p, c.point), radial = norm(sub(w, c.axis.map((x) => x * dot(w, c.axis))));
      const same = dot(cross(du, dv), radial) > 0;
      const ref = norm(Math.abs(c.axis[0]) < 0.9 ? cross(c.axis, [1, 0, 0]) : cross(c.axis, [0, 1, 0]));
      const oes = sidesOf(f).flatMap(({ a, b, P, level }) => sideEdges(a, b, P, level));
      const loop = add(`EDGE_LOOP('',(${oes.map((x) => `#${x}`).join(",")}))`);
      const surf = add(`CYLINDRICAL_SURFACE('',#${add(`AXIS2_PLACEMENT_3D('',#${pt(c.point)},#${dir(c.axis)},#${dir(ref)})`)},${fmt(c.radius)})`);
      faceIds.push(add(`ADVANCED_FACE('',(#${add(`FACE_OUTER_BOUND('',#${loop},.T.)`)}),#${surf},${same ? ".T." : ".F."})`));
      cylFaces++;
      continue;
    }
    face(f.S, sidesOf(f));
  }
  for (const fl of fills) {
    const P = Float64Array.from(fl.grid);
    face(makeSurf(0, 0, P), fl.sides.map(({ a, b, ctrl: c }) => ({ a, b, P: c, level: 0 })));
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
    faces: faceIds.length,
    planeFaces,
    cylFaces,
    mergedFaces: grouped.size,
    unmerged: why,
    step: "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\n"
      + `FILE_NAME('${name}.step','',(''),(''),'brepcode','brepcode','');\n`
      + "FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));\nENDSEC;\nDATA;\n"
      + out.join("\n") + "\nENDSEC;\nEND-ISO-10303-21;\n",
  };
}

// the surface as triangles, with a per-vertex level (for a heat-map preview):
// { tris: Float32Array xyz x 9, level: Uint8Array per triangle }
export function modelToTriangles(model, segsPerSpan = 3) {
  const T = [], L = [];
  const emit = (S, lvl) => {
    const gu = segsPerSpan * (1 << S.lu), gv = segsPerSpan * (1 << S.lv), grid = [];
    for (let a = 0; a <= gu; a++) for (let b = 0; b <= gv; b++) grid.push(evalSurf(S, a / gu, b / gv));
    const g = (a, b) => grid[a * (gv + 1) + b];
    for (let a = 0; a < gu; a++) for (let b = 0; b < gv; b++) {
      T.push(...g(a, b), ...g(a + 1, b), ...g(a + 1, b + 1)); L.push(lvl);
      T.push(...g(a, b), ...g(a + 1, b + 1), ...g(a, b + 1)); L.push(lvl);
    }
  };
  for (const f of model.faces) emit(f.S, f.stuck && f.foldedFit ? 7 : Math.max(f.S.lu, f.S.lv));
  for (const fl of model.fills) emit(makeSurf(0, 0, Float64Array.from(fl.grid)), 6);
  return { tris: Float64Array.from(T), level: Uint8Array.from(L) };
}
