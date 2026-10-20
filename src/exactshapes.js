// Exact shapes for the habits that otherwise make meshes.
//
// hull() of corner cylinders is how half the world writes a rounded box, and
// minkowski() with a sphere is how the other half rounds one. Both are meshes
// here: hull() imports a triangle skin, roundedGrow() offsets a mesh. Each of
// the common forms has an exact twin the B-rep kernel builds faster, keeps on
// the exact lane (so it still fillets, cuts and exports STEP with real curves)
// and that is the SAME shape, not an approximation of it:
//
//   hull of equal upright cylinders    the convex outline of their centres,
//                                      grown by r: a sharp prism with its
//                                      vertical edges filleted at r (the arc
//                                      centres land on the cylinder axes); two
//                                      cylinders are a stadium, one is itself
//   hull of coaxial cylinders / cones  a revolve of the 2D hull of their
//                                      outlines, or one cone when that is all
//                                      it is
//   hull of 8 equal spheres on a box   a box filleted all round at r
//   hull of 2 equal spheres            a capsule: the balls and the bar between
//   minkowski(box, sphere)             the box grown by r, filleted all round
//   minkowski(box, upright cylinder)   the box grown by r in plan and by the
//                                      cylinder's height, vertical edges at r
//   minkowski(cylinder, sphere)        the cylinder grown by r, both rims at r
//   a 2D outline offset with round     the convex outline's rounded prism, as
//   corners, then extruded             for the cylinders above
//
// Every function returns null when it cannot PROVE the shape is one of these,
// and the caller keeps its mesh: an exact solid of the wrong shape would be
// worse than a slow solid of the right one. Measured on the split engine
// (2026-10-19): rounded rectangle prism 0.24 s exact (the mesh hull 0.06 s,
// but a mesh); hexagon 0.05 s; stadium 0.08 s; box filleted all round 0.15 s;
// cylinder with both rims filleted 0.5 s (a fillet of the whole cylinder is
// refused: it picks the seam edge too, so the rims go one at a time).

import { Matrix4, Vector3 } from "three";
import { cube, cylinder, sphere, polygon, linearExtrude, fillet, union, difference, translate, rotate, revolve } from "./dsl.js";

const EPS = 1e-6;
const MIN_EDGE = 0.2;        // a flat this short between two fillets is a sliver the kernel trips on
const ROUND_FN = 96;         // anything above 8 is a true circle on the exact kernel; this is the export facet count

// ------------------------------------------------------------------ 2D

const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// Convex hull, counter-clockwise, collinear points dropped (monotone chain).
export function convexHull2(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const uniq = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > EPS);
  if (uniq.length < 3) return uniq;
  const lower = [], upper = [];
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= EPS) lower.pop();
    lower.push(p);
  }
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= EPS) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

const isConvexCCW = (pts) => {
  if (pts.length < 3) return false;
  for (let i = 0; i < pts.length; i++) {
    if (cross(pts[i], pts[(i + 1) % pts.length], pts[(i + 2) % pts.length]) <= EPS) return false;
  }
  return true;
};

// The outline as a convex counter-clockwise polygon (repeated and collinear
// points dropped), or null when it is not convex: an outline is convex exactly
// when every one of its points lies on the boundary of its own hull.
export function convexOutline(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  const hull = convexHull2(pts);
  if (!isConvexCCW(hull)) return null;
  return pts.every((p) => hull.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6) || onHullEdge(p, hull)) ? hull : null;
}
function onHullEdge(p, hull) {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L > EPS && Math.abs(cross(a, b, p)) / L < 1e-6
      && (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]) >= -EPS
      && (p[0] - b[0]) * (a[0] - b[0]) + (p[1] - b[1]) * (a[1] - b[1]) >= -EPS) return true;
  }
  return false;
}

// Each edge of a convex CCW polygon pushed out by r, neighbours meeting at a
// sharp mitre. null when a corner is so sharp the mitre runs away.
function mitre(hull, r) {
  const n = hull.length, out = [];
  const normal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); return [dy / L, -dx / L]; };
  for (let i = 0; i < n; i++) {
    const p = hull[(i - 1 + n) % n], v = hull[i], q = hull[(i + 1) % n];
    const a = normal(p, v), b = normal(v, q);
    const k = 1 + a[0] * b[0] + a[1] * b[1];
    if (k < 0.05) return null;                       // under ~18 degrees inside
    out.push([v[0] + r * (a[0] + b[0]) / k, v[1] + r * (a[1] + b[1]) / k]);
  }
  return out;
}

