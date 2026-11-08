// design/features.js — the text every Design-mode feature writes.
//
// No DOM and no kernel: each function takes the editor text (and the ranges
// the last build mapped) and returns the next text, so the dialogs, the
// press-pull drag and the tests all share one writer per feature, and a
// feature is a code edit like any other (undo, sliders, the chat all keep
// working on what it wrote).
//
// Where a feature goes, as a history-based CAD would put it:
//   a feature on a BODY (fillet, chamfer, a hole, an extrude that joins or
//   cuts, press-pull past the shape's own size) wraps that body's outermost
//   call, so it comes after everything already in it;
//   a feature on a SHAPE (hollow, rotate, scale, a pattern or mirror of a
//   cutter) wraps that call and the transforms around it.

import { planeToWorld } from "../../src/dsl.js";
import { parseCode, offsetAt, callAt, runLineOffset } from "../../src/codemap.js";
import { soleChild } from "../design-move.js";

// words that hold several bodies side by side rather than making one
const ASSEMBLY = new Set(["group", "layout", "look"]);
// words that place or dress one shape without changing what it is
const DRESSING = new Set(["translate", "rotate", "scale", "colorize", "color", "finish", "glass", "glow"]);

export const round = (v, k = 1000) => { const r = Math.round(v * k) / k; return Object.is(r, -0) ? 0 : r; };
export const vec = (a, k) => `[${a.map((v) => round(v, k)).join(", ")}]`;

// The call (in the editor text) at [start, end), or null.
function callFor(map, span) {
  return map.ok ? map.calls.find((c) => c.start === span.start && c.end === span.end) ?? null : null;
}

// bodySpan(text, fid, { sites, trace, runText, lineOffset })
//   -> { start, end, name } the outermost call of the body fid belongs to.
// The trace's `path` is the chain of calls the shape was made inside (through
// variables and helpers, as the node tree has them), so a body written as
// `const base = …; return difference(base, …)` is that difference.
export function bodySpan(text, fid, { sites = {}, trace = [], runText = null, lineOffset } = {}) {
  const own = sites[fid];
  if (!own) return null;
  const t = trace.find((x) => x.id === fid);
  const shift = runText == null ? -1 : runText === text ? 0 : text.indexOf(runText);
  if (t?.path?.length && shift >= 0) {
    const run = parseCode(runText);
    const lo = lineOffset ?? runLineOffset();
    for (const s of t.path) {
      const c = callAt(run, offsetAt(run.lineStarts, s.line - lo, s.col));
      if (!c || ASSEMBLY.has(c.name)) continue;
      return { start: c.start + shift, end: c.end + shift, name: c.name };
    }
  }
  // no path (the old mapper placed it): climb the text's own nesting
  const map = parseCode(text);
  let c = callFor(map, own);
  if (!c) return { start: own.start, end: own.end, name: own.kind };
  while (c.parent != null && !ASSEMBLY.has(map.calls[c.parent].name)) c = map.calls[c.parent];
  return { start: c.start, end: c.end, name: c.name };
}

// shapeSpan(text, span) -> the call at span, grown out through the
// transforms and dressing wrapped around it (a pattern of
// translate([…], cylinder(…)) copies the placed cylinder, not one at 0,0,0).
export function shapeSpan(text, span) {
  const map = parseCode(text);
  let c = callFor(map, span);
  if (!c) return { ...span };
  for (;;) {
    const p = c.parent == null ? null : map.calls[c.parent];
    // the shape must be the wrapper's LAST argument (its child), not a value
    if (!p || !DRESSING.has(p.name) || p.args[p.args.length - 1]?.start !== c.start) break;
    c = p;
  }
  return { start: c.start, end: c.end, name: c.name };
}

// wrapText(text, span, head) -> { next, start, end } where `head` is the
// call's opening ("fillet({ r: 2 }, "); start/end are the wrapped call's
// new range (the whole wrapper).
export function wrapText(text, span, head, tail = ")") {
  const next = text.slice(0, span.start) + head + text.slice(span.start, span.end) + tail + text.slice(span.end);
  return { next, start: span.start, end: span.start + head.length + (span.end - span.start) + tail.length };
}

