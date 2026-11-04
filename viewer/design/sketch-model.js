// design/sketch-model.js — the sketcher's data, with no DOM.
//
// A sketch is what src/dsl.js sketch() reads: points, curves, constraints and
// dims, on a plane. This module edits one (the drawing tools, trim, offset,
// construction, constraints and dims), solves it with the kernel's own
// ConstraintSolver through dsl.solveSketch2D, reads one back out of the code
// (a sketch({ … }) call, names and all) and writes it as code. The sketcher
// (sketcher.js) only turns pointer events into these calls and draws.
//
//   sk = { on, points: [[x, y]], curves: [{ kind, ids, r?, construction }],
//          constraints: [{ type, ids }], dims: [{ type, ids, value, name? }] }
//
// A dim with a `name` is written as that name (a const param, so a slider);
// its value is the param's.

import { Parser } from "../../vendor/acorn/acorn.mjs";
import { readParams, evalFormula } from "./parameters.js";
export { evalFormula, paramScope, readParams } from "./parameters.js";
import { solveSketch2D, sketchError, sketch as dslSketch, planeFrame } from "../../src/dsl.js";

export const TOOLS = ["line", "rect", "circle", "arc", "spline", "trim", "offset", "construction",
  "centerRect", "arc3", "tangentArc", "slot", "polygon", "fillet", "mirror", "pattern"];
export const CONSTRAINTS = ["coincident", "horizontal", "vertical", "parallel", "perpendicular", "tangent", "equal", "fixed",
  "midpoint", "collinear", "concentric", "symmetric"];

