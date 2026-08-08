// Building the rounded offset that roundify.js plans.
//
// The plan is a list of prisms, cylinders and spheres whose union is the shape
// grown by r. Somebody has to actually union them, and the obvious somebody —
// the kernel — turned out to be the wrong one. Four kernel-side assemblies were
// tried and all four failed: twelve sketch-and-extrudes timed out past ten
// minutes, one STL holding every prism came back NotManifold, and handing the
// kernel thirty-two separate imports to union timed out with no output at all.
//
// So the union happens here, on the mesh, and the kernel receives ONE finished
// solid. Two things make that affordable:
//
//   The tree. Unioning into a running accumulator is the worst possible order —
//   after the first step the accumulator touches everything, so every later
//   step pays full BSP cost against a mesh that only grows. Unioning as a
//   balanced tree means the bottom level is almost entirely disjoint pairs, and
//   two solids that share no space are concatenated rather than intersected.
//
//   The cap. meshbool refuses past 12,000 triangles because that is where it
//   goes quadratic on a user's imported mesh. This caller is different: it
//   feeds a long run of small primitives and has already checked, via
//   roundifyPlan's own primitive limit, that the shape is worth it.
//
// WHAT NOT TO TRY: re-triangulating the flat regions to shrink the result.
//
// It is tempting, and the numbers look compelling — 97% of the output triangles
// sit on planar regions of eight or more, and one flat on a rounded cylinder is
// 2,230 triangles where a dozen would draw the same surface. It was built and
// measured. Keeping each region's outline exactly and ear-clipping it cut the
// mesh by about a quarter, made no measurable difference to the kernel's import
// time (a rounded cube: 13,694 facets in 1,644ms before, 10,852 in 1,556ms
// after), and turned a cylinder the kernel had accepted into one it rejected as
// "Not manifold".
//
// The reason is in the shape of the regions rather than in the triangulation:
// every one of the largest regions has a boundary that PINCHES — a vertex with
// two outgoing boundary edges, so the outline is not one simple loop. Those need
// real polygon-with-holes triangulation, and the regions that do reduce cleanly
// are the small ones that were never the problem. A correct mesh that imports in
// a minute beats a smaller one the kernel will not take.
//
// The result is not exact, and is not meant to be. Cylinders and spheres are
// polygons here, so a rounded cube comes out a few tenths of a percent UNDER
// the true Minkowski volume — the inscribed-polygon direction, which is the
// safe one for a part that has to fit something. Raise `segments` to trade time
// and triangles for a closer answer.

import { meshUnion, meshSubtract } from "./meshbool.js";
import { roundifyPlan } from "./roundify.js";
import { inspectMesh } from "./meshhealth.js";
import { repairMesh } from "./meshrepair.js";

// Merge vertices that are within tol of each other, and drop any triangle that
// collapses to a line as a result.
//
// meshhealth's weldTriangles rounds each coordinate to a fixed number of places
// and uses the result as a key. That merges exact duplicates, which is all it
// was written for, but it cannot merge two points that are a nanometre apart
// and happen to straddle a rounding boundary: 1.00005 and 1.000049999 round to
// different keys and stay two vertices forever.
//
// The kernel does not work that way. It merges by DISTANCE, so it joins that
// pair — and joining them turns two separately-paired edges into one edge with
// four faces on it. That is the entire story behind a mesh this module called
// watertight, at every precision from 3 to 12 decimal places, that the kernel
// answered with "Not manifold". Snapping to a neighbour within a tolerance,
// rather than to a bucket, is what makes our verdict and the kernel's agree.
export function snapWeld({ points, faces }, tol) {
  const grid = new Map();
  const out = [];
  const map = new Int32Array(points.length);
  const cell = (v) => Math.floor(v / tol);

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ci = cell(p[0]), cj = cell(p[1]), ck = cell(p[2]);
    let found = -1;
    // A point near a cell boundary has its nearest neighbour in the cell next
    // door, so all 27 have to be looked at. Checking only its own cell is the
    // same bug in a different costume.
    for (let a = -1; a <= 1 && found < 0; a++) {
      for (let b = -1; b <= 1 && found < 0; b++) {
        for (let c = -1; c <= 1 && found < 0; c++) {
          for (const j of grid.get(`${ci + a}_${cj + b}_${ck + c}`) || []) {
            const q = out[j];
            if (Math.abs(q[0] - p[0]) <= tol
              && Math.abs(q[1] - p[1]) <= tol
              && Math.abs(q[2] - p[2]) <= tol) { found = j; break; }
          }
        }
      }
    }
    if (found < 0) {
      found = out.push(p.slice()) - 1;
      const k = `${ci}_${cj}_${ck}`;
      const bucket = grid.get(k);
      if (bucket) bucket.push(found); else grid.set(k, [found]);
    }
    map[i] = found;
  }

  const kept = [];
  for (const [a, b, c] of faces) {
    const x = map[a], y = map[b], z = map[c];
    if (x === y || y === z || x === z) continue;     // collapsed: no surface left
    kept.push([x, y, z]);
  }
  return { points: out, faces: kept };
}