// addTool(text, body, tool) -> { next, start, end }: a cutter into a body.
// A body that already is a difference(…) takes it as one more tool (one line
// per hole reads better than a nest of differences); anything else is
// wrapped in difference(body, tool). start/end: the tool's own range.
export function addTool(text, body, tool, op = "difference") {
  const map = parseCode(text);
  const c = callFor(map, body);
  if (c && c.name === op && c.args.length >= 1) {
    const last = c.args[c.args.length - 1];
    const indent = /\n([ \t]*)[^\n]*$/.exec(text.slice(0, last.start))?.[1];
    const sep = indent != null && /\n/.test(text.slice(c.args[0].start, last.end)) ? `,\n${indent}` : ", ";
    const next = text.slice(0, last.end) + sep + tool + text.slice(last.end);
    const start = last.end + sep.length;
    return { next, start, end: start + tool.length };
  }
  const head = `${op}(`;
  const next = text.slice(0, body.start) + head + text.slice(body.start, body.end) + ", " + tool + ")" + text.slice(body.end);
  const start = body.start + head.length + (body.end - body.start) + 2;
  return { next, start, end: start + tool.length };
}

// ------------------------------------------------------------ fillet, chamfer
// edgeOpText(text, body, { kind, amount, edges }) — edges by name, as picked.
export function edgeOpText(text, body, { kind = "fillet", amount = 1, edges = [] }) {
  const key = kind === "fillet" ? "r" : "d";
  const list = edges.map((e) => JSON.stringify(e)).join(", ");
  return wrapText(text, body, `${kind}({ ${key}: ${round(amount)}, edges: [${list}] }, `);
}

// --------------------------------------------------------------- face edits
// pushFace / moveFace / deleteFace around a body, by the faces' kernel names
// (any exact solid, an imported STEP included)
export function faceOpText(text, body, { mode = "push", faces = [], by = 1, vec = [0, 0, 1], angle = 5, axis = "x" }) {
  const list = faces.map((f) => JSON.stringify(f)).join(", ");
  if (mode === "delete") return wrapText(text, body, `deleteFace({ faces: [${list}] }, `);
  if (mode === "tilt") {
    const turn = ["x", "y", "z"].map((a) => (a === axis ? round(angle) : 0));
    return wrapText(text, body, `moveFace({ faces: [${list}], turn: [${turn.join(", ")}] }, `);
  }
  if (mode === "move") return wrapText(text, body, `moveFace({ faces: [${list}], by: [${vec.map((v) => round(v)).join(", ")}] }, `);
  return wrapText(text, body, `pushFace({ faces: [${list}], by: ${round(by)} }, `);
}

// ------------------------------------------------------------------- hollow
// open: face normals ([x, y, z], world) of the faces to leave open
export function openKeys(normals) {
  const KEYS = [["+x", [1, 0, 0]], ["-x", [-1, 0, 0]], ["+y", [0, 1, 0]], ["-y", [0, -1, 0]], ["top", [0, 0, 1]], ["bottom", [0, 0, -1]]];
  const out = [];
  for (const n of normals) {
    const k = KEYS.find(([, v]) => v[0] * n[0] + v[1] * n[1] + v[2] * n[2] > 0.999);
    if (!k) return null;                     // a slanted face: not one shelled() can open
    if (!out.includes(k[0])) out.push(k[0]);
  }
  return out;
}
export function shellText(text, shape, { wall = 2, open = [] }) {
  const o = open.length === 0 ? "" : open.length === 1 ? `, open: ${JSON.stringify(open[0])}` : `, open: [${open.map((k) => JSON.stringify(k)).join(", ")}]`;
  return wrapText(text, shape, `shelled({ wall: ${round(wall)}${o} }, `);
}

// --------------------------------------------------------------------- hole
// holeCall({ point, normal, d, depth, through, kind, cbore, csink })
export function holeCall({ point, normal, d = 5, depth = 10, through = false, kind = "simple", cbD = 9, cbDepth = 3, csD = 10, csAngle = 90 }) {
  const opts = [`d: ${round(d)}`, through ? "through: true" : `depth: ${round(depth)}`];
  if (kind === "counterbore") opts.push(`cbore: { d: ${round(cbD)}, depth: ${round(cbDepth)} }`);
  if (kind === "countersink") opts.push(`csink: { d: ${round(csD)}${csAngle !== 90 ? `, angle: ${round(csAngle)}` : ""} }`);
  return `drill(${vec(point, 100)}, ${vec(normal, 10000)}, { ${opts.join(", ")} })`;
}

