// OpenSCAD -> BrepScript translator.
//
// Parses a practical subset of OpenSCAD and evaluates it straight into BrepScript
// shape nodes, so a .scad file can be built by the same pipeline as native code.
//
// Supported: variables, arithmetic/ternary/comparison expressions, vectors and
// ranges, module definitions and calls, for loops, if/else, the 3D primitives,
// the three booleans, and the transforms.
//
// hull() and minkowski() are supported too — minkowski() in the form everyone
// actually writes, a part and a sphere, which is a rounded offset.
//
// Deliberately unsupported (each raises a clear error): surface, projection,
// and minkowski with something other than a sphere.

import * as dsl from "./dsl.js";
import { Euler, Quaternion, Vector3, MathUtils } from "three";

// ------------------------------------------------------------------ tokenizer

const PUNCT2 = ["<=", ">=", "==", "!=", "&&", "||"];

function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  const idStart = (c) => /[A-Za-z_$]/.test(c);
  const idRest = (c) => /[A-Za-z0-9_$]/.test(c);

  while (i < src.length) {
    const c = src[i];
    if (c === "\n") { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
      i += 2; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1]))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      if (/[eE]/.test(src[j] || "")) {
        j++;
        if (src[j] === "+" || src[j] === "-") j++;
        while (j < src.length && /[0-9]/.test(src[j])) j++;
      }
      toks.push({ t: "num", v: parseFloat(src.slice(i, j)), line });
      i = j; continue;
    }
    if (idStart(c)) {
      let j = i;
      while (j < src.length && idRest(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j), line });
      i = j; continue;
    }
    if (c === '"') {
      let j = i + 1, s = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\") { s += src[j + 1]; j += 2; } else s += src[j++];
      }
      toks.push({ t: "str", v: s, line });
      i = j + 1; continue;
    }
    const two = src.slice(i, i + 2);
    if (PUNCT2.includes(two)) { toks.push({ t: "op", v: two, line }); i += 2; continue; }
    toks.push({ t: "op", v: c, line });
    i++;
  }
  toks.push({ t: "eof", v: "", line });
  return toks;
}

// -------------------------------------------------------------------- parser

class Parser {
  constructor(toks) { this.toks = toks; this.p = 0; }
  peek(k = 0) { return this.toks[this.p + k]; }
  next() { return this.toks[this.p++]; }
  isOp(v, k = 0) { const t = this.peek(k); return t.t === "op" && t.v === v; }
  isId(v, k = 0) { const t = this.peek(k); return t.t === "id" && t.v === v; }
  eat(v) {
    if (this.isOp(v)) return this.next();
    const t = this.peek();
    throw new Error(`Expected "${v}" but found "${t.v || t.t}" on line ${t.line}`);
  }

  parseProgram() {
    const out = [];
    while (this.peek().t !== "eof") out.push(this.parseStatement());
    return out;
  }

  parseStatement() {
    if (this.isOp(";")) { this.next(); return { k: "noop" }; }
    if (this.isOp("{")) {
      this.next();
      const body = [];
      while (!this.isOp("}")) {
        if (this.peek().t === "eof") throw new Error("Unclosed { block");
        body.push(this.parseStatement());
      }
      this.next();
      return { k: "block", body };
    }
    // modifier characters: * disables and % is background (both excluded from
    // the built geometry); ! (show-only) and # (highlight) keep the child.
    if (this.isOp("*") || this.isOp("!") || this.isOp("#") || this.isOp("%")) {
      const m = this.next().v;
      const stmt = this.parseStatement();
      return (m === "*" || m === "%") ? { k: "noop" } : stmt;
    }
    if (this.isId("module")) return this.parseModuleDef();
    if (this.isId("function")) return this.parseFunctionDef();
    if (this.isId("for")) return this.parseFor();
    if (this.isId("if")) return this.parseIf();
    if (this.isId("include") || this.isId("use")) {
      const w = this.next().v;
      throw new Error(`"${w}" isn't supported — paste the included file's contents in directly.`);
    }
    // assignment  name = expr ;
    if (this.peek().t === "id" && this.isOp("=", 1)) {
      const name = this.next().v;
      this.next();
      const value = this.parseExpr();
      if (this.isOp(";")) this.next();
      return { k: "assign", name, value };
    }
    if (this.peek().t === "id") return this.parseModuleCall();
    const t = this.peek();
    throw new Error(`Unexpected "${t.v || t.t}" on line ${t.line}`);
  }

  parseParamList() {
    this.eat("(");
    const params = [];
    while (!this.isOp(")")) {
      const name = this.next().v;
      let def = null;
      if (this.isOp("=")) { this.next(); def = this.parseExpr(); }
      params.push({ name, def });
      if (this.isOp(",")) this.next();
    }
    this.eat(")");
    return params;
  }

  parseModuleDef() {
    this.next();                                  // 'module'
    const name = this.next().v;
    const params = this.parseParamList();
    const body = this.parseStatement();
    return { k: "moduledef", name, params, body };
  }

  parseFunctionDef() {
    this.next();                                  // 'function'
    const name = this.next().v;
    const params = this.parseParamList();
    this.eat("=");
    const body = this.parseExpr();
    if (this.isOp(";")) this.next();
    return { k: "funcdef", name, params, body };
  }

  parseFor() {
    this.next();                                  // 'for'
    this.eat("(");
    const vars = [];
    while (!this.isOp(")")) {
      const name = this.next().v;
      this.eat("=");
      vars.push({ name, range: this.parseExpr() });
      if (this.isOp(",")) this.next();
    }
    this.eat(")");
    return { k: "for", vars, body: this.parseStatement() };
  }

  parseIf() {
    this.next();                                  // 'if'
    this.eat("(");
    const cond = this.parseExpr();
    this.eat(")");
    const then = this.parseStatement();
    let other = null;
    if (this.isId("else")) { this.next(); other = this.parseStatement(); }
    return { k: "if", cond, then, other };
  }

  parseArgs() {
    this.eat("(");
    const positional = [], named = {};
    while (!this.isOp(")")) {
      if (this.peek().t === "id" && this.isOp("=", 1)) {
        const name = this.next().v;
        this.next();
        named[name] = this.parseExpr();
      } else {
        positional.push(this.parseExpr());
      }
      if (this.isOp(",")) this.next();
    }
    this.eat(")");
    return { positional, named };
  }

  parseModuleCall() {
    const name = this.next().v;
    const args = this.parseArgs();
    let child = null;
    if (this.isOp(";")) this.next();
    else if (!this.isOp("}") && this.peek().t !== "eof") child = this.parseStatement();
    return { k: "call", name, args, child };
  }

  // ---- expressions, lowest precedence first
  parseExpr() { return this.parseTernary(); }

  parseTernary() {
    const cond = this.parseBinary(0);
    if (this.isOp("?")) {
      this.next();
      const a = this.parseExpr();
      this.eat(":");
      const b = this.parseExpr();
      return { k: "ternary", cond, a, b };
    }
    return cond;
  }

  parseBinary(level) {
    const LEVELS = [["||"], ["&&"], ["==", "!="], ["<", ">", "<=", ">="], ["+", "-"], ["*", "/", "%"]];
    if (level >= LEVELS.length) return this.parseUnary();
    let left = this.parseBinary(level + 1);
    while (this.peek().t === "op" && LEVELS[level].includes(this.peek().v)) {
      const op = this.next().v;
      left = { k: "bin", op, left, right: this.parseBinary(level + 1) };
    }
    return left;
  }