export const emptySketch = (on = "XY") => ({ on, points: [], curves: [], constraints: [], dims: [] });
const r6 = (v) => { const r = Math.round(v * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return Object.is(r, -0) ? 0 : r; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ------------------------------------------------------------- the points
// the index of a point within tol of xy, or a new point there
export function pointAt(sk, xy, tol = 1e-6) {
  let best = -1, bd = tol;
  sk.points.forEach((p, i) => { const d = dist(p, xy); if (d <= bd) { bd = d; best = i; } });
  if (best >= 0) return best;
  sk.points.push([r6(xy[0]), r6(xy[1])]);
  return sk.points.length - 1;
}
export function nearestPoint(sk, xy, tol) {
  let best = -1, bd = tol;
  sk.points.forEach((p, i) => { if (!usedPoint(sk, i)) return; const d = dist(p, xy); if (d <= bd) { bd = d; best = i; } });
  return best;
}
function usedPoint(sk, i) {
  return sk.curves.some((c) => c.ids.includes(i));
}

// ------------------------------------------------------------- the curves
export function addLine(sk, a, b, { auto = true } = {}) {
  const i = pointAt(sk, a), j = pointAt(sk, b);
  if (i === j) return -1;
  sk.curves.push({ kind: "line", ids: [i, j], construction: false });
  // a line drawn nearly level or plumb is made so (Fusion's auto constraint)
  if (auto) {
    const [p, q] = [sk.points[i], sk.points[j]];
    const ang = Math.abs(Math.atan2(q[1] - p[1], q[0] - p[0]) * 180 / Math.PI) % 180;
    if (ang < 3 || ang > 177) addConstraint(sk, "horizontal", [i, j]);
    else if (Math.abs(ang - 90) < 3) addConstraint(sk, "vertical", [i, j]);
  }
  return sk.curves.length - 1;
}
export function addRect(sk, a, b) {
  const c = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  const ids = c.map((p) => pointAt(sk, p));
  const out = [];
  for (let k = 0; k < 4; k++) {
    sk.curves.push({ kind: "line", ids: [ids[k], ids[(k + 1) % 4]], construction: false });
    out.push(sk.curves.length - 1);
    addConstraint(sk, k % 2 ? "vertical" : "horizontal", [ids[k], ids[(k + 1) % 4]]);
  }
  return out;
}
export function addCircle(sk, center, r) {
  const c = pointAt(sk, center);
  sk.curves.push({ kind: "circle", ids: [c], r: r3(r), construction: false });
  return sk.curves.length - 1;
}
// center, then start, then where it ends (counter-clockwise from start; the
// end is put on the circle, unless it is a point already there: then that
// point is the end, so the arc joins it, and the solve evens the radius)
export function addArc(sk, center, start, end) {
  const r = dist(center, start);
  const a = Math.atan2(end[1] - center[1], end[0] - center[0]);
  const at = sk.points.findIndex((p) => dist(p, end) <= 1e-6);
  const e = at >= 0 ? sk.points[at] : [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
  const ids = [pointAt(sk, center), pointAt(sk, start), at >= 0 ? at : pointAt(sk, e)];
  if (ids[1] === ids[2]) return -1;
  sk.curves.push({ kind: "arc", ids, construction: false });
  return sk.curves.length - 1;
}
// through the clicked points: one cubic Bezier per stretch (Catmull-Rom), the
// control points kept as construction-free inner points of each Bezier
// closed: the last point runs smoothly back into the first (a loop, no ends)
export function addSpline(sk, through, { closed = false } = {}) {
  if (through.length < (closed ? 3 : 2)) return [];
  const P = through, n = P.length;
  const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    const ids = [pointAt(sk, p1), -1, -1, pointAt(sk, p2)];
    sk.points.push([r6(c1[0]), r6(c1[1])]); ids[1] = sk.points.length - 1;
    sk.points.push([r6(c2[0]), r6(c2[1])]); ids[2] = sk.points.length - 1;
    sk.curves.push({ kind: "bezier", ids, construction: false });
    out.push(sk.curves.length - 1);
  }
  return out;
}
export function toggleConstruction(sk, ci) {
  const c = sk.curves[ci];
  if (c) c.construction = !c.construction;
}
export function removeCurve(sk, ci) {
  const c = sk.curves[ci];
  if (!c) return;
  sk.curves.splice(ci, 1);
  // rules on points no curve uses any more go with it
  const gone = new Set(c.ids.filter((i) => !usedPoint(sk, i)));
  sk.constraints = sk.constraints.filter((k) => !k.ids.some((i) => gone.has(i)) && ruleHolds(sk, k));
  sk.dims = sk.dims.filter((k) => !k.ids.some((i) => gone.has(i)));
}

// a tangent still has its line (or first circle) and a circle or arc around
// its centre(s)
const roundAt = (sk, center) => sk.curves.some((c) => (c.kind === "circle" || c.kind === "arc") && c.ids[0] === center);
function tangentHolds(sk, k) {
  if (k.type === "tangentArcs") return roundAt(sk, k.ids[0]) && roundAt(sk, k.ids[1]);
  if (k.type === "tangentEnd") return sk.curves.some((c) => c.kind === "bezier" && c.ids.includes(k.ids[0]) && c.ids.includes(k.ids[1]))
    && (roundAt(sk, k.ids[2]) || sk.curves.some((c) => c.ids.includes(k.ids[2]) && c.ids.includes(k.ids[3])));
  const [a, b, center] = k.ids;
  return sk.curves.some((c) => c.kind === "line" && ((c.ids[0] === a && c.ids[1] === b) || (c.ids[0] === b && c.ids[1] === a)))
    && roundAt(sk, center);
}
const isTangent = (k) => k.type === "tangent" || k.type === "tangentArcs" || k.type === "tangentEnd";
const touchOf = (k) => k.ids[k.type === "tangentArcs" ? 2 : k.type === "tangentEnd" ? 0 : 3];
// a rule still has the curves it is about (a point on a circle needs the circle)
const ruleHolds = (sk, k) => (isTangent(k) ? tangentHolds(sk, k) : k.type === "onCurve" ? roundAt(sk, k.ids[0]) : true);
// a point of the rule's own, on no curve (kept while the rule is): a tangent's
// touch, a symmetry's midway point
const ownPoint = (k) => (isTangent(k) ? touchOf(k) : k.type === "symmetric" ? k.ids[4] : null);

// ------------------------------------------------------------ constraints
const SAME = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export function addConstraint(sk, type, ids) {
  if (sk.constraints.some((c) => c.type === type && SAME(c.ids, ids))) return false;
  sk.constraints.push({ type, ids: [...ids] });
  return true;
}
// constraint from a selection of points / curves, as the palette applies it.
// sel: [{ point: i } | { curve: j }]. Returns an error string or null.
export function constrain(sk, type, sel) {
  const curves = sel.filter((s) => s.curve != null).map((s) => sk.curves[s.curve]);
  const points = sel.filter((s) => s.point != null).map((s) => s.point);
  const lines = curves.filter((c) => c.kind === "line");
  const round = curves.filter((c) => c.kind === "arc" || c.kind === "circle");
  switch (type) {
    case "horizontal": case "vertical":
      if (lines.length === 1 && !points.length) return addConstraint(sk, type, lines[0].ids), null;
      if (points.length === 2) return addConstraint(sk, type, points), null;
      return "pick a line, or two points";
    case "coincident":
      if (points.length === 2) return addConstraint(sk, "coincident", points), null;
      if (points.length === 1 && lines.length === 1) return addConstraint(sk, "onLine", [...lines[0].ids, points[0]]), null;
      if (points.length === 1 && round.length === 1 && !lines.length) return onCurve(sk, round[0], points[0]);
      return "pick two points, or a point and a line, circle or arc";
    case "midpoint":
      if (points.length === 1 && lines.length === 1 && curves.length === 1) {
        if (lines[0].ids.includes(points[0])) return "pick a point that is not one of that line's own ends";
        return addConstraint(sk, "midpoint", [...lines[0].ids, points[0]]), null;
      }
      return "pick a point and a line: the point goes to the middle of the line";
    case "collinear":
      if (lines.length === 2 && curves.length === 2) return addConstraint(sk, "collinear", [...lines[0].ids, ...lines[1].ids]), null;
      return "pick two lines: they line up on one straight line";
    case "concentric": {
      if (round.length !== 2 || curves.length !== 2) return "pick two circles or arcs: they share a centre";
      const [p, q] = [round[0].ids[0], round[1].ids[0]];
      if (p === q) return "those two already share a centre";
      return addConstraint(sk, "coincident", [p, q]), null;
    }
    case "symmetric": return symmetric(sk, sel);
    case "parallel": case "perpendicular":
      if (lines.length === 2) return addConstraint(sk, type, [...lines[0].ids, ...lines[1].ids]), null;
      return "pick two lines";
    case "equal":
      if (lines.length === 2) return addConstraint(sk, "equal", [...lines[0].ids, ...lines[1].ids]), null;
      if (round.length === 2) {
        // two radii: arcs by their start points; a circle's radius is its number, so
        // circles are made equal by writing the same r
        const [a, b] = round;
        if (a.kind === "circle" && b.kind === "circle") { b.r = a.r; return null; }
        if (a.kind === "arc" && b.kind === "arc") return addConstraint(sk, "equal", [a.ids[0], a.ids[1], b.ids[0], b.ids[1]]), null;
        return "make a circle and an arc equal by typing the radius";
      }
      return "pick two lines or two circles / arcs";
    case "tangent": {
      const splines = curves.filter((c) => c.kind === "bezier");
      if (splines.length && curves.length === 2) return splineTangent(sk, splines[0], curves.find((c) => c !== splines[0]) ?? splines[1]);
      if (round.length === 2 && !lines.length) {
        const touch = roundTouch(sk, round[0], round[1]);
        if (touch == null) return "those two share a centre: they can't touch";
        return addConstraint(sk, "tangentArcs", [round[0].ids[0], round[1].ids[0], touch]), null;
      }
      if (lines.length !== 1 || round.length !== 1) return "pick two curves: a line, arc, circle or spline and another";
      const [a, b] = lines[0].ids, arc = round[0];
      const touch = tangentTouch(sk, lines[0], arc);
      if (touch == null) return "that line has no length";
      return addConstraint(sk, "tangent", [a, b, arc.ids[0], touch]), null;
    }
    case "fixed":
      if (points.length) { for (const p of points) addConstraint(sk, "fixed", [p]); return null; }
      return "pick points to fix";
    default: return `no constraint "${type}"`;
  }
}

// Where a line touches an arc or circle: an end they share, else a line end
// already on the curve, else a point of the constraint's own on the curve,
// nearest the line (the solver then slides it along both).
function tangentTouch(sk, line, arc) {
  const [a, b] = line.ids, P = sk.points;
  const shared = arc.kind === "arc" ? arc.ids.slice(1).find((p) => p === a || p === b) : undefined;
  if (shared != null) return shared;
  const C = P[arc.ids[0]];
  const r = arc.kind === "circle" ? arc.r : dist(C, P[arc.ids[1]]);
  const onRim = [a, b].find((k) => Math.abs(dist(C, P[k]) - r) < 1e-3 && k !== arc.ids[0]);
  if (onRim != null) return onRim;
  const A = P[a], d = [P[b][0] - A[0], P[b][1] - A[1]], L = Math.hypot(...d);
  if (L < 1e-9) return null;
  // the foot of the centre on the line, and the rim point toward it
  const t = ((C[0] - A[0]) * d[0] + (C[1] - A[1]) * d[1]) / (L * L);
  // a line drawn toward the circle and stopping short (or running past) with
  // a free end there: that end is where it touches, so the line runs exactly
  // to the circle and a trim can close the outline. A connected end stays put
  // (the touch point is then the rule's own, on the line's run).
  const lone = (k) => sk.curves.filter((c) => c.ids.includes(k)).length === 1;
  if (t > 1 && lone(b)) return b;
  if (t < 0 && lone(a)) return a;
  const foot = [A[0] + d[0] * t, A[1] + d[1] * t];
  let n = [foot[0] - C[0], foot[1] - C[1]];
  const nl = Math.hypot(...n);
  n = nl > 1e-9 ? [n[0] / nl, n[1] / nl] : [-d[1] / L, d[0] / L];
  sk.points.push([r6(C[0] + n[0] * r), r6(C[1] + n[1] * r)]);
  return sk.points.length - 1;
}

// A spline end running on smoothly into another curve: the end they share,
// or a spline end lying on it. ["tangentEnd", end, handle, c, d]: c-d is the
// line, or the other spline's last handle and end, or c the centre of the
// circle / arc (d the end).
function splineTangent(sk, S, o) {
  const P = sk.points;
  const ends = [[S.ids[0], S.ids[1]], [S.ids[3], S.ids[2]]];
  const on = (k) => {
    if (o.kind === "line") {
      if (o.ids.includes(k)) return true;
      const [a, b] = o.ids.map((i) => P[i]), d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d);
      return Math.abs((P[k][0] - a[0]) * d[1] - (P[k][1] - a[1]) * d[0]) / L < 1e-3;
    }
    if (o.kind === "circle" || o.kind === "arc") return o.ids.slice(1).includes(k) || Math.abs(dist(P[k], P[o.ids[0]]) - roundR(sk, o)) < 1e-3;
    return o.ids[0] === k || o.ids[3] === k;
  };
  const hit = ends.find(([k]) => on(k));
  if (!hit) return "a spline is tangent where it meets the other curve: start or end it on that curve (snap to it), then pick Tangent";
  const [end, handle] = hit;
  if (o.kind === "line") return addConstraint(sk, "tangentEnd", [end, handle, ...o.ids]), null;
  if (o.kind === "circle" || o.kind === "arc") return addConstraint(sk, "tangentEnd", [end, handle, o.ids[0], end]), null;
  const other = o.ids[0] === end ? o.ids[1] : o.ids[2];
  return addConstraint(sk, "tangentEnd", [end, handle, other, end]), null;
}

// Where two circles / arcs touch: an end they share, else a point of the
// constraint's own on the first, on the line of centres, on the side that
// makes the nearer fit (outside each other, or one inside the other).
function roundTouch(sk, A, B) {
  const P = sk.points;
  if (A.kind === "arc" && B.kind === "arc") {
    const shared = A.ids.slice(1).find((p) => B.ids.slice(1).includes(p));
    if (shared != null) return shared;
  }
  const ca = P[A.ids[0]], cb = P[B.ids[0]];
  const ra = A.kind === "circle" ? A.r : dist(ca, P[A.ids[1]]), rb = B.kind === "circle" ? B.r : dist(cb, P[B.ids[1]]);
  const d = dist(ca, cb);
  if (d < 1e-9) return null;
  const u = [(cb[0] - ca[0]) / d, (cb[1] - ca[1]) / d];
  // outside each other: toward B; one inside the other: on the side away
  // from the smaller's centre when A is the bigger, toward it otherwise
  const outside = Math.abs(d - (ra + rb)) <= Math.abs(d - Math.abs(ra - rb));
  const s = outside || ra >= rb ? 1 : -1;
  sk.points.push([r6(ca[0] + u[0] * ra * s), r6(ca[1] + u[1] * ra * s)]);
  return sk.points.length - 1;
}

// a point on a circle / arc (an arc's own end, or its centre, is refused)
function onCurve(sk, c, p) {
  if (c.ids.includes(p)) return c.ids[0] === p ? "that point is the centre" : "that point is already on it";
  return addConstraint(sk, "onCurve", [c.ids[0], p]), null;
}
// Symmetric about a line (the last line picked, best a construction line):
// two points; two lines (end for end, each end with the other line's end
// nearer its mirror image); two circles / arcs (their centres, and a circle's
// radius made the same). Each pair gets a midway point of its own.
function symmetric(sk, sel) {
  const P = sk.points;
  const picked = sel.filter((x) => x.curve != null).map((x) => x.curve);
  const axisAt = [...picked].reverse().find((ci) => sk.curves[ci].kind === "line" && sk.curves[ci].construction)
    ?? [...picked].reverse().find((ci) => sk.curves[ci].kind === "line");
  if (axisAt == null) return "pick what to mirror and a line to mirror it across (a construction line is best)";
  const [a, b] = sk.curves[axisAt].ids;
  const others = picked.filter((ci) => ci !== axisAt).map((ci) => sk.curves[ci]);
  const pts = sel.filter((x) => x.point != null).map((x) => x.point);
  const mirror = (q) => {
    const A = P[a], d = [P[b][0] - A[0], P[b][1] - A[1]], L2 = d[0] ** 2 + d[1] ** 2;
    const t = ((q[0] - A[0]) * d[0] + (q[1] - A[1]) * d[1]) / L2, f = [A[0] + d[0] * t, A[1] + d[1] * t];
    return [2 * f[0] - q[0], 2 * f[1] - q[1]];
  };
  let pairs;
  if (pts.length === 2 && !others.length) pairs = [pts];
  else if (others.length === 2 && others.every((c) => c.kind === "line")) {
    const [u, v] = others.map((c) => c.ids);
    const m0 = mirror(P[u[0]]);
    const near = dist(P[v[0]], m0) <= dist(P[v[1]], m0) ? 0 : 1;
    pairs = [[u[0], v[near]], [u[1], v[1 - near]]];
  } else if (others.length === 2 && others.every((c) => c.kind === "circle" || c.kind === "arc")) {
    pairs = [[others[0].ids[0], others[1].ids[0]]];
    if (others[0].kind === "circle" && others[1].kind === "circle") others[1].r = others[0].r;
  } else return "pick two points, two lines or two circles / arcs, and the line to mirror them across";
  if (pairs.some(([p, q]) => p === q || p === a || p === b || q === a || q === b)) return "the mirror line can't be one of the pair";
  for (const [p, q] of pairs) {
    sk.points.push([r6((P[p][0] + P[q][0]) / 2), r6((P[p][1] + P[q][1]) / 2)]);
    addConstraint(sk, "symmetric", [p, q, a, b, sk.points.length - 1]);
  }
  return null;
}

// ------------------------------------------------------------------- dims
// a dim from a selection: a line (its length), two points (their distance),
// a circle or arc (its radius), two lines (the angle between them)
export function dimension(sk, sel, value = null) {
  const curves = sel.filter((s) => s.curve != null).map((s) => s.curve);
  const points = sel.filter((s) => s.point != null).map((s) => s.point);
  if (curves.length === 1 && !points.length) {
    const c = sk.curves[curves[0]];
    if (c.kind === "line") return pushDim(sk, "distance", c.ids, value ?? dist(sk.points[c.ids[0]], sk.points[c.ids[1]]));
    if (c.kind === "circle") { if (value != null) c.r = r3(value); return { radius: curves[0] }; }
    if (c.kind === "arc") return pushDim(sk, "distance", [c.ids[0], c.ids[1]], value ?? dist(sk.points[c.ids[0]], sk.points[c.ids[1]]));
  }
  if (points.length === 2 && !curves.length) return pushDim(sk, "distance", points, value ?? dist(sk.points[points[0]], sk.points[points[1]]));
  if (curves.length === 2 && sk.curves[curves[0]].kind === "line" && sk.curves[curves[1]].kind === "line") {
    const [a, b] = sk.curves[curves[0]].ids, [c, d] = sk.curves[curves[1]].ids;
    const P = sk.points;
    const u = [P[b][0] - P[a][0], P[b][1] - P[a][1]], v = [P[d][0] - P[c][0], P[d][1] - P[c][1]];
    const ang = Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180 / Math.PI;
    return pushDim(sk, "angle", [a, b, c, d], value ?? ang);
  }
  return { error: "pick a line, two points, a circle or arc, or two lines" };
}
function pushDim(sk, type, ids, value) {
  const at = sk.dims.findIndex((d) => d.type === type && SAME(d.ids, ids));
  if (at >= 0) { sk.dims[at].value = r3(value); return { dim: at }; }
  sk.dims.push({ type, ids: [...ids], value: r3(value) });
  return { dim: sk.dims.length - 1 };
}

// ------------------------------------------------------------------ solve
// the kernel's ConstraintSolver, through the same path sketch() builds with
export function solve(sk) {
  const curves = sk.curves.map((c) => ({ kind: c.kind, ids: c.ids, r: c.r, construction: c.construction }));
  const solved = solveSketch2D(sk.points, curves, sk.constraints, sk.dims);
  // a coordinate written as a const keeps its name (it goes back as the name
  // while its value is untouched)
  sk.points = solved.map(([x, y], i) => keepNames(sk.points[i] ?? [], [r6(x), r6(y)]));
  return sk;
}
// The rules the solve could not meet (over-constrained, or asking the
// impossible): [{ type, ids }, …] constraints and dims alike, with how far off.
export function unmet(sk, tol = 1e-3) {
  const curves = sk.curves.map((c) => ({ kind: c.kind, ids: c.ids, r: c.r }));
  return [...sk.constraints.map((c) => [c, [c], []]), ...sk.dims.map((d) => [d, [], [d]])]
    .map(([rule, cs, ds]) => ({ type: rule.type, ids: rule.ids, off: sketchError(sk.points, cs, ds, curves) }))
    .filter((r) => r.off > tol);
}
// What the sketch makes, for the sketcher to show: the shaded outline(s)
// (loops of plane points, with holes), the curves left out (they enclose
// nothing) and the loose ends (a curve ending on nothing), or why there is
// no profile at all.
export function profileInfo(sk) {
  try {
    const s = dslSketch(toSpec(sk));
    const loops = [s, ...(s.islands || [])].map((o) => ({ pts: o.pts, holes: (o.holes || []).map((h) => h.pts) }));
    return { problem: null, loops, strays: s.leftOut?.strays ?? [], loose: s.leftOut?.loose ?? [] };
  } catch (e) {
    return { problem: String(e.message || e).replace(/^sketch\(\):\s*/, ""), loops: [], strays: [], loose: looseEnds(sk) };
  }
}
// points only one (non-construction) curve ends on
function looseEnds(sk) {
  const deg = new Map();
  for (const c of sk.curves) {
    if (c.construction) continue;
    const ends = c.kind === "line" ? c.ids : c.kind === "arc" ? c.ids.slice(1) : c.kind === "bezier" ? [c.ids[0], c.ids[3]] : [];
    for (const e of ends) deg.set(e, (deg.get(e) ?? 0) + 1);
  }
  return [...deg].filter(([, d]) => d === 1).map(([e]) => sk.points[e]);
}
// Pick a region in or out (Fusion's profile picking): a click in a shaded
// region leaves it out; a click where a left-out region was brings it back.
// -> "out" | "in" | null (the click is in no region)
export function toggleRegion(sk, xy) {
  const inside = (info) => info.loops.some((l) => inLoop(xy, l.pts) && !l.holes.some((h) => inLoop(xy, h)));
  if (inside(profileInfo(sk))) {
    const t = { ...sk, skip: [...(sk.skip ?? []), [r3(xy[0]), r3(xy[1])]] };
    if (profileInfo(t).problem) return null;          // the last region: keep it
    sk.skip = t.skip;
    return "out";
  }
  for (let k = 0; k < (sk.skip ?? []).length; k++) {
    const t = { ...sk, skip: sk.skip.filter((_, j) => j !== k) };
    if (inside(profileInfo(t))) { sk.skip = t.skip; if (!sk.skip.length) delete sk.skip; return "in"; }
  }
  return null;
}
function inLoop(p, poly) {
  let k = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) k = !k;
  }
  return k;
}
// Does it make a profile? null, or why not (sketch()'s own message).
export function profileProblem(sk) {
  try { dslSketch(toSpec(sk)); return null; } catch (e) { return String(e.message || e).replace(/^sketch\(\):\s*/, ""); }
}