// How close is "the same point". Scaled to the model, because float32 — which
// is what an STL round-trip costs — spaces its values about 1.2e-7 apart per
// unit of magnitude, so a fixed tolerance that suits a 20mm part is below the
// noise floor of a 500mm one.
function weldTolerance({ points }) {
  let span = 0;
  for (let i = 0; i < 3; i++) {
    let lo = Infinity, hi = -Infinity;
    for (const p of points) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; }
    span = Math.max(span, hi - lo);
  }
  return Math.max(1e-7, span * 1e-6);
}

// Well past what any plan produces, because the intermediate result of a CSG
// union is much larger than either input and shrinks again at the top of the
// tree. A rounded 20mm cube peaks near 25,000 and settles at 14,000.
export const BUILD_MAX_FACES = 400000;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-12 ? null : [a[0] / l, a[1] / l, a[2] / l];
};

// A whole face swept along a direction by h. This is the flat part of the
// offset, and it stays perfectly flat — the faceting error lives entirely in
// the tubes and balls.
//
// The slab arrives already triangulated with its boundary edges marked, so this
// never triangulates anything: the two caps are the face's own triangles (one
// copy offset by h), and each boundary edge becomes two wall triangles. A face
// with a hole through it has two boundary loops and needs no special case,
// because nothing here ever assembles a loop — every boundary edge is handled
// on its own.
export function prismMesh(slab, dir, h) {
  const { points: base, tris, boundary, normal } = slab;
  const s = [dir[0] * h, dir[1] * h, dir[2] * h];
  const n = base.length;
  const points = base.map((p) => p.slice());
  for (const p of base) points.push([p[0] + s[0], p[1] + s[1], p[2] + s[2]]);

  const faces = [];
  for (const [a, b, c] of tris) {
    faces.push([a, c, b]);                            // the cap left behind, facing back
    faces.push([a + n, b + n, c + n]);                // the swept cap, facing forward
  }
  // For a face wound counter-clockwise about its normal, the wall on boundary
  // edge u->v has outward normal (v-u) x normal, and this pair of triangles is
  // wound to match.
  for (const [u, v] of boundary) faces.push([u, v, v + n], [u, v + n, u + n]);

  // Sweeping AGAINST the face's own normal — which shrinking does, to put the
  // slab under the surface instead of on it — mirrors the solid, so every face
  // above comes out inside-out. A BSP reads an inside-out solid as all of space
  // minus the shape, and subtracting THAT removes nothing at all: the first
  // shrink attempt left a 20mm cube still 20mm across.
  if (s[0] * normal[0] + s[1] * normal[1] + s[2] * normal[2] < 0) {
    for (const f of faces) { const t = f[1]; f[1] = f[2]; f[2] = t; }
  }
  return { points, faces };
}

// A capped cylinder from p to q. Built from an arbitrary perpendicular rather
// than a rotation matrix so there is no gimbal case to get wrong; the seam
// lands wherever it lands, which nothing downstream cares about.
export function tubeMesh(p, q, r, segments = 16) {
  const axis = sub(q, p);
  const L = Math.hypot(axis[0], axis[1], axis[2]);
  const w = norm(axis);
  if (!w || L < 1e-9) return null;                  // a zero-length edge has no tube
  const ref = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(ref, w));
  const v = cross(w, u);
  const points = [], faces = [];
  for (let j = 0; j < segments; j++) {
    const th = (j / segments) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const rad = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
    points.push([p[0] + rad[0] * r, p[1] + rad[1] * r, p[2] + rad[2] * r]);
    points.push([
      p[0] + rad[0] * r + w[0] * L,
      p[1] + rad[1] * r + w[1] * L,
      p[2] + rad[2] * r + w[2] * L,
    ]);
  }
  const bot = points.push(p.slice()) - 1;
  const top = points.push([p[0] + w[0] * L, p[1] + w[1] * L, p[2] + w[2] * L]) - 1;
  for (let j = 0; j < segments; j++) {
    const a = j * 2, b = j * 2 + 1;
    const c = ((j + 1) % segments) * 2, d = ((j + 1) % segments) * 2 + 1;
    faces.push([a, c, b], [b, c, d], [bot, c, a], [top, b, d]);
  }
  return { points, faces };
}

