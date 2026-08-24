// Grow or shrink a solid, rounding as it goes.
//
// This is Minkowski with a ball, which is the case essentially every real
// OpenSCAD minkowski() is: `minkowski() { cube(...); sphere(r); }` to get a
// rounded box. Adding a ball to every point of a solid IS a uniform outward
// offset, and offsetting a distance field is just subtracting from it —
//
//     grow by r    ->  f(p) - r
//     shrink by r  ->  f(p) + r
//
// so both directions come from one line, and the sign is the whole feature.
// They are not symmetric in what they round: growing rounds the CONVEX edges
// (the outside corners of a box), shrinking rounds the CONCAVE ones (the inside
// corners of a pocket). That is why "round the inside of this slot" and "round
// the outside of this block" are the same operation with opposite signs.
//
// Why not the kernel: it has no offset. Its feature registry is THICKEN,
// PUSHFACE, HEIGHTMAP, STL IMPORT, TEXT TO FACE, SMOOTH SUBDIVISION, EDGE
// SMOOTH, COLLAPSE EDGE and the self-intersection cleanups — nothing that
// grows a solid. The 2D offset() in the OpenSCAD layer works on flat profiles
// and refuses solids outright. So this is ours.
//
// What it costs: the result is a MESH. There is no exact edge left to fillet
// and a STEP of it is faceted — the same trade blend() makes, for the same
// reason. Sharp features also soften by roughly half a grid cell, which is
// invisible once you are rounding by millimetres and is the reason a zero
// offset is not a no-op. Do not use this to "do nothing".

import { surfaceNets } from "./sdf.js";
import { inspectMesh } from "./meshhealth.js";
import { repairMesh } from "./meshrepair.js";

// Past this the sampling cost stops being worth it — see the note on `res`.
export const MAX_FACES = 40000;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// Squared distance from a point to a triangle — the Ericson region test, which
// answers "which of the seven Voronoi regions is this in" without branching
// into trigonometry.
function distanceSqToTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);

  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const q = sub(p, [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]);
    return dot(q, q);
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const q = sub(p, [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]);
    return dot(q, q);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const q = sub(p, [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]);
    return dot(q, q);
  }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  const q = sub(p, [
    a[0] + ab[0] * v + ac[0] * w,
    a[1] + ab[1] * v + ac[1] * w,
    a[2] + ab[2] * v + ac[2] * w,
  ]);
  return dot(q, q);
}

// A uniform grid of triangles. Without it every sample tests every triangle,
// which is fine for a twelve-triangle cube and hopeless for anything real: a
// 64-cell field is a quarter of a million samples.
function triangleGrid(tris, lo, hi, cells) {
  const span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const cell = Math.max(...span) / cells || 1;
  const dim = span.map((s) => Math.max(1, Math.ceil(s / cell)));
  // Integer keys, not strings. Every cell probe used to build a
  // `${i},${j},${k}` string, and at a quarter of a million samples each
  // touching dozens of cells that is tens of millions of throwaway strings —
  // which is where most of the time was going, not in the geometry.
  const buckets = new Map();
  const idx = (i, j, k) => (k * dim[1] + j) * dim[0] + i;


  tris.forEach((t, ti) => {
    const a = [0, 1, 2].map((d) => {
      const v = Math.min(t[0][d], t[1][d], t[2][d]);
      return Math.max(0, Math.min(dim[d] - 1, Math.floor((v - lo[d]) / cell)));
    });
    const b = [0, 1, 2].map((d) => {
      const v = Math.max(t[0][d], t[1][d], t[2][d]);
      return Math.max(0, Math.min(dim[d] - 1, Math.floor((v - lo[d]) / cell)));
    });
    for (let i = a[0]; i <= b[0]; i++) {
      for (let j = a[1]; j <= b[1]; j++) {
        for (let k = a[2]; k <= b[2]; k++) {
          const key = idx(i, j, k);
          const bucket = buckets.get(key);
          if (bucket) bucket.push(ti); else buckets.set(key, [ti]);
        }
      }
    }
  });
  return { buckets, cell, dim, lo, idx, lines: new Map() };
}

