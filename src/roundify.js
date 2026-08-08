// The tube-and-sphere rounded offset: a plan, not geometry.
//
// Grow a solid by r and the new surface is made of exactly three things —
//
//   every FACE  slides out along its normal by r        (the flats)
//   every convex EDGE gains a cylinder of radius r      (the tubes)
//   every convex VERTEX gains a sphere of radius r      (the corners)
//
// — and their union has no gap anywhere, because each piece is the set of
// points within r of a face, an edge or a corner, and those three cover the
// whole boundary. That is the exact Minkowski sum with a ball, and it is exact:
// the flats stay perfectly flat, the rounds are true cylinders and spheres, and
// nothing is sampled on a grid.
//
// The same three pieces do the other direction. Eroding is the solid MINUS the
// r-thick shell around its own boundary, and that shell is the same slabs,
// tubes and balls. So one plan serves both: union it to grow, subtract it to
// shrink.
//
// This module returns a PLAN — a list of primitives with positions and sizes —
// rather than kernel objects, so it can be tested against arithmetic in node
// without a kernel, and so the caller decides what to build them with.
//
// When NOT to use it: the cost is one primitive per triangle, convex edge and
// convex corner. A blocky part needs tens; a cube is 32. An imported organic
// mesh needs thousands — 4,161 for a 2,048-triangle sphere — and no kernel will
// union that. offsetPrimitiveCount() is the cheap check, and offset3d.js is the
// sampled fallback for exactly those.

import { analyzeSolid, triangleNormal } from "./faces.js";

// Past here the union is the bottleneck and the sampled route wins. This number
// is measured, not guessed. Growing a faceted cylinder, at 8 segments per tube:
//
//     primitives    50      98     146     194
//     time        0.4s    3.4s   18.8s   45.0s
//     result     clean   clean   NOT watertight   badly broken
//
// The boolean stops being trustworthy between 98 and 146, and the time is
// already unpleasant there, so the cut is below it. Shapes past this point are
// not refused outright — offset3d.js samples them instead, which is slower and
// blurs the flats but does not care how complicated the shape is.
export const MAX_PRIMITIVES = 120;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

// Build the list of primitives whose union is the r-shell of this solid's
// boundary. Positions are in the mesh's own space; nothing is transformed.
export function roundifyPlan(mesh, r, { analysis = null, maxPrimitives = MAX_PRIMITIVES } = {}) {
  const radius = Math.abs(Number(r));
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new TypeError("roundify needs a positive radius in mm");
  }
  const a = analysis || analyzeSolid(mesh);
  const total = a.faces.length + a.convexEdges.length + a.convexVertices.length;
  if (total > maxPrimitives) {
    throw new Error(
      `roundify refused: this shape needs ${total} primitives (${a.faces.length} slabs, `
      + `${a.convexEdges.length} tubes, ${a.convexVertices.length} balls) and the union stops being `
      + `worth it past ${maxPrimitives}. Use the sampled offset for meshes this dense.`);
  }

  // The flats. Each whole FACE is swept along its normal by r.
  //
  // Sweeping each triangle separately is the easy version and it was the first
  // one: it needs no polygon handling at all. It is also what made a faceted
  // cylinder impossible — 64 triangles became 64 prisms, and 46 of the walls
  // between them were internal, so the union's only real job was dissolving
  // walls that should never have been built. Sweeping the merged face instead
  // takes the cylinder from 64 prisms to 18.
  //
  // The usual reason people sweep triangles is that extruding a polygon means
  // triangulating it, holes and all. That is avoided here: the face already
  // arrives triangulated, so the two caps are its own triangles offset by r,
  // and the sides come from its boundary edges — the ones used by exactly one
  // triangle of the face. A face with a hole in it has two boundary loops and
  // needs no special handling, because nothing here ever looks for a loop.
  const slabs = [];
  for (const g of a.faces) {
    if (!g.normal) continue;
    const used = new Map();                            // point index -> slab-local index
    const tris = [];
    const edgeUse = new Map();                         // undirected key -> directed pairs
    for (const ti of g.triangles) {
      const f = mesh.faces[ti];
      if (!triangleNormal(mesh.points, f)) continue;   // a sliver sweeps to nothing
      const local = f.map((i) => {
        if (!used.has(i)) used.set(i, used.size);
        return used.get(i);
      });
      tris.push(local);
      for (let k = 0; k < 3; k++) {
        const u = local[k], v = local[(k + 1) % 3];
        const key = u < v ? `${u}_${v}` : `${v}_${u}`;
        const bucket = edgeUse.get(key);
        if (bucket) bucket.push([u, v]); else edgeUse.set(key, [[u, v]]);
      }
    }
    if (!tris.length) continue;
    const boundary = [];
    for (const bucket of edgeUse.values()) if (bucket.length === 1) boundary.push(bucket[0]);
    const points = new Array(used.size);
    for (const [orig, local] of used) points[local] = mesh.points[orig].slice();
    slabs.push({ kind: "slab", points, tris, boundary, normal: g.normal, height: radius });
  }

  // The tubes. Only convex edges: a concave one folds into the material, so a
  // cylinder there is already buried and would only cost a boolean.
  const tubes = a.convexEdges.map((e) => {
    const p = mesh.points[e.a], q = mesh.points[e.b];
    return {
      kind: "cylinder",
      from: p.slice(),
      to: q.slice(),
      radius,
      length: len(sub(q, p)),
    };
  });

  // The corners.
  const balls = a.convexVertices.map((v) => ({
    kind: "sphere",
    at: mesh.points[v].slice(),
    radius,
  }));

  return { radius, grow: Number(r) > 0, slabs, tubes, balls, total, faces: a.faces.length };
}

// What the finished shape should measure, from the plan alone. Used by the
// tests to check the assembled solid against arithmetic rather than against a
// picture, and cheap enough to show someone before they commit to the build.
//
// For a convex solid the dilated volume is Steiner's formula: the original,
// plus the surface area times r, plus the mean-width term over the edges, plus
// a whole ball for the corners. The edge term needs the exterior angle at each
// edge, which the plan already knows.
export function expectedGrownVolume(mesh, r, analysis = null) {
  const a = analysis || analyzeSolid(mesh);
  let volume = 0, area = 0;
  for (const f of mesh.faces) {
    const [A, B, C] = f.map((i) => mesh.points[i]);
    volume += (A[0] * (B[1] * C[2] - B[2] * C[1])
      - A[1] * (B[0] * C[2] - B[2] * C[0])
      + A[2] * (B[0] * C[1] - B[1] * C[0])) / 6;
    const u = sub(B, A), v = sub(C, A);
    area += len([
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]) / 2;
  }
  // Each convex edge contributes a wedge of cylinder: its exterior angle over
  // 2*pi of a full r-cylinder along its length.
  let edgeTerm = 0;
  for (const e of a.convexEdges) {
    const n1 = triangleNormal(mesh.points, mesh.faces[e.tris[0]]);
    const n2 = triangleNormal(mesh.points, mesh.faces[e.tris[1]]);
    if (!n1 || !n2) continue;
    const cosang = Math.max(-1, Math.min(1, n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]));
    const exterior = Math.acos(cosang);                // 0 for flat, pi/2 for a square corner
    edgeTerm += exterior * r * r * len(sub(mesh.points[e.b], mesh.points[e.a])) / 2;
  }
  // The corners of a closed convex solid always add up to exactly one ball.
  return Math.abs(volume) + area * r + edgeTerm + (4 / 3) * Math.PI * r ** 3;
}