// --------------------------------------------------------- mirror, patterns
export function mirrorText(text, shape, { normal = [1, 0, 0], at = 0, join = false }) {
  return wrapText(text, shape, `mirrored({ normal: ${vec(normal, 10000)}, at: ${round(at)}${join ? ", join: true" : ""} }, `);
}
export function linearPatternText(text, shape, { count = 3, step = [10, 0, 0], count2 = 1, step2 = [0, 10, 0], join = false }) {
  const two = count2 > 1 ? `, count2: ${Math.round(count2)}, step2: ${vec(step2)}` : "";
  return wrapText(text, shape, `linearPattern({ count: ${Math.round(count)}, step: ${vec(step)}${two}${join ? ", join: true" : ""} }, `);
}
export function circularPatternText(text, shape, { count = 6, axis = [0, 0, 1], center = [0, 0, 0], angle = 360, join = false }) {
  const a = angle !== 360 ? `, angle: ${round(angle)}` : "";
  return wrapText(text, shape, `circularPattern({ count: ${Math.round(count)}, axis: ${vec(axis, 10000)}, center: ${vec(center)}${a}${join ? ", join: true" : ""} }, `);
}

// ------------------------------------------------------------------ combine
// combineText(text, target, tools, op) -> { next } | { error }
// Each tool body is taken out of where it was written (it must be an
// argument of a call, typically the group() the bodies sit side by side in)
// and becomes a tool of op(target, …tools).
export function combineText(text, target, tools, op = "union") {
  const map = parseCode(text);
  if (!map.ok) return { error: "the code does not parse" };
  const cuts = [];
  for (const t of tools) {
    if (t.start < target.end && t.end > target.start) return { error: "a body cannot be combined with itself or a piece of itself" };
    const c = callFor(map, t);
    const p = c?.parent == null ? null : map.calls[c.parent];
    const i = p ? p.args.findIndex((a) => a.start === c.start && a.end === c.end) : -1;
    if (i < 0) return { error: `${text.slice(t.start, Math.min(t.end, t.start + 30))}… is not written as an argument (a variable?), so it cannot be moved` };
    // take out its argument slot with one separating comma
    const from = i > 0 ? p.args[i - 1].end : c.start;
    const to = i > 0 ? c.end : (p.args[i + 1]?.start ?? c.end);
    cuts.push({ from, to, body: text.slice(t.start, t.end) });
  }
  const head = `${op}(`, tail = `, ${cuts.map((c) => c.body).join(", ")})`;
  const edits = [...cuts.map((c) => ({ from: c.from, to: c.to, put: "" })),
    { from: target.start, to: target.start, put: head }, { from: target.end, to: target.end, put: tail }];
  let next = text;
  for (const e of edits.sort((a, b) => b.from - a.from || b.to - a.to)) next = next.slice(0, e.from) + e.put + next.slice(e.to);
  return { next };
}

// ---------------------------------------------------------- rotate, scale
// rotateText(text, span, axis 0|1|2, deg, about) -> { next, how, start, end }
// The span as shapeSpan hands it over is the rotate / scale itself when one is
// already around the shape: its child is what a second turn folds onto.
function childOf(text, span, name) {
  const c = callFor(parseCode(text), span);
  const child = c?.name === name ? c.args[c.args.length - 1] : null;
  return child ? { ...span, start: child.start, end: child.end } : span;
}

