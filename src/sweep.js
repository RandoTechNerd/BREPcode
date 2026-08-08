// Sweeping a round profile along a path — one solid, one mesh.
//
// WHY THIS EXISTS
//
// Every model that needed a cable, a bowden tube, a handle or a bent rod was
// getting the same hand-rolled helper written into it by whoever (or whatever)
// wrote the code:
//
//     const loopTube = (…) => union(
//       cylinder(a→b), sphere(b), cylinder(b→c), sphere(c), …
//     );
//
// That is a chain of separate solids. It costs a boolean union per joint, it
// makes the part count explode (a five-bend wire is eleven solids), and it
// still looks wrong: the spheres bulge at the joints and the "bend" is a
// visible kink because a cylinder cannot curve.
//
// A swept tube is one closed mesh. A five-bend wire is ONE solid regardless of
// how many bends it has, the corners are real arcs rather than kinks, and the
// caller writes a list of points instead of a helper function.
//
// HOW THE CORNERS WORK
//
// Two passes, and the order matters:
//
//   1. roundPath() replaces each sharp corner of the polyline with a circular
//      arc. This is the pass that makes it look like a bent wire rather than a
//      mitred pipe, and it is also what keeps pass 2 well-behaved.
//   2. sweepTube() puts a ring of vertices at every point and stitches them.
//
// Pass 2 alone would need a mitre at each corner, and a mitre stretches the
// ring by 1/cos(half the turn) — at a 90° corner that is 1.41x, and at 170° it
// is 11x and self-intersects. After pass 1 no single step turns more than a few
// degrees, so the mitre correction is a rounding error and the tube stays
// circular the whole way along. The correction is still applied (and clamped),
// because a caller can ask for bend:0 and get honest mitres.
//
// TWIST
//
// Rings are carried along the path by PARALLEL TRANSPORT rather than being
// rebuilt from a fixed reference direction. Rebuilding from, say, world Z makes
// the seam spin wildly wherever the path passes near vertical, which shows up
// as a twisted tube. Transport rotates the previous ring by exactly the
// rotation that takes the previous tangent onto this one, which is the smallest
// change that keeps it perpendicular — so the tube does not twist.
//
// A closed loop does not close up on its own: transport around a loop comes
// back rotated by a holonomy angle that depends on the path. That is measured
// at the end and unwound evenly across the rings, so the seam meets itself.

const EPS = 1e-9;