// ------------------------------------------------- how constrained, and why not
// Every rule as equations in the points' x, y (a circle's radius is its own
// number, never free). analyse(sk) counts how many more rules or dims would
// lock the sketch (degrees of freedom: unknowns less the rank of the rules'
// Jacobian) and which curves can still move (a point is locked when no
// motion the rules allow moves it). Moving the whole sketch counts: a sketch
// with nothing fixed has 3 to go, the way Fusion counts.
const curveR = (sk, P, c) => (c.kind === "circle" ? c.r : Math.hypot(P[c.ids[1]][0] - P[c.ids[0]][0], P[c.ids[1]][1] - P[c.ids[0]][1]));
// the circle / arc around `center` that p is on (as dsl.js tangentCurve picks it)
function roundFor(sk, P, center, p) {
  const round = sk.curves.filter((c) => (c.kind === "circle" || c.kind === "arc") && c.ids[0] === center);
  const ends = round.find((c) => c.kind === "arc" && (c.ids[1] === p || c.ids[2] === p));
  if (ends) return ends;
  const d = Math.hypot(P[p][0] - P[center][0], P[p][1] - P[center][1]);
  return round.sort((u, v) => Math.abs(curveR(sk, P, u) - d) - Math.abs(curveR(sk, P, v) - d))[0] ?? null;
}
// rule -> [f(P) …], each zero when it holds. `at` is where the sketch is now
// (a fixed point stays there).
function equations(sk, at) {
  const eq = [];
  const L = (P, a, b) => Math.hypot(P[b][0] - P[a][0], P[b][1] - P[a][1]);
  const cross = (P, a, b, c, d) => (P[b][0] - P[a][0]) * (P[d][1] - P[c][1]) - (P[b][1] - P[a][1]) * (P[d][0] - P[c][0]);
  const dot = (P, a, b, c, d) => (P[b][0] - P[a][0]) * (P[d][0] - P[c][0]) + (P[b][1] - P[a][1]) * (P[d][1] - P[c][1]);
  const onRound = (center, p) => {
    const c = roundFor(sk, at, center, p);
    if (!c || (c.kind === "arc" && (c.ids[1] === p || c.ids[2] === p))) return;
    if (c.kind === "circle") eq.push((P) => L(P, center, p) - c.r);
    else eq.push((P) => L(P, center, p) - L(P, center, c.ids[1]));
  };
  for (const c of sk.curves) if (c.kind === "arc") { const [o, s, e] = c.ids; eq.push((P) => L(P, o, e) - L(P, o, s)); }
  for (const k of sk.constraints) {
    const [a, b, c, d] = k.ids;
    switch (k.type) {
      case "fixed": eq.push((P) => P[a][0] - at[a][0], (P) => P[a][1] - at[a][1]); break;
      case "coincident": eq.push((P) => P[a][0] - P[b][0], (P) => P[a][1] - P[b][1]); break;
      case "horizontal": eq.push((P) => P[a][1] - P[b][1]); break;
      case "vertical": eq.push((P) => P[a][0] - P[b][0]); break;
      case "parallel": eq.push((P) => cross(P, a, b, c, d) / (L(P, a, b) * L(P, c, d) || 1)); break;
      case "perpendicular": eq.push((P) => dot(P, a, b, c, d) / (L(P, a, b) * L(P, c, d) || 1)); break;
      case "equal": eq.push((P) => L(P, a, b) - L(P, c, d)); break;
      case "onLine": eq.push((P) => cross(P, a, b, a, c) / (L(P, a, b) || 1)); break;
      case "midpoint": eq.push((P) => (P[a][0] + P[b][0]) / 2 - P[c][0], (P) => (P[a][1] + P[b][1]) / 2 - P[c][1]); break;
      case "onCurve": onRound(a, b); break;
      case "collinear":
        eq.push((P) => cross(P, a, b, a, c) / (L(P, a, b) || 1), (P) => cross(P, a, b, a, d) / (L(P, a, b) || 1)); break;
      case "symmetric": {
        const m = k.ids[4];
        eq.push((P) => (P[a][0] + P[b][0]) / 2 - P[m][0], (P) => (P[a][1] + P[b][1]) / 2 - P[m][1],
          (P) => cross(P, c, d, c, m) / (L(P, c, d) || 1), (P) => dot(P, c, d, a, b) / (L(P, c, d) || 1));
        break;
      }
      case "tangent":
        eq.push((P) => dot(P, a, b, c, d) / (L(P, a, b) * L(P, c, d) || 1));
        if (d !== a && d !== b) eq.push((P) => cross(P, a, b, a, d) / (L(P, a, b) || 1));
        onRound(c, d);
        break;
      case "tangentArcs":
        eq.push((P) => cross(P, a, b, a, c) / (L(P, a, b) || 1));
        onRound(a, c); onRound(b, c);
        break;
      case "tangentEnd":
        // spline end a with handle b runs on into the curve through c-d:
        // square to the radius (c a centre) or in line with c-d; the end on it
        if (endIsRound(sk, k.ids)) { eq.push((P) => dot(P, c, a, a, b) / (L(P, c, a) * L(P, a, b) || 1)); onRound(c, a); }
        else {
          eq.push((P) => cross(P, c, d, c, b) / (L(P, c, d) || 1));
          if (a !== c && a !== d) eq.push((P) => cross(P, c, d, c, a) / (L(P, c, d) || 1));
        }
        break;
      default: break;
    }
  }
  for (const k of sk.dims) {
    const [a, b, c, d] = k.ids;
    if (k.type === "distance") eq.push((P) => L(P, a, b) - k.value);
    else if (k.type === "angle") eq.push((P) => Math.atan2(cross(P, a, b, c, d), dot(P, a, b, c, d)) * 180 / Math.PI);
  }
  return eq;
}
// ["tangentEnd", end, handle, c, d]: c is the centre of a circle / arc through `end`
function endIsRound(sk, [end, , c]) {
  return sk.curves.some((k) => (k.kind === "circle" || k.kind === "arc") && k.ids[0] === c);
}
export function analyse(sk) {
  const used = new Set();
  for (const c of sk.curves) c.ids.forEach((i) => used.add(i));
  for (const k of [...sk.constraints, ...sk.dims]) k.ids.forEach((i) => used.add(i));
  const vars = [...used].sort((a, b) => a - b).flatMap((i) => [[i, 0], [i, 1]]);
  const eqs = equations(sk, sk.points);
  const n = vars.length, m = eqs.length;
  // the Jacobian, by central differences
  const P = sk.points.map((p) => [...p]);
  const J = Array.from({ length: m }, () => new Float64Array(n));
  const h = 1e-6;
  vars.forEach(([i, k], j) => {
    const v = P[i][k];
    P[i][k] = v + h; const up = eqs.map((f) => f(P));
    P[i][k] = v - h; const dn = eqs.map((f) => f(P));
    P[i][k] = v;
    for (let r = 0; r < m; r++) J[r][j] = (up[r] - dn[r]) / (2 * h);
  });
  // row-reduce: pivots are the locked directions, the rest free
  const pivots = [];
  let row = 0;
  for (let col = 0; col < n && row < m; col++) {
    let best = row;
    for (let r = row + 1; r < m; r++) if (Math.abs(J[r][col]) > Math.abs(J[best][col])) best = r;
    if (Math.abs(J[best][col]) < 1e-7) continue;
    [J[row], J[best]] = [J[best], J[row]];
    const pv = J[row][col];
    for (let c = col; c < n; c++) J[row][c] /= pv;
    for (let r = 0; r < m; r++) {
      if (r === row || Math.abs(J[r][col]) < 1e-14) continue;
      const f = J[r][col];
      for (let c = col; c < n; c++) J[r][c] -= f * J[row][c];
    }
    pivots.push(col);
    row++;
  }
  const isPivot = new Set(pivots);
  const freeCols = [...Array(n).keys()].filter((c) => !isPivot.has(c));
  // a variable is locked when no free direction moves it
  const locked = new Set();
  pivots.forEach((col, r) => { if (freeCols.every((f) => Math.abs(J[r][f]) < 1e-6)) locked.add(col); });
  const lockedPoint = (i) => vars.every(([p], j) => p !== i || locked.has(j));
  const curveLocked = sk.curves.map((c) => c.ids.every(lockedPoint));
  return { dof: freeCols.length, curveLocked, rank: pivots.length, rules: m };
}

// --------------------------------------------- try a change; refuse what fights
// attempt(sk, change): change(sk) adds or edits rules (returns an error string
// to refuse outright). It is kept when the solve still meets every rule.
// Otherwise sk is left as it was and the rules that block it come back: each
// existing rule whose removal lets everything (the change included) be met.
//   -> { ok: true } | { error } | { ok: false, culprits: [{ kind, index, type, ids }], changed }
export function attempt(sk, change) {
  const before = cloneSketch(sk);
  const err = change(sk);
  if (err) { assignSketch(sk, before); return { error: err }; }
  const changed = cloneSketch(sk);
  solve(sk);
  if (!unmet(sk).length) return { ok: true };
  assignSketch(sk, before);
  // which old rules fight the change: drop each in turn, solve from where it was
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const culprits = [];
  const old = [
    ...before.constraints.map((k, index) => ({ kind: "constraint", index, rule: k })),
    ...before.dims.map((k, index) => ({ kind: "dim", index, rule: k })),
  ].filter(({ kind, index, rule }) => same((kind === "dim" ? changed.dims : changed.constraints)[index], rule));
  for (const o of old) {
    const t = cloneSketch(changed);
    (o.kind === "dim" ? t.dims : t.constraints).splice(o.index, 1);
    solve(t);
    if (!unmet(t).length) culprits.push({ kind: o.kind, index: o.index, type: o.rule.type, ids: o.rule.ids });
  }
  return { ok: false, culprits, changed };
}
// the change, with one blocking rule taken out (the panel's one-click fix)
export function applyWithout(sk, changed, culprit) {
  const t = cloneSketch(changed);
  (culprit.kind === "dim" ? t.dims : t.constraints).splice(culprit.index, 1);
  solve(t);
  assignSketch(sk, t);
}
function assignSketch(sk, src) {
  for (const k of Object.keys(sk)) if (!(k in src)) delete sk[k];
  Object.assign(sk, cloneSketch(src));
}
// a deep copy that keeps a point's names (a coordinate written as a const)
export function cloneSketch(sk) {
  const out = JSON.parse(JSON.stringify(sk));
  out.points = sk.points.map((p) => keepNames(p, [...p]));
  return out;
}
function keepNames(from, to) {
  if (from.names) { to.names = [...from.names]; to.read = [...from.read]; }
  return to;
}

