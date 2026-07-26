// build123d / CadQuery (OCP-style Python) -> BrepScript DSL.
//
// Covers the practical algebra-mode subset people actually paste:
//
//   from build123d import *
//   body = Box(30, 30, 12)
//   hole = Pos(0, 0, -1) * Cylinder(8, 14)
//   part = body - hole
//   part -= Pos(10, 0, 0) * Sphere(4)
//
// and fluent CadQuery chains without selectors:
//
//   import cadquery as cq
//   result = cq.Workplane("XY").box(30, 30, 12).cut(
//       cq.Workplane("XY").cylinder(14, 8))
//
// build123d conventions honoured: primitives are CENTRED (unlike BREPcode's
// corner-origin cube), Pos/Rot/Location are locations applied with *, align=
// tuples shift Boxes, and part±= compound assignment works. Builder mode
// (with BuildPart() as ...) and CadQuery selectors (.faces(">Z")...) are out
// of scope and fail with a pointer to algebra style.

import {
  cube, cylinder, cone, sphere, torus,
  union, difference, intersection, translate, rotate,
} from "./dsl.js";

export function looksLikePython(src) {
  if (/\b(const|let|=>)\b|;\s*$/m.test(src)) return false;      // JS
  if (/\bfrom\s+(build123d|cadquery)\s+import|\bimport\s+(build123d|cadquery)/.test(src)) return true;
  if (/\bcq\s*\.\s*Workplane\s*\(|\bWorkplane\s*\(\s*["']/.test(src)) return true;
  // bare algebra-mode snippets: python assignment of a capitalised primitive
  return /^\s*\w+\s*=\s*(Box|Cylinder|Sphere|Cone|Torus)\s*\(/m.test(src)
    && /\b(Pos|Rot|Align|Location)\b|\*\s*(Box|Cylinder|Sphere|Cone|Torus)\(/.test(src);
}

// ------------------------------------------------------------- tokenizer

function tokenize(src) {
  const toks = [];
  let i = 0, paren = 0;
  const push = (type, value) => toks.push({ type, value });
  while (i < src.length) {
    const c = src[i];
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "\n") { if (paren === 0) push("nl"); i++; continue; }
    if (c === "\\" && src[i + 1] === "\n") { i += 2; continue; }   // line continuation
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1]))) {
      let j = i;
      while (j < src.length && /[0-9._eE]/.test(src[j])) {
        if ((src[j] === "e" || src[j] === "E") && /[+-]/.test(src[j + 1])) j++;
        j++;
      }
      push("num", parseFloat(src.slice(i, j).replace(/_/g, "")));
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[\w]/.test(src[j])) j++;
      push("name", src.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1, out = "";
      while (j < src.length && src[j] !== q) { out += src[j]; j++; }
      push("str", out);
      i = j + 1;
      continue;
    }
    const three = src.slice(i, i + 2);
    if (["+=", "-=", "&=", "|=", "*=", "//", "**", "=="].includes(three)) {
      push("op", three);
      i += 2;
      continue;
    }
    if ("()[],=.+-*/&|:".includes(c)) {
      if (c === "(" || c === "[") paren++;
      if (c === ")" || c === "]") paren = Math.max(0, paren - 1);
      push(c === "(" || c === ")" || c === "[" || c === "]" || c === "," || c === "." || c === ":" ? c : "op", c);
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}" in the Python code`);
  }
  push("nl");
  push("eof");
  return toks;
}

// ---------------------------------------------------------------- values
//
// Three value species flow through the evaluator: numbers/arrays/strings,
// SHAPES (BrepScript DSL nodes), and LOCATIONS ({__loc: shape=>shape}).

const isShape = (v) => !!v?.__brepscript;
const isLoc = (v) => typeof v?.__loc === "function";
const loc = (fn) => ({ __loc: fn });

const num = (v, what) => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what} needs a number`);
  return v;
};

const ALIGN = { MIN: 0, CENTER: 1, MAX: 2 };

function alignShift(size, a) {
  return a === ALIGN.MIN ? 0 : a === ALIGN.MAX ? -size : -size / 2;
}

// build123d call-signature helpers: positional + keyword args arrive as
// { args: [...], kw: {...} }
function arg(c, i, name, fallback) {
  if (c.kw[name] !== undefined) return c.kw[name];
  if (c.args[i] !== undefined) return c.args[i];
  return fallback;
}

function makeEnv(langBox) {
  const env = Object.create(null);

  // ---- build123d shapes (all CENTRED, per its convention)
  env.Box = (c) => {
    const l = num(arg(c, 0, "length"), "Box length");
    const w = num(arg(c, 1, "width"), "Box width");
    const h = num(arg(c, 2, "height"), "Box height");
    let al = c.kw.align ?? arg(c, 3, "align");
    if (al === undefined) al = [ALIGN.CENTER, ALIGN.CENTER, ALIGN.CENTER];
    if (!Array.isArray(al)) al = [al, al, al];
    langBox.lang = langBox.lang || "build123d";
    return translate(
      [alignShift(l, al[0]), alignShift(w, al[1]), alignShift(h, al[2])],
      cube([l, w, h]),
    );
  };
  env.Cylinder = (c) => {
    const r = num(arg(c, 0, "radius"), "Cylinder radius");
    const h = num(arg(c, 1, "height"), "Cylinder height");
    langBox.lang = langBox.lang || "build123d";
    return translate([0, 0, -h / 2], cylinder({ r, h, $fn: 64 }));
  };
  env.Cone = (c) => {
    const rb = num(arg(c, 0, "bottom_radius"), "Cone bottom_radius");
    const rt = num(arg(c, 1, "top_radius") ?? 0, "Cone top_radius");
    const h = num(arg(c, 2, "height"), "Cone height");
    return translate([0, 0, -h / 2], cone({ r1: rb, r2: rt, h, $fn: 64 }));
  };
  env.Sphere = (c) => sphere({ r: num(arg(c, 0, "radius"), "Sphere radius"), $fn: 48 });
  env.Torus = (c) => torus({
    r: num(arg(c, 0, "major_radius"), "Torus major_radius"),
    tube: num(arg(c, 1, "minor_radius"), "Torus minor_radius"),
    $fn: 48,
  });

  // ---- locations
  const posLoc = (x, y, z) => loc((s) => translate([x, y, z], s));
  env.Pos = (c) => {
    let [x, y, z] = [arg(c, 0, "X", 0), arg(c, 1, "Y", 0), arg(c, 2, "Z", 0)];
    if (Array.isArray(x)) [x, y = 0, z = 0] = x;
    return posLoc(num(x, "Pos"), num(y ?? 0, "Pos"), num(z ?? 0, "Pos"));
  };
  env.Location = env.Pos;
  env.Rot = (c) => {
    const rx = num(c.kw.X ?? arg(c, 0, "X", 0), "Rot");
    const ry = num(c.kw.Y ?? arg(c, 1, "Y", 0), "Rot");
    const rz = num(c.kw.Z ?? arg(c, 2, "Z", 0), "Rot");
    return loc((s) => rotate([rx, ry, rz], s));
  };
  env.Rotation = env.Rot;

  // ---- enums / namespaces
  env.Align = { MIN: ALIGN.MIN, CENTER: ALIGN.CENTER, MAX: ALIGN.MAX };
  env.Plane = {
    XY: loc((s) => s),
    get XZ() { throw new Error("Only Plane.XY is supported — rotate the shape instead of using other planes"); },
    get YZ() { throw new Error("Only Plane.XY is supported — rotate the shape instead of using other planes"); },
  };
  env.Mode = { ADD: "ADD", SUBTRACT: "SUBTRACT" };

  // ---- CadQuery
  const wpMethods = (self) => ({
    box: (c) => {
      langBox.lang = "cadquery";
      const [w, d, h] = [num(arg(c, 0, "length"), "box"), num(arg(c, 1, "width"), "box"), num(arg(c, 2, "height"), "box")];
      const centred = arg(c, 3, "centered", true);
      let s = cube([w, d, h]);
      if (centred !== false) s = translate([-w / 2, -d / 2, -h / 2], s);
      return wp(self.shape ? union(self.shape, s) : s);
    },
    cylinder: (c) => {
      langBox.lang = "cadquery";
      const h = num(arg(c, 0, "height"), "cylinder");
      const r = num(arg(c, 1, "radius"), "cylinder");
      const s = translate([0, 0, -h / 2], cylinder({ r, h, $fn: 64 }));
      return wp(self.shape ? union(self.shape, s) : s);
    },
    sphere: (c) => wp(self.shape ? union(self.shape, sphere({ r: num(arg(c, 0, "radius"), "sphere"), $fn: 48 }))
      : sphere({ r: num(arg(c, 0, "radius"), "sphere"), $fn: 48 })),
    translate: (c) => {
      const v = arg(c, 0, "vec");
      if (!Array.isArray(v)) throw new Error("translate() needs a (x, y, z) tuple");
      return wp(translate(v, needShape(self)));
    },
    union: (c) => wp(union(needShape(self), needShape(arg(c, 0, "other")))),
    cut: (c) => wp(difference(needShape(self), needShape(arg(c, 0, "other")))),
    intersect: (c) => wp(intersection(needShape(self), needShape(arg(c, 0, "other")))),
  });
  const UNSUPPORTED_CQ = ["faces", "edges", "vertices", "workplane", "hole", "cboreHole", "cskHole",
    "fillet", "chamfer", "shell", "extrude", "revolve", "rect", "circle", "moveTo", "lineTo", "offset2D"];
  function wp(shape) {
    const self = { __wp: true, shape };
    self.methods = wpMethods(self);
    for (const m of UNSUPPORTED_CQ) {
      self.methods[m] = () => {
        throw new Error(`CadQuery .${m}() isn't supported here — stick to box/cylinder/sphere with cut/union/intersect/translate, or use build123d algebra style (Box(…) - Cylinder(…))`);
      };
    }
    return self;
  }
  const needShape = (v) => {
    const s = v?.__wp ? v.shape : v;
    if (!isShape(s)) throw new Error("expected a solid here");
    return s;
  };
  env.Workplane = (c) => wp(null);
  env.cq = { Workplane: env.Workplane };
  env.cadquery = env.cq;

  env.__needShape = needShape;
  return env;
}

