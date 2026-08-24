// A mesh's signed-distance field, PRECOMPUTED onto a lattice.
//
// meshSignedDistance() answers one point at a time, and each answer walks the
// acceleration grid in rings until it finds a triangle. One field sampled by
// surfaceNets can live with that. smoothUnion() cannot: N children × a res³
// lattice re-runs that walk hundreds of thousands of times per child, and a
// two-sphere blend measured in MINUTES.
//
// So the field is computed once, grid-shaped, in three passes that each touch
// every cell a constant number of times:
//
//   1. SEED — cells within a couple of lattice steps of a triangle get their
//      exact distance (only a handful of nearby triangles each, found through
//      the same bucket grid the sampler uses).
//   2. SWEEP — a forward and a backward chamfer pass propagate distance to
//      every other cell from its already-visited neighbours. Chamfer error is
//      a few percent, and it only exists FAR from the surface, where the blend
//      has stopped caring: the zero of a smooth-min lies within the blend
//      radius of the child surfaces, exactly where the seeded band is exact.
//   3. SIGN — one parity ray per (y, z) lattice line, through the same cached
//      crossings the point sampler uses.
//
// The result is a closure over a Float32Array: reads are a trilinear lerp.

import { crossingsForLine, buildTriangleGrid, exactDistanceNear } from "./offset3d.js";

export function meshFieldGrid(mesh, bounds, res, { seedBand = 2.5 } = {}) {
  const tris = mesh.faces.map(([a, b, c]) => [mesh.points[a], mesh.points[b], mesh.points[c]]);
  if (!tris.length) throw new Error("meshFieldGrid needs triangles");
  const [lo, hi] = bounds;
  const n = Math.max(8, Math.min(200, res | 0));
  const step = [(hi[0] - lo[0]) / n, (hi[1] - lo[1]) / n, (hi[2] - lo[2]) / n];
  const h = Math.max(...step);
  const N = n + 1;
  const at3 = (i, j, k) => [lo[0] + i * step[0], lo[1] + j * step[1], lo[2] + k * step[2]];
  const idx = (i, j, k) => (k * N + j) * N + i;

  const g = buildTriangleGrid(tris, lo, hi);
  const dist = new Float32Array(N * N * N).fill(Infinity);

  // 1. seed: exact distance where a triangle is within seedBand lattice steps
  const seedR = seedBand * h;
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const d = exactDistanceNear(at3(i, j, k), tris, g, seedR);
        if (d !== null) dist[idx(i, j, k)] = d;
      }
    }
  }

  // 2. chamfer sweep, forward then backward. Weights are the true distances
  // to the 26 neighbours, so straight, diagonal and corner steps all cost
  // what they measure.
  const W = [];
  for (let dk = -1; dk <= 1; dk++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj && !dk) continue;
        W.push([di, dj, dk, Math.hypot(di * step[0], dj * step[1], dk * step[2])]);
      }
    }
  }
  const fwd = W.filter(([di, dj, dk]) => dk < 0 || (dk === 0 && (dj < 0 || (dj === 0 && di < 0))));
  const bwd = W.filter((w) => !fwd.includes(w));
  const sweep = (order, from) => {
    for (const k of order.ks) {
      for (const j of order.js) {
        for (const i of order.is) {
          let best = dist[idx(i, j, k)];
          for (const [di, dj, dk, w] of from) {
            const ii = i + di, jj = j + dj, kk = k + dk;
            if (ii < 0 || jj < 0 || kk < 0 || ii >= N || jj >= N || kk >= N) continue;
            const cand = dist[idx(ii, jj, kk)] + w;
            if (cand < best) best = cand;
          }
          dist[idx(i, j, k)] = best;
        }
      }
    }
  };
  const up = [...Array(N).keys()];
  const down = up.slice().reverse();
  sweep({ is: up, js: up, ks: up }, fwd);
  sweep({ is: down, js: down, ks: down }, bwd);

  // 3. sign, one cached parity ray per lattice line
  for (let k = 0; k < N; k++) {
    for (let j = 0; j < N; j++) {
      const [, y, z] = at3(0, j, k);
      const xs = crossingsForLine(y, z, tris, g);
      let c = 0;
      for (let i = 0; i < N; i++) {
        const x = lo[0] + i * step[0];
        while (c < xs.length && xs[c] < x) c++;
        const inside = ((xs.length - c) % 2) === 1;
        if (inside) dist[idx(i, j, k)] = -dist[idx(i, j, k)];
      }
    }
  }

  // trilinear read; outside the lattice, clamp to the nearest cell (the
  // caller's bounds already include every place the blend can reach)
  const f = (p) => {
    const u = [(p[0] - lo[0]) / step[0], (p[1] - lo[1]) / step[1], (p[2] - lo[2]) / step[2]]
      .map((v) => Math.max(0, Math.min(n - 1e-6, v)));
    const i0 = u.map(Math.floor);
    const t = u.map((v, d) => v - i0[d]);
    let acc = 0;
    for (let c = 0; c < 8; c++) {
      const di = c & 1, dj = (c >> 1) & 1, dk = (c >> 2) & 1;
      const w = (di ? t[0] : 1 - t[0]) * (dj ? t[1] : 1 - t[1]) * (dk ? t[2] : 1 - t[2]);
      acc += w * dist[idx(i0[0] + di, i0[1] + dj, i0[2] + dk)];
    }
    return acc;
  };
  f.bounds = bounds;
  return f;
}