  parseUnary() {
    if (this.isOp("-") || this.isOp("!") || this.isOp("+")) {
      const op = this.next().v;
      return { k: "unary", op, arg: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    for (;;) {
      if (this.isOp("[")) {
        this.next();
        const index = this.parseExpr();
        this.eat("]");
        node = { k: "index", node, index };
      } else if (this.isOp(".")) {
        this.next();
        const key = this.next().v;
        node = { k: "index", node, index: { k: "num", v: { x: 0, y: 1, z: 2 }[key] ?? 0 } };
      } else return node;
    }
  }

  parsePrimary() {
    const t = this.peek();
    if (t.t === "num") { this.next(); return { k: "num", v: t.v }; }
    if (t.t === "str") { this.next(); return { k: "str", v: t.v }; }
    if (this.isOp("(")) { this.next(); const e = this.parseExpr(); this.eat(")"); return e; }
    if (this.isOp("[")) {
      this.next();
      // list comprehension: [ for (…) … ], [ each … ], [ if (…) … ]
      if (this.isId("for") || this.isId("each") || this.isId("if")) {
        const comp = this.parseCompElement();
        this.eat("]");
        return { k: "listcomp", comp };
      }
      const items = [];
      let isRange = false, rangeParts = null;
      while (!this.isOp("]")) {
        const e = this.parseExpr();
        if (this.isOp(":")) {                     // [start : end] or [start : step : end]
          isRange = true;
          rangeParts = [e];
          while (this.isOp(":")) { this.next(); rangeParts.push(this.parseExpr()); }
          break;
        }
        items.push(e);
        if (this.isOp(",")) this.next();
      }
      this.eat("]");
      return isRange ? { k: "range", parts: rangeParts } : { k: "vec", items };
    }
    if (t.t === "id") {
      this.next();
      if (t.v === "true") return { k: "num", v: true };
      if (t.v === "false") return { k: "num", v: false };
      if (t.v === "undef") return { k: "num", v: undefined };
      if (t.v === "let" && this.isOp("(")) {
        // let(a=1, b=a*2) expr
        const args = this.parseArgs();
        return { k: "letexpr", args, body: this.parseExpr() };
      }
      if (this.isOp("(")) return { k: "fcall", name: t.v, args: this.parseArgs() };
      return { k: "var", name: t.v };
    }
    throw new Error(`Unexpected "${t.v || t.t}" on line ${t.line}`);
  }

  // One element of a list comprehension: for/let/if/each chains ending in a value.
  parseCompElement() {
    if (this.isId("for")) {
      this.next();
      this.eat("(");
      const gens = [];
      for (;;) {
        const name = this.next().v;
        this.eat("=");
        gens.push({ name, range: this.parseExpr() });
        if (this.isOp(",")) { this.next(); continue; }
        break;
      }
      this.eat(")");
      return { k: "comp_for", gens, body: this.parseCompElement() };
    }
    if (this.isId("let")) {
      this.next();
      const args = this.parseArgs();
      return { k: "comp_let", args, body: this.parseCompElement() };
    }
    if (this.isId("if")) {
      this.next();
      this.eat("(");
      const cond = this.parseExpr();
      this.eat(")");
      const then = this.parseCompElement();
      let els = null;
      if (this.isId("else")) { this.next(); els = this.parseCompElement(); }
      return { k: "comp_if", cond, then, els };
    }
    if (this.isId("each")) { this.next(); return { k: "comp_each", expr: this.parseExpr() }; }
    return { k: "comp_val", expr: this.parseExpr() };
  }
}

// ----------------------------------------------------------------- evaluation

const BUILTIN_FUNCS = {
  sin: (d) => Math.sin(d * Math.PI / 180),
  cos: (d) => Math.cos(d * Math.PI / 180),
  tan: (d) => Math.tan(d * Math.PI / 180),
  asin: (x) => Math.asin(x) * 180 / Math.PI,
  acos: (x) => Math.acos(x) * 180 / Math.PI,
  atan: (x) => Math.atan(x) * 180 / Math.PI,
  atan2: (y, x) => Math.atan2(y, x) * 180 / Math.PI,
  abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  sqrt: Math.sqrt, exp: Math.exp, pow: Math.pow,
  ln: Math.log, log: (x) => Math.log10(x),
  min: (...a) => Math.min(...a.flat()), max: (...a) => Math.max(...a.flat()),
  len: (a) => (a == null ? 0 : a.length ?? 0),
  concat: (...a) => [].concat(...a),
  norm: (v) => Math.hypot(...v),
  str: (...a) => a.join(""),
};

// Exported so the chat harness can WARN about these before a model writes them
// rather than after. A hand-kept list in the prompt drifts from this one
// silently; test/toolfit.js reads this object and fails if the prompt is missing
// any key, so the two can only agree.
export const UNSUPPORTED = {
  text: "text isn't wired into the DSL yet",
  projection: "projection() isn't implemented",
  surface: "surface() isn't implemented",
  import: "import() isn't implemented",
  polyhedron: "polyhedron() isn't implemented",
  multmatrix: "multmatrix() isn't implemented",
  resize: "resize() isn't implemented",
};

// The other half of the story: modules that DO exist but refuse some of their
// arguments. These throw rather than warn, so a model that reaches for one
// loses the whole build — worth naming in the prompt for the same reason.
export const LIMITED = {
  linear_extrude: "twist and scale are refused — use tube() or cone() for a taper",
  rotate_extrude: "a profile detached from the axis must be a CIRCLE (that is a torus); any other detached shape is refused",
  polygon: "a second path (a hole) is refused — difference() two polygons instead",
};

// The modules the prompt is allowed to advertise. Not a hand-kept list in the
// sense that matters: test/toolfit.js runs each one through the translator and
// fails if it warns "isn't a known module", so a rename downstream breaks the
// test rather than quietly turning the prompt into a lie.
export const MODULES = [
  "cube", "sphere", "cylinder", "torus",
  "square", "circle", "polygon", "linear_extrude", "rotate_extrude",
  "translate", "rotate", "scale", "mirror",
  "union", "difference", "intersection", "hull", "minkowski", "offset",
  "color", "render", "group", "children", "echo", "assert",
];

// ------------------------------------------------------------- 2D profiles
//
// 2D shapes flow through the evaluator as profile trees (polygon leaves plus
// boolean structure). Nothing is computed in 2D: at linear_extrude time every
// leaf becomes a kernel Sketch+Extrude prism and the boolean structure is
// applied in 3D — which is equivalent for straight extrusions and reuses the
// manifold engine instead of a second geometry library.

export const isProfile = (v) => !!(v && v.__profile2d);
// exported: py123d.js builds BuildSketch/BuildLine on the same profile species
export const profileLeaf = (pts) => ({ __profile2d: true, leaf: true, pts });
export const profileOp = (op, children) => ({ __profile2d: true, op, children });

export function mapProfile(p, fn) {
  if (p.leaf) return profileLeaf(p.pts.map(fn));
  return profileOp(p.op, p.children.map((c) => mapProfile(c, fn)));
}

// ---------------------------------------------------------- revolving a 2D
//
// Spun about the Z axis with the profile's X read as radius and Y as height,
// which is what OpenSCAD's rotate_extrude does.
//
// Is this ring of points a circle? Decided by measurement, not by remembering
// that circle() made it: by the time a profile reaches here it is a plain point
// list, and it may have been translated, scaled or written out by hand. A
// circle detached from the axis is a torus and nothing else is.
export function circleOf(pts, tol = 0.02) {
  if (!Array.isArray(pts) || pts.length < 8) return null;    // too few to tell
  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;
  const rs = pts.map(([x, y]) => Math.hypot(x - cx, y - cy));
  const r = rs.reduce((a, b) => a + b, 0) / rs.length;
  if (!(r > 0)) return null;
  // Every point the same distance from the centre, within a fraction of the
  // radius. A polygon circle is inscribed, so the tolerance has to allow the
  // sagitta of one facet — at $fn 12 that is already 3.4%.
  const worst = Math.max(...rs.map((v) => Math.abs(v - r)));
  return worst / r <= tol ? { cx, cy, r } : null;
}

const touchesAxis = (pts) => {
  const on = (x) => Math.abs(x) < 1e-6;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (on(a[0]) && on(b[0])) return true;      // a whole EDGE on the axis
  }
  return false;
};

export function profileToRevolved(p, angle, fn) {
  if (!p.leaf) {
    // A boolean of 2D shapes: revolve each leaf and redo the boolean in 3D.
    // Sound for a revolve about a shared axis, the same way profileToSolid
    // treats a straight extrusion.
    const kids = p.children.map((c) => profileToRevolved(c, angle, fn));
    if (p.op === "difference") return dsl.difference(...kids);
    if (p.op === "intersection") return dsl.intersection(...kids);
    return dsl.union(...kids);
  }
  const pts = p.pts;
  const minX = Math.min(...pts.map(([x]) => x));
  if (minX < -1e-6) {
    throw new Error("rotate_extrude() needs every point at x >= 0 — the profile "
      + "would sweep through its own axis. Move it into the x >= 0 half.");
  }
  // Touching the axis: a real lathe, any outline.
  if (touchesAxis(pts)) {
    return dsl.revolve({ angle, ...(fn ? { $fn: fn } : {}) }, dsl.polygon(pts));
  }
  // Detached: revolve() has no axis edge to spin and refuses. A circle here is
  // a torus — major radius = how far out the centre sits, tube = its radius.
  const c = circleOf(pts);
  if (c) {
    const t = dsl.torus({
      r: c.cx, tube: c.r,
      ...(angle < 360 ? { arc: angle } : {}),
      ...(fn ? { $fn: fn } : {}),
    });
    // The profile's Y is height, so a circle centred off y=0 rides up the axis.
    return Math.abs(c.cy) > 1e-6 ? dsl.translate([0, 0, c.cy], t) : t;
  }
  throw new Error("rotate_extrude(): this profile does not touch the axis and is not a "
    + "circle, so it would sweep a ring with a non-round section — the kernel has no "
    + "such primitive. Either extend the profile to x = 0 (a true lathe), or use a "
    + "circle (a torus), or sweep it yourself with tube().");
}

// Cutting/intersecting tools are extruded 2mm long and dropped 1mm so the
// caps never sit coincident with the kept solid's faces.
export function profileToSolid(p, h, overshoot = false) {
  if (p.leaf) {
    const solid = dsl.linearExtrude({ h: overshoot ? h + 2 : h }, dsl.polygon(p.pts));
    return overshoot ? dsl.translate([0, 0, -1], solid) : solid;
  }
  const kids = p.children.map((c, i) =>
    profileToSolid(c, h, p.op === "UNION" ? overshoot : (i > 0 ? true : overshoot)));
  if (p.op === "UNION") return dsl.union(kids);
  if (p.op === "SUBTRACT") return dsl.difference(kids);
  return dsl.intersection(kids);
}

const circlePts = (r, n) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * 2 * Math.PI;
  return [r * Math.cos(a), r * Math.sin(a)];
});