// Folds into a rotate([…], { about: <same point> }, …) already around the
// span when that one turns about the same single axis; otherwise wraps.
const ROT_HEAD = /rotate\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*,\s*\{\s*about\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*\}\s*,\s*$/;
export function rotateText(text, span, axis, deg, about) {
  const d = round(deg, 100);
  if (!d) return { next: text, how: "none", start: span.start, end: span.end };
  const child = childOf(text, span, "rotate");
  const head = text.slice(0, child.start);
  const w = soleChild(text, child.end) ? ROT_HEAD.exec(head) : null;
  if (w) {
    const angles = [+w[1], +w[2], +w[3]], at = [+w[4], +w[5], +w[6]];
    const same = at.every((v, i) => Math.abs(v - round(about[i], 100)) < 1e-6);
    const single = angles.every((v, i) => i === axis || v === 0);
    if (same && single) {
      angles[axis] = round(angles[axis] + d, 100);
      const lead = `rotate(${vec(angles, 100)}, { about: ${vec(at, 100)} }, `;
      const start = w.index + lead.length;
      return { next: head.slice(0, w.index) + lead + text.slice(child.start), how: "fold", start, end: start + child.end - child.start };
    }
  }
  // anything else turns after what is already there: outside it
  const a = [0, 0, 0];
  a[axis] = d;
  const r = wrapText(text, span, `rotate(${vec(a, 100)}, { about: ${vec(about, 100)} }, `);
  const inner = r.start + `rotate(${vec(a, 100)}, { about: ${vec(about, 100)} }, `.length;
  return { next: r.next, how: "wrap", start: inner, end: inner + span.end - span.start };
}
const SCALE_HEAD = /scale\(\s*(-?[\d.]+)\s*,\s*\{\s*about\s*:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*\}\s*,\s*$/;
export function scaleText(text, span, k, about) {
  // k: one factor, or [x, y, z] per axis (one number again when they agree)
  if (Array.isArray(k)) {
    const v = k.map((x) => round(x, 1000));
    if (!v.every((x) => x > 0)) return { next: text, how: "none", start: span.start, end: span.end };
    if (v.some((x) => x !== v[0])) {
      if (v.every((x) => Math.abs(x - 1) < 1e-9)) return { next: text, how: "none", start: span.start, end: span.end };
      const lead = `scale([${v.join(", ")}], { about: ${vec(about, 100)} }, `;
      const r = wrapText(text, span, lead);
      return { next: r.next, how: "wrap", start: r.start + lead.length, end: r.start + lead.length + span.end - span.start };
    }
    k = v[0];
  }
  const f = round(k, 1000);
  if (!(f > 0) || Math.abs(f - 1) < 1e-9) return { next: text, how: "none", start: span.start, end: span.end };
  const inner = childOf(text, span, "scale");
  const head = text.slice(0, inner.start);
  const w = soleChild(text, inner.end) ? SCALE_HEAD.exec(head) : null;
  if (w && [+w[2], +w[3], +w[4]].every((v, i) => Math.abs(v - round(about[i], 100)) < 1e-6)) {
    const lead = `scale(${round(+w[1] * f, 1000)}, { about: ${vec([+w[2], +w[3], +w[4]], 100)} }, `;
    const start = w.index + lead.length;
    return { next: head.slice(0, w.index) + lead + text.slice(inner.start), how: "fold", start, end: start + inner.end - inner.start };
  }
  const lead = `scale(${f}, { about: ${vec(about, 100)} }, `;
  const r = wrapText(text, span, lead);
  return { next: r.next, how: "wrap", start: r.start + lead.length, end: r.start + lead.length + span.end - span.start };
}

// -------------------------------------------------------- a face's outline
//
// faceOutline({ positions, index, matrix }) -> { normal, point, loops } or null
// for a face that is not flat. positions: the face mesh's triangles (world
// space after `matrix`, a 16-number column-major array, when given). loops:
// closed boundary loops of world points, the outer (largest) first.
export function faceOutline({ positions, index = null, matrix = null }) {
  const P = [];
  const n3 = positions.length / 3;
  for (let i = 0; i < n3; i++) {
    let x = positions[3 * i], y = positions[3 * i + 1], z = positions[3 * i + 2];
    if (matrix) {
      const m = matrix;
      [x, y, z] = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
    }
    P.push([x, y, z]);
  }
  const tri = index ? Array.from(index) : P.map((_, i) => i);
  if (tri.length < 3) return null;
  // weld: the same corner may come as several vertices
  const key = (p) => p.map((v) => Math.round(v * 1e4)).join(",");
  const ids = new Map(), pts = [];
  const vid = P.map((p) => { const k = key(p); if (!ids.has(k)) { ids.set(k, pts.length); pts.push(p); } return ids.get(k); });
  // the plane: area-weighted normal, and every point on it
  const nrm = [0, 0, 0];
  for (let t = 0; t + 2 < tri.length; t += 3) {
    const [a, b, c] = [P[tri[t]], P[tri[t + 1]], P[tri[t + 2]]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    nrm[0] += u[1] * v[2] - u[2] * v[1]; nrm[1] += u[2] * v[0] - u[0] * v[2]; nrm[2] += u[0] * v[1] - u[1] * v[0];
  }
  const len = Math.hypot(...nrm);
  if (len < 1e-12) return null;
  const normal = nrm.map((v) => v / len);
  const d0 = pts[0][0] * normal[0] + pts[0][1] * normal[1] + pts[0][2] * normal[2];
  let span = 0;
  for (const p of pts) span = Math.max(span, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1]), Math.abs(p[2] - pts[0][2]));
  if (pts.some((p) => Math.abs(p[0] * normal[0] + p[1] * normal[1] + p[2] * normal[2] - d0) > 1e-3 * Math.max(1, span))) return null;
  // boundary: edges used by exactly one triangle, chained into loops
  const count = new Map();
  for (let t = 0; t + 2 < tri.length; t += 3) {
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const a = vid[tri[t + i]], b = vid[tri[t + j]];
      if (a === b) continue;
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const e = count.get(k);
      if (e) e.n++; else count.set(k, { n: 1, a, b });
    }
  }
  const next = new Map();
  for (const e of count.values()) if (e.n === 1) next.set(e.a, [...(next.get(e.a) || []), e.b]);
  const loops = [];
  const used = new Set();
  for (const s of next.keys()) {
    if (used.has(s)) continue;
    const loop = [s];
    used.add(s);
    let cur = s;
    for (let guard = 0; guard < 100000; guard++) {
      const nx = (next.get(cur) || []).find((v) => !used.has(v)) ?? null;
      if (nx == null) break;
      loop.push(nx); used.add(nx); cur = nx;
    }
    if (loop.length >= 3) loops.push(dropCollinear(loop.map((i) => pts[i])));
  }
  if (!loops.length) return null;
  const area = (L) => {
    const a = [0, 0, 0];
    for (let i = 0; i < L.length; i++) {
      const p = L[i], q = L[(i + 1) % L.length];
      a[0] += p[1] * q[2] - p[2] * q[1]; a[1] += p[2] * q[0] - p[0] * q[2]; a[2] += p[0] * q[1] - p[1] * q[0];
    }
    return Math.abs(a[0] * normal[0] + a[1] * normal[1] + a[2] * normal[2]) / 2;
  };
  loops.sort((a, b) => area(b) - area(a));
  const c = loops[0].reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / loops[0].length);
  return { normal, point: c, loops, area: area(loops[0]) };
}
function dropCollinear(L) {
  const out = [];
  for (let i = 0; i < L.length; i++) {
    const a = L[(i + L.length - 1) % L.length], b = L[i], c = L[(i + 1) % L.length];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const cr = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]);
    if (cr > 1e-7 * Math.hypot(...u) * Math.hypot(...v) + 1e-12) out.push(b);
  }
  return out.length >= 3 ? out : L;
}