// The convex outline of `centres` grown by r in plan, standing from z0 to
// z0 + h. One exact solid however many centres; null when it cannot be one.
export function roundedPrism(centres, r, h, z0 = 0) {
  if (!(r > 0) || !(h > 0) || !centres?.length) return null;
  const hull = convexHull2(centres);
  const lift = (s) => (Math.abs(z0) > EPS ? translate([0, 0, z0], s) : s);
  if (hull.length === 1) return translate([hull[0][0], hull[0][1], z0], cylinder({ r, h, $fn: ROUND_FN }));
  if (hull.length === 2) {
    // a stadium: the band between the two axes and a cylinder on each
    const [a, b] = hull;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < MIN_EDGE) return null;
    const nx = -dy / L * r, ny = dx / L * r;
    const band = linearExtrude({ h }, polygon([[a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] - nx, b[1] - ny], [b[0] + nx, b[1] + ny]]));
    return lift(union(band, ...[a, b].map(([x, y]) => translate([x, y, 0], cylinder({ r, h, $fn: ROUND_FN })))));
  }
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_EDGE) return null;
  }
  const outline = mitre(hull, r);
  if (!outline) return null;
  return lift(fillet({ r, edges: "z" }, linearExtrude({ h }, polygon(outline))));
}

// ------------------------------------------------------------------ 3D leaves

// A child reduced to one primitive and the rigid placement on it, or null.
function leafOf(node) {
  let m = new Matrix4(), n = node;
  while (n?.kind === "xform") { m = m.clone().multiply(n.matrix); n = n.child; }
  if (!n || (n.kind !== "prim" && n.kind !== "prism")) return null;
  const xa = new Vector3(), ya = new Vector3(), za = new Vector3();
  m.extractBasis(xa, ya, za);
  const rigid = [xa, ya, za].every((v) => Math.abs(v.length() - 1) < 1e-6)
    && Math.abs(xa.dot(ya)) < 1e-6 && Math.abs(ya.dot(za)) < 1e-6 && Math.abs(xa.dot(za)) < 1e-6;
  return rigid ? { n, m } : null;
}
const at = (m, x, y, z) => new Vector3(x, y, z).applyMatrix4(m);
const roundRes = (p) => p.resolution == null || p.resolution > 8;   // $fn 3-8 is a polygon prism

// An upright round cylinder or cone: { cx, cy, z0, z1, r0, r1 } (r0 at z0), or null.
function upright({ n, m }) {
  if (n.kind !== "prim" || (n.code !== "P.CY" && n.code !== "P.CO") || !roundRes(n.params)) return null;
  const p = n.params, h = p.height;
  const rb = n.code === "P.CY" ? p.radius : p.radiusBottom, rt = n.code === "P.CY" ? p.radius : p.radiusTop;
  const b = at(m, 0, 0, 0), t = at(m, 0, 0, h);
  if (Math.abs(b.x - t.x) > 1e-6 || Math.abs(b.y - t.y) > 1e-6 || !(Math.abs(t.z - b.z) > EPS)) return null;
  return b.z < t.z ? { cx: b.x, cy: b.y, z0: b.z, z1: t.z, r0: rb, r1: rt }
    : { cx: b.x, cy: b.y, z0: t.z, z1: b.z, r0: rt, r1: rb };
}
const same = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// hull() of equal upright cylinders, all spanning the same heights.
function slabHull(leaves) {
  const cyl = leaves.map(upright);
  if (cyl.some((c) => !c || !same(c.r0, c.r1))) return null;
  const [f] = cyl;
  if (!cyl.every((c) => same(c.r0, f.r0) && same(c.z0, f.z0) && same(c.z1, f.z1))) return null;
  return roundedPrism(cyl.map((c) => [c.cx, c.cy]), f.r0, f.z1 - f.z0, f.z0);
}

