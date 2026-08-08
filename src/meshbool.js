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
// IT DOES NOT SCALE, AND THAT IS THE POINT OF IT. READ THIS BEFORE USING IT.
//
// Correctness is settled: volumes are exact, output is closed and edge-matched,
// stress cases included. Speed is not, and speed was the entire reason for
// building it. Measured, cutting a rod out of a sphere:
//
//     1,152 tris ->   3,706 out    0.2s
//     4,608 tris ->   9,142 out    0.8s
//    10,368 tris ->  16,582 out    4.7s
//    18,432 tris ->  25,208 out   22.4s
//    32,768 tris ->  40,224 out   60.9s
//
// That is quadratic. Past roughly ten thousand triangles it is SLOWER than the
// kernel it was meant to replace, and a real 225k-triangle Benchy took four and
// a half minutes, came back with 2.5 million triangles, and was not even closed
// at the end. It also only ran at all with --stack-size raised: clipPolygons()
// recurses once per tree level, and a deep tree overflows the default stack —
// which in a browser is a hard crash, not an exception.
//
// So this is the right algorithm for small meshes and the wrong one for the
// case that motivated it. A BSP splits every polygon against every plane that
// crosses it, and an imported STL is tens of thousands of facets. The real fix
// is an established mesh-boolean kernel (manifold-3d) rather than a better
// hand-rolled BSP. MAX_FACES below refuses the sizes where this loses, instead
// of appearing to work and then taking a minute.
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

// Where this stops being the fast option. At 10k triangles a cut takes about
// five seconds; at 18k, twenty-two. Refusing is kinder than a minute of silence
// followed by a mesh the slicer will not take, and the message names the two
// things that actually work instead.
export const MAX_FACES = 12000;

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
  const cellOf = (v) => [Math.round(v[0] / EPS), Math.round(v[1] / EPS), Math.round(v[2] / EPS)];
  // Rounding alone is not a weld: two points a hair apart can round into
  // neighbouring cells and stay separate, and a pair of vertices closer than
  // the on-edge tolerance makes the stitcher below split a face, then find the
  // other one on the new edge, forever. So look at the neighbouring cells too
  // and genuinely merge anything within EPS.
  const idOf = (v) => {
    const [cx, cy, cz] = cellOf(v);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const hit = index.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (hit === undefined) continue;
          const q = points[hit];
          if (Math.abs(q[0] - v[0]) <= EPS && Math.abs(q[1] - v[1]) <= EPS
            && Math.abs(q[2] - v[2]) <= EPS) return hit;
        }
      }
    }
    const i = points.length;
    points.push(v);
    index.set(`${cx},${cy},${cz}`, i);
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

// ------------------------------------------------------- T-junction stitching
//
// Splitting a polygon does not split the neighbour that shares the cut edge, so
// one side of that edge ends up with two half-edges where the other still has
// one. The mesh encloses exactly the right volume — there is no hole — but the
// edges do not pair up, and a slicer can open a crack along the layer that
// crosses one.
//
// The repair: wherever a vertex sits partway along an edge it does not end,
// re-cut the face owning that edge so the vertex becomes a real corner of it.
//
// Crucially this INTRODUCES NO NEW VERTICES. A face carrying an offending
// vertex is split in two by joining that vertex to the corner opposite its
// edge; both halves have real area, and each half may still carry others, so it
// recurses. Because the vertex set never grows, the process has to finish.
//
// The first version fanned each face from its CENTROID instead, which does fix
// the T-junctions but adds a vertex per face per round — and those new vertices
// land near other faces' edges, which splits those, which adds more. On a
// 32-sided hole in a plate it went from 494 faces to 52,172 with 43,094 edges
// still unmatched, then ate four gigabytes on the next cutter. Adding geometry
// to fix geometry does not converge.