// How many facets around a tube of radius r.
//
// A fixed count is the wrong default in both directions: 16 sides on a 1.5mm
// cable is eight times the triangles anyone can see, and 16 sides on a 25mm
// handle is a visible polygon. Worse, the kernel's import cost is SUPERLINEAR
// in triangles — measured in the browser at ~0.15s for 768 and ~17s for 11k —
// so over-tessellating a cable is not a rounding error, it is the difference
// between a build you wait for and a build you cancel.
//
// So pick from the chord error instead: how far the flat side sags away from
// the true circle. 0.15mm is well under a 0.4mm nozzle, so it cannot show in a
// print and does not show on screen either. That gives 8 sides at r=1.5, 10 at
// r=3, 18 at r=10, and stops at 24.
export function autoSides(r, tol = 0.15) {
  if (!(r > 0)) return 8;
  if (tol >= r) return 6;
  const n = Math.PI / Math.acos(1 - tol / r);
  return Math.max(6, Math.min(24, Math.round(n / 2) * 2));   // even, so it is symmetric
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
function norm(a) {
  const L = len(a);
  return L < EPS ? null : [a[0] / L, a[1] / L, a[2] / L];
}

// Accept anything that reasonably means "a list of points": [[x,y,z]…],
// [[x,y]…] (z=0, so a 2D drawing sweeps flat), or a flat [x,y,z,x,y,z…].
// Consecutive duplicates are dropped — they carry no direction and would put a
// zero-length segment in the middle of the frame chain.
export function cleanPath(raw, { closed = false } = {}) {
  if (!Array.isArray(raw) || !raw.length) return [];
  let pts;
  if (typeof raw[0] === "number") {
    if (raw.length % 3 !== 0) {
      throw new Error("tube(): a flat point list needs a multiple of 3 numbers (x, y, z)");
    }
    pts = [];
    for (let i = 0; i < raw.length; i += 3) pts.push([+raw[i], +raw[i + 1], +raw[i + 2]]);
  } else {
    pts = raw.map((p, i) => {
      if (!Array.isArray(p) || p.length < 2) {
        throw new Error(`tube(): point ${i} is not [x, y] or [x, y, z]`);
      }
      const v = [+p[0], +p[1], +(p[2] ?? 0)];
      if (!v.every(Number.isFinite)) throw new Error(`tube(): point ${i} has a value that is not a number`);
      return v;
    });
  }
  const out = [];
  for (const p of pts) {
    if (!out.length || len(sub(p, out[out.length - 1])) > 1e-7) out.push(p);
  }
  // A closed path that also repeats its first point would sweep a zero-length
  // final segment; the wrap-around handles the join.
  if (closed && out.length > 2 && len(sub(out[0], out[out.length - 1])) <= 1e-7) out.pop();
  return out;
}

// Replace each corner with a circular arc of the given radius.
//
// The requested radius is a wish, not a promise: two short segments meeting at a
// sharp angle cannot both give up the tangent length a big radius needs. Rather
// than refuse, each corner takes as much as the shorter of its two neighbours
// can spare (a bit under half, so adjacent corners never eat the same segment)
// and the radius is recomputed from what it actually got.
export function roundPath(pts, radius, segments = 6, {
  closed = false, smoothLimit = 15, minStep = 0,
} = {}) {
  if (!(radius > 0) || pts.length < 3) return pts.slice();
  // A path that is ALREADY a smooth curve — a helix, a sampled circle, a spline
  // somebody exported at 64 points — turns only a few degrees per point. Those
  // are not corners and must not be "rounded", or every one of them grows six
  // more points and the mesh comes out seven times heavier for no visible
  // difference. Measured: a 3-turn helix went 14,140 facets -> 2,072 with this
  // check, and the two render identically.
  const smoothRad = Math.max(0, smoothLimit) * Math.PI / 180;
  const segs = Math.max(1, Math.round(segments));
  const n = pts.length;
  const out = [];
  const first = closed ? 0 : 1;
  const last = closed ? n - 1 : n - 2;

  if (!closed) out.push(pts[0]);

  for (let i = first; i <= last; i++) {
    const cur = pts[i];
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const d1 = norm(sub(prev, cur));
    const d2 = norm(sub(next, cur));
    if (!d1 || !d2) { out.push(cur); continue; }

    const cosT = Math.max(-1, Math.min(1, dot(d1, d2)));
    const theta = Math.acos(cosT);                     // the angle AT the corner
    // Already smooth (or straight), or doubling back on itself: nothing to
    // round either way.
    if (theta > Math.PI - smoothRad || theta < 1e-4) { out.push(cur); continue; }

    const half = theta / 2;
    let t = radius / Math.tan(half);                   // tangent distance from the corner
    const room = 0.499 * Math.min(len(sub(prev, cur)), len(sub(next, cur)));
    if (t > room) t = room;
    const rEff = t * Math.tan(half);
    if (!(rEff > 1e-6)) { out.push(cur); continue; }

    const p1 = add(cur, mul(d1, t));
    const p2 = add(cur, mul(d2, t));
    const bis = norm(add(d1, d2));
    if (!bis) { out.push(cur); continue; }
    const centre = add(cur, mul(bis, rEff / Math.sin(half)));

    // Rotate (p1 - centre) onto (p2 - centre) about the corner's own plane.
    const v1 = sub(p1, centre);
    const axis = norm(cross(v1, sub(p2, centre)));
    const sweepAng = Math.PI - theta;                  // how far the direction turns
    if (!axis) { out.push(cur); continue; }

    // How finely to cut the arc, measured on the INSIDE of the bend.
    //
    // The outside of a bend travels further than the inside, and it is the
    // inside that goes wrong: at a bend radius of R the inner wall of the tube
    // sits at R - r, so a tight bend on a thin tube puts consecutive rings a
    // fraction of a millimetre apart there. Below the kernel's welding
    // distance those vertices merge, the quads between them collapse to
    // slivers, and the import spends its time repairing them.
    //
    // Measured on a 0.8mm filament strand with three corners: 23.2 s with the
    // arc cut into six, 7.1 s with no arc at all. Same triangle count either
    // way — the cost was entirely in degenerate geometry, not in mesh size.
    let steps = segs;
    if (minStep > 0) {
      const innerArc = Math.max(0, rEff - minStep) * sweepAng;
      steps = Math.max(1, Math.min(segs, Math.floor(innerArc / minStep)));
    }
    for (let k = 0; k <= steps; k++) {
      out.push(add(centre, rotateAbout(v1, axis, (k / steps) * sweepAng)));
    }
  }

  if (!closed) out.push(pts[n - 1]);

  // The arcs can land points on top of each other when a corner was clamped to
  // nearly nothing; clean once more so the frame chain never sees a zero step.
  return cleanPath(out, { closed });
}

// Rodrigues. Used for the corner arcs and for unwinding the closed-loop seam.
function rotateAbout(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(
    add(mul(v, c), mul(cross(axis, v), s)),
    mul(axis, dot(axis, v) * (1 - c)),
  );
}

// A frame per point: the ring plane's normal, and two axes in that plane.
//
// `m` is the ring's normal — the average of the incoming and outgoing tangents,
// so the ring straddles the corner instead of sitting square to one side of it.
// `stretch` is how much the ring has to grow along `bend` for the mitre to meet
// cleanly; it is 0 on a straight run.
export function pathFrames(pts, { closed = false, maxStretch = 2 } = {}) {
  const n = pts.length;
  if (n < 2) return [];

  // Tangent of each SEGMENT first, then the per-point ring normals from those.
  const segT = [];
  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const t = norm(sub(pts[(i + 1) % n], pts[i]));
    segT.push(t || (segT.length ? segT[segT.length - 1] : [0, 0, 1]));
  }

  const frames = [];
  let u = null;
  for (let i = 0; i < n; i++) {
    const tIn = closed ? segT[(i - 1 + n) % n] : segT[Math.max(0, i - 1)];
    const tOut = closed ? segT[i % segCount] : segT[Math.min(segCount - 1, i)];
    const m = norm(add(tIn, tOut)) || tOut;

    if (u === null) {
      // Any perpendicular will do for the first ring; picking the axis the
      // tangent leans on least keeps it numerically sane.
      const ref = Math.abs(m[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      u = norm(cross(ref, m)) || [1, 0, 0];
    } else {
      // Carry the previous ring forward: rotate it by the rotation taking the
      // previous ring normal onto this one. This is the whole no-twist trick.
      const prev = frames[i - 1].m;
      const axis = cross(prev, m);
      const s = len(axis);
      if (s > 1e-9) {
        const ang = Math.atan2(s, Math.max(-1, Math.min(1, dot(prev, m))));
        u = rotateAbout(u, mul(axis, 1 / s), ang);
      }
      // Re-orthogonalise: a few hundred rotations of drift would show.
      u = norm(sub(u, mul(m, dot(u, m)))) || u;
    }
    const v = cross(m, u);

    // Mitre: the ring is a circle stretched along the bend direction by
    // 1/cos(phi). Clamped, because a caller who turned bend off and then asked
    // for a hairpin should get a visible pinch rather than a mesh that folds
    // through itself.
    const cosPhi = Math.max(-1, Math.min(1, dot(tIn, m)));
    let stretch = cosPhi > 1e-6 ? 1 / cosPhi - 1 : maxStretch - 1;
    if (stretch > maxStretch - 1) stretch = maxStretch - 1;
    let bend = norm(sub(tIn, mul(m, cosPhi)));
    if (!bend || stretch < 1e-9) { bend = u; stretch = 0; }

    frames.push({ p: pts[i], m, u, v, bend, stretch });
  }

  // A loop's transported frame comes back rotated. Measure that and unwind it
  // evenly, so the last ring lines up with the first instead of leaving a
  // sheared seam.
  if (closed && n > 2) {
    const f0 = frames[0], fl = frames[n - 1];
    const drift = Math.atan2(dot(cross(fl.u, f0.u), f0.m), dot(fl.u, f0.u));
    if (Math.abs(drift) > 1e-9) {
      for (let i = 0; i < n; i++) {
        const f = frames[i];
        f.u = rotateAbout(f.u, f.m, (drift * i) / (n - 1));
        f.v = cross(f.m, f.u);
      }
    }
  }
  return frames;
}

// The mesh itself. `points`/`faces` to match the rest of the mesh side.
//
// `r` may be a single number or one number per ORIGINAL path point; a list is
// resampled across the rounded path so a taper survives corner rounding.
export function sweepTube(rawPath, {
  r = 1,
  sides = "auto",
  caps = "round",
  closed = false,
  bend = null,
  bendSegments = 6,
  maxStretch = 2,
} = {}) {
  const base = cleanPath(rawPath, { closed });
  if (base.length < 2) {
    throw new Error("tube(): needs at least two different points to sweep along");
  }
  const radii = Array.isArray(r) ? r.map(Number) : null;
  const seg = (sides === "auto" || sides == null)
    ? autoSides(radii ? Math.max(...radii) : +r)
    : Math.max(3, Math.round(sides));

  // Default the corner radius to THREE times the tube radius.
  //
  // 1.5x was the first guess, on the reasoning that a wire bends about as
  // tightly as it is thick. Geometrically that is legal — the arc's inner wall
  // still has radius 0.5r, so the tube never passes through itself — but it is
  // a hair's breadth from a pinch, and on a thin tube 0.5r is a fraction of a
  // millimetre. That is where the kernel starts merging vertices and repairing
  // slivers. At 3x the inner wall is 2r and the problem disappears.
  const rMax = radii ? Math.max(...radii) : +r;
  if (!(rMax > 0)) throw new Error("tube(): r must be a positive number");
  const bendR = bend === null ? rMax * 3 : +bend;

  // Rounding moves points around, so a per-point radius is carried by
  // parameter: sample the original radius list along the arc length of the
  // original path, then read it back at the rounded path's arc length.
  // minStep keeps the arc from being cut finer than the tube can carry — see
  // the note in roundPath about what happens on the inside of a tight bend.
  const path = bendR > 0
    ? roundPath(base, bendR, bendSegments, { closed, minStep: Math.max(0.25, rMax * 0.6) })
    : base;
  const sampler = makeRadiusSampler(base, radii, closed);
  const radiusAt = sampler || (() => +r);

  const frames = pathFrames(path, { closed, maxStretch });
  const n = frames.length;
  if (n < 2) throw new Error("tube(): the path collapsed to a single point");

  const points = [];
  const faces = [];
  const rings = [];                 // ordered along the path; each is a base index
  const round = caps === "round" && !closed;
  const capRings = round ? Math.max(1, Math.round(seg / 4)) : 0;
  let startPole = -1, endPole = -1;

  const ringAt = (f, radius, push = 0) => {
    const base0 = points.length;
    for (let j = 0; j < seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      let d = add(mul(f.u, Math.cos(th)), mul(f.v, Math.sin(th)));
      if (f.stretch > 0) d = add(d, mul(f.bend, f.stretch * dot(d, f.bend)));
      points.push(add(add(f.p, mul(d, radius)), mul(f.m, push)));
    }
    return base0;
  };

  const arc = cumulative(path, closed);
  const total = arc[arc.length - 1] || 1;

  // --- start cap (built pole-first so every ring below runs along +m) ---
  if (round) {
    const f = frames[0];
    const r0 = radiusAt(0);
    startPole = points.push(add(f.p, mul(f.m, -r0))) - 1;
    for (let k = capRings - 1; k >= 1; k--) {
      const alpha = (k / capRings) * (Math.PI / 2);
      rings.push(ringAt({ ...f, stretch: 0 }, r0 * Math.cos(alpha), -r0 * Math.sin(alpha)));
    }
  }

  // --- the tube ---
  for (let i = 0; i < n; i++) rings.push(ringAt(frames[i], radiusAt(arc[i] / total)));

  // --- end cap ---
  if (round) {
    const f = frames[n - 1];
    const r1 = radiusAt(1);
    for (let k = 1; k < capRings; k++) {
      const alpha = (k / capRings) * (Math.PI / 2);
      rings.push(ringAt({ ...f, stretch: 0 }, r1 * Math.cos(alpha), r1 * Math.sin(alpha)));
    }
    endPole = points.push(add(f.p, mul(f.m, r1))) - 1;
  }

  // Stitch every neighbouring pair of rings. Winding is chosen so the normal
  // comes out radially OUTWARD: with u x v = m, (B-A) x (D-A) ~ v x m = u.
  const stitch = (a, b) => {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      faces.push([a + j, a + j2, b + j2], [a + j, b + j2, b + j]);
    }
  };
  for (let i = 0; i + 1 < rings.length; i++) stitch(rings[i], rings[i + 1]);
  if (closed) stitch(rings[rings.length - 1], rings[0]);

  if (round) {
    const first = rings[0], last = rings[rings.length - 1];
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      faces.push([startPole, first + j2, first + j]);
      faces.push([endPole, last + j, last + j2]);
    }
  } else if (!closed) {
    // Flat ends: one centre vertex each, fanned. Same winding logic as above,
    // reversed at the start because that face looks back down the path.
    const f0 = frames[0], f1 = frames[n - 1];
    const c0 = points.push(f0.p.slice()) - 1;
    const c1 = points.push(f1.p.slice()) - 1;
    const first = rings[0], last = rings[rings.length - 1];
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      faces.push([c0, first + j2, first + j]);
      faces.push([c1, last + j, last + j2]);
    }
  }

  return { points, faces };
}