// hull() of upright cylinders and cones on one axis: a lathe of the hull of
// their outlines. Only when they share the axis; anything else is not round.
function coaxialHull(leaves) {
  const cyl = leaves.map(upright);
  if (cyl.some((c) => !c)) return null;
  const [f] = cyl;
  if (!cyl.every((c) => same(c.cx, f.cx) && same(c.cy, f.cy))) return null;
  const zmin = Math.min(...cyl.map((c) => c.z0)), zmax = Math.max(...cyl.map((c) => c.z1));
  const pts = [[0, zmin], [0, zmax]];
  for (const c of cyl) pts.push([c.r0, c.z0], [c.r1, c.z1]);
  const prof = convexHull2(pts.filter((p) => p[0] >= 0));
  const place = (s) => translate([f.cx, f.cy, 0], s);
  // one cone or cylinder is the common case (a taper between two discs)
  const outer = prof.filter((p) => p[0] > EPS);
  if (outer.length === 2) {
    const [lo, hi] = outer[0][1] < outer[1][1] ? outer : [outer[1], outer[0]];
    if (same(lo[1], zmin) && same(hi[1], zmax)) {
      const s = same(lo[0], hi[0]) ? cylinder({ r: lo[0], h: zmax - zmin, $fn: ROUND_FN })
        : cylinder({ r1: lo[0], r2: hi[0], h: zmax - zmin, $fn: ROUND_FN });
      return place(translate([0, 0, zmin], s));
    }
  }
  // the hull's profile runs up the axis on its left; revolve() wants that edge
  if (!prof.some((p, i) => p[0] < EPS && prof[(i + 1) % prof.length][0] < EPS)) return null;
  return place(revolve({ angle: 360, $fn: ROUND_FN }, polygon(prof)));
}

// hull() of eight equal spheres on the corners of an upright box.
function sphereBoxHull(leaves) {
  if (leaves.length !== 8 || leaves.some(({ n }) => n.kind !== "prim" || n.code !== "P.S")) return null;
  const r = leaves[0].n.params.radius;
  if (!leaves.every(({ n }) => same(n.params.radius, r))) return null;
  const c = leaves.map(({ m }) => at(m, 0, 0, 0));
  const axis = (k) => [...new Set(c.map((v) => v[k].toFixed(6)))].map(Number).sort((a, b) => a - b);
  const xs = axis("x"), ys = axis("y"), zs = axis("z");
  if (xs.length !== 2 || ys.length !== 2 || zs.length !== 2) return null;
  const seen = new Set(c.map((v) => `${v.x.toFixed(6)},${v.y.toFixed(6)},${v.z.toFixed(6)}`));
  if (seen.size !== 8) return null;
  return filletBox([xs[0] - r, ys[0] - r, zs[0] - r], [xs[1] - xs[0] + 2 * r, ys[1] - ys[0] + 2 * r, zs[1] - zs[0] + 2 * r], r);
}

// hull() of two equal spheres: a capsule (a bar with round ends, the handle
// and the rounded strut). Two balls and the cylinder between them, all of the
// SAME radius: the kernel welds the exactly tangent seams cleanly, while a
// cylinder even 0.001 mm thinner is refused as self-intersecting.
function capsuleHull(leaves) {
  if (leaves.length !== 2 || leaves.some(({ n }) => n.kind !== "prim" || n.code !== "P.S")) return null;
  const r = leaves[0].n.params.radius;
  if (!same(leaves[1].n.params.radius, r) || !(r > 0)) return null;
  const [a, b] = leaves.map(({ m }) => at(m, 0, 0, 0));
  const dir = b.clone().sub(a), L = dir.length();
  if (L < MIN_EDGE) return null;
  dir.divideScalar(L);
  const tilt = Math.acos(Math.max(-1, Math.min(1, dir.z))) * 180 / Math.PI;
  const turn = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
  // +Z leans over towards +X by `tilt`, then swings round Z by `turn`
  const rod = translate([a.x, a.y, a.z], rotate([0, 0, turn], rotate([0, tilt, 0], cylinder({ r, h: L, $fn: ROUND_FN }))));
  return union(translate([a.x, a.y, a.z], sphere({ r, $fn: ROUND_FN })), translate([b.x, b.y, b.z], sphere({ r, $fn: ROUND_FN })), rod);
}

// A box from `lo` sized `size`, every edge filleted at r (null when a face
// would have no flat left between its fillets).
function filletBox(lo, size, r, edges = null) {
  const need = edges === "z" ? [size[0], size[1]] : size;
  if (need.some((s) => s - 2 * r < MIN_EDGE)) return null;
  const b = translate(lo, cube(size));
  return fillet(edges ? { r, edges } : { r }, b);
}