// ------------------------------------------------------------ trim, offset
// A tangent touch is solved to the solver's tolerance, not exactly: within
// TOUCH mm a line and a curve that touch count as meeting there.
const TOUCH = 1e-3;
const TAU = 2 * Math.PI;
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const roundR = (sk, c) => (c.kind === "circle" ? c.r : dist(sk.points[c.ids[0]], sk.points[c.ids[1]]));
// an arc's start angle and CCW sweep (a circle: the whole turn from 0)
function span(sk, c) {
  if (c.kind === "circle") return { s: 0, w: TAU };
  const [C, A, B] = c.ids.map((k) => sk.points[k]);
  const s = Math.atan2(A[1] - C[1], A[0] - C[0]);
  const w = wrap(Math.atan2(B[1] - C[1], B[0] - C[0]) - s) || TAU;
  return { s, w };
}
function onSpan(sk, c, xy) {
  if (c.kind === "circle") return true;
  const C = sk.points[c.ids[0]], { s, w } = span(sk, c);
  const u = wrap(Math.atan2(xy[1] - C[1], xy[0] - C[0]) - s);
  return u <= w + 1e-6 || u >= TAU - 1e-6;
}
// where the segment p-q meets circle / arc o: [xy], a touch counted once
function segRound(sk, p, q, o) {
  const C = sk.points[o.ids[0]], r = roundR(sk, o);
  const d = [q[0] - p[0], q[1] - p[1]], L2 = d[0] ** 2 + d[1] ** 2;
  const t0 = ((C[0] - p[0]) * d[0] + (C[1] - p[1]) * d[1]) / L2;
  const foot = [p[0] + d[0] * t0, p[1] + d[1] * t0];
  const h = dist(foot, C);
  let ts;
  if (Math.abs(h - r) < TOUCH) ts = [t0];
  else if (h > r) return [];
  else { const k = Math.sqrt(r * r - h * h) / Math.sqrt(L2); ts = [t0 - k, t0 + k]; }
  return ts.filter((t) => t >= -1e-9 && t <= 1 + 1e-9).map((t) => [p[0] + d[0] * t, p[1] + d[1] * t]).filter((xy) => onSpan(sk, o, xy));
}
// where two circles / arcs meet
function roundRound(sk, a, b) {
  const A = sk.points[a.ids[0]], B = sk.points[b.ids[0]], ra = roundR(sk, a), rb = roundR(sk, b);
  const D = dist(A, B);
  if (D < 1e-9 || D > ra + rb + TOUCH || D < Math.abs(ra - rb) - TOUCH) return [];
  const e = [(B[0] - A[0]) / D, (B[1] - A[1]) / D];
  // touching (outside or inside) is judged on the centres' distance: the
  // crossing's half-chord is a square root of the gap, so a touch solved to
  // 1e-6 would otherwise split into two crossings 0.003 mm apart
  if (Math.abs(D - (ra + rb)) < TOUCH || Math.abs(D - Math.abs(ra - rb)) < TOUCH) {
    const s = Math.abs(D - (ra + rb)) < TOUCH || ra >= rb ? 1 : -1;
    const m = [A[0] + e[0] * ra * s, A[1] + e[1] * ra * s];
    return onSpan(sk, a, m) && onSpan(sk, b, m) ? [m] : [];
  }
  const x = (D * D + ra * ra - rb * rb) / (2 * D), y = Math.sqrt(Math.max(0, ra * ra - x * x));
  const m = [A[0] + e[0] * x, A[1] + e[1] * x];
  return [[m[0] - e[1] * y, m[1] + e[0] * y], [m[0] + e[1] * y, m[1] - e[0] * y]]
    .filter((xy) => onSpan(sk, a, xy) && onSpan(sk, b, xy));
}
// points that already sit on curve ci: other curves' ends, and the touch
// points of tangents. A cut there reuses the point, so the pieces join.
function pointsOn(sk, ci) {
  const c = sk.curves[ci], out = [];
  const ends = new Set();
  const endsOf = (o) => (o.kind === "line" ? o.ids : o.kind === "arc" ? o.ids.slice(1) : o.kind === "bezier" ? [o.ids[0], o.ids[3]] : []);
  sk.curves.forEach((o, j) => { if (j !== ci && !o.construction) endsOf(o).forEach((k) => ends.add(k)); });
  for (const k of sk.constraints) if (isTangent(k)) ends.add(touchOf(k));
  for (const k of ends) {
    if (c.ids.includes(k)) continue;
    const xy = sk.points[k];
    if (c.kind === "line") {
      const [p, q] = c.ids.map((i) => sk.points[i]);
      const d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(...d);
      if (Math.abs((xy[0] - p[0]) * d[1] - (xy[1] - p[1]) * d[0]) / L < TOUCH) out.push({ xy, id: k });
    } else if (c.kind === "bezier") {
      const B = c.ids.map((i) => sk.points[i]);
      if (dist(bezAt(B, bezNearest(B, xy)), xy) < TOUCH) out.push({ xy, id: k });
    } else if (Math.abs(dist(xy, sk.points[c.ids[0]]) - roundR(sk, c)) < TOUCH && onSpan(sk, c, xy)) out.push({ xy, id: k });
  }
  return out;
}
// every place curve ci is cut: [{ xy, id? }]
function cutsOf(sk, ci) {
  const c = sk.curves[ci], out = pointsOn(sk, ci);
  const round = (o) => o.kind === "circle" || o.kind === "arc";
  sk.curves.forEach((o, j) => {
    if (j === ci || o.construction) return;
    if (c.kind === "line") {
      const [a, b] = c.ids.map((k) => sk.points[k]);
      if (o.kind === "line") {
        const [p, q] = o.ids.map((k) => sk.points[k]);
        const d = [b[0] - a[0], b[1] - a[1]], e = [q[0] - p[0], q[1] - p[1]];
        const den = d[0] * e[1] - d[1] * e[0];
        if (Math.abs(den) < 1e-12) return;
        const t = ((p[0] - a[0]) * e[1] - (p[1] - a[1]) * e[0]) / den;
        const s = ((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / den;
        if (t > -1e-9 && t < 1 + 1e-9 && s >= -1e-9 && s <= 1 + 1e-9) out.push({ xy: [a[0] + d[0] * t, a[1] + d[1] * t] });
      } else if (round(o)) segRound(sk, a, b, o).forEach((xy) => out.push({ xy }));
      else if (o.kind === "bezier") bezMeets(sk, o.ids.map((k) => sk.points[k]), c).forEach((xy) => out.push({ xy }));
    } else if (round(c)) {
      if (o.kind === "line") segRound(sk, sk.points[o.ids[0]], sk.points[o.ids[1]], c).forEach((xy) => out.push({ xy }));
      else if (round(o)) roundRound(sk, c, o).forEach((xy) => out.push({ xy }));
      else if (o.kind === "bezier") bezMeets(sk, o.ids.map((k) => sk.points[k]), c).forEach((xy) => out.push({ xy }));
    } else if (c.kind === "bezier") bezMeets(sk, c.ids.map((k) => sk.points[k]), o).forEach((xy) => out.push({ xy }));
  });
  return out;
}
// ------------------------------------------------------------------ splines
// A spline is cubic Beziers [a, c1, c2, b]. These are the curve maths trim,
// offset and tangent need: a point and a direction along one, the exact
// split at t (de Casteljau), where it meets a line / circle / another one
// (sampled, then refined), and the nearest t to a point.
const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
export function bezAt([p0, p1, p2, p3], t) {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
}
function bezDir([p0, p1, p2, p3], t) {
  const u = 1 - t;
  const d = [3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]),
    3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1])];
  const l = Math.hypot(...d);
  if (l > 1e-12) return [d[0] / l, d[1] / l];
  // a handle on its end: the direction to the next control point
  const q = t < 0.5 ? (dist(p0, p2) > 1e-12 ? p2 : p3) : (dist(p3, p1) > 1e-12 ? p1 : p0);
  const o = t < 0.5 ? p0 : p3, s = t < 0.5 ? 1 : -1;
  const e = [(q[0] - o[0]) * s, (q[1] - o[1]) * s], m = Math.hypot(...e) || 1;
  return [e[0] / m, e[1] / m];
}
// the piece of B between t0 and t1, exactly
export function bezPiece(B, t0, t1) {
  const split = ([p0, p1, p2, p3], t) => {
    const a = lerp2(p0, p1, t), b = lerp2(p1, p2, t), c = lerp2(p2, p3, t);
    const d = lerp2(a, b, t), e = lerp2(b, c, t), f = lerp2(d, e, t);
    return [[p0, a, d, f], [f, e, c, p3]];
  };
  const right = t0 > 0 ? split(B, t0)[1] : B;
  return t1 < 1 ? split(right, (t1 - t0) / (1 - t0))[0] : right;
}
// the t on B nearest p
function bezNearest(B, p) {
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 64; i++) { const t = i / 64, d = dist(bezAt(B, t), p); if (d < bd) { bd = d; best = t; } }
  let lo = Math.max(0, best - 1 / 64), hi = Math.min(1, best + 1 / 64);
  for (let k = 0; k < 40; k++) {
    const a = lo + (hi - lo) / 3, b = hi - (hi - lo) / 3;
    if (dist(bezAt(B, a), p) < dist(bezAt(B, b), p)) hi = b; else lo = a;
  }
  return (lo + hi) / 2;
}
// where B crosses something given as f(xy) = signed distance (0 on it):
// sign changes between samples, then bisection
function bezRoots(B, f, n = 96) {
  const out = [];
  let tp = 0, fp = f(bezAt(B, 0));
  if (Math.abs(fp) < TOUCH) out.push(0);
  for (let i = 1; i <= n; i++) {
    const t = i / n, ft = f(bezAt(B, t));
    if (Math.abs(ft) < TOUCH) { if (!out.length || t - out[out.length - 1] > 1.5 / n) out.push(t); }
    else if (fp * ft < 0) {
      let lo = tp, hi = t, flo = fp;
      for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2, fm = f(bezAt(B, m)); if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; } }
      out.push((lo + hi) / 2);
    }
    tp = t; fp = ft;
  }
  return out;
}
// where Bezier B meets curve o (line segment, circle / arc, or Bezier Q): [xy]
function bezMeets(sk, B, o) {
  const P = sk.points;
  if (o.kind === "line") {
    const [a, b] = o.ids.map((k) => P[k]), d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d);
    return bezRoots(B, (q) => ((q[0] - a[0]) * d[1] - (q[1] - a[1]) * d[0]) / L).map((t) => bezAt(B, t))
      .filter((q) => { const s = ((q[0] - a[0]) * d[0] + (q[1] - a[1]) * d[1]) / (L * L); return s >= -1e-6 && s <= 1 + 1e-6; });
  }
  if (o.kind === "circle" || o.kind === "arc") {
    const C = P[o.ids[0]], r = roundR(sk, o);
    return bezRoots(B, (q) => dist(q, C) - r).map((t) => bezAt(B, t)).filter((q) => onSpan(sk, o, q));
  }
  if (o.kind === "bezier") {
    // two splines: polyline crossings, refined by alternating nearest points
    const Q = o.ids.map((k) => P[k]), n = 64, out = [];
    const pa = Array.from({ length: n + 1 }, (_, i) => bezAt(B, i / n)), pb = Array.from({ length: n + 1 }, (_, i) => bezAt(Q, i / n));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const [p, q] = [pa[i], pa[i + 1]], [r, s] = [pb[j], pb[j + 1]];
      const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [s[0] - r[0], s[1] - r[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-14) continue;
      const t = ((r[0] - p[0]) * d2[1] - (r[1] - p[1]) * d2[0]) / den, u = ((r[0] - p[0]) * d1[1] - (r[1] - p[1]) * d1[0]) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      let x = lerp2(p, q, t);
      for (let k = 0; k < 20; k++) x = bezAt(Q, bezNearest(Q, bezAt(B, bezNearest(B, x))));
      if (!out.some((y) => dist(x, y) < TOUCH)) out.push(x);
    }
    return out;
  }
  return [];
}

// cuts closer than TOUCH are one place: an existing point wins
function mergeCuts(cuts) {
  const out = [];
  for (const k of [...cuts].sort((x, y) => (x.id == null) - (y.id == null))) if (!out.some((m) => dist(m.xy, k.xy) < TOUCH)) out.push(k);
  return out;
}
// a cut's point: the one already there, or a new one
const cutPoint = (sk, cut) => cut.id ?? pointAt(sk, cut.xy, 1e-4);