// 2D polygon offset (OpenSCAD offset()). Each edge is shifted out by `amount`
// along its outward normal; consecutive offset edges are joined by an arc at
// convex vertices when `rounded` (offset(r=…)), or a miter intersection when
// straight (offset(delta=…)). Positive grows, negative shrinks. Handles simple
// convex/concave polygons — the square/rounded-rect case that dominates.
export function offsetPolygon(pts, amount, fn = 24, rounded = true) {
  if (!amount) return pts.slice();
  // work CCW so the right-hand normal points outward
  let area = 0;
  const N0 = pts.length;
  for (let i = 0; i < N0; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % N0]; area += x1 * y2 - x2 * y1; }
  const poly = area < 0 ? [...pts].reverse() : pts.slice();
  const N = poly.length;
  const outNormal = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1; return [dy / L, -dx / L]; };
  const edges = [];
  for (let i = 0; i < N; i++) {
    const a = poly[i], b = poly[(i + 1) % N], nrm = outNormal(a, b);
    edges.push({ a: [a[0] + amount * nrm[0], a[1] + amount * nrm[1]], b: [b[0] + amount * nrm[0], b[1] + amount * nrm[1]], nrm });
  }
  const lineX = (p1, p2, p3, p4) => {
    const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((p1[0] - p3[0]) * (p3[1] - p4[1]) - (p1[1] - p3[1]) * (p3[0] - p4[0])) / d;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };
  const out = [];
  for (let i = 0; i < N; i++) {
    const eIn = edges[(i - 1 + N) % N], eOut = edges[i], v = poly[i];
    const p0 = poly[(i - 1 + N) % N], p2 = poly[(i + 1) % N];
    const cross = (v[0] - p0[0]) * (p2[1] - v[1]) - (v[1] - p0[1]) * (p2[0] - v[0]); // >0 = convex (CCW)
    const convex = amount > 0 ? cross > 1e-9 : cross < -1e-9;
    if (rounded && convex) {
      let a0 = Math.atan2(eIn.nrm[1], eIn.nrm[0]), a1 = Math.atan2(eOut.nrm[1], eOut.nrm[0]);
      if (amount > 0) { while (a1 < a0) a1 += 2 * Math.PI; } else { while (a1 > a0) a1 -= 2 * Math.PI; }
      const seg = Math.max(1, Math.round((fn || 24) * Math.abs(a1 - a0) / (2 * Math.PI)));
      const R = Math.abs(amount);
      for (let s = 0; s <= seg; s++) { const a = a0 + (a1 - a0) * s / seg; out.push([v[0] + R * Math.cos(a), v[1] + R * Math.sin(a)]); }
    } else {
      out.push(lineX(eIn.a, eIn.b, eOut.a, eOut.b) || eOut.a);
    }
  }
  return out;
}

class Scope {
  constructor(parent = null) {
    this.vars = new Map();
    this.parent = parent;
    this.modules = parent ? parent.modules : new Map();
    this.funcs = parent ? parent.funcs : new Map();
  }
  get(name) {
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name);
    return undefined;
  }
  has(name) {
    for (let s = this; s; s = s.parent) if (s.vars.has(name)) return true;
    return false;
  }
  set(name, value) { this.vars.set(name, value); }
}

// Warnings surfaced alongside a successful build — how library shims admit to
// approximating (rounding ignored, attach() as a no-op, and so on).
const WARNINGS = [];
export function getWarnings() { return [...WARNINGS]; }
function warn(msg) { if (!WARNINGS.includes(msg)) WARNINGS.push(msg); }

// Evaluate one list-comprehension element to a flat array of values.
function evalComp(node, scope) {
  switch (node.k) {
    case "comp_for": {
      const out = [];
      const rec = (gi, sc) => {
        if (gi >= node.gens.length) { out.push(...evalComp(node.body, sc)); return; }
        const g = node.gens[gi];
        let vals = evalExpr(g.range, sc);
        if (!Array.isArray(vals)) vals = vals == null ? [] : [vals];
        for (const v of vals) { const s2 = new Scope(sc); s2.set(g.name, v); rec(gi + 1, s2); }
      };
      rec(0, scope);
      return out;
    }
    case "comp_let": {
      const s2 = new Scope(scope);
      for (const [k, vNode] of Object.entries(node.args.named)) s2.set(k, evalExpr(vNode, s2));
      return evalComp(node.body, s2);
    }
    case "comp_if":
      return evalExpr(node.cond, scope) ? evalComp(node.then, scope) : (node.els ? evalComp(node.els, scope) : []);
    case "comp_each": {
      const v = evalExpr(node.expr, scope);
      return Array.isArray(v) ? v : (v == null ? [] : [v]);
    }
    case "comp_val": return [evalExpr(node.expr, scope)];
    default: return [];
  }
}