// Nearest distance, searching cells in rings outward and stopping as soon as
// the next ring cannot beat what we already have.
function nearestDistance(p, tris, g, maxUseful = Infinity) {
  const c = [0, 1, 2].map((d) => Math.max(0, Math.min(g.dim[d] - 1, Math.floor((p[d] - g.lo[d]) / g.cell))));
  let best = Infinity;
  const maxRing = Math.max(...g.dim);
  for (let ring = 0; ring <= maxRing; ring++) {
    if (best < Infinity && (ring - 1) * g.cell > Math.sqrt(best)) break;
    // Narrow band: only the shell where f(p) crosses the offset matters. A
    // sample deep inside or far outside needs the right SIGN and a value past
    // the level set — not an exact distance nobody reads. Without this the ring
    // search keeps expanding across the whole grid for every far sample, which
    // is where the seconds went: 70s at res 64 before, and most of it spent
    // measuring distances that made no difference to the surface.
    if ((ring - 1) * g.cell > maxUseful) break;
    let touched = false;
    for (let i = c[0] - ring; i <= c[0] + ring; i++) {
      for (let j = c[1] - ring; j <= c[1] + ring; j++) {
        for (let k = c[2] - ring; k <= c[2] + ring; k++) {
          // only the shell of the ring; the inside was covered already
          if (ring > 0 && Math.abs(i - c[0]) !== ring
            && Math.abs(j - c[1]) !== ring && Math.abs(k - c[2]) !== ring) continue;
          if (i < 0 || j < 0 || k < 0 || i >= g.dim[0] || j >= g.dim[1] || k >= g.dim[2]) continue;
          const bucket = g.buckets.get(g.idx(i, j, k));
          if (!bucket) continue;
          touched = true;
          for (const ti of bucket) {
            const t = tris[ti];
            const d = distanceSqToTriangle(p, t[0], t[1], t[2]);
            if (d < best) best = d;
          }
        }
      }
    }
    void touched;
  }
  // Nothing within the band: report the band edge, which is past the level set
  // and therefore on the correct side of it.
  return best === Infinity ? maxUseful + g.cell : Math.sqrt(best);
}

// Inside or out, by ray parity along +X. Only the triangles in the cells that
// row passes through are tested, which is what keeps it affordable.
// Where the +X line through (y, z) crosses the surface, sorted.
//
// Computed once per LINE and cached, which is the difference between this
// being usable and not: a 72-cell field is nearly 400,000 samples, and casting
// a fresh ray from each one re-tests the same triangles seventy times over.
// surfaceNets walks x innermost, so a whole row shares one answer.
//
// The line is nudged off the lattice before casting. A ray fired from the exact
// centre of a box runs straight down the diagonal where that face's two
// triangles meet, hits BOTH, counts two crossings and calls the middle of a
// solid "outside". The offsets are a fraction of a cell and irrational-ish, so
// the line cannot align with an edge, a vertex or a shared diagonal. Anywhere
// the nudge could change the answer, the point is ON the surface, where the
// distance is zero and the sign does not matter.
function crossingsAt(y, z, tris, g) {
  const key = (Math.round(z * 4096) * 8388608) + Math.round(y * 4096);
  const hit = g.lines.get(key);
  if (hit) return hit;

  const py = y + g.cell * 1.7e-3, pz = z + g.cell * 2.9e-3;
  const j = Math.max(0, Math.min(g.dim[1] - 1, Math.floor((py - g.lo[1]) / g.cell)));
  const k = Math.max(0, Math.min(g.dim[2] - 1, Math.floor((pz - g.lo[2]) / g.cell)));
  const seen = new Set();
  const xs = [];
  for (let i = 0; i < g.dim[0]; i++) {
    const bucket = g.buckets.get(g.idx(i, j, k));
    if (!bucket) continue;
    for (const ti of bucket) {
      if (seen.has(ti)) continue;
      seen.add(ti);
      const [a, b, c] = tris[ti];
      // A ray along +X from (-inf, py, pz): solve in the YZ plane for the
      // barycentric position, then read the crossing's x straight off.
      const y1 = a[1] - py, z1 = a[2] - pz;
      const y2 = b[1] - py, z2 = b[2] - pz;
      const y3 = c[1] - py, z3 = c[2] - pz;
      const d = (y2 - y1) * (z3 - z1) - (y3 - y1) * (z2 - z1);
      if (Math.abs(d) < 1e-14) continue;                 // edge-on to the line
      const u = (-y1 * (z3 - z1) + z1 * (y3 - y1)) / d;
      const v = ((y2 - y1) * -z1 + (z2 - z1) * y1) / d;
      if (u < 0 || v < 0 || u + v > 1) continue;
      xs.push(a[0] + u * (b[0] - a[0]) + v * (c[0] - a[0]));
    }
  }
  xs.sort((p, q) => p - q);
  g.lines.set(key, xs);
  return xs;
}

function isInside(point, tris, g) {
  const xs = crossingsAt(point[1], point[2], tris, g);
  let ahead = 0;
  for (let i = xs.length - 1; i >= 0; i--) {
    if (xs[i] > point[0]) ahead++; else break;           // sorted, so stop early
  }
  return (ahead % 2) === 1;
}

