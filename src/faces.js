// The real faces and edges of a triangulated solid.
//
// A mesh does not know it is a box. It knows it is twelve triangles, and the
// diagonal across each side is an artefact of triangulation rather than an edge
// of the shape. Anything that wants to reason about the SHAPE — round its
// edges, offset its faces, put a tube along every rim — has to recover which
// triangles are really one face and which edges are really edges.
//
// This is what the constructive rounded offset is built on, and the numbers are
// the reason it is worth having: a cube described by 12 triangles has 6 faces
// and 12 edges, so a tube-and-sphere construction needs 26 primitives rather
// than the 38 the raw triangulation implies. On a faceted cylinder the saving
// is larger, and it is the difference between a union the kernel can do and one
// it cannot.

const key = (u, v) => (u < v ? `${u}_${v}` : `${v}_${u}`);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

export function triangleNormal(points, [ia, ib, ic]) {
  const a = points[ia];
  const n = cross(sub(points[ib], a), sub(points[ic], a));
  const l = Math.hypot(n[0], n[1], n[2]);
  return l < 1e-12 ? null : [n[0] / l, n[1] / l, n[2] / l];
}

// Two triangles belong to the same face when they share a plane AND are
// connected through other triangles of that plane. The connectivity half
// matters: the top and bottom of a slab are parallel but they are not one face,
// and two separate pads milled into the same surface are two faces even though
// they are exactly coplanar.
export function analyzeSolid(mesh, { angleTol = 1e-3, offsetTol = 1e-4 } = {}) {
  const { points, faces } = mesh;
  const normals = faces.map((f) => triangleNormal(points, f));

  // Which triangles touch which edge.
  const edgeTris = new Map();
  faces.forEach((f, ti) => {
    const [a, b, c] = f;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = key(u, v);
      const bucket = edgeTris.get(k);
      if (bucket) bucket.push(ti); else edgeTris.set(k, [ti]);
    }
  });

  const samePlane = (i, j) => {
    const ni = normals[i], nj = normals[j];
    if (!ni || !nj) return false;
    if (dot(ni, nj) < 1 - angleTol) return false;
    // Parallel is not enough — they must also sit at the same offset, or the
    // two sides of a thin plate would merge into one face.
    const wi = dot(ni, points[faces[i][0]]);
    const wj = dot(nj, points[faces[j][0]]);
    return Math.abs(wi - wj) <= offsetTol * Math.max(1, Math.abs(wi));
  };

  // Flood fill across shared edges, only crossing where the plane is the same.
  const faceOf = new Int32Array(faces.length).fill(-1);
  const groups = [];
  for (let start = 0; start < faces.length; start++) {
    if (faceOf[start] >= 0 || !normals[start]) continue;
    const id = groups.length;
    const members = [];
    const stack = [start];
    faceOf[start] = id;
    while (stack.length) {
      const ti = stack.pop();
      members.push(ti);
      const [a, b, c] = faces[ti];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        for (const nb of edgeTris.get(key(u, v)) || []) {
          if (faceOf[nb] >= 0 || nb === ti) continue;
          if (!samePlane(ti, nb)) continue;
          faceOf[nb] = id;
          stack.push(nb);
        }
      }
    }
    groups.push({ id, normal: normals[start], triangles: members });
  }

  // An edge of the SHAPE is one where the two sides belong to different faces.
  // The rest are triangulation seams — the diagonal across a flat side — and a
  // tube along one of those would be a tube through the middle of a flat.
  const edges = [];
  for (const [k, tris] of edgeTris) {
    if (tris.length !== 2) continue;                 // open or non-manifold: skip
    const [i, j] = tris;
    if (faceOf[i] === faceOf[j]) continue;           // same face: a seam
    const [a, b] = k.split("_").map(Number);
    // Convex or concave, decided by where the neighbour's far corner sits
    // relative to this face's plane. Below it and the surface folds away from
    // the material — a convex rim, the kind a tube belongs on. Above it and the
    // fold is into the material, which is a valley and needs nothing.
    // A zero-area triangle has no plane, so it has no opinion about which way
    // the surface folds. Real meshes are full of them — the poles of any UV
    // sphere are a ring of them — and asking a null normal for a dot product is
    // how this first met one.
    const ni = normals[i];
    const far = faces[j].find((v) => v !== a && v !== b);
    const convex = (!ni || far === undefined) ? false
      : dot(ni, sub(points[far], points[a])) < -offsetTol;
    edges.push({ a, b, tris: [i, j], faces: [faceOf[i], faceOf[j]], convex });
  }

  // A vertex needs a sphere when it caps a convex rim. Anything else is either
  // flat or a valley, and a sphere there would sit inside the solid.
  const convexVertices = new Set();
  for (const e of edges) {
    if (!e.convex) continue;
    convexVertices.add(e.a);
    convexVertices.add(e.b);
  }

  return {
    faces: groups,
    faceOf,
    edges,
    convexEdges: edges.filter((e) => e.convex),
    convexVertices: [...convexVertices].sort((x, y) => x - y),
  };
}

// How many primitives a tube-and-sphere offset of this solid would need, which
// is the number that decides whether the constructive route is affordable at
// all. One slab per merged FACE, not per triangle: a face is swept in one piece
// using its own triangles as the caps, so a 64-triangle cylinder is 18 slabs.
// Counting triangles here would overstate a cylinder by three times and send
// shapes to the sampled fallback that the constructive route handles easily.
export function offsetPrimitiveCount(mesh, analysis = null) {
  const a = analysis || analyzeSolid(mesh);
  return {
    slabs: a.faces.length,
    tubes: a.convexEdges.length,
    balls: a.convexVertices.length,
    total: a.faces.length + a.convexEdges.length + a.convexVertices.length,
    faces: a.faces.length,
  };
}