function vertexGrid(points, cell) {
  const map = new Map();
  const at = (p) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)},${Math.floor(p[2] / cell)}`;
  points.forEach((p, i) => {
    const k = at(p);
    const bucket = map.get(k);
    if (bucket) bucket.push(i); else map.set(k, [i]);
  });
  return { map, cell };
}

// Vertices lying strictly between a and b, nearest-first along the segment.
function pointsOnEdge(points, grid, ia, ib, tol) {
  const A = points[ia], B = points[ib];
  const ab = sub(B, A);
  const L2 = dot(ab, ab);
  if (L2 < 1e-18) return [];
  const c = grid.cell;
  const lo = [0, 1, 2].map((i) => Math.floor((Math.min(A[i], B[i]) - tol) / c));
  const hi = [0, 1, 2].map((i) => Math.floor((Math.max(A[i], B[i]) + tol) / c));
  const found = [];
  const seen = new Set();
  for (let x = lo[0]; x <= hi[0]; x++) {
    for (let y = lo[1]; y <= hi[1]; y++) {
      for (let z = lo[2]; z <= hi[2]; z++) {
        const bucket = grid.map.get(`${x},${y},${z}`);
        if (!bucket) continue;
        for (const vi of bucket) {
          if (vi === ia || vi === ib || seen.has(vi)) continue;
          const P = points[vi];
          const ap = sub(P, A);
          const t = dot(ap, ab) / L2;
          if (t <= 0 || t >= 1) continue;                // at or past an end
          const d = [ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t];
          if (len(d) > tol) continue;
          // Parametric position is not enough on a long edge: t can be tiny and
          // still sit a whole millimetre from the end, or large enough to pass
          // this test while being a nanometre from it. Splitting a face at a
          // point that close to a corner produces a sliver, and the sliver is
          // what the stitcher then trips over on the next pass.
          const L = Math.sqrt(L2);
          if (t * L <= tol || (1 - t) * L <= tol) continue;
          seen.add(vi);
          found.push([t, vi]);
        }
      }
    }
  }
  found.sort((p, q) => p[0] - q[0]);
  return found.map((p) => p[1]);
}

export function stitchTJunctions(mesh, { tol = EPS * 2, maxFaces = 4e6 } = {}) {
  const points = mesh.points.map((p) => p.slice());
  if (!mesh.faces.length) return { points, faces: [] };

  // Cell size from the average edge, so a long thin part does not end up with
  // every vertex in one bucket (turning the lookup back into a linear scan).
  let total = 0, n = 0;
  for (const [a, b, c] of mesh.faces) {
    total += len(sub(points[b], points[a]))
      + len(sub(points[c], points[b])) + len(sub(points[a], points[c]));
    n += 3;
  }
  const cell = Math.max(total / Math.max(n, 1), tol * 10);
  const grid = vertexGrid(points, cell);

  // ONE pass per face, never a recursion.
  //
  // Splitting a face and re-examining the halves looks like it must terminate,
  // because the vertex set is fixed — but it does not. A sliver whose three
  // edges all lie within tolerance of each other reports points on the halves
  // it was just cut into, and cuts forever. Two overlapping cutters on a curved
  // surface produce exactly that, and it ran the face count away.
  //
  // Collecting each face's boundary points once and triangulating that polygon
  // has no such loop: every ear clipped removes a vertex, so it ends after at
  // most as many steps as the polygon has corners.
  const out = [];
  for (const f of mesh.faces) {
    if (out.length > maxFaces) throw new Error("stitchTJunctions: face count ran away");
    const [a, b, c] = f;
    const e0 = pointsOnEdge(points, grid, a, b, tol);
    const e1 = pointsOnEdge(points, grid, b, c, tol);
    const e2 = pointsOnEdge(points, grid, c, a, tol);
    if (!e0.length && !e1.length && !e2.length) { out.push([a, b, c]); continue; }
    for (const t of earClip(points, [a, ...e0, b, ...e1, c, ...e2])) out.push(t);
  }
  return { points, faces: out };
}

// Triangulate a planar loop without adding vertices.
//
// The loop here is always a triangle with extra points sitting along its edges,
// so it is convex — but it is convex with collinear runs, and that is what rules
// out the obvious answer. Fanning from a corner makes a degenerate triangle out
// of every point on the two edges touching that corner; drop those and the
// points are unused again, which is the T-junction back. Ear clipping picks
// corners that actually have area, so every point ends up used.
// Exported because the rounded offset re-triangulates whole planar regions
// with it — a CSG union leaves a flat face as hundreds of fragments, and
// clipping the region's outline back to a handful of triangles is what makes
// the result small enough for the kernel to import quickly.
export function earClip(points, loop) {
  if (loop.length < 3) return [];
  if (loop.length === 3) return [loop.slice()];

  // Work in 2D on the plane's dominant axis — cheaper and better conditioned
  // than staying in 3D, and the loop is planar by construction.
  const A = points[loop[0]], B = points[loop[1]], C = points[loop[2]];
  let n = cross(sub(B, A), sub(C, A));
  if (len(n) < 1e-18) {
    // Degenerate seed; try any other triple before giving up.
    for (let i = 3; i < loop.length && len(n) < 1e-18; i++) {
      n = cross(sub(points[loop[i]], A), sub(points[loop[1]], A));
    }
    if (len(n) < 1e-18) return [];
  }
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const drop = ax > ay && ax > az ? 0 : ay > az ? 1 : 2;
  const u = drop === 0 ? 1 : 0;
  const v = drop === 2 ? 1 : 2;
  const P = loop.map((i) => [points[i][u], points[i][v]]);

  const area2 = (i, j, k) =>
    (P[j][0] - P[i][0]) * (P[k][1] - P[i][1]) - (P[j][1] - P[i][1]) * (P[k][0] - P[i][0]);

  // Orientation of the loop in this projection; ears are judged against it.
  let signed = 0;
  for (let i = 0; i < P.length; i++) {
    const j = (i + 1) % P.length;
    signed += P[i][0] * P[j][1] - P[j][0] * P[i][1];
  }
  const ccw = signed > 0;

  const idx = loop.map((_, i) => i);
  const tris = [];
  let guard = idx.length * idx.length + 16;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let s = 0; s < idx.length; s++) {
      const i0 = idx[(s + idx.length - 1) % idx.length];
      const i1 = idx[s];
      const i2 = idx[(s + 1) % idx.length];
      const a2 = area2(i0, i1, i2);
      if (ccw ? a2 <= 1e-12 : a2 >= -1e-12) continue;      // reflex or flat
      // No other corner of the loop may sit inside the ear.
      let clean = true;
      for (const k of idx) {
        if (k === i0 || k === i1 || k === i2) continue;
        const d0 = area2(i0, i1, k), d1 = area2(i1, i2, k), d2 = area2(i2, i0, k);
        const neg = d0 < 0 || d1 < 0 || d2 < 0;
        const pos = d0 > 0 || d1 > 0 || d2 > 0;
        if (!(neg && pos)) { clean = false; break; }
      }
      if (!clean) continue;
      tris.push([loop[i0], loop[i1], loop[i2]]);
      idx.splice(s, 1);
      clipped = true;
      break;
    }
    // Numerically stuck: take the remaining loop as a fan rather than drop it.
    // Losing a face would put a hole in the mesh, which is worse than a slightly
    // untidy triangulation of one polygon.
    if (!clipped) break;
  }
  for (let i = 1; i + 1 < idx.length; i++) tris.push([loop[idx[0]], loop[idx[i]], loop[idx[i + 1]]]);
  return tris;
}

// ------------------------------------------------------------------- the ops

// A BSP clips against INFINITE planes, so a cutter parked well clear of the
// target still slices it: a 3mm rod 40mm away turned a 12-triangle cube into
// 62. Nothing moved and the volume stayed exact, but the mesh came back shredded
// and no longer edge-matched. Boxes that do not overlap cannot interact, so the
// answer is known without building a tree at all — which is also what stops four
// separate holes in a plate from each re-splitting the other three's work.
function bounds({ points }) {
  if (!points.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      if (p[i] < lo[i]) lo[i] = p[i];
      if (p[i] > hi[i]) hi[i] = p[i];
    }
  }
  return [lo, hi];
}

// Touching counts as overlapping: a cutter whose face sits exactly on the
// target's is the flush-pocket case, which very much does interact.
function boxesOverlap(A, B) {
  if (!A || !B) return false;
  for (let i = 0; i < 3; i++) {
    if (A[1][i] < B[0][i] - EPS || B[1][i] < A[0][i] - EPS) return false;
  }
  return true;
}

const copyMesh = ({ points, faces }) => ({
  points: points.map((p) => p.slice()),
  faces: faces.map((f) => f.slice()),
});

// maxFaces is an option rather than a constant because one caller knows more
// than this module does. The rounded offset feeds it a long run of small,
// mostly-disjoint primitives whose intermediate result is bigger than any mesh
// a user would hand us, and it has already checked that the shape is worth it.
// Everyone else gets the default, which is the number that keeps this fast.
function op(kind, meshA, meshB, { maxFaces = MAX_FACES } = {}) {
  const total = (meshA.faces?.length || 0) + (meshB.faces?.length || 0);
  if (total > maxFaces) {
    throw new Error(
      `mesh boolean refused: ${total} triangles is past the ${maxFaces} this handles quickly `
      + "(it goes quadratic above that). Simplify the mesh first, or let the kernel do it.");
  }
  if (!boxesOverlap(bounds(meshA), bounds(meshB))) {
    if (kind === "subtract") return copyMesh(meshA);
    if (kind === "intersect") return { points: [], faces: [] };
    // Disjoint union: two solids that share no space are already the answer.
    // Concatenating keeps both exactly as they were — including their edge
    // pairing, which is the whole point.
    const points = meshA.points.map((p) => p.slice());
    const faces = meshA.faces.map((f) => f.slice());
    const off = points.length;
    for (const p of meshB.points) points.push(p.slice());
    for (const f of meshB.faces) faces.push(f.map((i) => i + off));
    return { points, faces };
  }

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
  return stitchTJunctions(toMesh(allPolygons(merged)));
}

export const meshUnion = (a, b, opts) => op("union", a, b, opts);
export const meshSubtract = (a, b, opts) => op("subtract", a, b, opts);
export const meshIntersect = (a, b, opts) => op("intersect", a, b, opts);

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
