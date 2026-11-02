// How far the input mesh strays from a smooth-surface cage: a cheap stand-in
// for the finished surface's error, used to size the cage to the mesh
// (cage.js tries a small cage first and grows it only when this says the
// small one would smooth away real shape).
//
// Samples up to `samples` input vertices and measures each one's distance to
// the nearest cage quad (two triangles), found through a uniform grid.
// Returns { mean, p95, max, diag } in the mesh's units.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// closest point on triangle abc to p (Ericson, Real-Time Collision Detection 5.1.5)
function closest(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}

export function cageDeviation(meshVerts, cageVerts, quads, opts = {}) {
  const P = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  const tris = [];
  for (let q = 0; q < quads.length; q += 4) {
    const [a, b, c, d] = [0, 1, 2, 3].map((k) => P(cageVerts, quads[q + k]));
    tris.push([a, b, c], [a, c, d]);
  }
  return surfaceDeviation(meshVerts, tris, opts);
}

// The same, against any triangles ([[a, b, c], ...], or a flat position
// array 9 numbers per triangle): the finished smooth surface's own preview.
export function surfaceDeviation(meshVerts, triangles, { samples = 3000 } = {}) {
  const P = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  let tris = triangles;
  if (!Array.isArray(triangles[0])) {
    tris = [];
    for (let i = 0; i + 8 < triangles.length; i += 9) tris.push([[triangles[i], triangles[i + 1], triangles[i + 2]], [triangles[i + 3], triangles[i + 4], triangles[i + 5]], [triangles[i + 6], triangles[i + 7], triangles[i + 8]]]);
  }
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < meshVerts.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], meshVerts[i + k]); hi[k] = Math.max(hi[k], meshVerts[i + k]); }
  const diag = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  // the triangles, bucketed by every grid cell their box touches
  let edge = 0;
  for (const [a, b] of tris) edge += Math.hypot(...sub(b, a));
  const cell = Math.max(edge / tris.length * 2, diag / 200);
  const grid = new Map();
  const ix = (x) => Math.floor(x / cell);
  tris.forEach((t, i) => {
    const mn = [0, 1, 2].map((k) => ix(Math.min(t[0][k], t[1][k], t[2][k]))), mx = [0, 1, 2].map((k) => ix(Math.max(t[0][k], t[1][k], t[2][k])));
    for (let x = mn[0]; x <= mx[0]; x++) for (let y = mn[1]; y <= mx[1]; y++) for (let z = mn[2]; z <= mx[2]; z++) {
      const key = `${x},${y},${z}`;
      let l = grid.get(key);
      if (!l) { l = []; grid.set(key, l); }
      l.push(i);
    }
  });
  const nv = meshVerts.length / 3, step = Math.max(1, Math.floor(nv / samples)), ds = [];
  for (let i = 0; i < nv; i += step) {
    const p = P(meshVerts, i), g = p.map(ix);
    let best = Infinity;
    for (let r = 0; r <= 6 && best > (r - 1) * cell; r++) {
      for (let x = g[0] - r; x <= g[0] + r; x++) for (let y = g[1] - r; y <= g[1] + r; y++) for (let z = g[2] - r; z <= g[2] + r; z++) {
        if (Math.max(Math.abs(x - g[0]), Math.abs(y - g[1]), Math.abs(z - g[2])) !== r) continue;   // the shell at radius r only
        for (const t of grid.get(`${x},${y},${z}`) || []) {
          const [a, b, c] = tris[t];
          best = Math.min(best, Math.hypot(...sub(closest(p, a, b, c), p)));
        }
      }
    }
    if (best < Infinity) ds.push(best);
  }
  ds.sort((a, b) => a - b);
  return {
    mean: ds.reduce((s, x) => s + x, 0) / (ds.length || 1),
    p95: ds[Math.floor(ds.length * 0.95)] ?? 0,
    max: ds.at(-1) ?? 0,
    diag,
  };
}
