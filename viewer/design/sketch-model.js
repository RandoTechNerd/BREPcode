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
import { solveSketch2D, sketch as dslSketch } from "../../src/dsl.js";

export const TOOLS = ["line", "rect", "circle", "arc", "spline", "trim", "offset", "construction"];
export const CONSTRAINTS = ["coincident", "horizontal", "vertical", "parallel", "perpendicular", "tangent", "equal", "fixed"];

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
// end is put on the circle)
export function addArc(sk, center, start, end) {
  const r = dist(center, start);
  const a = Math.atan2(end[1] - center[1], end[0] - center[0]);
  const e = [center[0] + r * Math.cos(a), center[1] + r * Math.sin(a)];
  const ids = [pointAt(sk, center), pointAt(sk, start), pointAt(sk, e)];
  if (ids[1] === ids[2]) return -1;
  sk.curves.push({ kind: "arc", ids, construction: false });
  return sk.curves.length - 1;
}
// through the clicked points: one cubic Bezier per stretch (Catmull-Rom), the
// control points kept as construction-free inner points of each Bezier
export function addSpline(sk, through) {
  if (through.length < 2) return [];
  const P = through;
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
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
  sk.constraints = sk.constraints.filter((k) => !k.ids.some((i) => gone.has(i)));
  sk.dims = sk.dims.filter((k) => !k.ids.some((i) => gone.has(i)));
}

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
      return "pick two points, or a point and a line";
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
      if (lines.length !== 1 || round.length !== 1) return "pick a line and an arc or circle";
      const [a, b] = lines[0].ids, arc = round[0];
      // the arc end the line shares (or the end nearest the line)
      const touch = arc.kind === "arc" ? (arc.ids.slice(1).find((p) => p === a || p === b) ?? arc.ids[1]) : null;
      if (touch == null) return "a circle touches a line at no point of its own: draw an arc from the line's end";
      return addConstraint(sk, "tangent", [a, b, arc.ids[0], touch]), null;
    }
    case "fixed":
      if (points.length) { for (const p of points) addConstraint(sk, "fixed", [p]); return null; }
      return "pick points to fix";
    default: return `no constraint "${type}"`;
  }
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
  sk.points = solved.map(([x, y]) => [r6(x), r6(y)]);
  return sk;
}
// Does it make a profile? null, or why not (sketch()'s own message).
export function profileProblem(sk) {
  try { dslSketch(toSpec(sk)); return null; } catch (e) { return String(e.message || e).replace(/^sketch\(\):\s*/, ""); }
}