// trim(sk, ci, at): cut away the piece of curve ci around the point `at`,
// between the crossings (and touches) either side of it. A line, arc or
// circle with nothing crossing it is deleted; a trimmed circle is an arc.
export function trim(sk, ci, at) {
  const c = sk.curves[ci];
  if (!c) return "nothing there";
  const cuts = mergeCuts(cutsOf(sk, ci));
  return c.kind === "line" ? trimLine(sk, ci, at, cuts) : c.kind === "bezier" ? trimBezier(sk, ci, at, cuts) : trimRound(sk, ci, at, cuts);
}
function trimLine(sk, ci, at, cuts) {
  const c = sk.curves[ci];
  const [a, b] = c.ids.map((k) => sk.points[k]);
  const d = [b[0] - a[0], b[1] - a[1]];
  const L2 = d[0] ** 2 + d[1] ** 2;
  const tOf = (xy) => ((xy[0] - a[0]) * d[0] + (xy[1] - a[1]) * d[1]) / L2;
  const t0 = tOf(at);
  const inner = cuts.map((k) => ({ ...k, t: tOf(k.xy) })).filter((k) => k.t > 1e-6 && k.t < 1 - 1e-6);
  if (!inner.length) { removeCurve(sk, ci); return null; }
  const below = inner.filter((k) => k.t < t0).sort((x, y) => y.t - x.t || (x.id == null) - (y.id == null))[0];
  const above = inner.filter((k) => k.t > t0).sort((x, y) => x.t - y.t || (x.id == null) - (y.id == null))[0];
  const [ia, ib] = c.ids;
  const pieces = [];
  if (below) pieces.push([ia, cutPoint(sk, below)]);
  if (above) pieces.push([cutPoint(sk, above), ib]);
  sk.curves.splice(ci, 1, ...pieces.map((ids) => ({ kind: "line", ids, construction: c.construction })));
  relineRules(sk, ia, ib, pieces);
  dropOrphanRules(sk, [ia, ib]);
  return null;
}
// rules written on line ia-ib move to what is left of it: its direction
// (level, plumb, parallel, square) holds for every piece, a tangent or a
// point-on-line goes with the piece its point is on, a length is dropped
function relineRules(sk, ia, ib, pieces) {
  const pair = (x, y) => (x === ia && y === ib) || (x === ib && y === ia);
  const P = sk.points;
  const onPiece = (pc, k) => {
    const [p, q] = pc.map((i) => P[i]), d = [q[0] - p[0], q[1] - p[1]], L2 = d[0] ** 2 + d[1] ** 2;
    const t = ((P[k][0] - p[0]) * d[0] + (P[k][1] - p[1]) * d[1]) / L2;
    return t > -1e-6 && t < 1 + 1e-6;
  };
  const out = [];
  for (const k of sk.constraints) {
    const ids = k.ids;
    if ((k.type === "horizontal" || k.type === "vertical") && pair(ids[0], ids[1])) { for (const pc of pieces) out.push({ ...k, ids: [...pc] }); continue; }
    const first = pair(ids[0], ids[1]), second = (k.type === "parallel" || k.type === "perpendicular") && pair(ids[2], ids[3]);
    if ((k.type === "parallel" || k.type === "perpendicular" || k.type === "tangent" || k.type === "onLine") && (first || second)) {
      const at0 = first ? 0 : 2;
      const probe = k.type === "tangent" ? ids[3] : k.type === "onLine" ? ids[2] : null;
      const pc = probe != null ? pieces.find((x) => x.includes(probe) || onPiece(x, probe)) : pieces[0];
      if (!pc) continue;
      const n = [...ids]; n[at0] = pc[0]; n[at0 + 1] = pc[1];
      out.push({ ...k, ids: n });
      continue;
    }
    if (k.type === "equal" && (pair(ids[0], ids[1]) || pair(ids[2], ids[3]))) continue;
    out.push(k);
  }
  sk.constraints = out;
  sk.dims = sk.dims.filter((dm) => !(dm.type === "distance" && pair(dm.ids[0], dm.ids[1])) && !(dm.type === "angle" && (pair(dm.ids[0], dm.ids[1]) || pair(dm.ids[2], dm.ids[3]))));
}
// rules on points no curve uses any more, and tangents whose curves are gone
function dropOrphanRules(sk, ids) {
  const gone = new Set(ids.filter((i) => !usedPoint(sk, i)));
  sk.constraints = sk.constraints.filter((k) => !k.ids.some((i) => gone.has(i)) && ruleHolds(sk, k));
  sk.dims = sk.dims.filter((k) => !k.ids.some((i) => gone.has(i)));
}
// a spline: split exactly at the crossings either side of `at`; the pieces
// keep their ends, get new handles, and a tangent on an end moves to the
// handle that end has now
function trimBezier(sk, ci, at, cuts) {
  const c = sk.curves[ci];
  const B = c.ids.map((k) => sk.points[k]);
  const t0 = bezNearest(B, at);
  const inner = cuts.map((k) => ({ ...k, t: bezNearest(B, k.xy) })).filter((k) => k.t > 1e-6 && k.t < 1 - 1e-6);
  if (!inner.length) { removeCurve(sk, ci); return null; }
  const below = inner.filter((k) => k.t < t0).sort((x, y) => y.t - x.t)[0];
  const above = inner.filter((k) => k.t > t0).sort((x, y) => x.t - y.t)[0];
  const [ia, h1, h2, ib] = c.ids;
  const handle = (xy) => { sk.points.push([r6(xy[0]), r6(xy[1])]); return sk.points.length - 1; };
  const pieces = [], remap = new Map();
  if (below) {
    const Q = bezPiece(B, 0, below.t), e = cutPoint(sk, { ...below, xy: below.id != null ? below.xy : Q[3] });
    const ids = [ia, handle(Q[1]), handle(Q[2]), e];
    remap.set(h1, ids[1]);
    pieces.push(ids);
  }
  if (above) {
    const Q = bezPiece(B, above.t, 1), e = cutPoint(sk, { ...above, xy: above.id != null ? above.xy : Q[0] });
    const ids = [e, handle(Q[1]), handle(Q[2]), ib];
    remap.set(h2, ids[2]);
    pieces.push(ids);
  }
  sk.curves.splice(ci, 1, ...pieces.map((ids) => ({ kind: "bezier", ids, construction: c.construction })));
  for (const k of sk.constraints) k.ids = k.ids.map((i) => remap.get(i) ?? i);
  dropOrphanRules(sk, [ia, h1, h2, ib]);
  return null;
}
function trimRound(sk, ci, at, cuts) {
  const c = sk.curves[ci];
  const C = sk.points[c.ids[0]], r = roundR(sk, c), { s, w } = span(sk, c);
  const u = (xy) => wrap(Math.atan2(xy[1] - C[1], xy[0] - C[0]) - s);
  const u0 = u(at);
  // the cuts by angle along the curve, each place once (a point already there wins)
  const list = [];
  for (const k of cuts.map((x) => ({ ...x, u: u(x.xy) })).sort((x, y) => (x.id == null) - (y.id == null))) {
    if (c.kind === "arc" && (k.u < 1e-6 || k.u > w - 1e-6)) continue;
    if (list.some((m) => Math.abs(m.u - k.u) < 1e-6 || Math.abs(Math.abs(m.u - k.u) - TAU) < 1e-6)) continue;
    list.push(k);
  }
  list.sort((x, y) => x.u - y.u);
  const rim = (k) => cutPoint(sk, k.id != null ? k : { xy: [C[0] + r * Math.cos(s + k.u), C[1] + r * Math.sin(s + k.u)] });
  if (c.kind === "circle") {
    if (list.length < 2) {
      if (list.length) return "a circle is trimmed between two crossings; this one has one";
      removeCurve(sk, ci); return null;
    }
    // the piece around u0 goes: the arc left runs CCW from the cut after it
    // round to the cut before it
    const after = list.find((k) => k.u > u0) ?? list[0];
    const before = [...list].reverse().find((k) => k.u < u0) ?? list[list.length - 1];
    const ids = [c.ids[0], rim(after), rim(before)];
    sk.curves.splice(ci, 1, { kind: "arc", ids, construction: c.construction });
    // the circle's radius (a number on it, maybe a named param) stays, as a dim
    const k = pushDim(sk, "distance", [ids[0], ids[1]], c.r).dim;
    if (c.rName && c.r === c.rRead) sk.dims[k].name = c.rName;
    return null;
  }
  if (!list.length) { removeCurve(sk, ci); return null; }
  const below = [...list].reverse().find((k) => k.u < u0), above = list.find((k) => k.u > u0);
  const [ctr, ia, ib] = c.ids;
  const pieces = [];
  if (below) pieces.push([ctr, ia, rim(below)]);
  if (above) pieces.push([ctr, rim(above), ib]);
  sk.curves.splice(ci, 1, ...pieces.map((ids) => ({ kind: "arc", ids, construction: c.construction })));
  // a radius dim on an end that went moves to an end that stayed
  const keep = pieces[0][1];
  for (const dm of sk.dims) {
    if (dm.type !== "distance" || !dm.ids.includes(ctr)) continue;
    const other = dm.ids[0] === ctr ? 1 : 0;
    if ((dm.ids[other] === ia || dm.ids[other] === ib) && !usedPoint(sk, dm.ids[other])) dm.ids[other] = keep;
  }
  dropOrphanRules(sk, [ia, ib]);
  return null;
}
// offset(sk, ci, d): the closed loop curve ci is in, copied d mm outward
// (negative: inward). Lines move out along their normals, arcs keep their
// centres and change radius, splines are FITTED (a Bezier's offset is not a
// Bezier: cubic pieces within OFFSET_FIT of it, split until they are), and
// each corner is where the neighbouring offset curves meet again (a tangent
// joint stays a tangent joint).
export function offset(sk, ci, d) {
  const c = sk.curves[ci];
  if (!c) return "nothing there";
  if (c.kind === "circle") { addCircle(sk, sk.points[c.ids[0]], Math.max(0.01, c.r + d)); return null; }
  const loop = loopOf(sk, ci);
  if (!loop) return "offset works on a closed outline";
  const P = sk.points;
  // winding: the loop's signed area, arcs counted by their bulge
  let area = 0;
  for (const x of loop) {
    const [a, b] = [P[x.from], P[x.to]];
    area += a[0] * b[1] - b[0] * a[1];
    const k = sk.curves[x.ci];
    if (k.kind === "arc") {
      const C = P[k.ids[0]], r = dist(C, P[k.ids[1]]);
      const w = wrap(Math.atan2(P[k.ids[2]][1] - C[1], P[k.ids[2]][0] - C[0]) - Math.atan2(P[k.ids[1]][1] - C[1], P[k.ids[1]][0] - C[0])) || TAU;
      const seg = r * r * (w - Math.sin(w));           // twice the segment area, CCW arc
      area += x.from === k.ids[1] ? seg : -seg;
    }
    if (k.kind === "bezier") {
      // the area between the chord and the curve, from a few samples
      const B = (x.from === k.ids[0] ? k.ids : [...k.ids].reverse()).map((i) => P[i]);
      let q = B[0];
      for (let i = 1; i <= 32; i++) { const r = bezAt(B, i / 32); area += q[0] * r[1] - r[0] * q[1]; q = r; }
      area -= a[0] * b[1] - b[0] * a[1];
    }
  }
  const s = area > 0 ? 1 : -1;                         // outward is right of a CCW edge
  // each piece moved out: a line as its two moved ends, an arc as its new radius
  const pieces = loop.map((x) => {
    const k = sk.curves[x.ci];
    const a = P[x.from], b = P[x.to];
    if (k.kind === "line") {
      const e = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...e);
      const n = [s * e[1] / l, -s * e[0] / l];
      return { kind: "line", a: [a[0] + n[0] * d, a[1] + n[1] * d], b: [b[0] + n[0] * d, b[1] + n[1] * d] };
    }
    if (k.kind === "bezier") {
      const B = (x.from === k.ids[0] ? k.ids : [...k.ids].reverse()).map((i) => P[i]);
      return { kind: "bez", parts: offsetBezier(B, d, s) };
    }
    const C = P[k.ids[0]], r = dist(C, P[k.ids[1]]);
    // a CCW arc walked forwards bulges outward on a CCW loop; walked backwards, inward
    const out = (x.from === k.ids[1]) === (s > 0) ? 1 : -1;
    const R = r + out * d;
    if (R <= 1e-6) return null;
    return { kind: "arc", C, R, fwd: x.from === k.ids[1] };
  });
  if (pieces.some((p) => !p)) return `an arc in that outline is smaller than ${Math.abs(d)} mm: it would vanish`;
  // the corners: where piece i meets piece i+1, nearest the old corner
  const n = loop.length;
  const corner = [];
  for (let i = 0; i < n; i++) {
    const A = endOf(pieces[i], 1), B = endOf(pieces[(i + 1) % n], 0), old = P[loop[i].to];
    const hits = meet(A, B);
    if (!hits.length) return "an offset corner has no meeting point (the curves part); try a smaller distance";
    corner.push(hits.sort((p, q) => dist(p, old) - dist(q, old))[0]);
  }
  // a spline's ends go to its corners (each end's handle moving with it)
  pieces.forEach((pc, i) => {
    if (pc.kind !== "bez") return;
    const first = pc.parts[0], last = pc.parts[pc.parts.length - 1];
    const s0 = corner[(i + n - 1) % n], s1 = corner[i];
    const m0 = [s0[0] - first[0][0], s0[1] - first[0][1]], m1 = [s1[0] - last[3][0], s1[1] - last[3][1]];
    first[0] = s0; first[1] = [first[1][0] + m0[0], first[1][1] + m0[1]];
    last[3] = s1; last[2] = [last[2][0] + m1[0], last[2][1] + m1[1]];
  });
  // write it: the corners as points, lines between them, arcs about their
  // centres, splines as their fitted pieces
  const ids = corner.map((p) => pointAt(sk, p));
  for (let i = 0; i < n; i++) {
    const from = ids[(i + n - 1) % n], to = ids[i], pc = pieces[i];
    if (from === to) continue;
    if (pc.kind === "line") addLine(sk, P[from], P[to], { auto: true });
    else if (pc.kind === "bez") {
      let at = from;
      pc.parts.forEach((Q, j) => {
        const to2 = j === pc.parts.length - 1 ? to : pointAt(sk, Q[3]);
        sk.points.push([r6(Q[1][0]), r6(Q[1][1])], [r6(Q[2][0]), r6(Q[2][1])]);
        sk.curves.push({ kind: "bezier", ids: [at, sk.points.length - 2, sk.points.length - 1, to2], construction: false });
        at = to2;
      });
    } else {
      const ctr = pointAt(sk, pc.C);
      sk.curves.push({ kind: "arc", ids: pc.fwd ? [ctr, from, to] : [ctr, to, from], construction: false });
    }
  }
  return null;
}
// how close a fitted spline offset is kept to the true offset curve (mm)
export const OFFSET_FIT = 0.01;
// B offset by d to the side s (as a line's: right of its direction when s is 1),
// as cubic pieces: ends on the offset curve, end directions B's own, handle
// lengths by least squares; a piece further than OFFSET_FIT is split in two
function offsetBezier(B, d, s, depth = 0) {
  const off = (t) => { const p = bezAt(B, t), e = bezDir(B, t); return [p[0] + s * e[1] * d, p[1] - s * e[0] * d]; };
  const q0 = off(0), q3 = off(1), T0 = bezDir(B, 0), T1 = bezDir(B, 1);
  // Q(u) = (b0 + b1) q0 + b1 a T0 + (b2 + b3) q3 - b2 b T1: linear in a, b.
  // Each target point is fitted at a parameter u, first its t on B, then
  // (a few rounds) the u of the nearest point on the fit so far.
  const targets = Array.from({ length: 23 }, (_, i) => { const t = (i + 1) / 24; return { o: off(t), u: t }; });
  const chord = dist(q0, q3) / 3;
  let a = chord, b = chord, Q;
  const curve = () => [q0, [q0[0] + a * T0[0], q0[1] + a * T0[1]], [q3[0] - b * T1[0], q3[1] - b * T1[1]], q3];
  for (let round = 0; round < 5; round++) {
    let m11 = 0, m12 = 0, m22 = 0, r1 = 0, r2 = 0;
    for (const { o, u: t } of targets) {
      const u = 1 - t, b0 = u * u * u, b1 = 3 * u * u * t, b2 = 3 * u * t * t, b3 = t * t * t;
      const A = [(b0 + b1) * q0[0] + (b2 + b3) * q3[0] - o[0], (b0 + b1) * q0[1] + (b2 + b3) * q3[1] - o[1]];
      const g = [b1 * T0[0], b1 * T0[1]], h = [-b2 * T1[0], -b2 * T1[1]];
      m11 += g[0] * g[0] + g[1] * g[1]; m12 += g[0] * h[0] + g[1] * h[1]; m22 += h[0] * h[0] + h[1] * h[1];
      r1 -= g[0] * A[0] + g[1] * A[1]; r2 -= h[0] * A[0] + h[1] * A[1];
    }
    const det = m11 * m22 - m12 * m12;
    if (Math.abs(det) > 1e-12) { a = (r1 * m22 - r2 * m12) / det; b = (m11 * r2 - m12 * r1) / det; }
    Q = curve();
    for (const tg of targets) tg.u = bezNearest(Q, tg.o);
  }
  // how far it strays: each sample of Q to the nearest of the true offset
  const truth = Array.from({ length: 129 }, (_, i) => off(i / 128));
  const toSeg = (p, a, b) => {
    const e = [b[0] - a[0], b[1] - a[1]], L2 = e[0] ** 2 + e[1] ** 2;
    const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * e[0] + (p[1] - a[1]) * e[1]) / L2)) : 0;
    return dist(p, [a[0] + e[0] * t, a[1] + e[1] * t]);
  };
  const near = (p) => { let m = Infinity; for (let i = 0; i < 128; i++) m = Math.min(m, toSeg(p, truth[i], truth[i + 1])); return m; };
  const err = Math.max(...Array.from({ length: 33 }, (_, i) => near(bezAt(Q, i / 32))));
  if ((err <= OFFSET_FIT && a > 0 && b > 0) || depth >= 6) return [Q];
  return [...offsetBezier(bezPiece(B, 0, 0.5), d, s, depth + 1), ...offsetBezier(bezPiece(B, 0.5, 1), d, s, depth + 1)];
}
// a piece as its neighbour meets it at one end (0: start, 1: end): a spline's
// end as the line along its end direction, anything else as it is
function endOf(pc, side) {
  if (pc.kind !== "bez") return pc;
  const Q = side ? pc.parts[pc.parts.length - 1] : pc.parts[0];
  const o = side ? Q[3] : Q[0], e = bezDir(Q, side);
  // the line ends (side 1) or starts (side 0) on the spline's end, so a
  // smooth joint (parallel lines) meets where the two ends are
  return side ? { kind: "line", a: [o[0] - e[0], o[1] - e[1]], b: o } : { kind: "line", a: o, b: [o[0] + e[0], o[1] + e[1]] };
}
// where two offset pieces meet: line-line (as infinite lines), line-circle,
// circle-circle; a touch counts once
function meet(A, B) {
  if (A.kind === "line" && B.kind === "line") {
    const d1 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], d2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-9 * Math.hypot(...d1) * Math.hypot(...d2)) return dist(A.b, B.a) < TOUCH ? [A.b] : [];
    const t = ((B.a[0] - A.a[0]) * d2[1] - (B.a[1] - A.a[1]) * d2[0]) / den;
    return [[A.a[0] + d1[0] * t, A.a[1] + d1[1] * t]];
  }
  if (A.kind === "arc" && B.kind === "arc") {
    const D = dist(A.C, B.C);
    if (D < 1e-9) return [];
    const e = [(B.C[0] - A.C[0]) / D, (B.C[1] - A.C[1]) / D];
    const x = (D * D + A.R * A.R - B.R * B.R) / (2 * D), y2 = A.R * A.R - x * x;
    if (y2 < -TOUCH) return [];
    const y = Math.sqrt(Math.max(0, y2)), m = [A.C[0] + e[0] * x, A.C[1] + e[1] * x];
    return [[m[0] - e[1] * y, m[1] + e[0] * y], [m[0] + e[1] * y, m[1] - e[0] * y]];
  }
  const [L, R] = A.kind === "line" ? [A, B] : [B, A];
  const dd = [L.b[0] - L.a[0], L.b[1] - L.a[1]], L2 = dd[0] ** 2 + dd[1] ** 2;
  const t0 = ((R.C[0] - L.a[0]) * dd[0] + (R.C[1] - L.a[1]) * dd[1]) / L2;
  const foot = [L.a[0] + dd[0] * t0, L.a[1] + dd[1] * t0], h = dist(foot, R.C);
  if (h > R.R + TOUCH) return [];
  const k = Math.sqrt(Math.max(0, R.R * R.R - h * h)) / Math.sqrt(L2);
  return [t0 - k, t0 + k].map((t) => [L.a[0] + dd[0] * t, L.a[1] + dd[1] * t]);
}
// the closed chain of curves through ci: [{ ci, from, to }] in order, or null
function loopOf(sk, ci) {
  const ends = (c) => (c.kind === "line" ? c.ids : c.kind === "arc" ? [c.ids[1], c.ids[2]] : c.kind === "bezier" ? [c.ids[0], c.ids[3]] : null);
  const first = sk.curves[ci];
  const e0 = ends(first);
  if (!e0) return null;
  const out = [{ ci, from: e0[0], to: e0[1] }];
  const used = new Set([ci]);
  let cur = e0[1];
  for (let guard = 0; guard < sk.curves.length && cur !== e0[0]; guard++) {
    const j = sk.curves.findIndex((c, k) => !used.has(k) && !c.construction && ends(c) && ends(c).includes(cur));
    if (j < 0) return null;
    used.add(j);
    const e = ends(sk.curves[j]);
    const to = e[0] === cur ? e[1] : e[0];
    out.push({ ci: j, from: cur, to });
    cur = to;
  }
  return cur === e0[0] ? out : null;
}