// A loop that is a circle (every point the same distance from the middle,
// a dozen points or more): { center, r }, else null.
export function circleOf(loop) {
  if (loop.length < 12) return null;
  const c = loop.reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0]).map((v) => v / loop.length);
  const rs = loop.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]));
  const r = rs.reduce((a, b) => a + b, 0) / rs.length;
  return rs.every((v) => Math.abs(v - r) < 0.01 * r + 1e-3) ? { center: c, r } : null;
}

// The plane a face lies on, as the DSL reads it ({ origin, normal }): the
// origin is the plane's nearest point to the world origin, so a face square
// to an axis draws its outline in the world's own numbers.
export function facePlane(outline) {
  const n = outline.normal.map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
  const snapped = n.map((v) => (Math.abs(Math.abs(v) - 1) < 1e-6 ? Math.sign(v) : v));
  const d = outline.point[0] * snapped[0] + outline.point[1] * snapped[1] + outline.point[2] * snapped[2];
  return { origin: snapped.map((v) => v * d), normal: snapped };
}
const onText = (plane) => `{ origin: ${vec(plane.origin)}, normal: ${vec(plane.normal, 10000)} }`;

// profileOf(outline, toPlane) -> the 2D call for a face's outer loop on its
// own plane: a polygon in the plane's coordinates. toPlane([x,y,z]) -> [u,v]
// is the DSL's worldToPlane bound to that plane.
export function polygonText(loop, toPlane) {
  return `polygon([${loop.map((p) => vec(toPlane(p))).join(", ")}])`;
}