// ---- lattice-precompute hooks (fieldgrid.js) ------------------------------
//
// fieldgrid.js computes a whole distance LATTICE instead of answering one
// point at a time, and it wants exactly three internals: the acceleration
// grid, the cached parity ray, and "the exact distance, but only if a
// triangle is close". Exported here rather than duplicated there, so there is
// one implementation of each to be wrong.
export function buildTriangleGrid(tris, lo, hi, cells = 32) {
  return triangleGrid(tris, lo, hi, cells);
}
export function crossingsForLine(y, z, tris, g) {
  return crossingsAt(y, z, tris, g);
}
// null when no triangle is within r — the caller seeds only the near band and
// lets the chamfer sweep fill everything else.
export function exactDistanceNear(p, tris, g, r) {
  const d = nearestDistance(p, tris, g, r);
  return d > r ? null : d;
}

// A signed distance function for a closed triangle mesh.
export function meshSignedDistance(mesh, { gridCells = 32, band = Infinity } = {}) {
  const tris = mesh.faces.map(([a, b, c]) => [mesh.points[a], mesh.points[b], mesh.points[c]]);
  if (!tris.length) throw new Error("offset needs a mesh with triangles in it");
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) {
    for (const p of t) {
      for (let d = 0; d < 3; d++) {
        if (p[d] < lo[d]) lo[d] = p[d];
        if (p[d] > hi[d]) hi[d] = p[d];
      }
    }
  }
  const pad = Math.max(...[0, 1, 2].map((d) => hi[d] - lo[d])) * 0.05 + 1;
  const g = triangleGrid(tris, lo.map((v) => v - pad), hi.map((v) => v + pad), gridCells);
  const f = (p) => (isInside(p, tris, g) ? -1 : 1) * nearestDistance(p, tris, g, band);
  f.bounds = [lo, hi];
  return f;
}

// Grow (r > 0) or shrink (r < 0) a closed mesh, rounding as it goes.
//
// `res` is the sampling grid across the longest side. It buys accuracy and
// costs time cubically, so the default is the point where a rounded box is
// right to well under a percent rather than the point where it is perfect.
export function roundedOffset(mesh, r, { res = 64, requireClosed = true } = {}) {
  const amount = Number(r);
  if (!Number.isFinite(amount)) throw new TypeError("offset needs a distance in mm");
  if (mesh.faces.length > MAX_FACES) {
    throw new Error(
      `rounded offset refused: ${mesh.faces.length} triangles is past the ${MAX_FACES} this samples `
      + "quickly. Simplify the mesh first.");
  }
  if (requireClosed) {
    const health = inspectMesh(mesh);
    if (!health.watertight) {
      // An open surface has no inside, so "grow the solid" has no meaning and
      // the sign test would return noise rather than an answer.
      throw new Error(
        "rounded offset needs a closed surface — this one has "
        + `${health.openEdges} open edge${health.openEdges === 1 ? "" : "s"}. Repair it first.`);
    }
  }
  // The band only has to reach past the level set being extracted, plus a
  // couple of cells so the interpolation either side of it is honest.
  const rough = meshSignedDistance(mesh, { band: 0 });
  const spanFor = rough.bounds;
  const cellGuess = Math.max(...[0, 1, 2].map((d) => spanFor[1][d] - spanFor[0][d])) / res;
  const f = meshSignedDistance(mesh, { band: Math.abs(amount) + cellGuess * 3 });
  const [lo, hi] = f.bounds;
  // Room for the result: growing needs the box to open up by r, shrinking can
  // keep the original box. A margin of one cell stops the surface clipping flat
  // against the edge of the sampled volume.
  const grow = Math.max(amount, 0);
  const span = Math.max(...[0, 1, 2].map((d) => hi[d] - lo[d]));
  const pad = grow + span / res + Math.abs(amount) * 0.05 + 0.5;
  const bounds = [lo.map((v) => v - pad), hi.map((v) => v + pad)];
  const out = surfaceNets((p) => f(p) - amount, bounds, res);
  if (!out.faces.length) {
    throw new Error(amount < 0
      ? `shrinking by ${Math.abs(amount)}mm removed the whole part — try less`
      : "rounded offset produced nothing");
  }
  // Surface nets does not come back edge-manifold: measured on a grown 20mm
  // cube, 360 open edges and 2,140 edges owned by three faces or more. The
  // volume was right and the topology was not, which is the state the kernel
  // sews into something it will not subtract from — the exact fault that made
  // drilling a simplified model silently do nothing. So it is repaired here,
  // where the defect is created, rather than left for a caller to trip over.
  const fixed = repairMesh(out);
  return inspectMesh(fixed).watertight ? fixed : out;
}