// ----------------------------------------------------------------- parser

export function fromPython(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const eat = (type, value) => {
    const t = next();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(`Expected ${value ?? type} but got "${t.value ?? t.type}"`);
    }
    return t;
  };

  const langBox = { lang: "" };
  const env = makeEnv(langBox);
  const vars = Object.create(null);
  let lastShape = null;

  // if any statement line is indented, there's a block structure we don't do
  if (/^(?:[ \t]+)\S/m.test(src.replace(/\(([^()]|\([^()]*\))*\)/gs, "()"))) {
    if (/\bwith\s+Build(Part|Sketch|Line)/.test(src)) {
      throw new Error('build123d builder mode ("with BuildPart() as …") isn\'t supported — use algebra mode instead: part = Box(30, 30, 12) - Pos(0, 0, -1) * Cylinder(8, 14)');
    }
    throw new Error("Indented Python blocks (if/for/def/with) aren't supported — keep it to flat assignments like part = Box(20, 20, 10) - Cylinder(5, 12)");
  }

  function atom() {
    const t = next();
    if (t.type === "num") return t.value;
    if (t.type === "str") return t.value;
    if (t.type === "(") {
      // parenthesised expr or tuple
      const items = [];
      if (peek().type !== ")") {
        items.push(expr());
        while (peek().type === ",") { next(); if (peek().type === ")") break; items.push(expr()); }
      }
      eat(")");
      return items.length === 1 ? items[0] : items;
    }
    if (t.type === "[") {
      const items = [];
      if (peek().type !== "]") {
        items.push(expr());
        while (peek().type === ",") { next(); if (peek().type === "]") break; items.push(expr()); }
      }
      eat("]");
      return items;
    }
    if (t.type === "op" && t.value === "-") return negate(atomPostfix());
    if (t.type === "name") {
      if (t.value in vars) return postfix(vars[t.value]);
      if (t.value in env) return postfix(env[t.value]);
      throw new Error(`"${t.value}" isn't defined — supported names: Box, Cylinder, Cone, Sphere, Torus, Pos, Rot, Align, Plane.XY, cq.Workplane`);
    }
    throw new Error(`Unexpected "${t.value ?? t.type}"`);
  }
  const negate = (v) => {
    if (typeof v === "number") return -v;
    throw new Error("unary minus only works on numbers here");
  };
  const atomPostfix = () => atom();

  function callArgs() {
    const c = { args: [], kw: {} };
    eat("(");
    while (peek().type !== ")") {
      if (peek().type === "name" && toks[p + 1]?.type === "op" && toks[p + 1].value === "=") {
        const k = next().value;
        next();
        c.kw[k] = expr();
      } else {
        c.args.push(expr());
      }
      if (peek().type === ",") next();
    }
    eat(")");
    return c;
  }

  function postfix(v) {
    for (;;) {
      if (peek().type === "(") {
        if (typeof v !== "function") throw new Error("only the built-in names are callable");
        v = v(callArgs());
      } else if (peek().type === ".") {
        next();
        const name = eat("name").value;
        if (v?.__wp) {
          const m = v.methods[name];
          if (!m) throw new Error(`CadQuery .${name}() isn't supported`);
          v = m(callArgs());
        } else if (v && typeof v === "object" && name in v) {
          v = v[name];
        } else if (isShape(v) || isShape(v?.shape)) {
          throw new Error(`.${name}() isn't supported on solids — use +, -, & operators instead`);
        } else {
          throw new Error(`Unknown attribute .${name}`);
        }
      } else {
        return v;
      }
    }
  }

  function term() {
    let v = atom();
    while (peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
      const op = next().value;
      const r = atom();
      if (op === "*") {
        if (isLoc(v)) {
          if (isLoc(r)) { const a = v.__loc, b = r.__loc; v = loc((s) => a(b(s))); }
          else if (isShape(r) || r?.__wp) v = v.__loc(r?.__wp ? env.__needShape(r) : r);
          else throw new Error("a location (Pos/Rot) can only multiply a shape or another location");
        } else if (typeof v === "number" && typeof r === "number") v = v * r;
        else throw new Error("* only combines numbers, or a Pos/Rot with a shape");
      } else {
        if (typeof v !== "number" || typeof r !== "number") throw new Error("/ only works on numbers");
        v = v / r;
      }
    }
    return v;
  }

  function arith() {
    let v = term();
    while (peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
      const op = next().value;
      const r = term();
      const vs = v?.__wp ? env.__needShape(v) : v;
      const rs = r?.__wp ? env.__needShape(r) : r;
      if (typeof vs === "number" && typeof rs === "number") v = op === "+" ? vs + rs : vs - rs;
      else if (isShape(vs) && isShape(rs)) v = op === "+" ? union(vs, rs) : difference(vs, rs);
      else throw new Error(`${op} needs two numbers or two solids`);
    }
    return v;
  }

  function expr() {
    let v = arith();
    while (peek().type === "op" && (peek().value === "&" || peek().value === "|")) {
      const op = next().value;
      const r = arith();
      const vs = v?.__wp ? env.__needShape(v) : v;
      const rs = r?.__wp ? env.__needShape(r) : r;
      if (!isShape(vs) || !isShape(rs)) throw new Error(`${op} needs two solids`);
      v = op === "&" ? intersection(vs, rs) : union(vs, rs);
    }
    return v;
  }

  // ---- statement loop
  while (peek().type !== "eof") {
    if (peek().type === "nl") { next(); continue; }
    // import lines: skip to newline
    if (peek().type === "name" && (peek().value === "from" || peek().value === "import")) {
      while (peek().type !== "nl" && peek().type !== "eof") next();
      continue;
    }
    // ignored calls: show/show_object/export_*/print
    if (peek().type === "name" && /^(show|show_object|show_topology|export_stl|export_step|print)$/.test(peek().value)
        && toks[p + 1]?.type === "(") {
      let depth = 0;
      do {
        const t = next();
        if (t.type === "(") depth++;
        if (t.type === ")") depth--;
      } while ((depth > 0 || peek().type !== "nl") && peek().type !== "eof");
      continue;
    }
    // tuple unpacking: `length, width, thickness = 80, 60, 10` (very common)
    if (peek().type === "name" && toks[p + 1]?.type === ",") {
      const names = [next().value];
      while (peek().type === ",") {
        next();
        if (peek().type === "name") names.push(next().value); else break;
      }
      if (peek().type === "op" && peek().value === "=") {
        next();
        const vals = [expr()];
        while (peek().type === ",") { next(); vals.push(expr()); }
        const flat = (vals.length === 1 && Array.isArray(vals[0])) ? vals[0] : vals;
        names.forEach((nm, i) => { vars[nm] = flat[i]; });
        if (peek().type === "nl") next();
        continue;
      }
      throw new Error(`Expected '=' after '${names.join(", ")}'`);
    }
    // assignment?
    if (peek().type === "name" && toks[p + 1]?.type === "op"
        && ["=", "+=", "-=", "&=", "|="].includes(toks[p + 1].value)) {
      const name = next().value;
      const op = next().value;
      let v = expr();
      if (op !== "=") {
        const cur = vars[name];
        if (!isShape(cur)) throw new Error(`${name} ${op} … needs ${name} to already be a solid`);
        const rv = v?.__wp ? env.__needShape(v) : v;
        v = op === "+=" || op === "|=" ? union(cur, rv)
          : op === "-=" ? difference(cur, rv)
          : intersection(cur, rv);
      }
      vars[name] = v;
      const s = v?.__wp ? v.shape : v;
      if (isShape(s)) lastShape = { name, shape: s };
      if (peek().type === "nl") next();
      continue;
    }
    // bare expression statement
    const v = expr();
    const s = v?.__wp ? v.shape : v;
    if (isShape(s)) lastShape = { name: null, shape: s };
    if (peek().type === "nl") next();
  }

  // prefer conventional result names over recency
  for (const name of ["part", "result", "model", "shape", "solid"]) {
    const v = vars[name];
    const s = v?.__wp ? v.shape : v;
    if (isShape(s)) return { shape: s, lang: langBox.lang || "build123d" };
  }
  if (lastShape) return { shape: lastShape.shape, lang: langBox.lang || "build123d" };
  throw new Error("No solid was produced — assign one, e.g.  part = Box(20, 20, 10) - Cylinder(5, 12)");
}