function evalExpr(node, scope) {
  switch (node.k) {
    case "num": case "str": return node.v;
    case "vec": return node.items.map((i) => evalExpr(i, scope));
    case "range": {
      const p = node.parts.map((x) => evalExpr(x, scope));
      const [start, b, c] = p;
      const step = p.length === 3 ? b : 1;
      const end = p.length === 3 ? c : b;
      const out = [];
      if (step === 0) return out;
      if (step > 0) for (let v = start; v <= end + 1e-9; v += step) out.push(v);
      else for (let v = start; v >= end - 1e-9; v += step) out.push(v);
      return out;
    }
    case "var": {
      const v = scope.get(node.name);
      // Forgiving: an unknown name (often a constant from an include we can't
      // fetch) becomes undef with a warning instead of killing the build — an
      // unused one then costs nothing, and a used one surfaces as a clear note.
      if (v === undefined && !scope.has(node.name) && !node.name.startsWith("$")) {
        warn(`"${node.name}" isn't defined (missing include?) — treated as undef`);
        return undefined;
      }
      return v;
    }
    case "letexpr": {
      const inner = new Scope(scope);
      for (const [k, vNode] of Object.entries(node.args.named)) inner.set(k, evalExpr(vNode, inner));
      return evalExpr(node.body, inner);
    }
    case "listcomp": return evalComp(node.comp, scope);
    case "index": {
      const base = evalExpr(node.node, scope);
      return base?.[evalExpr(node.index, scope)];
    }
    case "unary": {
      const v = evalExpr(node.arg, scope);
      if (node.op === "-") return Array.isArray(v) ? v.map((x) => -x) : -v;
      if (node.op === "+") return v;
      return !v;
    }
    case "bin": {
      const a = evalExpr(node.left, scope), b = evalExpr(node.right, scope);
      const vecOp = (f) => Array.isArray(a) && Array.isArray(b) ? a.map((x, i) => f(x, b[i]))
        : Array.isArray(a) ? a.map((x) => f(x, b))
        : Array.isArray(b) ? b.map((x) => f(a, x))
        : f(a, b);
      switch (node.op) {
        case "+": return vecOp((x, y) => x + y);
        case "-": return vecOp((x, y) => x - y);
        case "*": return vecOp((x, y) => x * y);
        case "/": return vecOp((x, y) => x / y);
        case "%": return a % b;
        case "==": return a === b;
        case "!=": return a !== b;
        case "<": return a < b;
        case ">": return a > b;
        case "<=": return a <= b;
        case ">=": return a >= b;
        case "&&": return a && b;
        case "||": return a || b;
      }
      throw new Error(`Unknown operator ${node.op}`);
    }
    case "ternary": return evalExpr(node.cond, scope) ? evalExpr(node.a, scope) : evalExpr(node.b, scope);
    case "fcall": {
      const args = node.args.positional.map((a) => evalExpr(a, scope));
      const user = scope.funcs.get(node.name);
      if (user) {
        const inner = new Scope(scope);
        user.params.forEach((p, i) => {
          const named = node.args.named[p.name];
          inner.set(p.name, named !== undefined ? evalExpr(named, scope)
            : args[i] !== undefined ? args[i]
            : p.def ? evalExpr(p.def, scope) : undefined);
        });
        return evalExpr(user.body, inner);
      }
      const fn = BUILTIN_FUNCS[node.name];
      // Forgiving: an unknown helper function (usually from an include we can't
      // fetch) shouldn't nuke the whole model. Most such helpers are "fit / adjust
      // / round this value" wrappers, so pass their first numeric argument straight
      // through — layer_height_fit(1.2) -> 1.2 — and warn. That lets a model whose
      // only missing piece is a utility include still build with sane numbers.
      if (!fn) {
        warn(`function ${node.name}() isn't available (missing include?) — using its first argument as-is`);
        return typeof args[0] === "number" ? args[0] : (Array.isArray(args[0]) ? args[0] : undefined);
      }
      return fn(...args);
    }
  }
  throw new Error(`Cannot evaluate ${node.k}`);
}

// Pull an argument by position or name, the way OpenSCAD resolves them.
function arg(args, scope, index, ...names) {
  for (const n of names) {
    if (args.named[n] !== undefined) return evalExpr(args.named[n], scope);
  }
  if (index != null && args.positional[index] !== undefined) {
    return evalExpr(args.positional[index], scope);
  }
  return undefined;
}

const asVec3 = (v, fallback = 0) =>
  Array.isArray(v) ? [v[0] ?? fallback, v[1] ?? fallback, v[2] ?? fallback] : [v ?? fallback, v ?? fallback, v ?? fallback];

function fnOf(args, scope) {
  const v = arg(args, scope, null, "$fn");
  const g = scope.get("$fn");
  const n = v ?? g;
  return n && n > 2 ? n : undefined;
}

// Turn a statement list into a single shape (implicit union, like OpenSCAD).
// Works for both 3D shapes and 2D profiles; mixing the two is an error.
function shapesToOne(shapes) {
  const list = shapes.filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const profiles = list.filter(isProfile).length;
  if (profiles === list.length) return profileOp("UNION", list);
  if (profiles > 0) throw new Error("Can't mix 2D shapes with 3D solids — extrude the 2D part first with linear_extrude().");
  return dsl.union(list);
}

function evalStatements(stmts, scope) {
  // OpenSCAD hoists assignments within a scope; do a pass for defs first so
  // modules and functions can be used before they're declared.
  for (const s of stmts) {
    if (s.k === "moduledef") scope.modules.set(s.name, s);
    if (s.k === "funcdef") scope.funcs.set(s.name, s);
  }
  const shapes = [];
  for (const s of stmts) shapes.push(...evalStatement(s, scope));
  return shapes;
}

function evalStatement(stmt, scope) {
  switch (stmt.k) {
    case "noop": case "moduledef": case "funcdef": return [];
    case "assign": scope.set(stmt.name, evalExpr(stmt.value, scope)); return [];
    case "block": return evalStatements(stmt.body, new Scope(scope));
    case "if": {
      const branch = evalExpr(stmt.cond, scope) ? stmt.then : stmt.other;
      return branch ? evalStatement(branch, scope) : [];
    }
    case "for": {
      const out = [];
      const loop = (idx, inner) => {
        if (idx >= stmt.vars.length) { out.push(...evalStatement(stmt.body, inner)); return; }
        const { name, range } = stmt.vars[idx];
        let values = evalExpr(range, inner);
        if (!Array.isArray(values)) values = [values];
        for (const v of values) {
          const s = new Scope(inner);
          s.set(name, v);
          loop(idx + 1, s);
        }
      };
      loop(0, scope);
      return out;
    }
    case "call": {
      const shape = evalCall(stmt, scope);
      return shape ? [shape] : [];
    }
  }
  throw new Error(`Cannot evaluate statement ${stmt.k}`);
}

function childShape(stmt, scope) {
  if (!stmt.child) return null;
  return shapesToOne(evalStatement(stmt.child, scope));
}