// --------------------------------------------------------- code <-> sketch
// toSpec(sk) -> the object sketch() takes (dims by value)
export function toSpec(sk) {
  return {
    on: sk.on,
    points: sk.points,
    curves: sk.curves.map(curveArr),
    constraints: sk.constraints.map((c) => [c.type, ...c.ids]),
    dims: sk.dims.map((d) => [d.type, ...d.ids, d.value]),
    ...(sk.skip?.length ? { skip: sk.skip } : {}),
  };
}
const curveArr = (c) => [c.kind, ...c.ids, ...(c.kind === "circle" ? [c.r] : []), ...(c.construction ? ["construction"] : [])];

// compact(sk): drop points no curve or rule uses, renumbering the rest
export function compact(sk) {
  const keep = new Set();
  for (const c of sk.curves) c.ids.forEach((i) => keep.add(i));
  // a tangent's own touch point is on no curve, but the rule needs it
  for (const c of sk.constraints) {
    const own = ownPoint(c);
    if (own != null && c.ids.filter((i) => i !== own).every((i) => keep.has(i))) keep.add(own);
  }
  // a fillet's virtual sharp: the old corner, on no curve, held on both lines'
  // runs (and whatever rules and dims were on it); kept while those lines are
  for (const c of sk.constraints) if (c.type === "onLine" && keep.has(c.ids[0]) && keep.has(c.ids[1])) keep.add(c.ids[2]);
  const map = new Map();
  const points = [];
  sk.points.forEach((p, i) => { if (keep.has(i)) { map.set(i, points.length); points.push(p); } });
  const m = (ids) => ids.map((i) => map.get(i));
  return {
    on: sk.on, ...(sk.onSrc ? { onSrc: sk.onSrc } : {}), points,
    curves: sk.curves.map((c) => ({ ...c, ids: m(c.ids) })),
    constraints: sk.constraints.filter((c) => c.ids.every((i) => map.has(i))).map((c) => ({ ...c, ids: m(c.ids) })),
    dims: sk.dims.filter((d) => d.ids.every((i) => map.has(i))).map((d) => ({ ...d, ids: m(d.ids) })),
    ...(sk.skip?.length ? { skip: sk.skip } : {}),
  };
}

const num = (v) => String(r3(v));
const onText = (on) => (typeof on === "string" ? JSON.stringify(on)
  : `{ origin: [${on.origin.map(num).join(", ")}], normal: [${on.normal.map((v) => String(Math.round(v * 1e4) / 1e4)).join(", ")}]${on.x ? `, x: [${on.x.map((v) => String(Math.round(v * 1e4) / 1e4)).join(", ")}]` : ""} }`);
// sketchCode(sk, indent) -> `sketch({ … })`, one key per line
export function sketchCode(skIn, indent = "") {
  const sk = compact(skIn);
  const i1 = indent + "  ";
  const list = (items) => `[${items.join(", ")}]`;
  // a name read from the code goes back as that name while its value is untouched
  const coord = (p, k) => (p.names?.[k] && p[k] === p.read[k] ? p.names[k] : num(p[k]));
  const curve = (c) => {
    const a = curveArr(c).map((v) => (typeof v === "string" ? JSON.stringify(v) : num(v)));
    if (c.kind === "circle" && c.rName && c.r === c.rRead) a[2] = c.rName;
    return `[${a.join(", ")}]`;
  };
  const lines = [`on: ${sk.onSrc ?? onText(sk.on)}`, `points: ${list(sk.points.map((p) => `[${coord(p, 0)}, ${coord(p, 1)}]`))}`,
    `curves: ${list(sk.curves.map(curve))}`];
  if (sk.constraints.length) lines.push(`constraints: ${list(sk.constraints.map((c) => `[${[JSON.stringify(c.type), ...c.ids].join(", ")}]`))}`);
  if (sk.dims.length) lines.push(`dims: ${list(sk.dims.map((d) => `[${[JSON.stringify(d.type), ...d.ids, d.name ?? num(d.value)].join(", ")}]`))}`);
  if (sk.skip?.length) lines.push(`skip: ${list(sk.skip.map((p) => `[${num(p[0])}, ${num(p[1])}]`))}`);
  return `sketch({\n${lines.map((l) => i1 + l + ",").join("\n")}\n${indent}})`;
}