// extrudeText(text, body, outline, { h, mode, symmetric, toPlane })
//   mode: "join" | "cut" | "new". A circular face extrudes as a cylinder
//   (round, so exact), any other flat face as its outline on its own plane.
export function extrudeCall(outline, { h, symmetric = false, cut = false, toPlane, taper = 0 }) {
  const plane = facePlane(outline);
  const circ = circleOf(outline.loops[0]);
  const n = plane.normal;
  // a taper (draft, degrees: positive narrows as it goes) is exact on a round
  // face (a cone) and on an outline whose sides are all the same distance from
  // its middle (a square, a regular polygon): shrunk evenly about that middle,
  // every side moves in by the same amount, which is what a draft is
  const t = Math.tan((taper * Math.PI) / 180);
  if (taper && (symmetric || cut)) return { error: "a taper goes one way: turn off Symmetric, and taper a cut from its sketch instead" };
  if (circ && Math.abs(Math.abs(n[2]) - 1) < 1e-9) {
    // up or down along Z: a plain cylinder (or a cone), placed
    const z = circ.center[2];
    let lo;
    if (symmetric) lo = z - h / 2;
    else if (cut) lo = n[2] > 0 ? z - h : z - 0.5;            // into the face, 0.5 proud
    else lo = n[2] > 0 ? z : z - h;
    const height = cut && !symmetric ? h + 0.5 : h;
    if (taper) {
      const r2 = circ.r - h * t;
      if (!(r2 > 0.01)) return { error: `a ${taper}° taper over ${round(h)} mm closes a ${round(circ.r * 2)} mm circle to a point: less angle, or less distance` };
      // the narrow end is away from the face
      const [r1, rTop] = n[2] > 0 ? [circ.r, r2] : [r2, circ.r];
      return `translate(${vec([circ.center[0], circ.center[1], lo])}, cylinder({ r1: ${round(r1)}, r2: ${round(rTop)}, h: ${round(height)} }))`;
    }
    return `translate(${vec([circ.center[0], circ.center[1], lo])}, cylinder({ r: ${round(circ.r)}, h: ${round(height)} }))`;
  }
  const opts = [`h: ${round(h)}`];
  if (symmetric) opts.push("center: true");
  else if (cut) opts.push("reverse: true", "proud: 0.5");
  if (taper) {
    const loop = outline.loops[0].map(toPlane);
    const inr = evenSides(loop);
    if (!inr) return { error: "a taper is exact only on a round face, or a shape whose sides are all the same distance from its middle (a square, a regular polygon); this outline isn't one" };
    const k = (inr.a - h * t) / inr.a;
    if (!(k > 0.01)) return { error: `a ${taper}° taper over ${round(h)} mm closes this shape to a point: less angle, or less distance` };
    opts.push(`scale: ${round(k, 10000)}`);
    // drawn about its middle, so it shrinks toward it
    const c3 = planeToWorld(plane, inr.c).map((x) => round(x));
    const pl = { origin: c3, normal: plane.normal };
    return `linearExtrude({ ${opts.join(", ")}, on: ${onText(pl)} }, polygon([${loop.map((p) => vec([p[0] - inr.c[0], p[1] - inr.c[1]])).join(", ")}]))`;
  }
  opts.push(`on: ${onText(plane)}`);
  return `linearExtrude({ ${opts.join(", ")} }, ${polygonText(outline.loops[0], toPlane)})`;
}
// The middle a polygon's sides are all equally far from (its incircle's
// centre, found from the vertex average for the shapes this is for), and
// that distance; null when the sides are not all the same distance (1%).
function evenSides(loop) {
  const n = loop.length;
  if (n < 3) return null;
  const c = [loop.reduce((a, p) => a + p[0], 0) / n, loop.reduce((a, p) => a + p[1], 0) / n];
  const ds = loop.map((p, i) => {
    const q = loop[(i + 1) % n], d = [q[0] - p[0], q[1] - p[1]], L = Math.hypot(...d) || 1;
    return Math.abs((c[0] - p[0]) * d[1] - (c[1] - p[1]) * d[0]) / L;
  });
  const a = ds.reduce((x, y) => x + y, 0) / n;
  return a > 1e-6 && ds.every((d) => Math.abs(d - a) <= 0.01 * a) ? { c, a } : null;
}
// upTo(from, to): how far a face's extrude runs to reach another flat face
// parallel to it -> { h, inward } (inward: the target is behind the face, so
// only a cut reaches it) | { error }
export function upToDistance(from, to) {
  const n = from.normal, m = to.normal;
  const dot = n[0] * m[0] + n[1] * m[1] + n[2] * m[2];
  if (Math.abs(Math.abs(dot) - 1) > 1e-4) return { error: "up to a face works when that face is parallel to the one you're extruding" };
  const d = (to.point[0] - from.point[0]) * n[0] + (to.point[1] - from.point[1]) * n[1] + (to.point[2] - from.point[2]) * n[2];
  if (Math.abs(d) < 1e-6) return { error: "those two faces are in the same plane" };
  return { h: Math.abs(d), inward: d < 0 };
}
// splitText(text, target, { normal, at }) -> the target wrapped in splitBody(…)
export function splitText(text, target, { normal = [0, 0, 1], at = 0 }) {
  return wrapText(text, target, `splitBody({ normal: ${vec(normal, 10000)}, at: ${round(at)} }, `);
}
export function extrudeText(text, body, outline, { h, mode = "join", symmetric = false, toPlane, taper = 0 }) {
  const call = extrudeCall(outline, { h, symmetric, cut: mode === "cut", toPlane, taper });
  if (call.error) return call;
  if (mode === "cut") return addTool(text, body, call);
  if (mode === "join") return addTool(text, body, call, "union");
  return newBodyText(text, body, call);
}

