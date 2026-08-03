// Booleans on triangles, without the kernel.
//
// The kernel's cost tracks TOPOLOGY, not triangle count: it sews a mesh into a
// real solid with faces and edges, and an imported STL is thousands of little
// facets that all have to become real. A smooth 89k-triangle sphere sews in
// about four seconds; a 5k-triangle Benchy takes twenty-six, because the
// Benchy is thousands of unrelated flat facets and the sphere is one surface.
// That is why "drill a hole in this STL" used to mean a minute of waiting, and
// why Simplify only traded one wait for another.
//
// A mesh does not need any of that to be cut. It needs to know which triangles
// are inside the cutter and which are outside, and to split the ones that
// straddle it. That is a BSP tree, it is exact enough for parts you are going
// to print, and it runs in milliseconds on the meshes that were taking a
// minute.
//
// What this deliberately is NOT: a replacement for the kernel. The result is
// triangles, so there is no edge left to fillet() and a STEP of it is faceted.
// On a model that arrived as triangles that costs nothing, which is exactly
// when this path is taken.
//
// UNFINISHED — NOT WIRED INTO THE APP, AND HERE IS WHY.
//
// The volumes are exact: a 20mm cube with a 4mm rod bored through it comes out
// at 6997.6mm3 against 6997.6 expected, an error of 0.000%. There are no holes.
// But the output is not EDGE-MANIFOLD: 222 of 355 vertices in that same result
// are T-junctions — a vertex sitting partway along another triangle's edge
// rather than at one of its ends. It happens because splitting a polygon does
// not split the neighbour that shares the cut edge, so one side ends up with
// two half-edges where the other still has one.
//
// That is the well-known artefact of this algorithm, and it matters here more
// than it would elsewhere: these meshes go to a slicer. Many slicers repair
// T-junctions silently, some produce cracks on the layer that crosses one, and
// "usually fine" is not what this app promises about a part you are about to
// print. Wiring it in before that is fixed would trade a slow, correct answer
// for a fast one that is sometimes subtly wrong, which is the wrong trade.
//
// The fix is a stitching pass over the finished mesh: for every vertex lying on
// an edge it does not terminate, re-triangulate the face owning that edge so
// the vertex becomes a real corner of it. test/meshbool.js already checks for
// this — the six failures it reports are exactly this defect, and they are the
// specification for that pass.

const EPS = 1e-5;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// A polygon carries its own plane. Recomputing it after a split would drift:
// the child of a split inherits the parent's plane exactly, which is what keeps
// coplanar faces recognisably coplanar instead of almost-coplanar.
function makePolygon(verts, plane) {
  if (plane) return { verts, plane };
  const n = cross(sub(verts[1], verts[0]), sub(verts[2], verts[0]));
  const l = len(n);
  if (l < 1e-12) return null;                 // a degenerate sliver has no plane
  const unit = [n[0] / l, n[1] / l, n[2] / l];
  return { verts, plane: { n: unit, w: dot(unit, verts[0]) } };
}

const flip = (p) => ({
  verts: p.verts.slice().reverse(),
  plane: { n: [-p.plane.n[0], -p.plane.n[1], -p.plane.n[2]], w: -p.plane.w },
});

// Sort a polygon against a plane into the four buckets the tree needs. The two
// coplanar buckets are kept apart by FACING, not position: a face lying exactly
// on the cutter belongs with whichever side it points at, and merging them is
// how coincident walls turn into z-fighting or vanish.
const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