// readSketch(text, call) -> sk, read from a sketch({ … }) call's source (a
// codemap call: { start, end }). A dim or radius written as a name takes the
// value of that top-level const and keeps the name.
export function readSketch(text, call) {
  const src = text.slice(call.start, call.end);
  const ast = Parser.parseExpressionAt(src, 0, { ecmaVersion: "latest" });
  const consts = constValues(text);
  const obj = ast.arguments?.[0];
  if (!obj || obj.type !== "ObjectExpression") throw new Error("sketch() takes one { … } object");
  const prop = (k) => obj.properties.find((p) => (p.key?.name ?? p.key?.value) === k)?.value ?? null;
  const val = (n) => {
    if (!n) return undefined;
    if (n.type === "Literal") return n.value;
    if (n.type === "UnaryExpression" && n.operator === "-") return -val(n.argument);
    if (n.type === "ArrayExpression") return n.elements.map(val);
    if (n.type === "ObjectExpression") return Object.fromEntries(n.properties.map((p) => [p.key.name ?? p.key.value, val(p.value)]));
    if (n.type === "Identifier") return { name: n.name, value: consts.get(n.name) };
    // a formula of parameters (`width / 2`): kept as written, its value worked out
    if (n.type === "BinaryExpression" || n.type === "CallExpression" || n.type === "MemberExpression" || n.type === "UnaryExpression") {
      const v = evalFormula(src.slice(n.start, n.end), consts);
      return typeof v === "number" ? { name: src.slice(n.start, n.end), value: v } : undefined;
    }
    return undefined;
  };
  const named = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : { value: v });
  const on = val(prop("on")) ?? "XY";
  // a plane written as a name or an expression is drawn on XY here but goes
  // back exactly as written, so finishing the sketch never moves it
  const onNode = prop("on");
  const literal = (n) => n && (n.type === "Literal" || (n.type === "UnaryExpression" && n.argument.type === "Literal")
    || (n.type === "ArrayExpression" && n.elements.every(literal))
    || (n.type === "ObjectExpression" && n.properties.every((p) => !p.computed && literal(p.value))));
  const onSrc = onNode && !literal(onNode) ? src.slice(onNode.start, onNode.end) : null;
  const points = (val(prop("points")) || []).map((p) => {
    const q = p.map((v) => named(v).value);
    if (p.some((v) => named(v).name)) { q.names = p.map((v) => named(v).name ?? null); q.read = [...q]; }
    return q;
  });
  const curves = (val(prop("curves")) || []).map((c) => {
    const construction = c[c.length - 1] === "construction";
    const args = construction ? c.slice(1, -1) : c.slice(1);
    if (c[0] === "circle") return { kind: "circle", ids: [args[0]], r: named(args[1]).value, rName: named(args[1]).name, rRead: named(args[1]).value, construction };
    return { kind: c[0], ids: args, construction };
  });
  const constraints = (val(prop("constraints")) || []).map((c) => ({ type: c[0], ids: c.slice(1) }));
  const dims = (val(prop("dims")) || []).map((d) => {
    const v = named(d[d.length - 1]);
    return { type: d[0], ids: d.slice(1, -1), value: v.value, ...(v.name ? { name: v.name } : {}) };
  });
  const skip = (val(prop("skip")) || []).map((p) => p.map((v) => named(v).value));
  return { on: onSrc ? "XY" : on, ...(onSrc ? { onSrc } : {}), points, curves, constraints, dims, ...(skip.length ? { skip } : {}) };
}
// returnBare(text) -> the text with its bare final expression (the editor's
// no-return form, e.g. the starter model) made a `return`, or null when the
// code already returns or ends in no expression
export function returnBare(text) {
  let ast;
  try { ast = Parser.parse(text, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true }); } catch { return null; }
  if (ast.body.some((st) => st.type === "ReturnStatement")) return null;
  const last = ast.body[ast.body.length - 1];
  if (last?.type !== "ExpressionStatement") return null;
  return text.slice(0, last.start) + "return " + text.slice(last.start);
}
function constValues(text) {
  return new Map(readParams(text).map((p) => [p.name, p.value]));
}

// promote(text, sk, dimIndex, name) -> { text, sk }: the dim becomes a named
// const param at the top of the code (a slider) and the sketch refers to it.
export function promoteDim(text, sk, k, name) {
  const d = sk.dims[k];
  if (!d) return null;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return { error: "a name is letters, digits and _ (not starting with a digit)" };
  if (new RegExp(`(^|\\n)\\s*(const|let|var)\\s+${name}\\b`).test(text)) return { error: `there is already a ${name}` };
  d.name = name;
  return { text: `const ${name} = ${num(d.value)};\n` + text, sk };
}

// ------------------------------------------------- inference while drawing
// Fusion's sketch inference: where a click lands, and the rule it brings.
// inferPoint(sk, uv, tol, opts) looks, in order, for an existing point (an
// end or a centre), a line's midpoint, a crossing of two curves, a point on
// one curve, then lines up with an existing point across or down (a guide,
// no rule), then the grid. tol is in mm (the sketcher passes its snap radius
// in pixels times mm per pixel). opts: { free: true } (Alt: no snapping but
// existing points), grid (mm), skip (point ids the curve being drawn already
// owns, so a line's end does not snap onto its own start).
//   -> { uv, point?, mid?, on: [ci…], label, guides: [[from, to]…] }
export function inferPoint(sk, uv, tol, { free = false, grid = 1, skip = [] } = {}) {
  const near = nearestPoint(sk, uv, tol);
  if (near >= 0 && !skip.includes(near)) {
    const centre = sk.curves.some((c) => (c.kind === "circle" || c.kind === "arc") && c.ids[0] === near);
    return { uv: [...sk.points[near]], point: near, on: [], label: centre ? "Centre" : "Point", guides: [] };
  }
  if (free) return { uv: [...uv], on: [], label: "", guides: [] };
  const P = sk.points;
  // a line's midpoint
  for (let ci = 0; ci < sk.curves.length; ci++) {
    const c = sk.curves[ci];
    if (c.kind !== "line") continue;
    const [a, b] = c.ids.map((k) => P[k]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (dist(m, uv) <= tol) return { uv: m, mid: ci, on: [], label: "Midpoint", guides: [] };
  }
  // where uv lands on each curve (lines and round curves; a spline is skipped)
  const hits = [];
  sk.curves.forEach((c, ci) => {
    const q = nearestOn(sk, c, uv);
    if (q && dist(q, uv) <= tol) hits.push({ ci, q });
  });
  // a crossing of two of them
  for (let i = 0; i < hits.length; i++) {
    for (let j = i + 1; j < hits.length; j++) {
      const x = crossings(sk, hits[i].ci, hits[j].ci).filter((xy) => dist(xy, uv) <= tol)
        .sort((u, v) => dist(u, uv) - dist(v, uv))[0];
      if (x) return { uv: x, on: [hits[i].ci, hits[j].ci], label: "Intersection", guides: [] };
    }
  }
  if (hits.length) {
    const h = hits.sort((u, v) => dist(u.q, uv) - dist(v.q, uv))[0];
    return { uv: h.q, on: [h.ci], label: sk.curves[h.ci].kind === "line" ? "On line" : `On ${sk.curves[h.ci].kind}`, guides: [] };
  }
  // in line with a point already there, across or down: a dotted guide
  const out = [Math.round(uv[0] / grid) * grid, Math.round(uv[1] / grid) * grid];
  const guides = [];
  const used = new Set(sk.curves.flatMap((c) => (c.kind === "bezier" ? [c.ids[0], c.ids[3]] : c.ids)));
  for (const k of [0, 1]) {
    let best = -1, bd = tol;
    for (const i of used) { const d = Math.abs(P[i][k] - uv[k]); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) { out[k] = P[best][k]; guides.push({ from: best, axis: k }); }
  }
  return { uv: out, on: [], label: guides.length === 2 ? "Aligned" : "", guides: guides.map(({ from }) => [[...P[from]], out]) };
}
// the nearest point of curve c to xy (a line's segment, a circle, an arc's
// span), or null for a spline
function nearestOn(sk, c, xy) {
  const P = sk.points;
  if (c.kind === "line") {
    const [a, b] = c.ids.map((k) => P[k]), d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] ** 2 + d[1] ** 2;
    if (L2 < 1e-12) return null;
    const t = Math.max(0, Math.min(1, ((xy[0] - a[0]) * d[0] + (xy[1] - a[1]) * d[1]) / L2));
    return [a[0] + d[0] * t, a[1] + d[1] * t];
  }
  if (c.kind === "circle" || c.kind === "arc") {
    const C = P[c.ids[0]], r = roundR(sk, c), l = dist(C, xy);
    if (l < 1e-9) return null;
    const q = [C[0] + (xy[0] - C[0]) / l * r, C[1] + (xy[1] - C[1]) / l * r];
    return onSpan(sk, c, q) ? q : null;
  }
  return null;
}
// where curves i and j cross (lines and round curves)
function crossings(sk, i, j) {
  const A = sk.curves[i], B = sk.curves[j], P = sk.points;
  const round = (c) => c.kind === "circle" || c.kind === "arc";
  if (A.kind === "line" && B.kind === "line") {
    const [p, q] = A.ids.map((k) => P[k]), [r, s] = B.ids.map((k) => P[k]);
    const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [s[0] - r[0], s[1] - r[1]], den = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(den) < 1e-12) return [];
    const t = ((r[0] - p[0]) * d2[1] - (r[1] - p[1]) * d2[0]) / den, u = ((r[0] - p[0]) * d1[1] - (r[1] - p[1]) * d1[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [[p[0] + d1[0] * t, p[1] + d1[1] * t]] : [];
  }
  if (A.kind === "line" && round(B)) return segRound(sk, P[A.ids[0]], P[A.ids[1]], B);
  if (round(A) && B.kind === "line") return segRound(sk, P[B.ids[0]], P[B.ids[1]], A);
  if (round(A) && round(B)) return roundRound(sk, A, B);
  return [];
}
// The rules a point drawn at an inferred spot keeps: on the line or curve it
// landed on, at the line's midpoint. (An existing point is simply reused, and
// a guide brings no rule: lining up while drawing is not a promise.)
export function applyInferred(sk, i, inf) {
  if (!inf || i < 0) return;
  if (inf.mid != null) {
    const c = sk.curves[inf.mid];
    if (c && !c.ids.includes(i)) addConstraint(sk, "midpoint", [...c.ids, i]);
  }
  for (const ci of inf.on ?? []) {
    const c = sk.curves[ci];
    if (!c || c.ids.includes(i)) continue;
    if (c.kind === "line") addConstraint(sk, "onLine", [...c.ids, i]);
    else if (c.kind === "circle" || c.kind === "arc") addConstraint(sk, "onCurve", [c.ids[0], i]);
  }
}
// After a line is drawn on from the end of another (a chain): square to it
// within 3° (and neither already level or plumb) makes it Perpendicular.
// After an arc is drawn from a line's end: running on along the line within
// 3° makes it Tangent. Returns the rule's name, or null.
export function inferJoin(sk, ci) {
  const c = sk.curves[ci], P = sk.points;
  if (!c) return null;
  const hv = (ids) => sk.constraints.some((k) => (k.type === "horizontal" || k.type === "vertical") && SAME([...k.ids].sort(), [...ids].sort()));
  const deg = (u, v) => Math.acos(Math.min(1, Math.abs(u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v) || 1))) * 180 / Math.PI;
  const vec = (a, b) => [P[b][0] - P[a][0], P[b][1] - P[a][1]];
  if (c.kind === "line") {
    for (const end of c.ids) {
      const prev = sk.curves.find((o, j) => j !== ci && o.kind === "line" && o.ids.includes(end));
      if (!prev || hv(c.ids) || hv(prev.ids)) continue;
      if (Math.abs(deg(vec(...c.ids), vec(...prev.ids)) - 90) < 3) {
        addConstraint(sk, "perpendicular", [...prev.ids, ...c.ids]);
        return "Perpendicular";
      }
    }
  }
  if (c.kind === "arc") {
    for (const end of c.ids.slice(1)) {
      const line = sk.curves.find((o) => o.kind === "line" && o.ids.includes(end));
      if (!line) continue;
      if (Math.abs(deg(vec(c.ids[0], end), vec(...line.ids)) - 90) < 3) {
        constrain(sk, "tangent", [{ curve: sk.curves.indexOf(line) }, { curve: ci }]);
        return "Tangent";
      }
    }
  }
  return null;
}

// ------------------------------------------------------ more drawing tools
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const unit = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l]; };
const endsOfCurve = (c) => (c.kind === "line" ? c.ids : c.kind === "arc" ? c.ids.slice(1) : c.kind === "bezier" ? [c.ids[0], c.ids[3]] : []);