// ------------------------------------------------------------ trim, offset
// segment-segment intersections of a line with every other curve, as the
// line's parameter t (0..1)
function lineHits(sk, ci) {
  const c = sk.curves[ci];
  const [a, b] = c.ids.map((k) => sk.points[k]);
  const d = [b[0] - a[0], b[1] - a[1]];
  const ts = [];
  sk.curves.forEach((o, j) => {
    if (j === ci || o.construction) return;
    if (o.kind === "line") {
      const [p, q] = o.ids.map((k) => sk.points[k]);
      const e = [q[0] - p[0], q[1] - p[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-12) return;
      const t = ((p[0] - a[0]) * e[1] - (p[1] - a[1]) * e[0]) / den;
      const s = ((p[0] - a[0]) * d[1] - (p[1] - a[1]) * d[0]) / den;
      if (t > 1e-6 && t < 1 - 1e-6 && s >= -1e-9 && s <= 1 + 1e-9) ts.push(t);
    } else if (o.kind === "circle" || o.kind === "arc") {
      const cpt = sk.points[o.ids[0]];
      const r = o.kind === "circle" ? o.r : dist(cpt, sk.points[o.ids[1]]);
      const f = [a[0] - cpt[0], a[1] - cpt[1]];
      const A = d[0] ** 2 + d[1] ** 2, B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] ** 2 + f[1] ** 2 - r * r;
      const disc = B * B - 4 * A * C;
      if (disc < 0) return;
      for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) {
        if (t > 1e-6 && t < 1 - 1e-6) ts.push(t);
      }
    }
  });
  return ts.sort((x, y) => x - y);
}
// trim(sk, ci, at): cut away the piece of line ci around the point `at`
// (between its neighbouring crossings); a line with no crossing is deleted.
export function trim(sk, ci, at) {
  const c = sk.curves[ci];
  if (!c) return "nothing there";
  if (c.kind !== "line") { removeCurve(sk, ci); return null; }
  const [a, b] = c.ids.map((k) => sk.points[k]);
  const d = [b[0] - a[0], b[1] - a[1]];
  const L2 = d[0] ** 2 + d[1] ** 2;
  const t0 = ((at[0] - a[0]) * d[0] + (at[1] - a[1]) * d[1]) / L2;
  const ts = lineHits(sk, ci);
  if (!ts.length) { removeCurve(sk, ci); return null; }
  const lo = Math.max(0, ...ts.filter((t) => t < t0)), hi = Math.min(1, ...ts.filter((t) => t > t0));
  const P = (t) => [a[0] + d[0] * t, a[1] + d[1] * t];
  const [ia, ib] = c.ids;
  removeCurve(sk, ci);
  if (lo > 0) sk.curves.push({ kind: "line", ids: [ia, pointAt(sk, P(lo), 1e-6)], construction: false });
  if (hi < 1) sk.curves.push({ kind: "line", ids: [pointAt(sk, P(hi), 1e-6), ib], construction: false });
  return null;
}
// offset(sk, ci, d): the closed loop curve ci is in, copied d mm outward
// (negative: inward). Lines are mitred; arcs and circles change radius.
export function offset(sk, ci, d) {
  const c = sk.curves[ci];
  if (!c) return "nothing there";
  if (c.kind === "circle") { addCircle(sk, sk.points[c.ids[0]], Math.max(0.01, c.r + d)); return null; }
  const loop = loopOf(sk, ci);
  if (!loop) return "offset works on a closed outline";
  if (loop.some((x) => sk.curves[x.ci].kind !== "line")) return "offset works on outlines of straight lines (and circles) for now";
  const pts = loop.map((x) => sk.points[x.from]);
  let area = 0;
  for (let i = 0; i < pts.length; i++) area += pts[i][0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * pts[i][1];
  const s = area > 0 ? 1 : -1;          // outward normal sign for this winding (right of a CCW edge)
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], q = pts[(i + 1) % pts.length];
    const e1 = [b[0] - a[0], b[1] - a[1]], e2 = [q[0] - b[0], q[1] - b[1]];
    const l1 = Math.hypot(...e1), l2 = Math.hypot(...e2);
    const n1 = [s * e1[1] / l1, -s * e1[0] / l1], n2 = [s * e2[1] / l2, -s * e2[0] / l2];
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    out.push([b[0] + d * (n1[0] + n2[0]) / k, b[1] + d * (n1[1] + n2[1]) / k]);
  }
  for (let i = 0; i < out.length; i++) addLine(sk, out[i], out[(i + 1) % out.length], { auto: true });
  return null;
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
  };
}
const curveArr = (c) => [c.kind, ...c.ids, ...(c.kind === "circle" ? [c.r] : []), ...(c.construction ? ["construction"] : [])];

// compact(sk): drop points no curve or rule uses, renumbering the rest
export function compact(sk) {
  const keep = new Set();
  for (const c of sk.curves) c.ids.forEach((i) => keep.add(i));
  const map = new Map();
  const points = [];
  sk.points.forEach((p, i) => { if (keep.has(i)) { map.set(i, points.length); points.push(p); } });
  const m = (ids) => ids.map((i) => map.get(i));
  return {
    on: sk.on, ...(sk.onSrc ? { onSrc: sk.onSrc } : {}), points,
    curves: sk.curves.map((c) => ({ ...c, ids: m(c.ids) })),
    constraints: sk.constraints.filter((c) => c.ids.every((i) => map.has(i))).map((c) => ({ ...c, ids: m(c.ids) })),
    dims: sk.dims.filter((d) => d.ids.every((i) => map.has(i))).map((d) => ({ ...d, ids: m(d.ids) })),
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
  return { on: onSrc ? "XY" : on, ...(onSrc ? { onSrc } : {}), points, curves, constraints, dims };
}
function constValues(text) {
  const out = new Map();
  try {
    const ast = Parser.parse(text, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true });
    for (const st of ast.body) {
      if (st.type !== "VariableDeclaration") continue;
      for (const d of st.declarations) {
        const n = d.init;
        const v = n?.type === "Literal" ? n.value : n?.type === "UnaryExpression" && n.argument.type === "Literal" ? -n.argument.value : undefined;
        if (d.id.type === "Identifier" && typeof v === "number") out.set(d.id.name, v);
      }
    }
  } catch { /* half-typed code: no names */ }
  return out;
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