function splitPolygon(poly, plane, coplanarFront, coplanarBack, front, back) {
  let polyType = 0;
  const types = [];
  for (const v of poly.verts) {
    const t = dot(plane.n, v) - plane.w;
    const type = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    polyType |= type;
    types.push(type);
  }

  if (polyType === COPLANAR) {
    (dot(plane.n, poly.plane.n) > 0 ? coplanarFront : coplanarBack).push(poly);
    return;
  }
  if (polyType === FRONT) { front.push(poly); return; }
  if (polyType === BACK) { back.push(poly); return; }

  // Spanning: walk the edges, emitting the crossing point into both halves.
  const f = [], b = [];
  for (let i = 0; i < poly.verts.length; i++) {
    const j = (i + 1) % poly.verts.length;
    const ti = types[i], tj = types[j];
    const vi = poly.verts[i], vj = poly.verts[j];
    if (ti !== BACK) f.push(vi);
    if (ti !== FRONT) b.push(vi);
    if ((ti | tj) === SPANNING) {
      const t = (plane.w - dot(plane.n, vi)) / dot(plane.n, sub(vj, vi));
      const v = lerp(vi, vj, t);
      f.push(v); b.push(v);
    }
  }
  // Fewer than three points is a numerical sliver, not a face.
  if (f.length >= 3) front.push({ verts: f, plane: poly.plane });
  if (b.length >= 3) back.push({ verts: b, plane: poly.plane });
}

// ---------------------------------------------------------------- the tree
//
// Built with an explicit stack rather than recursion. A mesh with thousands of
// nearly-parallel facets — which is precisely what an STL of a curved surface
// is — produces a deep, unbalanced tree, and the recursive version of this
// blows the JavaScript stack on exactly the models this exists to handle.

function buildNode(polygons) {
  const root = { plane: null, front: null, back: null, polygons: [] };
  const stack = [[root, polygons]];
  while (stack.length) {
    const [node, polys] = stack.pop();
    if (!polys.length) continue;
    if (!node.plane) node.plane = polys[0].plane;
    const front = [], back = [];
    for (const p of polys) {
      splitPolygon(p, node.plane, node.polygons, node.polygons, front, back);
    }
    if (front.length) {
      node.front ??= { plane: null, front: null, back: null, polygons: [] };
      stack.push([node.front, front]);
    }
    if (back.length) {
      node.back ??= { plane: null, front: null, back: null, polygons: [] };
      stack.push([node.back, back]);
    }
  }
  return root;
}

function allPolygons(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    for (const p of n.polygons) out.push(p);
    if (n.front) stack.push(n.front);
    if (n.back) stack.push(n.back);
  }
  return out;
}

function invertNode(root) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    n.polygons = n.polygons.map(flip);
    if (n.plane) n.plane = { n: [-n.plane.n[0], -n.plane.n[1], -n.plane.n[2]], w: -n.plane.w };
    const t = n.front; n.front = n.back; n.back = t;
    if (n.front) stack.push(n.front);
    if (n.back) stack.push(n.back);
  }
}

// Remove every part of `polys` that sits inside the solid `node` describes.
function clipPolygons(node, polys) {
  if (!node.plane) return polys.slice();
  let front = [], back = [];
  for (const p of polys) splitPolygon(p, node.plane, front, back, front, back);
  if (node.front) front = clipPolygons(node.front, front);
  // No back child means everything behind this plane is solid, so it goes.
  back = node.back ? clipPolygons(node.back, back) : [];
  return front.concat(back);
}

function clipTo(a, b) {
  const stack = [a];
  while (stack.length) {
    const n = stack.pop();
    if (!n) continue;
    n.polygons = clipPolygons(b, n.polygons);
    if (n.front) stack.push(n.front);
    if (n.back) stack.push(n.back);
  }
}

// ------------------------------------------------------------ mesh <-> polys

function toPolygons({ points, faces }) {
  const out = [];
  for (const f of faces) {
    // A face may be a triangle or a fan; both arrive as index lists.
    if (f.length < 3) continue;
    const verts = f.map((i) => points[i]);
    const p = makePolygon(verts);
    if (p) out.push(p);                       // degenerate faces are dropped
  }
  return out;
}