// OpenSCAD's color() takes CSS colour names. The common ones people actually
// type — the full CSS list is 140+, and an unknown name degrades gracefully
// (shape kept, warning shown) rather than failing the build.
const SCAD_COLORS = {
  red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  cyan: "#00ffff", magenta: "#ff00ff", black: "#000000", white: "#ffffff",
  gray: "#808080", grey: "#808080", silver: "#c0c0c0", orange: "#ffa500",
  purple: "#800080", pink: "#ffc0cb", brown: "#a52a2a", lime: "#00ff00",
  navy: "#000080", teal: "#008080", olive: "#808000", maroon: "#800000",
  aqua: "#00ffff", fuchsia: "#ff00ff", gold: "#ffd700", salmon: "#fa8072",
  coral: "#ff7f50", tomato: "#ff6347", orangered: "#ff4500", crimson: "#dc143c",
  indigo: "#4b0082", violet: "#ee82ee", lavender: "#e6e6fa", khaki: "#f0e68c",
  tan: "#d2b48c", beige: "#f5f5dc", ivory: "#fffff0", snow: "#fffafa",
  chocolate: "#d2691e", sienna: "#a0522d", peru: "#cd853f", orchid: "#da70d6",
  plum: "#dda0dd", skyblue: "#87ceeb", steelblue: "#4682b4", royalblue: "#4169e1",
  dodgerblue: "#1e90ff", cornflowerblue: "#6495ed", slateblue: "#6a5acd",
  seagreen: "#2e8b57", forestgreen: "#228b22", darkgreen: "#006400",
  springgreen: "#00ff7f", turquoise: "#40e0d0", hotpink: "#ff69b4",
  deeppink: "#ff1493", lightblue: "#add8e6", lightgreen: "#90ee90",
  lightgray: "#d3d3d3", lightgrey: "#d3d3d3", darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9", dimgray: "#696969", dimgrey: "#696969",
  darkblue: "#00008b", darkred: "#8b0000", goldenrod: "#daa520",
  wheat: "#f5deb3", lightyellow: "#ffffe0", limegreen: "#32cd32",
  mediumblue: "#0000cd", darkorange: "#ff8c00", darkviolet: "#9400d3",
  slategray: "#708090", slategrey: "#708090",
};
function scadColor(c) {
  if (typeof c === "string") {
    const s = c.trim().toLowerCase();
    if (SCAD_COLORS[s]) return SCAD_COLORS[s];
    // #rgb / #rrggbb, with any alpha nibbles/bytes dropped (nothing prints translucent)
    if (/^#[0-9a-f]{3,4}$/.test(s)) return s.slice(0, 4);
    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return s.slice(0, 7);
    return null;
  }
  if (Array.isArray(c) && c.length >= 3) return c.slice(0, 3);  // 0–1 floats; colorize() normalises
  return null;
}

function evalCall(stmt, scope) {
  const { name, args } = stmt;

  // Forgiving: a not-yet-supported operation (minkowski, resize, rotate_extrude…)
  // renders its child instead of failing — an approximation, flagged with a warning.
  if (UNSUPPORTED[name]) {
    warn(`${name}(): ${UNSUPPORTED[name]} — showing its contents un-${name === "minkowski" ? "rounded" : "changed"}`);
    return stmt.child ? childShape(stmt, scope) : null;
  }

  // user-defined module
  const mod = scope.modules.get(name);
  if (mod) {
    const inner = new Scope(scope);
    mod.params.forEach((p, i) => {
      const named = args.named[p.name];
      inner.set(p.name, named !== undefined ? evalExpr(named, scope)
        : args.positional[i] !== undefined ? evalExpr(args.positional[i], scope)
        : p.def ? evalExpr(p.def, scope) : undefined);
    });
    // `children()` inside the module resolves to whatever was passed to the call
    inner.set("__children__", () => childShape(stmt, scope));
    return shapesToOne(evalStatement(mod.body, inner));
  }

  switch (name) {
    case "children": {
      const fn = scope.get("__children__");
      return typeof fn === "function" ? fn() : null;
    }
    case "echo": return null;
    case "__warn__": {
      warn(String(arg(args, scope, 0) ?? "library warning"));
      return null;
    }
    case "assert": {
      const cond = arg(args, scope, 0, "condition");
      if (!cond) {
        throw new Error(`assert failed${args.positional[1] ? `: ${evalExpr(args.positional[1], scope)}` : ""}`);
      }
      return childShape(stmt, scope);
    }
    case "let": {
      const inner = new Scope(scope);
      for (const [k, vNode] of Object.entries(args.named)) inner.set(k, evalExpr(vNode, inner));
      return childShape(stmt, inner);
    }
    case "torus": {
      // BOSL2-style torus: r_maj/r_min, d_maj/d_min, or/ir, od/id
      let rmin = arg(args, scope, null, "r_min");
      const dmin = arg(args, scope, null, "d_min");
      if (rmin === undefined && dmin !== undefined) rmin = dmin / 2;
      let rmaj = arg(args, scope, null, "r_maj");
      const dmaj = arg(args, scope, null, "d_maj");
      if (rmaj === undefined && dmaj !== undefined) rmaj = dmaj / 2;
      const or_ = arg(args, scope, null, "or"), od_ = arg(args, scope, null, "od");
      const ir_ = arg(args, scope, null, "ir"), id_ = arg(args, scope, null, "id");
      const O = or_ ?? (od_ !== undefined ? od_ / 2 : undefined);
      const I = ir_ ?? (id_ !== undefined ? id_ / 2 : undefined);
      if (rmin === undefined && O !== undefined && I !== undefined) rmin = (O - I) / 2;
      if (rmaj === undefined && O !== undefined && rmin !== undefined) rmaj = O - rmin;
      if (rmaj === undefined && I !== undefined && rmin !== undefined) rmaj = I + rmin;
      return dsl.torus({ r: rmaj ?? 1, tube: rmin ?? 0.25, $fn: fnOf(args, scope) });
    }
    case "color": {
      // Real colour, not a pass-through: the tag threads through to the viewer
      // and out again as a colour-grouped 3MF, one filament per colour.
      const child = childShape(stmt, scope);
      if (!child) return null;
      const c = arg(args, scope, 0, "c");
      const hex = scadColor(c);
      if (!hex) {
        warn(`color(${JSON.stringify(c)}): not a colour I recognise — shape kept, colour dropped`);
        return child;
      }
      // OpenSCAD's alpha (4th component / second arg) is a screen effect —
      // nothing prints translucent, so it is deliberately ignored.
      return dsl.colorize(hex, child);
    }
    case "render": return childShape(stmt, scope);
    case "group": return childShape(stmt, scope);

    case "cube": {
      const size = arg(args, scope, 0, "size") ?? 1;
      const center = arg(args, scope, 1, "center") ?? false;
      return dsl.cube(Array.isArray(size) ? asVec3(size, 1) : size, { center });
    }
    case "sphere": {
      let r = arg(args, scope, 0, "r", "radius");
      const d = arg(args, scope, null, "d", "diameter");
      if (r === undefined) r = d !== undefined ? d / 2 : 1;
      return dsl.sphere({ r, $fn: fnOf(args, scope) });
    }
    case "cylinder": {
      const h = arg(args, scope, 0, "h", "height") ?? 1;
      let r = arg(args, scope, 1, "r", "radius");
      let r1 = arg(args, scope, null, "r1");
      let r2 = arg(args, scope, null, "r2");
      const d = arg(args, scope, null, "d");
      const d1 = arg(args, scope, null, "d1");
      const d2 = arg(args, scope, null, "d2");
      if (d !== undefined) r = d / 2;
      if (d1 !== undefined) r1 = d1 / 2;
      if (d2 !== undefined) r2 = d2 / 2;
      const center = arg(args, scope, null, "center") ?? false;
      const $fn = fnOf(args, scope);
      if (r1 !== undefined || r2 !== undefined) {
        return dsl.cylinder({ r1: r1 ?? r ?? 1, r2: r2 ?? r ?? 1, h, center, $fn });
      }
      return dsl.cylinder({ r: r ?? 1, h, center, $fn });
    }

    case "union": case "difference": case "intersection": {
      const kids = collectChildren(stmt, scope);
      if (kids.length < 2) return kids[0] ?? null;
      const profiles = kids.filter(isProfile).length;
      if (profiles > 0 && profiles < kids.length) {
        throw new Error(`${name}() can't mix 2D shapes with 3D solids — extrude the 2D part first.`);
      }
      const op = { union: "UNION", difference: "SUBTRACT", intersection: "INTERSECT" }[name];
      if (profiles) return profileOp(op, kids);
      return name === "union" ? dsl.union(kids)
        : name === "difference" ? dsl.difference(kids)
        : dsl.intersection(kids);
    }

    case "hull": {
      const kids = collectChildren(stmt, scope).filter(Boolean);
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      if (kids.some(isProfile)) {
        throw new Error("hull() of 2D shapes isn't supported yet — wrap each shape in linear_extrude() to hull them in 3D.");
      }
      return dsl.hull(...kids);
    }

    // minkowski() { shape(); sphere(r); } — rounding every outside edge of a
    // part by r — is what the operation is used for in practice, and it is
    // exactly a rounded offset, so that is the case handled. Minkowski with a
    // cube or an arbitrary second shape is a different, much larger operation;
    // it stays unimplemented rather than being silently approximated, because a
    // part that came out the wrong SHAPE would be worse than one that warned.
    case "minkowski": {
      const kids = collectChildren(stmt, scope).filter(Boolean);
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      if (kids.some(isProfile)) {
        throw new Error("minkowski() of 2D shapes isn't supported — use offset() on the outline, or linear_extrude() first.");
      }
      if (kids.length > 2) {
        throw new Error(`minkowski() with ${kids.length} shapes isn't supported — BREPcode handles the common form, a shape and a sphere.`);
      }
      const ball = kids[1];
      const r = (ball?.kind === "prim" && ball.code === "P.S")
        ? (ball.params?.radius ?? ball.params?.r)
        : null;
      if (!(r > 0)) {
        throw new Error("minkowski() is supported when the second shape is a sphere — minkowski() { part(); sphere(r=2); } rounds every outside edge by 2.");
      }
      return dsl.roundedGrow(r, kids[0]);
    }

    case "offset": {
      const child = childShape(stmt, scope);
      if (!child) return null;
      if (!isProfile(child)) throw new Error("offset() works on 2D shapes — put a square / circle / polygon inside it.");
      if (!child.leaf) throw new Error("offset() on a combined 2D shape isn't supported — offset each square/circle/polygon before combining them.");
      const r = arg(args, scope, 0, "r");
      const delta = arg(args, scope, undefined, "delta");
      const chamfer = arg(args, scope, undefined, "chamfer");
      const amount = r ?? delta ?? 0;
      if (!amount) return child;
      // offset(r=) rounds convex corners; offset(delta=) is a straight/miter offset
      const rounded = r !== undefined && !chamfer;
      return profileLeaf(offsetPolygon(child.pts, amount, fnOf(args, scope) || 24, rounded));
    }

    case "translate": {
      const raw = arg(args, scope, 0, "v") ?? [0, 0, 0];
      const child = childShape(stmt, scope);
      if (!child) return null;
      if (isProfile(child)) {
        const [dx, dy] = asVec3(raw);
        return mapProfile(child, ([x, y]) => [x + dx, y + dy]);
      }
      return dsl.translate(asVec3(raw), child);
    }
    case "scale": {
      const raw = arg(args, scope, 0, "v") ?? [1, 1, 1];
      const child = childShape(stmt, scope);
      if (!child) return null;
      if (isProfile(child)) {
        const [sx, sy] = asVec3(raw, 1);
        return mapProfile(child, ([x, y]) => [x * sx, y * sy]);
      }
      return dsl.scale(asVec3(raw, 1), child);
    }
    case "mirror": {
      const raw = arg(args, scope, 0, "v") ?? [1, 0, 0];
      const child = childShape(stmt, scope);
      if (!child) return null;
      if (isProfile(child)) {
        const [nx0, ny0] = raw;
        const len = Math.hypot(nx0 ?? 0, ny0 ?? 0) || 1;
        const nx = (nx0 ?? 0) / len, ny = (ny0 ?? 0) / len;
        return mapProfile(child, ([x, y]) => {
          const d = 2 * (x * nx + y * ny);
          return [x - d * nx, y - d * ny];
        });
      }
      return dsl.mirror(asVec3(raw), child);
    }
    case "rotate": {
      const a = arg(args, scope, 0, "a");
      const axis = arg(args, scope, 1, "v");
      const child = childShape(stmt, scope);
      if (!child) return null;
      if (isProfile(child)) {
        const deg = Array.isArray(a) ? a[2] ?? 0 : a ?? 0;
        if (Array.isArray(a) && ((a[0] ?? 0) !== 0 || (a[1] ?? 0) !== 0)) {
          throw new Error("rotate() on a 2D shape only supports rotation about Z — extrude first for 3D rotation.");
        }
        const rad = deg * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
        return mapProfile(child, ([x, y]) => [x * c - y * s, x * s + y * c]);
      }
      if (axis && typeof a === "number") {
        // axis-angle form: convert to the euler triple our DSL takes
        const q = new Quaternion().setFromAxisAngle(
          new Vector3(...asVec3(axis)).normalize(), MathUtils.degToRad(a));
        const e = new Euler().setFromQuaternion(q, "XYZ");
        return dsl.rotate(
          [MathUtils.radToDeg(e.x), MathUtils.radToDeg(e.y), MathUtils.radToDeg(e.z)], child);
      }
      return dsl.rotate(Array.isArray(a) ? asVec3(a) : [0, 0, a ?? 0], child);
    }

    // ----- 2D primitives -------------------------------------------------
    case "square": {
      const size = arg(args, scope, 0, "size") ?? 1;
      const center = arg(args, scope, 1, "center") ?? false;
      const [w, d] = Array.isArray(size) ? [size[0] ?? 1, size[1] ?? size[0] ?? 1] : [size, size];
      const [ox, oy] = center ? [-w / 2, -d / 2] : [0, 0];
      return profileLeaf([[ox, oy], [ox + w, oy], [ox + w, oy + d], [ox, oy + d]]);
    }
    case "circle": {
      let r = arg(args, scope, 0, "r", "radius");
      const d = arg(args, scope, null, "d", "diameter");
      if (r === undefined) r = d !== undefined ? d / 2 : 1;
      const n = Math.max(3, Math.round(fnOf(args, scope) ?? 32));
      return profileLeaf(circlePts(r, n));
    }
    case "polygon": {
      const points = arg(args, scope, 0, "points");
      const paths = arg(args, scope, 1, "paths");
      if (!Array.isArray(points) || points.length < 3) {
        throw new Error("polygon() needs a points list with at least 3 [x, y] pairs");
      }
      if (Array.isArray(paths) && Array.isArray(paths[0]) && paths.length > 1) {
        throw new Error("polygon() with multiple paths (holes) isn't supported — use difference() of two shapes instead.");
      }
      const ordered = Array.isArray(paths) && Array.isArray(paths[0])
        ? paths[0].map((i) => points[i])
        : points;
      return profileLeaf(ordered.map((p) => [p[0], p[1]]));
    }

    case "linear_extrude": {
      const h = arg(args, scope, 0, "height", "h") ?? 100;
      const center = arg(args, scope, null, "center") ?? false;
      const twist = arg(args, scope, null, "twist") ?? 0;
      const sc = arg(args, scope, null, "scale") ?? 1;
      if (twist !== 0) throw new Error("linear_extrude() twist isn't supported.");
      const scaleOk = Array.isArray(sc) ? sc.every((v) => v === 1) : sc === 1;
      if (!scaleOk) throw new Error("linear_extrude() scale isn't supported — use cone()/cylinder(r1, r2) for tapers.");
      const child = childShape(stmt, scope);
      if (!child) throw new Error("linear_extrude() needs a 2D shape inside it.");
      if (!isProfile(child)) throw new Error("linear_extrude() takes a 2D shape (square/circle/polygon) — its child is already 3D.");
      const solid = profileToSolid(child, h);
      return center ? dsl.translate([0, 0, -h / 2], solid) : solid;
    }

    // The lathe. This was the single most-missed module: every funnel, vase,
    // knob, O-ring and hoop is written with it, and without it the translator
    // warned once and dropped the revolve — leaving the flat 2D profile, which
    // then auto-extruded 1mm. A build that succeeds and hands back a disc.
    //
    // It needs TWO routes, because revolve() and a torus are different shapes
    // to the kernel:
    //
    //   profile TOUCHING the axis   -> revolve(): a true lathe of any outline
    //   profile DETACHED from it    -> there is no surface on the axis at all,
    //                                  and revolve() refuses. A detached circle
    //                                  is exactly a torus, which the kernel has
    //                                  as a primitive, arc and all.
    //
    // Anything else detached (a detached square, say) is a swept solid the
    // kernel cannot make directly, and it is refused by name rather than
    // approximated into something that looks plausible and is not.
    case "rotate_extrude": {
      const angle = arg(args, scope, null, "angle") ?? 360;
      const fn = arg(args, scope, null, "$fn");
      const child = childShape(stmt, scope);
      if (!child) throw new Error("rotate_extrude() needs a 2D shape inside it.");
      if (!isProfile(child)) {
        throw new Error("rotate_extrude() takes a 2D shape (square/circle/polygon) — its child is already 3D.");
      }
      if (!(angle > 0)) throw new Error(`rotate_extrude() angle must be positive, not ${angle}.`);
      return profileToRevolved(child, angle, fn);
    }
  }

  // Not a built-in — but the DSL is much bigger than OpenSCAD's module list.
  // Every shelf part, gear, fastener and joinery function is a plain function
  // on the DSL, and there is no reason an OpenSCAD file cannot call one.
  //
  // This closes a silent failure that is worse than an error: without it,
  // `dowelsOnPlane(...)` inside a difference() warned once, contributed nothing,
  // and produced a part with NO HOLES IN IT that looked perfectly fine. The
  // model was wrong in exactly the way you cannot see.
  //
  // Named arguments become the options object every DSL function takes; a child
  // is passed first, for the handful that transform a shape.
  const dslFn = dsl[name];
  if (typeof dslFn === "function") {
    const opts = {};
    for (const [k, v] of Object.entries(args.named)) opts[k] = evalExpr(v, scope);
    const positional = args.positional.map((v) => evalExpr(v, scope));
    const child = stmt.child ? childShape(stmt, scope) : null;
    try {
      let out;
      if (child) out = dslFn(child, opts);
      else if (positional.length && !Object.keys(opts).length) out = dslFn(...positional);
      else out = dslFn(opts);
      if (out && (out.__brepscript || out.__brepscript2d)) return out;
      warn(`${name}() ran but returned no shape`);
      return null;
    } catch (e) {
      // A real error from a real function — say what it said, rather than
      // pretending the call was never understood.
      throw new Error(`${name}(): ${e.message}`);
    }
  }

  // Forgiving: an unknown module (an unsupported library call, or a typo) should
  // not kill the whole model. Warn, and pass its children through so wrapping
  // modules still render their contents — one bad call just gets skipped.
  warn(`${name}() isn't a known module — skipped${stmt.child ? " (its contents still render)" : ""}`);
  return childShape(stmt, scope);
}

function collectChildren(stmt, scope) {
  if (!stmt.child) return [];
  const kids = evalStatement(stmt.child, scope).filter(Boolean);
  return kids;
}

// ------------------------------------------------------------ library shims
//
// Real BOSL2/MCAD are huge (sweeps, gears, attachment solving) — bundling them
// verbatim is an OpenSCAD-WASM job, not a translator job. Instead the calls that
// dominate real-world scripts are shimmed here, written in OpenSCAD and parsed
// by our own evaluator. Anything approximated says so via __warn__ rather than
// silently producing different geometry.

const BOSL2_SHIM = `
CENTER=[0,0,0]; CTR=[0,0,0];
LEFT=[-1,0,0]; RIGHT=[1,0,0];
FRONT=[0,-1,0]; FWD=[0,-1,0]; BACK=[0,1,0];
BOTTOM=[0,0,-1]; BOT=[0,0,-1]; DOWN=[0,0,-1];
TOP=[0,0,1]; UP=[0,0,1];
module up(z=0){ translate([0,0,z]) children(); }
module down(z=0){ translate([0,0,-z]) children(); }
module left(x=0){ translate([-x,0,0]) children(); }
module right(x=0){ translate([x,0,0]) children(); }
module fwd(y=0){ translate([0,-y,0]) children(); }
module back(y=0){ translate([0,y,0]) children(); }
module move(v=[0,0,0]){ translate(v) children(); }
module xmove(x=0){ translate([x,0,0]) children(); }
module ymove(y=0){ translate([0,y,0]) children(); }
module zmove(z=0){ translate([0,0,z]) children(); }
module xrot(a=0){ rotate([a,0,0]) children(); }
module yrot(a=0){ rotate([0,a,0]) children(); }
module zrot(a=0){ rotate([0,0,a]) children(); }
module cuboid(size=[1,1,1], rounding=0, chamfer=0, anchor=0, spin=0, orient=0, edges=0, except=0){
  sz = (size[0] == undef) ? [size, size, size] : size;
  rr = (rounding > 0) ? rounding : chamfer;
  if (rr > 0) {
    if (edges != 0 || except != 0) __warn__("BOSL2 cuboid(): edge selection ignored — all edges rounded");
    if (chamfer > 0 && rounding == 0) __warn__("BOSL2 cuboid(): chamfer approximated as rounding");
    // rounded box = convex hull of eight corner spheres
    hull() for (dx=[-1,1]) for (dy=[-1,1]) for (dz=[-1,1])
      translate([dx*(sz[0]/2-rr), dy*(sz[1]/2-rr), dz*(sz[2]/2-rr)]) sphere(r=rr);
  } else {
    cube(sz, center=true);
  }
  children();
}
// A frustum between two rectangles — realised as a hull of the two profiles.
module prismoid(size1=[1,1], size2=[1,1], h=1, shift=[0,0], rounding=0, chamfer=0, anchor=0, spin=0, orient=0){
  if (rounding > 0 || chamfer > 0) __warn__("BOSL2 prismoid(): rounding/chamfer ignored");
  hull() {
    linear_extrude(0.001) square(size1, center=true);
    translate([shift[0], shift[1], h]) linear_extrude(0.001) square(size2, center=true);
  }
  children();
}
// Copy modules: repeat children along an axis / in a grid.
module xcopies(spacing=0, n=2, l=0){ ss=(l>0 && n>1) ? l/(n-1) : spacing; for(i=[0:n-1]) translate([(i-(n-1)/2)*ss,0,0]) children(); }
module ycopies(spacing=0, n=2, l=0){ ss=(l>0 && n>1) ? l/(n-1) : spacing; for(i=[0:n-1]) translate([0,(i-(n-1)/2)*ss,0]) children(); }
module zcopies(spacing=0, n=2, l=0){ ss=(l>0 && n>1) ? l/(n-1) : spacing; for(i=[0:n-1]) translate([0,0,(i-(n-1)/2)*ss]) children(); }
module xrot_copies(n=2){ for(i=[0:n-1]) rotate([i*360/n,0,0]) children(); }
module yrot_copies(n=2){ for(i=[0:n-1]) rotate([0,i*360/n,0]) children(); }
module zrot_copies(n=2){ for(i=[0:n-1]) rotate([0,0,i*360/n]) children(); }
module rot_copies(n=2){ for(i=[0:n-1]) rotate([0,0,i*360/n]) children(); }
module grid_copies(spacing=10, n=2){
  ns = (n[0] == undef) ? [n, n] : n;
  sp = (spacing[0] == undef) ? [spacing, spacing] : spacing;
  for (ix=[0:ns[0]-1]) for (iy=[0:ns[1]-1])
    translate([(ix-(ns[0]-1)/2)*sp[0], (iy-(ns[1]-1)/2)*sp[1], 0]) children();
}
module mirror_copy(v=[1,0,0]){ children(); mirror(v) children(); }
module xflip_copy(){ children(); mirror([1,0,0]) children(); }
module yflip_copy(){ children(); mirror([0,1,0]) children(); }
module cyl(h=0, l=0, r=0, r1=0, r2=0, d=0, d1=0, d2=0,
           rounding=0, rounding1=0, rounding2=0, chamfer=0, chamfer1=0, chamfer2=0,
           anchor=0, spin=0, orient=0, center=true, circum=false, realign=false){
  if (rounding > 0 || rounding1 > 0 || rounding2 > 0 || chamfer > 0 || chamfer1 > 0 || chamfer2 > 0)
    __warn__("BOSL2 cyl(): rounding/chamfer ignored");
  hh = (l > 0) ? l : ((h > 0) ? h : 1);
  rb = (d1 > 0) ? d1/2 : ((r1 > 0) ? r1 : ((d > 0) ? d/2 : ((r > 0) ? r : 1)));
  rt = (d2 > 0) ? d2/2 : ((r2 > 0) ? r2 : ((d > 0) ? d/2 : ((r > 0) ? r : 1)));
  if (rb == rt) cylinder(h=hh, r=rb, center=true);
  else cylinder(h=hh, r1=rb, r2=rt, center=true);
  children();
}
module zcyl(h=0,l=0,r=0,r1=0,r2=0,d=0,d1=0,d2=0){ cyl(h=h,l=l,r=r,r1=r1,r2=r2,d=d,d1=d1,d2=d2); }
module xcyl(h=0,l=0,r=0,r1=0,r2=0,d=0,d1=0,d2=0){ yrot(90) cyl(h=h,l=l,r=r,r1=r1,r2=r2,d=d,d1=d1,d2=d2); }
module ycyl(h=0,l=0,r=0,r1=0,r2=0,d=0,d1=0,d2=0){ xrot(90) cyl(h=h,l=l,r=r,r1=r1,r2=r2,d=d,d1=d1,d2=d2); }
module spheroid(r=0, d=0, style=0, anchor=0){ sphere(r = (d > 0) ? d/2 : ((r > 0) ? r : 1)); children(); }
module tube(h=1, od=0, id=0, or=0, ir=0, wall=0, r=0, d=0, anchor=0, center=true){
  ro = (or > 0) ? or : ((od > 0) ? od/2 : ((r > 0) ? r : ((d > 0) ? d/2 : 1)));
  ri = (ir > 0) ? ir : ((id > 0) ? id/2 : ((wall > 0) ? ro - wall : ro/2));
  difference(){ cylinder(h=h, r=ro, center=true); cylinder(h=h+0.02, r=ri, center=true); }
  children();
}
module attach(a=0, b=0, inside=false){ __warn__("BOSL2 attach(): no attachment solver — children placed at parent centre"); children(); }
module position(at=0){ __warn__("BOSL2 position(): no attachment solver — children placed at parent centre"); children(); }
module attachable(anchor=0, spin=0, orient=0, size=0, r=0, d=0, h=0, l=0){ children(); }
module diff(remove="remove", keep="keep"){ __warn__("BOSL2 diff(): tags not supported — children combined as a plain union"); children(); }
module tag(t=""){ children(); }
`;

const MCAD_SHIM = `
module roundedBox(size=[1,1,1], radius=0.1, sidesonly=false){
  __warn__("MCAD roundedBox(): corners left square");
  cube(size, center=true);
}
module polyhole(h=1, d=1){ cylinder(h=h, d=d); }
module teardrop(radius=1, length=1, angle=90){
  __warn__("MCAD teardrop(): approximated as a plain cylinder");
  rotate([0,90,0]) cylinder(h=length, r=radius, center=true);
}
`;

const LIBRARIES = [
  { match: /^BOSL2\//i, shim: BOSL2_SHIM, name: "BOSL2" },
  { match: /^MCAD\//i, shim: MCAD_SHIM, name: "MCAD" },
];

// -------------------------------------------------------------------- public

/** Parse and evaluate OpenSCAD source into a BrepScript shape. */
export function fromOpenSCAD(source) {
  WARNINGS.length = 0;

  // include/use directives come out before tokenizing (a <path> isn't a token
  // stream). Known libraries prepend their shim; unknown ones warn and continue,
  // so a legacy script still builds if it only used calls we know.
  const libs = [];
  const body = String(source).replace(/\b(include|use)\s*<([^>]+)>\s*;?/g, (_, _kw, path) => {
    libs.push(path.trim());
    return "";
  });

  let prelude = "";
  const seen = new Set();
  for (const path of libs) {
    const lib = LIBRARIES.find((l) => l.match.test(path));
    if (lib) {
      if (!seen.has(lib.name)) { prelude += lib.shim; seen.add(lib.name); }
      // Only a subset is shimmed — any call outside it errors by name.
      if (!/^(BOSL2\/(std|shapes3d|transforms|attachments)\.scad|MCAD\/(boxes|polyholes|teardrop)\.scad)$/i.test(path)) {
        warn(`<${path}>: only the common ${lib.name} subset is shimmed — calls outside it will error by name`);
      }
    } else {
      warn(`library <${path}> isn't bundled — its modules will error if called`);
    }
  }

  const stmts = new Parser(tokenize(prelude + "\n" + body)).parseProgram();
  const scope = new Scope(null);
  scope.modules = new Map();
  scope.funcs = new Map();
  // OpenSCAD built-in constants/specials. PI is used everywhere (gears, involutes);
  // the $-specials keep animation/viewport-driven scripts from erroring on them.
  scope.set("PI", Math.PI);
  scope.set("undef", undefined);
  scope.set("$t", 0); scope.set("$fn", 0); scope.set("$fa", 12); scope.set("$fs", 2);
  scope.set("$vpr", [55, 0, 25]); scope.set("$vpt", [0, 0, 0]); scope.set("$vpd", 140); scope.set("$vpf", 22);
  scope.set("$preview", true); scope.set("$children", 0);
  const shapes = evalStatements(stmts, scope).filter(Boolean);
  // Multicolour designs: top-level siblings carrying two or more DIFFERENT
  // colour() tags stay a group() — separate solids, one filament per colour in
  // the 3MF — instead of strict OpenSCAD's implicit union, which welds them
  // into one solid wearing one colour. Same-colour/uncoloured siblings keep
  // union semantics, and an explicit union() still welds regardless.
  let shape;
  const solids3d = shapes.filter((s) => !isProfile(s));
  const tags = new Set(solids3d.map((s) => s.color).filter(Boolean));
  if (shapes.length > 1 && solids3d.length === shapes.length && tags.size > 1) {
    warn("multiple colours at top level — parts kept separate so each keeps its colour; wrap everything in union() to weld them into one");
    shape = dsl.group(...shapes);
  } else {
    shape = shapesToOne(shapes);
  }
  if (!shape) throw new Error("That OpenSCAD produced no solids.");
  // Forgiving: a top-level 2D result (a bare square/circle/polygon design) gets
  // a thin auto-extrude so it shows as a solid instead of erroring — the user
  // can add their own linear_extrude() for a specific height.
  if (isProfile(shape)) {
    warn("2D design auto-extruded 1mm — wrap it in linear_extrude(height=…) to set the thickness");
    return profileToSolid(shape, 1);
  }
  return shape;
}

/** Cheap heuristic: does this look like OpenSCAD rather than BrepScript? */
export function looksLikeOpenSCAD(src) {
  const s = src.trim();
  if (!s) return false;
  // JS-only keywords: OpenSCAD has no const/let/return/arrow functions.
  if (/\bimport\s|\bexport\s|\bconst\s|\blet\s|\breturn[\s(]|=>/.test(s)) return false;
  // Object literals are JS-only. OpenSCAD's `{` is always a block, so it can
  // only follow `)` or start a statement — never sit right after `(` or `,`
  // as an argument. Without this, one juxtaposition typo in BREPcode source
  // (`importedMesh("x.stl"))cube(...)`) trips the `)ident(` rule below, the
  // whole file gets handed to this translator, and the user is told the
  // problem is the `{` of their options object several lines earlier.
  if (/[(,]\s*\{\s*[A-Za-z_$"']/.test(s)) return false;
  return (
    /\b(module|include|use)\s/.test(s) ||
    /\b(include|use)\s*</.test(s) ||
    /\$fn\s*=/.test(s) ||
    // identifiers that only exist in OpenSCAD (supported or not)
    /\b(linear_extrude|rotate_extrude|projection|surface|children|echo)\s*\(/.test(s) ||
    // hull() and minkowski() exist in BOTH languages now, so the NAME cannot
    // decide which one this is — the shape of the call has to. OpenSCAD writes
    // them with NO arguments and a block after; BREPcode passes the shapes as
    // arguments. Listing the bare name here meant `minkowski(3, cube([20,20,20]))`
    // — ordinary BREPcode — was handed to this translator, which then reported
    // "that OpenSCAD produced no solids" about code that was never OpenSCAD.
    // hull() had the same fault and only escaped it by luck: the usual way to
    // write one includes an options object, and the rule above bails on those.
    /\b(hull|minkowski)\s*\(\s*\)/.test(s) ||
    // polygon/square/circle/polyhedron collide with BREPcode's own vocabulary,
    // so only count them as OpenSCAD when used statement-style (trailing
    // semicolon), never as a JS argument like revolve(360, polygon([...]))
    /\b(polygon|square|circle|polyhedron)\s*\([^;{]*\)\s*;/.test(s) ||
    // juxtaposed calls — `translate([...]) cube(...)` — which is a syntax error in JS
    /\)\s*[A-Za-z_$][\w$]*\s*\(/.test(s) ||
    /\b(union|difference|intersection|translate|rotate|scale|mirror)\s*\([^)]*\)\s*\{/.test(s) ||
    /\b(cube|sphere|cylinder)\s*\([^)]*\)\s*;/.test(s) ||
    /^[A-Za-z_$][\w$]*\s*=\s*[^=]+;/m.test(s)
  );
}