function cumulative(pts, closed) {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + len(sub(pts[i], pts[i - 1])));
  if (closed && pts.length > 1) out.push(out[out.length - 1] + len(sub(pts[0], pts[pts.length - 1])));
  return out;
}

// Turn a per-point radius list into a function of normalised arc length along
// the ORIGINAL path, so a taper still lines up after the corners are rounded
// (rounding inserts points, so indexing by point number would slide the taper).
function makeRadiusSampler(base, radii, closed) {
  if (!radii) return null;
  if (radii.some((x) => !(x > 0))) {
    throw new Error("tube(): every radius in the list must be a positive number");
  }
  if (radii.length !== base.length) {
    throw new Error(
      `tube(): r has ${radii.length} radii but the path has ${base.length} points — ` +
      "give one radius, or one per point",
    );
  }
  const arc = cumulative(base, closed);
  const total = arc[base.length - 1] || 1;
  const at = base.map((_, i) => arc[i] / total);
  return (t) => {
    if (t <= at[0]) return radii[0];
    if (t >= at[at.length - 1]) return radii[radii.length - 1];
    let i = 1;
    while (i < at.length - 1 && at[i] < t) i++;
    const span = at[i] - at[i - 1] || 1;
    const f = (t - at[i - 1]) / span;
    return radii[i - 1] + (radii[i] - radii[i - 1]) * f;
  };
}

export { rotateAbout };