// A UV sphere, with the poles as single vertices capped by triangle fans.
//
// The obvious way to write this is a full lattice from phi=0 to phi=pi, which
// puts `segments` copies of the north pole at the same point under different
// indices. It looks right and renders right, and it is not a closed mesh: each
// pole leaves `segments` unpaired edges, so every ball carried 32 open edges
// into the union. The cube got away with it because the union happened to weld
// them; the cylinder, with four times as many balls, did not.
export function sphereMesh(at, r, segments = 16, rings = 8) {
  const bands = Math.max(2, rings);                 // at least a top and a bottom
  const points = [[at[0], at[1], at[2] + r]];       // north pole is index 0
  for (let i = 1; i < bands; i++) {
    const phi = (i / bands) * Math.PI;
    const sp = Math.sin(phi) * r, cp = Math.cos(phi) * r;
    for (let j = 0; j < segments; j++) {
      const th = (j / segments) * Math.PI * 2;
      points.push([at[0] + sp * Math.cos(th), at[1] + sp * Math.sin(th), at[2] + cp]);
    }
  }
  const south = points.push([at[0], at[1], at[2] - r]) - 1;
  const ring = (i, j) => 1 + (i - 1) * segments + (j % segments);

  const faces = [];
  for (let j = 0; j < segments; j++) faces.push([0, ring(1, j), ring(1, j + 1)]);
  for (let i = 1; i < bands - 1; i++) for (let j = 0; j < segments; j++) {
    faces.push([ring(i, j), ring(i + 1, j), ring(i + 1, j + 1)]);
    faces.push([ring(i, j), ring(i + 1, j + 1), ring(i, j + 1)]);
  }
  for (let j = 0; j < segments; j++) faces.push([south, ring(bands - 1, j + 1), ring(bands - 1, j)]);
  return { points, faces };
}

// Turn a plan into the meshes it describes.
//
// The slabs are the one piece that knows which direction it is going. Growing
// sweeps each triangle OUTWARD, so the prisms sit on the surface and add to it.
// Shrinking sweeps INWARD, so the prisms sit just under the surface and the
// subtraction takes an r-thick layer off — outward prisms would be entirely
// outside the solid and subtracting them would do precisely nothing.
//
// The tubes and balls need no such switch: they are centred on the edges and
// corners, so they already straddle the surface and are correct either way.
export function planMeshes(plan, { segments = 16, rings = 8 } = {}) {
  const out = [];
  const sign = plan.grow ? 1 : -1;
  for (const s of plan.slabs) {
    out.push(prismMesh(s, s.normal.map((v) => v * sign), s.height));
  }
  for (const t of plan.tubes) {
    const tube = tubeMesh(t.from, t.to, t.radius, segments);
    if (tube) out.push(tube);
  }
  for (const b of plan.balls) out.push(sphereMesh(b.at, b.radius, segments, rings));
  return out;
}

// Union a list as a balanced tree. See the header for why the order matters:
// on a rounded cube this is the difference between finishing in under a second
// and hitting the face cap a third of the way through.
export function treeUnion(list, { maxFaces = BUILD_MAX_FACES, onLevel = null } = {}) {
  if (!list.length) return { points: [], faces: [] };
  let level = list;
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length
        ? meshUnion(level[i], level[i + 1], { maxFaces })
        : level[i]);
    }
    if (onLevel) onLevel(next.length, next.reduce((n, m) => n + m.faces.length, 0));
    level = next;
  }
  return level[0];
}