// The exact twin of hull(...kids), or null. See the top of the file.
export function exactHull(kids) {
  if (!Array.isArray(kids) || kids.length < 1) return null;
  const leaves = kids.map(leafOf);
  if (leaves.some((l) => !l)) return null;
  try {
    return slabHull(leaves) ?? coaxialHull(leaves) ?? sphereBoxHull(leaves) ?? capsuleHull(leaves) ?? null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ minkowski

// An upright box: { lo, size } with no rotation, or null.
function uprightBox({ n, m }) {
  if (n.kind !== "prim" || n.code !== "P.CU") return null;
  const xa = new Vector3(), ya = new Vector3(), za = new Vector3();
  m.extractBasis(xa, ya, za);
  if (!(same(xa.x, 1) && same(ya.y, 1) && same(za.z, 1))) return null;
  const lo = at(m, 0, 0, 0);
  return { lo: [lo.x, lo.y, lo.z], size: [n.params.sizeX, n.params.sizeY, n.params.sizeZ] };
}

// The exact twin of minkowski(a, b), or null. Only the forms people write to
// round things: a box or an upright cylinder with a sphere, and a box with an
// upright cylinder. The sum is the same either way round, so both are tried.
export function exactMinkowski(a, b) {
  return minkowskiOrdered(a, b) ?? minkowskiOrdered(b, a);
}
function minkowskiOrdered(part, tool) {
  const P = leafOf(part), T = leafOf(tool);
  if (!P || !T) return null;
  try {
    const ball = T.n.kind === "prim" && T.n.code === "P.S" ? { r: T.n.params.radius, c: at(T.m, 0, 0, 0) } : null;
    const rod = upright(T);
    const box = uprightBox(P);
    if (box && ball) {
      const { lo, size } = box, { r, c } = ball;
      return filletBox([lo[0] + c.x - r, lo[1] + c.y - r, lo[2] + c.z - r], size.map((s) => s + 2 * r), r);
    }
    if (box && rod && same(rod.r0, rod.r1)) {
      const { lo, size } = box, r = rod.r0;
      return filletBox([lo[0] + rod.cx - r, lo[1] + rod.cy - r, lo[2] + rod.z0],
        [size[0] + 2 * r, size[1] + 2 * r, size[2] + rod.z1 - rod.z0], r, "z");
    }
    const can = upright(P);
    if (can && same(can.r0, can.r1) && ball) {
      const { r, c } = ball, R = can.r0 + r, h = can.z1 - can.z0 + 2 * r;
      if (h - 2 * r < MIN_EDGE) return null;
      const body = translate([can.cx + c.x, can.cy + c.y, can.z0 + c.z - r], cylinder({ r: R, h, $fn: ROUND_FN }));
      return fillet({ r, edges: "bottom" }, fillet({ r, edges: "top" }, body));
    }
    if (can && same(can.r0, can.r1) && rod && same(rod.r0, rod.r1)) {
      return translate([can.cx + rod.cx, can.cy + rod.cy, can.z0 + rod.z0],
        cylinder({ r: can.r0 + rod.r0, h: can.z1 - can.z0 + rod.z1 - rod.z0, $fn: ROUND_FN }));
    }
  } catch {
    return null;
  }
  return null;
}

// ------------------------------------------------------------------ rings

// A ring swept from a detached four-sided outline with flat top and bottom
// (a washer, a band, a tapered collar): the outer wall minus the inner, both
// cones. revolve() cannot spin a profile that misses its axis, and this is the
// shape people most often ask that of. null for any other outline.
export function exactRing(pts) {
  if (!Array.isArray(pts) || pts.length !== 4 || pts.some(([x]) => !(x > EPS))) return null;
  const zs = [...new Set(pts.map((p) => p[1].toFixed(6)))].map(Number).sort((a, b) => a - b);
  if (zs.length !== 2) return null;
  const [z0, z1] = zs, h = z1 - z0;
  if (!(h > EPS)) return null;
  const rowAt = (z) => pts.filter((p) => same(p[1], z)).map((p) => p[0]).sort((a, b) => a - b);
  const bot = rowAt(z0), top = rowAt(z1);
  if (bot.length !== 2 || top.length !== 2) return null;
  const [ib, ob] = bot, [it, ot] = top;
  if (!(ob - ib > EPS && ot - it > EPS)) return null;
  const outer = translate([0, 0, z0], same(ob, ot) ? cylinder({ r: ob, h, $fn: ROUND_FN }) : cylinder({ r1: ob, r2: ot, h, $fn: ROUND_FN }));
  // the inner cutter runs 1 mm past both faces along its own slope
  const slope = (it - ib) / h;
  const rLo = Math.max(0.01, ib - slope), rHi = Math.max(0.01, it + slope);
  const inner = translate([0, 0, z0 - 1], same(rLo, rHi) ? cylinder({ r: rLo, h: h + 2, $fn: ROUND_FN })
    : cylinder({ r1: rLo, r2: rHi, h: h + 2, $fn: ROUND_FN }));
  return difference(outer, inner);
}