// Fillet a sharp corner where two lines meet (Fusion's sketch fillet): both
// lines are cut back to where an arc of radius r touches them, and the arc
// goes in, tangent to each. The corner point stays as Fusion's "virtual
// sharp", held on both lines' runs, so rules and dims on it still hold.
export function filletCorner(sk, V, r) {
  const lines = sk.curves.map((c, i) => [c, i]).filter(([c]) => c.kind === "line" && !c.construction && c.ids.includes(V));
  if (lines.length !== 2) return "pick a corner where exactly two lines meet";
  if (!(r > 0)) return "the radius must be more than 0";
  const P = sk.points, other = lines.map(([c]) => (c.ids[0] === V ? c.ids[1] : c.ids[0]));
  const u = other.map((k) => unit(sub(P[k], P[V])));
  const cos = Math.max(-1, Math.min(1, u[0][0] * u[1][0] + u[0][1] * u[1][1])), th = Math.acos(cos);
  if (th < 1e-3 || Math.PI - th < 1e-3) return "those two lines run straight on: there is no corner to round";
  const d = r / Math.tan(th / 2);
  if (other.some((k) => dist(P[k], P[V]) <= d + 1e-6)) return `a ${r} mm round does not fit: the lines are too short`;
  const T = u.map((w) => [r6(P[V][0] + w[0] * d), r6(P[V][1] + w[1] * d)]);
  const bis = unit([u[0][0] + u[1][0], u[0][1] + u[1][1]]), h = r / Math.sin(th / 2);
  const C = [r6(P[V][0] + bis[0] * h), r6(P[V][1] + bis[1] * h)];
  const ti = T.map((t) => { sk.points.push(t); return sk.points.length - 1; });
  sk.points.push(C);
  const ci = sk.points.length - 1;
  lines.forEach(([c], k) => {
    const was = [...c.ids];
    c.ids = c.ids.map((id) => (id === V ? ti[k] : id));
    // a tangent already on this line (a round at its other end) names the
    // line by its ends: it follows the line to its new end
    for (const t of sk.constraints) {
      if (t.type === "tangent" && SAME([t.ids[0], t.ids[1]].sort(), [...was].sort())) t.ids = [...c.ids, t.ids[2], t.ids[3]];
    }
  });
  // counter-clockwise from one touch to the other, the short way round the corner
  const ang = (p) => Math.atan2(p[1] - C[1], p[0] - C[0]);
  const [s, e] = wrap(ang(T[1]) - ang(T[0])) < Math.PI ? [0, 1] : [1, 0];
  sk.curves.push({ kind: "arc", ids: [ci, ti[s], ti[e]], construction: false });
  const arc = sk.curves.length - 1;
  lines.forEach(([c], k) => {
    addConstraint(sk, "onLine", [...c.ids, V]);
    addConstraint(sk, "tangent", [c.ids[0], c.ids[1], ci, ti[k]]);
  });
  pushDim(sk, "distance", [ci, ti[s]], r);
  return { arc };
}
// a corner near xy (within tol): a point two lines end on
export function cornerNear(sk, xy, tol) {
  let best = -1, bd = tol;
  sk.points.forEach((p, i) => {
    const n = sk.curves.filter((c) => c.kind === "line" && !c.construction && c.ids.includes(i)).length;
    const d = dist(p, xy);
    if (n === 2 && d < bd) { bd = d; best = i; }
  });
  return best;
}

// A slot (Fusion's centre-to-centre slot): two centres, the half width r.
// Two half circles and two straight sides, each side tangent to both ends,
// the ends the same radius.
export function addSlot(sk, p1, p2, r) {
  const L = dist(p1, p2);
  if (L < 1e-6 || !(r > 0)) return [];
  const u = unit(sub(p2, p1)), n = [-u[1], u[0]];
  const at = (p, s) => [p[0] + n[0] * r * s, p[1] + n[1] * r * s];
  const c1 = pointAt(sk, p1), c2 = pointAt(sk, p2);
  const [a1, a2, b1, b2] = [at(p1, 1), at(p2, 1), at(p1, -1), at(p2, -1)].map((p) => pointAt(sk, p));
  const out = [];
  const push = (c) => { sk.curves.push({ ...c, construction: false }); out.push(sk.curves.length - 1); };
  push({ kind: "line", ids: [a1, a2] });
  push({ kind: "arc", ids: [c2, b2, a2] });
  push({ kind: "line", ids: [b2, b1] });
  push({ kind: "arc", ids: [c1, a1, b1] });
  addConstraint(sk, "tangent", [a1, a2, c1, a1]);
  addConstraint(sk, "tangent", [a1, a2, c2, a2]);
  addConstraint(sk, "tangent", [b2, b1, c2, b2]);
  addConstraint(sk, "tangent", [b2, b1, c1, b1]);
  addConstraint(sk, "equal", [c1, a1, c2, a2]);
  // drawn level or plumb: kept so
  const ang = Math.abs(Math.atan2(u[1], u[0]) * 180 / Math.PI) % 180;
  if (ang < 3 || ang > 177) addConstraint(sk, "horizontal", [c1, c2]);
  else if (Math.abs(ang - 90) < 3) addConstraint(sk, "vertical", [c1, c2]);
  return out;
}

// A regular polygon with n sides, its corners on a construction circle
// (inscribed), the first corner where the second click was. Equal sides
// and the corners on the circle keep it regular when it is dragged.
export function addPolygon(sk, centre, corner, n) {
  n = Math.round(n);
  const r = dist(centre, corner);
  if (n < 3 || n > 64 || r < 1e-6) return [];
  const circ = addCircle(sk, centre, r);
  sk.curves[circ].construction = true;
  const a0 = Math.atan2(corner[1] - centre[1], corner[0] - centre[0]);
  const ids = Array.from({ length: n }, (_, k) => pointAt(sk, [centre[0] + r * Math.cos(a0 + (k * TAU) / n), centre[1] + r * Math.sin(a0 + (k * TAU) / n)]));
  const out = [];
  for (let k = 0; k < n; k++) {
    sk.curves.push({ kind: "line", ids: [ids[k], ids[(k + 1) % n]], construction: false });
    out.push(sk.curves.length - 1);
    addConstraint(sk, "onCurve", [sk.curves[circ].ids[0], ids[k]]);
    if (k) addConstraint(sk, "equal", [ids[0], ids[1], ids[k], ids[(k + 1) % n]]);
  }
  return out;
}

// A rectangle from its centre (Fusion's centre rectangle): the corners, a
// construction diagonal and the centre held at its midpoint.
export function addCenterRect(sk, centre, corner) {
  const dx = corner[0] - centre[0], dy = corner[1] - centre[1];
  if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return [];
  const out = addRect(sk, [centre[0] - dx, centre[1] - dy], [centre[0] + dx, centre[1] + dy]);
  const a = sk.curves[out[0]].ids[0], c = sk.curves[out[2]].ids[0];
  sk.curves.push({ kind: "line", ids: [a, c], construction: true });
  addConstraint(sk, "midpoint", [a, c, pointAt(sk, centre)]);
  return out;
}

// An arc through three clicks: its two ends, then a point it passes through.
export function addArc3(sk, start, end, through) {
  const [ax, ay] = start, [bx, by] = end, [cx, cy] = through;
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-9) return -1;        // in a straight line: no circle through them
  const s = (p) => p[0] * p[0] + p[1] * p[1];
  const C = [(s(start) * (by - cy) + s(end) * (cy - ay) + s(through) * (ay - by)) / D,
    (s(start) * (cx - bx) + s(end) * (ax - cx) + s(through) * (bx - ax)) / D];
  // counter-clockwise from start to end passes `through`, or else end to start
  const ang = (p) => Math.atan2(p[1] - C[1], p[0] - C[0]);
  const ccw = wrap(ang(through) - ang(start)) < wrap(ang(end) - ang(start));
  return ccw ? addArc(sk, C, start, end) : addArc(sk, C, end, start);
}

// An arc that runs on smoothly from the end of a line or arc (the point at
// index `from`) to `end`, made Tangent to it.
export function addTangentArc(sk, from, end) {
  const P = sk.points, S = P[from];
  const prev = sk.curves.map((c, i) => [c, i]).find(([c]) => !c.construction && (c.kind === "line" || c.kind === "arc") && endsOfCurve(c).includes(from));
  if (!prev) return { error: "start a tangent arc on the end of a line or arc" };
  const [c] = prev;
  // the way the curve was heading as it arrived at `from`
  let t;
  if (c.kind === "line") t = unit(sub(S, P[c.ids[0] === from ? c.ids[1] : c.ids[0]]));
  else { const rad = unit(sub(S, P[c.ids[0]])); t = c.ids[2] === from ? [-rad[1], rad[0]] : [rad[1], -rad[0]]; }
  const n = [-t[1], t[0]], w = sub(end, S), den = 2 * (w[0] * n[0] + w[1] * n[1]);
  if (Math.abs(den) < 1e-9) return { error: "that end is straight on from the line: draw a line there" };
  const k = (w[0] ** 2 + w[1] ** 2) / den, C = [S[0] + n[0] * k, S[1] + n[1] * k];
  // turning left (k > 0) runs counter-clockwise from the start
  const ci = k > 0 ? addArc(sk, C, S, end) : addArc(sk, C, end, S);
  if (ci < 0) return { error: "that arc has no length" };
  const arc = sk.curves[ci];
  constrain(sk, "tangent", [{ curve: prev[1] }, { curve: ci }]);
  return { arc: ci, end: arc.ids[k > 0 ? 2 : 1] };
}

// Mirror curves across a line (Fusion's sketch mirror): copies, each point
// held symmetric to its original. Points on the mirror line are shared.
export function mirrorCurves(sk, cis, axisCi) {
  const ax = sk.curves[axisCi];
  if (!ax || ax.kind !== "line") return "pick the curves to mirror, then the line to mirror across";
  const list = cis.filter((ci) => ci !== axisCi && sk.curves[ci]);
  if (!list.length) return "pick the curves to mirror as well as the line";
  const [a, b] = ax.ids, P = sk.points, A = P[a], d = sub(P[b], A), L2 = d[0] ** 2 + d[1] ** 2;
  const mirror = (q) => { const t = ((q[0] - A[0]) * d[0] + (q[1] - A[1]) * d[1]) / L2, f = [A[0] + d[0] * t, A[1] + d[1] * t]; return [2 * f[0] - q[0], 2 * f[1] - q[1]]; };
  const map = new Map();
  const image = (i) => {
    if (map.has(i)) return map.get(i);
    const m = mirror(P[i]);
    let j;
    if (dist(m, P[i]) < 1e-6) j = i;                 // on the mirror line: the same point
    else {
      sk.points.push([r6(m[0]), r6(m[1])]);
      j = sk.points.length - 1;
      sk.points.push([r6((P[i][0] + m[0]) / 2), r6((P[i][1] + m[1]) / 2)]);
      addConstraint(sk, "symmetric", [i, j, a, b, sk.points.length - 1]);
    }
    map.set(i, j);
    return j;
  };
  const out = [];
  for (const ci of list) {
    const c = sk.curves[ci];
    let ids = c.ids.map(image);
    if (c.kind === "arc") ids = [ids[0], ids[2], ids[1]];   // a mirror turns it the other way round
    sk.curves.push({ ...c, ids });
    out.push(sk.curves.length - 1);
  }
  return { curves: out };
}

// Copies of curves around a centre (circular, n in all, the originals
// included) or along a step (linear). Copies are plain curves: a pattern
// is not kept as a rule, so change the original before patterning.
export function patternCurves(sk, cis, { kind = "circular", centre = [0, 0], n = 6, step = [10, 0] } = {}) {
  n = Math.round(n);
  if (n < 2 || n > 200) return "the count is 2 to 200";
  const list = cis.filter((ci) => sk.curves[ci]);
  if (!list.length) return "pick the curves to copy first";
  const out = [];
  for (let k = 1; k < n; k++) {
    const map = new Map();
    const move = kind === "circular"
      ? (p) => { const a = (k * TAU) / n, c = Math.cos(a), s = Math.sin(a), x = p[0] - centre[0], y = p[1] - centre[1]; return [centre[0] + x * c - y * s, centre[1] + x * s + y * c]; }
      : (p) => [p[0] + step[0] * k, p[1] + step[1] * k];
    const image = (i) => {
      if (!map.has(i)) {
        const m = move(sk.points[i]);
        map.set(i, kind === "circular" && dist(m, sk.points[i]) < 1e-6 ? i : pointAt(sk, m));
      }
      return map.get(i);
    };
    for (const ci of list) {
      const c = sk.curves[ci];
      sk.curves.push({ ...c, ids: c.ids.map(image) });
      out.push(sk.curves.length - 1);
    }
  }
  return { curves: out };
}

// Project: model edges that lie in the sketch plane, as construction lines
// held fixed (Fusion's Project), so new curves can snap and line up to the
// part. segs: [[[u, v], [u, v]]…] in plane coordinates. Curved edges arrive
// as their facets' short lines. Returns how many lines were added.
export function projectSegments(sk, segs) {
  let n = 0;
  for (const [a, b] of segs) {
    if (dist(a, b) < 1e-4) continue;
    const i = pointAt(sk, a, 1e-4), j = pointAt(sk, b, 1e-4);
    if (i === j || sk.curves.some((c) => c.kind === "line" && SAME([...c.ids].sort(), [i, j].sort()))) continue;
    sk.curves.push({ kind: "line", ids: [i, j], construction: true });
    addConstraint(sk, "fixed", [i]);
    addConstraint(sk, "fixed", [j]);
    n++;
  }
  return n;
}

// A construction plane (Fusion's Offset Plane / Plane at Angle): `on` moved
// d mm along its normal and tilted `tilt` degrees about its own x axis.
// Nothing changed: `on` as it was ("XY" stays "XY").
export function offsetPlane(on, d = 0, tilt = 0) {
  if (!d && !tilt) return on;
  const f = planeFrame(on), a = (tilt * Math.PI) / 180;
  const n = f.n.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.y, -Math.sin(a));
  const o = f.origin.clone().addScaledVector(f.n, d);
  const k = (v) => [v.x, v.y, v.z].map((x) => { const r = Math.round(x * 1e4) / 1e4; return Object.is(r, -0) ? 0 : r; });
  return { origin: k(o), normal: k(n), x: k(f.x) };
}