// Back to indexed triangles, welding vertices that land on the same point.
// Without the weld a boolean returns a soup of unshared vertices, which is
// legal but triples the file and stops the viewer from shading it smoothly.
function toMesh(polys) {
  const points = [];
  const index = new Map();
  const key = (v) => `${Math.round(v[0] / EPS)},${Math.round(v[1] / EPS)},${Math.round(v[2] / EPS)}`;
  const idOf = (v) => {
    const k = key(v);
    let i = index.get(k);
    if (i === undefined) { i = points.length; points.push(v); index.set(k, i); }
    return i;
  };
  const faces = [];
  for (const p of polys) {
    const ids = p.verts.map(idOf);
    // Fan-triangulate. Polygons out of a BSP split are convex, so a fan from
    // the first vertex is always valid.
    for (let i = 2; i < ids.length; i++) {
      const t = [ids[0], ids[i - 1], ids[i]];
      if (t[0] !== t[1] && t[1] !== t[2] && t[0] !== t[2]) faces.push(t);
    }
  }
  return { points, faces };
}

// ------------------------------------------------------------------- the ops

function op(kind, meshA, meshB) {
  const a = buildNode(toPolygons(meshA));
  const b = buildNode(toPolygons(meshB));

  if (kind === "union") {
    clipTo(a, b); clipTo(b, a);
    invertNode(b); clipTo(b, a); invertNode(b);
  } else if (kind === "subtract") {
    invertNode(a);
    clipTo(a, b); clipTo(b, a);
    invertNode(b); clipTo(b, a); invertNode(b);
  } else {                                    // intersect
    invertNode(a);
    clipTo(b, a); invertNode(b);
    clipTo(a, b); clipTo(b, a);
  }

  const merged = buildNode(allPolygons(a).concat(allPolygons(b)));
  if (kind !== "union") invertNode(merged);
  return toMesh(allPolygons(merged));
}

export const meshUnion = (a, b) => op("union", a, b);
export const meshSubtract = (a, b) => op("subtract", a, b);
export const meshIntersect = (a, b) => op("intersect", a, b);

// Fold a list the way difference(target, ...cutters) reads.
export function meshSubtractAll(target, cutters) {
  let out = target;
  for (const c of cutters) out = meshSubtract(out, c);
  return out;
}

// -------------------------------------------------------------- convenience
// Cutters, as meshes, so a caller does not have to hand-build a cylinder to
// drill a hole. Sizes are in millimetres, matching everything else.

export function boxMesh([sx, sy, sz], centre = [0, 0, 0]) {
  const [x, y, z] = [sx / 2, sy / 2, sz / 2];
  const [cx, cy, cz] = centre;
  const points = [
    [cx - x, cy - y, cz - z], [cx + x, cy - y, cz - z],
    [cx + x, cy + y, cz - z], [cx - x, cy + y, cz - z],
    [cx - x, cy - y, cz + z], [cx + x, cy - y, cz + z],
    [cx + x, cy + y, cz + z], [cx - x, cy + y, cz + z],
  ];
  const faces = [
    [0, 3, 2], [0, 2, 1],     // bottom (-Z), wound outward
    [4, 5, 6], [4, 6, 7],     // top
    [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6],
    [3, 0, 4], [3, 4, 7],
  ];
  return { points, faces };
}

export function cylinderMesh({ r = 5, h = 20, segments = 32, centre = [0, 0, 0] } = {}) {
  const n = Math.max(3, segments | 0);
  const [cx, cy, cz] = centre;
  const z0 = cz - h / 2, z1 = cz + h / 2;
  const points = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z0]);
  }
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z1]);
  }
  const bottom = points.length; points.push([cx, cy, z0]);
  const top = points.length; points.push([cx, cy, z1]);
  const faces = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([i, j, j + n], [i, j + n, i + n]);   // wall
    faces.push([bottom, j, i]);                     // bottom cap, facing -Z
    faces.push([top, i + n, j + n]);                // top cap, facing +Z
  }
  return { points, faces };
}