// A new body beside the others: one more argument of the group() the bodies
// sit in, or group(body, new) when there is none.
export function newBodyText(text, body, call) {
  const map = parseCode(text);
  const c = callFor(map, body);
  const p = c?.parent == null ? null : map.calls[c.parent];
  if (p && p.name === "group") {
    const last = p.args[p.args.length - 1];
    const next = text.slice(0, last.end) + ", " + call + text.slice(last.end);
    return { next, start: last.end + 2, end: last.end + 2 + call.length };
  }
  const head = "group(";
  const next = text.slice(0, body.start) + head + text.slice(body.start, body.end) + ", " + call + ")" + text.slice(body.end);
  const start = body.start + head.length + (body.end - body.start) + 2;
  return { next, start, end: start + call.length };
}

// ------------------------------------------------------------- press-pull
//
// pressPullText(text, { site, body, face, outline, target, centered, toPlane }, d)
//   d > 0 pulls the face out (grows), d < 0 pushes it in (shrinks).
// A box face or a cylinder's end with its own size number (`target`, from
// assist.js findResizeTarget) edits that number, plus the translate that
// keeps the far side put; past the shape's own size (or a face with no number
// behind it) it becomes an extrusion of the face: joined outward, cut inward,
// and a cut goes on through whatever is beyond, as deep as it was pushed.
export function pressPullText(text, { body, outline, target = null, sign = 1, axis = 2, siteSpan = null, centered = false, toPlane }, d) {
  const step = round(d, 10);
  if (!step) return { next: text, how: "none" };
  if (target && siteSpan && target.value + step >= 0.2) {
    const value = round(target.value + step, 10);
    let next = text.slice(0, target.numStart) + String(value) + text.slice(target.numEnd);
    // the far side stays put: a centred shape grows both ways (move half, toward
    // the pulled side); a corner-anchored one grows from its min side
    const comp = centered ? (sign * step) / 2 : sign < 0 ? -step : 0;
    if (comp) {
      // the number can sit in the call or in a declaration above it (const w = 9)
      const dLen = String(value).length - (target.numEnd - target.numStart);
      const at = (i) => (i >= target.numEnd ? i + dLen : i);
      const span = { start: at(siteSpan.start), end: at(siteSpan.end) };
      const v = [0, 0, 0];
      v[axis] = round(comp, 100);
      const head = next.slice(0, span.start);
      const w = soleChild(next, span.end) ? /translate\(\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]\s*,\s*$/.exec(head) : null;
      if (w) {
        const nv = [+w[1] + v[0], +w[2] + v[1], +w[3] + v[2]];
        next = head.slice(0, w.index) + `translate(${vec(nv, 100)}, ` + next.slice(span.start);
      } else {
        next = wrapText(next, span, `translate(${vec(v, 100)}, `).next;
      }
    }
    return { next, how: "size", value };
  }
  if (!outline) return { next: text, how: "none" };
  const r = extrudeText(text, body, outline, { h: Math.abs(step), mode: step > 0 ? "join" : "cut", toPlane });
  return { next: r.next, how: step > 0 ? "join" : "cut" };
}