// The whole thing: a mesh in, the offset mesh out.
//
// Growing is the solid unioned with the shell around its boundary. Shrinking is
// the same shell subtracted from the same solid — one plan, both directions,
// which is why roundifyPlan does not care about the sign beyond recording it.
// How round to make the tubes and balls, given how many of them there are.
//
// Finer is better right up until it isn't. On a 20mm cube grown by 3, against
// the exact rounded-box volume:
//
//     segments   6      8     12     16     20     24      32
//     error  -1.97% -1.15% -0.52% -0.30% -0.19% -0.13%  -13.67%
//     clean    yes    yes    yes    yes    yes  repaired  BROKEN
//
// The error falls the way it should until the facets get thin enough that the
// BSP's plane tests stop agreeing with themselves, and then it collapses: 32
// segments loses an eighth of the solid and does not even close. So 16 is a
// hard ceiling. It also has to come down as the primitive count goes up, since
// every extra facet multiplies against every other piece — a cylinder at 12
// segments takes 14 seconds where 8 takes 3.
function autoTessellation(total) {
  if (total <= 40) return { segments: 12, rings: 6 };   // a blocky part: 0.2s, -0.5%
  if (total <= 80) return { segments: 10, rings: 5 };
  return { segments: 8, rings: 4 };                     // a faceted cylinder: 3s, -0.7%
}

export function buildRoundedOffset(mesh, r, {
  segments = "auto",
  rings = "auto",
  analysis = null,
  maxPrimitives,
  maxFaces = BUILD_MAX_FACES,
} = {}) {
  const started = Date.now();

  // Check the INPUT is a solid before offsetting it. Offsetting happily accepts
  // a shape with holes in it and produces a shape with holes in it, and the
  // complaint then lands on the result — which is where this was first looked
  // for, at some length, while the real fault was a caller handing over eight
  // triangles that never formed a cube.
  const before = inspectMesh(mesh);
  if (!before.watertight) {
    const bits = [];
    if (before.openEdges) bits.push(`${before.openEdges} open edge${before.openEdges === 1 ? "" : "s"}`);
    if (before.overusedEdges) bits.push(`${before.overusedEdges} edge${before.overusedEdges === 1 ? "" : "s"} shared by more than two faces`);
    if (before.windingClashes) bits.push(`${before.windingClashes} face${before.windingClashes === 1 ? "" : "s"} wound against its neighbour`);
    throw new Error(
      `offset needs a closed solid, and this shape is not a closed solid: ${bits.join(", ") || "it does not enclose a volume"}. `
      + "Run the mesh repair on it first.");
  }

  const plan = roundifyPlan(mesh, r, { analysis, maxPrimitives });

  const auto = autoTessellation(plan.total);
  const wantSeg = segments === "auto" ? auto.segments : Math.round(segments);
  const wantRng = rings === "auto" ? auto.rings : Math.round(rings);
  const seg = Math.max(3, Math.min(16, wantSeg));
  const rng = Math.max(2, Math.min(8, wantRng));
  const clamped = seg !== wantSeg || rng !== wantRng;

  const parts = planMeshes(plan, { segments: seg, rings: rng });

  let out;
  if (plan.grow) {
    out = treeUnion([mesh, ...parts], { maxFaces });
  } else {
    // Union the shell on its own first. Subtracting the parts one at a time
    // instead would work, but each subtraction re-splits the whole solid, and
    // the tree gets the shell built for a fraction of that.
    const shell = treeUnion(parts, { maxFaces });
    out = meshSubtract(mesh, shell, { maxFaces });
  }

  // Weld by POSITION before judging it, because that is the test the kernel
  // applies. A CSG union leaves duplicate vertices — the same point reached
  // twice by different splits, stored under two indices — and by index alone
  // such a mesh looks perfect: every edge used exactly twice, chi 2, nothing
  // open. Write it to an STL and the kernel rebuilds the indices from the
  // coordinates, those duplicates merge, and edges that were paired separately
  // become one edge shared by four faces. That is what "Not manifold" meant the
  // first time this reached the kernel, on a mesh this module was calling
  // watertight. Weld first and the health report describes the same mesh the
  // kernel will.
  out = snapWeld(out, weldTolerance(out));

  // The union usually lands watertight on its own. When it does not — a sliver
  // in the input, or two primitives meeting exactly on a plane — repair rather
  // than hand the kernel something it will reject, and say so in the report.
  let health = inspectMesh(out);
  let repaired = false;
  if (!health.watertight) {
    const fixed = repairMesh(out);
    out = { points: fixed.points, faces: fixed.faces };
    health = inspectMesh(out);
    repaired = true;
  }

  return {
    mesh: out, plan, health, repaired, clamped,
    segments: seg, rings: rng, ms: Date.now() - started,
  };
}