// ------------------------------------------------------------- primitives
//
// primitiveCall(kind, s) -> the call text for a box, cylinder, cone, sphere
// or torus. (s.x, s.y, s.z) is where its base sits: the middle of its bottom
// (a sphere or torus rests on that point); with sink (a cut placed on a
// face) its top is there instead, so it goes down into the face.
export const PRIMITIVES = [["box", "Box"], ["cylinder", "Cylinder"], ["cone", "Cone"], ["sphere", "Sphere"], ["torus", "Torus"]];
export function primitiveCall(kind, s, { sink = false } = {}) {
  const r = (v) => round(v);
  const pos = (x, y, z) => (x || y || z ? (call) => `translate(${vec([x, y, z])}, ${call})` : (call) => call);
  const tall = kind === "sphere" ? 2 * s.r : kind === "torus" ? 2 * s.tube : s.h;
  if (!(tall > 0)) return { error: "sizes must be more than 0" };
  const zb = sink ? s.z - tall : s.z;
  switch (kind) {
    case "box":
      if (!(s.w > 0 && s.d > 0)) return { error: "sizes must be more than 0" };
      return { text: pos(s.x - s.w / 2, s.y - s.d / 2, zb)(`cube(${vec([s.w, s.d, s.h])})`) };
    case "cylinder":
      if (!(s.r > 0)) return { error: "the radius must be more than 0" };
      return { text: pos(s.x, s.y, zb)(`cylinder({ r: ${r(s.r)}, h: ${r(s.h)} })`) };
    case "cone":
      if (!(s.r > 0) || !(s.rTop >= 0)) return { error: "the radii must be 0 or more (the bottom more than 0)" };
      return { text: pos(s.x, s.y, zb)(`cylinder({ r1: ${r(s.r)}, r2: ${r(s.rTop)}, h: ${r(s.h)} })`) };
    case "sphere":
      if (!(s.r > 0)) return { error: "the radius must be more than 0" };
      return { text: pos(s.x, s.y, zb + s.r)(`sphere({ r: ${r(s.r)} })`) };
    case "torus":
      if (!(s.R > s.tube && s.tube > 0)) return { error: "the ring radius must be more than the tube's" };
      return { text: pos(s.x, s.y, zb + s.tube)(`torus({ r: ${r(s.R)}, tube: ${r(s.tube)} })`) };
  }
  return { error: `no primitive called ${kind}` };
}

// The top-level return's expression ({ start, end }), or null.
export function returnSpan(text) {
  const m = parseCode(text);
  if (!m.ok) return null;
  const re = /(^|\n)[ \t]*return\s+/g;
  let last = null, k;
  while ((k = re.exec(text))) last = k;
  if (!last) return null;
  const at = last.index + last[0].length;
  const c = m.calls.find((x) => x.start === at);
  return c ? { start: c.start, end: c.end } : null;
}

// primitiveText(text, call, { op, body, starter }) -> { next } : a New body
// beside the model (or the model, when there is none, or in place of the
// untouched starter cube), else joined to / cut from body.
export function primitiveText(text, call, { op = "new", body = null, starter = null } = {}) {
  if (op === "join" || op === "cut") {
    if (!body) return { wait: `Select the body to ${op === "join" ? "join it to" : "cut it from"} (or click a face of it).` };
    return op === "cut" ? addTool(text, body, call) : addTool(text, body, call, "union");
  }
  const st = starter?.trim();
  if (st && text.trimEnd().endsWith(st)) {
    const head = text.slice(0, text.trimEnd().length - st.length).replace(/\s*$/, "");
    return { next: `${head}${head ? "\n" : ""}return ${call};\n` };
  }
  const ret = returnSpan(text);
  if (!ret) return { next: text.replace(/\s*$/, "") + `${text.trim() ? "\n" : ""}return ${call};\n` };
  return newBodyText(text, ret, call);
}
