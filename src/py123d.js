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
// tuples shift Boxes, and part±= compound assignment works.
//
// Builder mode works too (with BuildPart() as part: / BuildSketch / BuildLine,
// Locations as blocks, mode=Mode.SUBTRACT, extrude(amount=…), faces picked by
// part.faces().sort_by(Axis.Z)[-1]), and so does ordinary Python around it:
// if / for / while / def / lambda / comprehensions / math. CadQuery selectors
// (.faces(">Z")...) are still out of scope.

import {
  cube, cylinder, cone, sphere, torus, freeform,
  union, difference, intersection, translate, rotate, mirror,
  fillet as dslFillet, chamfer as dslChamfer,
} from "./dsl.js";
// BuildSketch/BuildLine ride the SAME 2D profile species as the OpenSCAD
// translator, so booleans, extrude and the auto-1mm forgiveness are shared.
import {
  isProfile, profileLeaf, profileOp, profileToSolid, mapProfile, offsetPolygon,
} from "./openscad.js";

export function looksLikePython(src) {
  if (/\b(const|let|=>)\b|;\s*$/m.test(src)) return false;      // JS
  if (/\bfrom\s+(build123d|cadquery)\s+import|\bimport\s+(build123d|cadquery)/.test(src)) return true;
  if (/\bcq\s*\.\s*Workplane\s*\(|\bWorkplane\s*\(\s*["']/.test(src)) return true;
  // bare algebra-mode snippets: python assignment of a capitalised primitive,
  // sketch object, or line object (BuildSketch/BuildLine vocabulary)
  const PY_OBJ = "Box|Cylinder|Sphere|Cone|Torus|Wedge|ConvexPolyhedron|Rectangle(?:Rounded)?|Circle|Ellipse|Polygon|RegularPolygon|Triangle|Trapezoid|Slot\\w+|Line|Polyline|FilletPolyline|PolarLine|Spline|Bezier|\\w*Arc";
  if (/^\s*with\s+Build(Part|Sketch|Line)\s*\(/m.test(src)) return true;
  // Python blocks (def / for / while / if / with lines ending in ":") around
  // build123d objects
  if (/^\s*(def\s+\w+\s*\(.*\)|for\s+[\w, ()]+\s+in\s+.+|while\s+.+|if\s+.+|with\s+.+)\s*:\s*(#.*)?$/m.test(src)
      && new RegExp(`\\b(?:${PY_OBJ})\\s*\\(`).test(src)) return true;
  return new RegExp(`^\\s*\\w+\\s*=\\s*(?:${PY_OBJ})\\s*\\(`, "m").test(src)
    && new RegExp(`\\b(Pos|Rot|Align|Location|make_face|extrude)\\b|\\*\\s*(?:${PY_OBJ})\\(`).test(src);
}

// ------------------------------------------------------------- tokenizer
//
// Python's shape, not just its expressions: the indentation at the start of
// each logical line becomes "indent" / "dedent" tokens (blocks for with / if /
// for / def), every token carries its line number for error messages, and
// triple-quoted docstrings and r"/f"-prefixed strings read as strings.

const STRING_PREFIX = /^(?:[rRbBuUfF]|[rR][bBfF]|[bBfF][rR])$/;

function tokenize(src) {
  const toks = [];
  let i = 0, paren = 0, line = 1;
  const push = (type, value) => toks.push({ type, value, line });
  const indents = [0];
  let atLineStart = true;
  const readString = (q) => {
    // q is ' or "; handles triple-quoted strings too
    const triple = src.startsWith(q.repeat(3), i);
    const close = triple ? q.repeat(3) : q;
    let j = i + close.length, out = "";
    while (j < src.length && !src.startsWith(close, j)) {
      if (src[j] === "\\" && j + 1 < src.length) {
        const e = src[j + 1];
        out += e === "n" ? "\n" : e === "t" ? "\t" : e;
        j += 2;
        continue;
      }
      if (src[j] === "\n") { if (!triple) break; line++; }
      out += src[j];
      j++;
    }
    push("str", out);
    i = j + close.length;
  };
  while (i < src.length) {
    if (atLineStart && paren === 0) {
      let j = i, width = 0;
      while (j < src.length && (src[j] === " " || src[j] === "\t")) { width += src[j] === "\t" ? 4 : 1; j++; }
      atLineStart = false;
      if (j < src.length && src[j] !== "\n" && src[j] !== "\r" && src[j] !== "#") {
        if (width > indents[indents.length - 1]) { indents.push(width); push("indent"); }
        while (width < indents[indents.length - 1]) { indents.pop(); push("dedent"); }
        if (width !== indents[indents.length - 1]) {
          throw new Error(`line ${line}: the indentation doesn't line up with any block above it`);
        }
      }
      i = j;
      continue;
    }
    const c = src[i];
    if (c === "#") { while (i < src.length && src[i] !== "\n") i++; continue; }
    if (c === "\n") {
      if (paren === 0) { push("nl"); atLineStart = true; }
      line++;
      i++;
      continue;
    }
    if (c === "\\" && (src[i + 1] === "\n" || (src[i + 1] === "\r" && src[i + 2] === "\n"))) {
      i += src[i + 1] === "\r" ? 3 : 2;
      line++;
      continue;
    }
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
      const word = src.slice(i, j);
      if (STRING_PREFIX.test(word) && (src[j] === '"' || src[j] === "'")) {   // r"...", f"..."
        i = j;
        readString(src[j]);
        continue;
      }
      push("name", word);
      i = j;
      continue;
    }
    if (c === '"' || c === "'") { readString(c); continue; }
    const three = src.slice(i, i + 3);
    if (["//=", "**=", "..."].includes(three)) { push("op", three); i += 3; continue; }
    const two = src.slice(i, i + 2);
    if (["+=", "-=", "*=", "/=", "%=", "&=", "|=", "@=", "//", "**", "==", "!=", "<=", ">=", "->"].includes(two)) {
      push("op", two);
      i += 2;
      continue;
    }
    if ("()[]{},=.+-*/&|:<>%@~^;".includes(c)) {
      if (c === "(" || c === "[" || c === "{") paren++;
      if (c === ")" || c === "]" || c === "}") paren = Math.max(0, paren - 1);
      if ("()[]{},.:;".includes(c)) push(c, c);
      else push("op", c);
      i++;
      continue;
    }
    throw new Error(`line ${line}: unexpected character "${c}" in the Python code`);
  }
  push("nl");
  while (indents.length > 1) { indents.pop(); push("dedent"); }
  push("eof");
  return toks;
}

// ---------------------------------------------------------------- values
//
// Three value species flow through the evaluator: numbers/arrays/strings,
// SHAPES (BrepScript DSL nodes), and LOCATIONS ({__loc: shape=>shape}).

const isShape = (v) => !!v?.__brepscript;
const isLoc = (v) => typeof v?.__loc === "function";
// __ops: the same move as data ([{t:[x,y,z]}] / [{r:[rx,ry,rz]}] / [{m}]), so
// builder mode can carry a part's bounding box through it. null = unknown.
const loc = (fn, ops = null) => ({ __loc: fn, __ops: ops });

// A fourth species: WIRES — open 2D point chains from BuildLine objects
// (Line, Polyline, arcs, splines). Wires concatenate with + and become a
// profile via make_face(); everything downstream is then the shared 2D system.
const isWire = (v) => Array.isArray(v?.__wire);
const isLocSet = (v) => Array.isArray(v?.__locs);
const wire = (pts) => ({ __wire: pts });
const pt2 = (v, what) => {
  if (Array.isArray(v) && v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1])) return [v[0], v[1]];
  throw new Error(`${what} needs (x, y) points`);
};
const joinWires = (a, b) => {
  const A = a.__wire, B = b.__wire;
  if (!A.length) return wire(B);
  const [ax, ay] = A[A.length - 1] || [];
  const skip = B.length && Math.hypot(B[0][0] - ax, B[0][1] - ay) < 1e-6 ? 1 : 0;
  return wire([...A, ...B.slice(skip)]);
};
const DEG = Math.PI / 180;
// sampled arc: centre, radius, start angle -> start+sweep (degrees, CCW +)
function arcPts(cx, cy, r, a0, sweep, ry = null) {
  const n = Math.max(4, Math.ceil(Math.abs(sweep) / 6));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (sweep * i) / n) * DEG;
    out.push([cx + r * Math.cos(a), cy + (ry ?? r) * Math.sin(a)]);
  }
  return out;
}
// closed regular sampling of a full circle/ellipse as a leaf profile
const ellipsePts = (rx, ry, n = 64) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI;
    out.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return out;
};
const rectPts = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
// stadium outline: overall length, height (= end diameter)
function slotPts(overall, h) {
  const r = h / 2, half = Math.max(0, overall / 2 - r);
  return [...arcPts(half, 0, r, -90, 180), ...arcPts(-half, 0, r, 90, 180)];
}
// Catmull-Rom through the given points (build123d Spline passes through them)
function splinePts(pts, seg = 10) {
  if (pts.length < 3) return pts.slice();
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [pts[0]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let j = 1; j <= seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) =>
        0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t
          + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
          + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  return out;
}
// de Casteljau — Bezier control points (does NOT pass through the middle ones)
function bezierPts(ctrl, n = 24) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let pts = ctrl.map((p) => [p[0], p[1]]);
    while (pts.length > 1) {
      const nx = [];
      for (let k = 0; k < pts.length - 1; k++) {
        nx.push([pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t]);
      }
      pts = nx;
    }
    out.push(pts[0]);
  }
  return out;
}
// arc through three points, sampled start -> end the short way through mid
function threePointArcPts(p1, p2, p3) {
  const [ax, ay] = p1, [bx, by] = p2, [cx, cy] = p3;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return [p1, p3];              // collinear -> a line
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  let a0 = Math.atan2(ay - uy, ax - ux) / DEG;
  let am = Math.atan2(by - uy, bx - ux) / DEG;
  let a1 = Math.atan2(cy - uy, cx - ux) / DEG;
  const norm = (x) => ((x % 360) + 360) % 360;
  const ccwMid = norm(am - a0), ccwEnd = norm(a1 - a0);
  const sweep = ccwMid <= ccwEnd ? ccwEnd : ccwEnd - 360;   // pass through the mid point
  return arcPts(ux, uy, r, a0, sweep);
}

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

  // Python literals — extrude(sk, amount=2, both=True) needs them
  env.True = true;
  env.False = false;
  env.None = null;

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
  env.Wedge = (c) => {
    // OCC wedge: a dx × dy × dz box whose y = dy face shrinks to
    // [xmin..xmax] × [zmin..zmax]. freeform() hulls the 8 corners directly.
    const dx = num(arg(c, 0, "xsize"), "Wedge xsize");
    const dy = num(arg(c, 1, "ysize"), "Wedge ysize");
    const dz = num(arg(c, 2, "zsize"), "Wedge zsize");
    const xmin = num(arg(c, 3, "xmin") ?? 0, "Wedge xmin");
    const zmin = num(arg(c, 4, "zmin") ?? 0, "Wedge zmin");
    const xmax = num(arg(c, 5, "xmax") ?? dx, "Wedge xmax");
    const zmax = num(arg(c, 6, "zmax") ?? dz, "Wedge zmax");
    return translate([-dx / 2, -dy / 2, -dz / 2], freeform([
      [0, 0, 0], [dx, 0, 0], [dx, dy, 0], [0, dy, 0],
      [xmin, 0, zmin], [xmax, 0, zmin], [xmax, dy, zmin], [xmin, dy, zmin],
      [xmin, 0, zmax], [xmax, 0, zmax], [xmax, dy, zmax], [xmin, dy, zmax],
    ].map(([x, y, z]) => [x, y, z])));
  };
  env.ConvexPolyhedron = (c) => {
    const pts = arg(c, 0, "points");
    if (!Array.isArray(pts) || pts.length < 4) throw new Error("ConvexPolyhedron needs a list of at least 4 (x, y, z) points");
    return freeform(pts);
  };
  // Hole family: plain solids you subtract (part -= Pos(...) * Hole(...)).
  // Modelled hanging DOWN from z=0, the way a hole enters a top face.
  env.Hole = (c) => {
    const r = num(arg(c, 0, "radius"), "Hole radius");
    const d = num(arg(c, 1, "depth") ?? 1000, "Hole depth");
    return translate([0, 0, -d], cylinder({ r, h: d + 1, $fn: 48 }));
  };
  env.CounterBoreHole = (c) => {
    const r = num(arg(c, 0, "radius"), "CounterBoreHole radius");
    const cbr = num(arg(c, 1, "counter_bore_radius"), "counter_bore_radius");
    const cbd = num(arg(c, 2, "counter_bore_depth"), "counter_bore_depth");
    const d = num(arg(c, 3, "depth") ?? 1000, "depth");
    return union(
      translate([0, 0, -d], cylinder({ r, h: d + 1, $fn: 48 })),
      translate([0, 0, -cbd], cylinder({ r: cbr, h: cbd + 1, $fn: 48 })),
    );
  };
  env.CounterSinkHole = (c) => {
    const r = num(arg(c, 0, "radius"), "CounterSinkHole radius");
    const csr = num(arg(c, 1, "counter_sink_radius"), "counter_sink_radius");
    const d = num(arg(c, 2, "depth") ?? 1000, "depth");
    const ang = num(arg(c, 3, "counter_sink_angle") ?? 82, "counter_sink_angle");
    const csDepth = (csr - r) / Math.tan((ang / 2) * DEG);
    return union(
      translate([0, 0, -d], cylinder({ r, h: d + 1, $fn: 48 })),
      translate([0, 0, -csDepth], cone({ r1: r, r2: csr, h: csDepth + 1, $fn: 48 })),
    );
  };

  // ---- BuildSketch objects: 2D PROFILES (centred, per build123d) ----------
  env.Circle = (c) => profileLeaf(ellipsePts(num(arg(c, 0, "radius"), "Circle radius"), num(arg(c, 0, "radius"), "Circle radius")));
  env.Ellipse = (c) => profileLeaf(ellipsePts(
    num(arg(c, 0, "x_radius"), "Ellipse x_radius"), num(arg(c, 1, "y_radius"), "Ellipse y_radius")));
  env.Rectangle = (c) => profileLeaf(rectPts(
    num(arg(c, 0, "width"), "Rectangle width"), num(arg(c, 1, "height"), "Rectangle height")));
  env.RectangleRounded = (c) => {
    const w = num(arg(c, 0, "width"), "RectangleRounded width");
    const h = num(arg(c, 1, "height"), "RectangleRounded height");
    const r = num(arg(c, 2, "radius"), "RectangleRounded radius");
    if (r <= 0 || r * 2 >= Math.min(w, h)) throw new Error("RectangleRounded radius must be > 0 and < half the short side");
    return profileLeaf(offsetPolygon(rectPts(w - 2 * r, h - 2 * r), r, 32, true));
  };
  env.Polygon = (c) => {
    const pts = (c.args.length === 1 && Array.isArray(c.args[0]) && Array.isArray(c.args[0][0]))
      ? c.args[0] : c.args;
    if (pts.length < 3) throw new Error("Polygon needs at least 3 (x, y) points");
    return profileLeaf(pts.map((p) => pt2(p, "Polygon")));
  };
  env.RegularPolygon = (c) => {
    const r = num(arg(c, 0, "radius"), "RegularPolygon radius");
    const n = Math.round(num(arg(c, 1, "side_count"), "RegularPolygon side_count"));
    if (n < 3) throw new Error("RegularPolygon needs side_count >= 3");
    return profileLeaf(ellipsePts(r, r, n));
  };
  env.Triangle = (c) => {
    const a = num(c.kw.a ?? arg(c, 0, "a"), "Triangle side a");
    const b = num(c.kw.b ?? arg(c, 1, "b"), "Triangle side b");
    const cc = num(c.kw.c ?? arg(c, 2, "c"), "Triangle side c");
    const x = (b * b + cc * cc - a * a) / (2 * cc);
    const y2 = b * b - x * x;
    if (y2 <= 0) throw new Error(`Triangle sides ${a}, ${b}, ${cc} don't close`);
    return profileLeaf([[0, 0], [cc, 0], [x, Math.sqrt(y2)]]);
  };
  env.Trapezoid = (c) => {
    const w = num(arg(c, 0, "width"), "Trapezoid width");
    const h = num(arg(c, 1, "height"), "Trapezoid height");
    const la = num(arg(c, 2, "left_side_angle"), "Trapezoid left_side_angle");
    const ra = num(arg(c, 3, "right_side_angle") ?? la, "Trapezoid right_side_angle");
    const li = h / Math.tan(la * DEG), ri = h / Math.tan(ra * DEG);
    if (li + ri >= w) throw new Error("Trapezoid sides meet before the top — reduce the height or steepen the angles");
    return profileLeaf([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2 - ri, h / 2], [-w / 2 + li, h / 2]]);
  };
  env.SlotOverall = (c) => profileLeaf(slotPts(
    num(arg(c, 0, "width"), "SlotOverall width"), num(arg(c, 1, "height"), "SlotOverall height")));
  env.SlotCenterToCenter = (c) => {
    const sep = num(arg(c, 0, "center_separation"), "SlotCenterToCenter center_separation");
    const h = num(arg(c, 1, "height"), "SlotCenterToCenter height");
    return profileLeaf(slotPts(sep + h, h));
  };
  env.SlotCenterPoint = (c) => {
    const centre = pt2(arg(c, 0, "center"), "SlotCenterPoint center");
    const point = pt2(arg(c, 1, "point"), "SlotCenterPoint point");
    const h = num(arg(c, 2, "height"), "SlotCenterPoint height");
    const ang = Math.atan2(point[1] - centre[1], point[0] - centre[0]) / DEG;
    const overall = Math.hypot(point[0] - centre[0], point[1] - centre[1]) * 2 + h;
    const s = profileLeaf(slotPts(overall, h));
    const rot = mapProfile(s, ([x, y]) => [
      x * Math.cos(ang * DEG) - y * Math.sin(ang * DEG),
      x * Math.sin(ang * DEG) + y * Math.cos(ang * DEG)]);
    return mapProfile(rot, ([x, y]) => [x + centre[0], y + centre[1]]);
  };
  env.Text = () => {
    throw new Error("Text isn't supported in the Python translator — use BREPcode's text({ text, size, height }) on the result instead");
  };
  for (const name of ["Arrow", "ArrowHead", "DimensionLine", "ExtensionLine", "TechnicalDrawing"]) {
    env[name] = () => {
      throw new Error(`${name} is a drawing annotation, not solid geometry — BREPcode's "SVG blueprint" export draws dimensioned views for you`);
    };
  }

  // ---- BuildLine objects: 1D WIRES (chain with +, close with make_face) ---
  env.Line = (c) => wire([pt2(arg(c, 0, "pts"), "Line"), pt2(arg(c, 1, "pts"), "Line")]);
  env.Polyline = (c) => {
    const pts = (c.args.length === 1 && Array.isArray(c.args[0]) && Array.isArray(c.args[0][0]))
      ? c.args[0] : c.args;
    if (pts.length < 2) throw new Error("Polyline needs at least 2 points");
    return wire(pts.map((p) => pt2(p, "Polyline")));
  };
  env.FilletPolyline = (c) => {
    const r = num(c.kw.radius ?? c.args[c.args.length - 1], "FilletPolyline radius");
    const raw = (Array.isArray(c.args[0]) && Array.isArray(c.args[0][0]) ? c.args[0] : c.args.slice(0, -1))
      .map((p) => pt2(p, "FilletPolyline"));
    if (raw.length < 3) return wire(raw);
    const out = [raw[0]];
    for (let i = 1; i < raw.length - 1; i++) {
      const [px, py] = raw[i - 1], [cx, cy] = raw[i], [nx, ny] = raw[i + 1];
      const v1 = [px - cx, py - cy], v2 = [nx - cx, ny - cy];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      const half = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) / 2;
      const t = Math.min(r / Math.tan(half), l1 * 0.49, l2 * 0.49);
      const a = [cx + (v1[0] / l1) * t, cy + (v1[1] / l1) * t];
      const b = [cx + (v2[0] / l2) * t, cy + (v2[1] / l2) * t];
      // the arc's apex sits on the angle bisector, (r/sin - r) off the corner
      const rEff = t * Math.tan(half);
      const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2];
      const bl = Math.hypot(...bis) || 1;
      const dist = rEff / Math.sin(half) - rEff;
      const apex = [cx + (bis[0] / bl) * dist, cy + (bis[1] / bl) * dist];
      out.push(a, ...threePointArcPts(a, apex, b).slice(1, -1), b);
    }
    out.push(raw[raw.length - 1]);
    return wire(out);
  };
  env.PolarLine = (c) => {
    const s = pt2(arg(c, 0, "start"), "PolarLine start");
    const len = num(arg(c, 1, "length"), "PolarLine length");
    const ang = num(arg(c, 2, "angle"), "PolarLine angle");
    return wire([s, [s[0] + len * Math.cos(ang * DEG), s[1] + len * Math.sin(ang * DEG)]]);
  };
  env.Spline = (c) => {
    const pts = (c.args.length === 1 && Array.isArray(c.args[0]) && Array.isArray(c.args[0][0]))
      ? c.args[0] : c.args;
    return wire(splinePts(pts.map((p) => pt2(p, "Spline"))));
  };
  env.Bezier = (c) => {
    const pts = (c.args.length === 1 && Array.isArray(c.args[0]) && Array.isArray(c.args[0][0]))
      ? c.args[0] : c.args;
    return wire(bezierPts(pts.map((p) => pt2(p, "Bezier"))));
  };
  env.CenterArc = (c) => {
    const ctr = pt2(arg(c, 0, "center"), "CenterArc center");
    const r = num(arg(c, 1, "radius"), "CenterArc radius");
    const a0 = num(arg(c, 2, "start_angle"), "CenterArc start_angle");
    const sweep = num(arg(c, 3, "arc_size"), "CenterArc arc_size");
    return wire(arcPts(ctr[0], ctr[1], r, a0, sweep));
  };
  env.EllipticalCenterArc = (c) => {
    const ctr = pt2(arg(c, 0, "center"), "EllipticalCenterArc center");
    const rx = num(arg(c, 1, "x_radius"), "x_radius");
    const ry = num(arg(c, 2, "y_radius"), "y_radius");
    const a0 = num(arg(c, 3, "start_angle") ?? 0, "start_angle");
    const a1 = num(arg(c, 4, "end_angle") ?? 90, "end_angle");
    return wire(arcPts(ctr[0], ctr[1], rx, a0, a1 - a0, ry));
  };
  env.ThreePointArc = (c) => wire(threePointArcPts(
    pt2(arg(c, 0, "pts"), "ThreePointArc"), pt2(arg(c, 1, "pts"), "ThreePointArc"), pt2(arg(c, 2, "pts"), "ThreePointArc")));
  env.RadiusArc = (c) => {
    const p1 = pt2(arg(c, 0, "start_point"), "RadiusArc");
    const p2b = pt2(arg(c, 1, "end_point"), "RadiusArc");
    const r = num(arg(c, 2, "radius"), "RadiusArc radius");
    const chord = Math.hypot(p2b[0] - p1[0], p2b[1] - p1[1]);
    if (Math.abs(r) < chord / 2) throw new Error("RadiusArc radius is smaller than half the chord — it can't reach");
    const sag = Math.abs(r) - Math.sqrt(r * r - (chord / 2) ** 2);
    const mid = [(p1[0] + p2b[0]) / 2, (p1[1] + p2b[1]) / 2];
    const nrm = [-(p2b[1] - p1[1]) / chord, (p2b[0] - p1[0]) / chord];
    const side = r >= 0 ? 1 : -1;
    const apex = [mid[0] + nrm[0] * sag * side, mid[1] + nrm[1] * sag * side];
    return wire(threePointArcPts(p1, apex, p2b));
  };
  env.SagittaArc = (c) => {
    const p1 = pt2(arg(c, 0, "start_point"), "SagittaArc");
    const p2b = pt2(arg(c, 1, "end_point"), "SagittaArc");
    const sag = num(arg(c, 2, "sagitta"), "SagittaArc sagitta");
    const chord = Math.hypot(p2b[0] - p1[0], p2b[1] - p1[1]) || 1;
    const mid = [(p1[0] + p2b[0]) / 2, (p1[1] + p2b[1]) / 2];
    const nrm = [-(p2b[1] - p1[1]) / chord, (p2b[0] - p1[0]) / chord];
    const apex = [mid[0] + nrm[0] * sag, mid[1] + nrm[1] * sag];
    return wire(threePointArcPts(p1, apex, p2b));
  };
  env.JernArc = (c) => {
    const s = pt2(arg(c, 0, "start"), "JernArc start");
    const tan = pt2(arg(c, 1, "tangent"), "JernArc tangent");
    const r = num(arg(c, 2, "radius"), "JernArc radius");
    const sweep = num(arg(c, 3, "arc_size"), "JernArc arc_size");
    const tl = Math.hypot(tan[0], tan[1]) || 1;
    const side = sweep >= 0 ? 1 : -1;
    const ctr = [s[0] - (tan[1] / tl) * r * side, s[1] + (tan[0] / tl) * r * side];
    const a0 = Math.atan2(s[1] - ctr[1], s[0] - ctr[0]) / DEG;
    return wire(arcPts(ctr[0], ctr[1], r, a0, sweep));
  };
  for (const name of ["Airfoil", "BlendCurve", "BSpline", "ConstrainedArcs", "ConstrainedLines",
    "DoubleTangentArc", "IntersectingLine", "ParabolicCenterArc", "HyperbolicCenterArc", "Helix"]) {
    env[name] = () => {
      throw new Error(`${name} isn't supported — supported BuildLine objects: Line, Polyline, FilletPolyline, PolarLine, Spline, Bezier, CenterArc, EllipticalCenterArc, ThreePointArc, RadiusArc, SagittaArc, JernArc, TangentArc. Chain them with + and close with make_face(...)`);
    };
  }

  // Wire([e1, e2, e3]) — the constructor form LLMs write constantly. Same as
  // chaining with +: join the edges end to end.
  env.Wire = (c) => {
    const parts = (c.args.length === 1 && Array.isArray(c.args[0]) ? c.args[0] : c.args).filter(Boolean);
    if (!parts.length || !parts.every(isWire)) {
      throw new Error("Wire([...]) takes BuildLine edges (Line, Polyline, arcs…)");
    }
    return parts.reduce((a, b) => joinWires(a, b));
  };

  // fillet(sketch.vertices(), radius=r) — round every corner of a 2D sketch.
  // Leaf profiles only; combined sketches should fillet before combining.
  env.fillet = (c) => {
    const target = c.args[0]?.__verts ?? c.args[0];
    const r2 = num(c.kw.radius ?? c.args[1], "fillet radius");
    if (!isProfile(target)) throw new Error("fillet() here takes a sketch's corners: fillet(Rectangle(40, 30).vertices(), radius=4)");
    if (!target.leaf) throw new Error("fillet the sketch BEFORE combining it with + - & (a combined sketch has no simple corner list)");
    const pts = target.pts, n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const [px, py] = pts[(i - 1 + n) % n], [cx, cy] = pts[i], [nx2, ny2] = pts[(i + 1) % n];
      const v1 = [px - cx, py - cy], v2 = [nx2 - cx, ny2 - cy];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      if (!l1 || !l2) continue;
      const half = Math.acos(Math.max(-1, Math.min(1, (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2)))) / 2;
      const t = Math.min(r2 / Math.tan(half), l1 * 0.49, l2 * 0.49);
      if (!(t > 1e-6) || half > Math.PI / 2 - 1e-3) { out.push([cx, cy]); continue; }   // straight-ish: keep
      const a = [cx + (v1[0] / l1) * t, cy + (v1[1] / l1) * t];
      const b = [cx + (v2[0] / l2) * t, cy + (v2[1] / l2) * t];
      const rEff = t * Math.tan(half);
      const bis = [v1[0] / l1 + v2[0] / l2, v1[1] / l1 + v2[1] / l2];
      const bl = Math.hypot(...bis) || 1;
      const dist = rEff / Math.sin(half) - rEff;
      const apex = [cx + (bis[0] / bl) * dist, cy + (bis[1] / bl) * dist];
      out.push(a, ...threePointArcPts(a, apex, b).slice(1, -1), b);
    }
    return profileLeaf(out);
  };
  env.chamfer = () => {
    throw new Error("2D chamfer() isn't supported yet — fillet(sketch.vertices(), radius=…) rounds corners instead");
  };
  for (const name of ["sweep", "loft"]) {
    env[name] = () => {
      throw new Error(`${name}() isn't supported — the kernel has no path-${name}. Model the part from extrusions/revolves, or use BREPcode's hull() for lofts between sections.`);
    };
  }

  // ---- sketch -> solid ----------------------------------------------------
  env.make_face = (c) => {
    let parts = c.args.length === 1 && Array.isArray(c.args[0]) ? c.args[0] : c.args;
    parts = parts.filter(Boolean);
    if (!parts.length) throw new Error("make_face() needs a wire (or several) to close");
    let w = null;
    for (const p of parts) {
      if (!isWire(p)) throw new Error("make_face() takes BuildLine wires (Line, Polyline, arcs…)");
      w = w ? joinWires(w, p) : p;
    }
    let pts = w.__wire;
    if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) {
      pts = pts.slice(0, -1);
    }
    if (pts.length < 3) throw new Error("make_face(): the wire has fewer than 3 distinct points");
    return profileLeaf(pts);
  };
  env.extrude = (c) => {
    const pr = arg(c, 0, "to_extrude");
    const amt = num(c.kw.amount ?? arg(c, 1, "amount"), "extrude amount");
    const both = c.kw.both === true;
    if (!isProfile(pr)) throw new Error("extrude() needs a sketch (Rectangle, Circle, make_face(...)…) as its first argument");
    const h = Math.abs(amt);
    let s = profileToSolid(pr, both ? 2 * h : h);
    if (both) s = translate([0, 0, -h], s);
    else if (amt < 0) s = translate([0, 0, amt], s);
    return s;
  };
  env.revolve = () => {
    throw new Error("revolve() isn't supported in the Python translator yet — use BREPcode's revolve(angle, polygon([...])) instead");
  };

  // ---- locations (they understand sketches and wires too: 2D moves in-plane)
  const posLoc = (x, y, z) => loc((s) => {
    if (isProfile(s)) {
      if (z) throw new Error("a sketch lives on the XY plane — extrude(sketch, amount=…) first, then Pos with a Z");
      return mapProfile(s, ([px, py]) => [px + x, py + y]);
    }
    if (isWire(s)) {
      if (z) throw new Error("a wire lives on the XY plane — make_face + extrude first, then Pos with a Z");
      return wire(s.__wire.map(([px, py]) => [px + x, py + y]));
    }
    return translate([x, y, z], s);
  }, [{ t: [x, y, z] }]);
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
    const spin2d = ([px, py]) => [
      px * Math.cos(rz * DEG) - py * Math.sin(rz * DEG),
      px * Math.sin(rz * DEG) + py * Math.cos(rz * DEG)];
    return loc((s) => {
      if (isProfile(s) || isWire(s)) {
        if (rx || ry) throw new Error("a sketch/wire can only Rot about Z — extrude first for X/Y rotations");
        return isProfile(s) ? mapProfile(s, spin2d) : wire(s.__wire.map(spin2d));
      }
      return rotate([rx, ry, rz], s);
    }, [{ r: [rx, ry, rz] }]);
  };
  env.Rotation = env.Rot;

  // Location SETS — the algebra replacement for builder-mode for-loops:
  //   holes += GridLocations(25, 15, 2, 2) * Circle(2.5)
  // multiplies into one combined shape, one copy per location. Centred grids,
  // matching build123d.
  env.GridLocations = (c) => {
    const xs = num(arg(c, 0, "x_spacing"), "GridLocations x_spacing");
    const ys = num(arg(c, 1, "y_spacing"), "GridLocations y_spacing");
    const nx = Math.round(num(arg(c, 2, "x_count"), "GridLocations x_count"));
    const ny = Math.round(num(arg(c, 3, "y_count"), "GridLocations y_count"));
    const locs = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        locs.push(posLoc((i - (nx - 1) / 2) * xs, (j - (ny - 1) / 2) * ys, 0));
      }
    }
    return { __locs: locs };
  };
  env.PolarLocations = (c) => {
    const rad = num(arg(c, 0, "radius"), "PolarLocations radius");
    const count = Math.round(num(arg(c, 1, "count"), "PolarLocations count"));
    const start = num(arg(c, 2, "start_angle") ?? 0, "start_angle");
    const locs = [];
    for (let i = 0; i < count; i++) {
      const a = (start + (360 * i) / count) * DEG;
      locs.push(posLoc(rad * Math.cos(a), rad * Math.sin(a), 0));
    }
    return { __locs: locs };
  };
  env.Locations = (c) => {
    const pts = (c.args.length === 1 && Array.isArray(c.args[0]) && Array.isArray(c.args[0][0])) ? c.args[0] : c.args;
    return { __locs: pts.map((p) => {
      if (isLoc(p)) return p;
      const [x, y, z] = Array.isArray(p) ? p : [0, 0, 0];
      return posLoc(x || 0, y || 0, z || 0);
    }) };
  };

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

// ------------------------------------------------------ geometry helpers
//
// Builder mode places sketches on a part's faces ("the top face", "the +X
// face"), so the translator keeps a bounding box beside every solid it makes:
// primitives know theirs, locations carry their transform as data (__ops), and
// booleans merge them. Unknown stays null, and only a face lookup minds.

const BB = new WeakMap();
const bbOf = (pts) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k] ?? 0); max[k] = Math.max(max[k], p[k] ?? 0); }
  return { min, max };
};
const bbCorners = (b) => {
  const out = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
};
// three.js Euler "XYZ" (what dsl.rotate uses): R = Rx * Ry * Rz
function eulerMatrix([rx, ry, rz]) {
  const [a, b, c] = [rx * DEG, ry * DEG, rz * DEG];
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sb],
    [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
    [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
  ];
}
function matrixEuler(m) {
  const y = Math.asin(Math.max(-1, Math.min(1, m[0][2])));
  const [x, z] = Math.abs(m[0][2]) < 0.9999999
    ? [Math.atan2(-m[1][2], m[2][2]), Math.atan2(-m[0][1], m[0][0])]
    : [Math.atan2(m[2][1], m[1][1]), 0];
  return [x / DEG, y / DEG, z / DEG];
}
const applyM = (m, p) => [0, 1, 2].map((i) => m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2]);
function bbApply(b, ops) {
  if (!b || !ops) return null;
  let pts = bbCorners(b);
  for (const op of ops) {
    if (op.t) pts = pts.map((p) => [p[0] + op.t[0], p[1] + op.t[1], p[2] + op.t[2]]);
    else if (op.r) { const m = eulerMatrix(op.r); pts = pts.map((p) => applyM(m, p)); }
    else if (op.m) pts = pts.map((p) => applyM(op.m, p));
  }
  return bbOf(pts);
}
const bbUnion = (a, b) => (a && b ? { min: a.min.map((v, k) => Math.min(v, b.min[k])), max: a.max.map((v, k) => Math.max(v, b.max[k])) } : null);
const bbIntersect = (a, b) => (a && b ? { min: a.min.map((v, k) => Math.max(v, b.min[k])), max: a.max.map((v, k) => Math.min(v, b.max[k])) } : null);
function profileBBox(pr) {
  if (!pr) return null;
  if (pr.leaf) return bbOf(pr.pts.map(([x, y]) => [x, y, 0]));
  if (pr.op === "UNION") return pr.children.map(profileBBox).reduce((a, b) => (a && b ? bbUnion(a, b) : a || b), null);
  return profileBBox(pr.children[0]);
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

// A workplane: origin + x direction + normal. It is also a location (Plane *
// shape, Locations(plane)), so a sketch drawn on it lands where build123d puts it.
function planeFrom(origin, xDir, zDir) {
  const z = unit(zDir);
  let x = unit(xDir);
  const d = x[0] * z[0] + x[1] * z[1] + x[2] * z[2];
  x = unit([x[0] - d * z[0], x[1] - d * z[1], x[2] - d * z[2]]);
  const y = cross(z, x);
  const m = [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
  const euler = matrixEuler(m);
  const flat = Math.abs(z[2] - 1) < 1e-9 && Math.abs(x[0] - 1) < 1e-9;      // plain XY
  const moved = origin.some((v) => Math.abs(v) > 1e-12);
  const place = (s) => {
    if (isProfile(s) || isWire(s)) {
      if (!flat || Math.abs(origin[2]) > 1e-12) {
        throw new Error("a sketch on another plane has to be drawn inside `with BuildSketch(plane):` (or extruded first, then moved)");
      }
      const f = ([px, py]) => [px + origin[0], py + origin[1]];
      return isProfile(s) ? mapProfile(s, f) : wire(s.__wire.map(f));
    }
    let out = flat ? s : rotate(euler, s);
    if (moved) out = translate(origin, out);
    return out;
  };
  const plane = {
    __plane: true, origin, x_dir: x, z_dir: z, flat, euler,
    __loc: place, __ops: [{ m }, { t: origin }],
  };
  plane.offset = (c) => {
    const amt = num(arg(c, 0, "amount"), "Plane.offset amount");
    return planeFrom(origin.map((o, k) => o + z[k] * amt), x, z);
  };
  plane.reverse = () => planeFrom(origin, x, z.map((v) => -v));
  plane.location = plane;
  return plane;
}
const ORIGIN = [0, 0, 0];
const PLANES = {
  XY: () => planeFrom(ORIGIN, [1, 0, 0], [0, 0, 1]),
  YZ: () => planeFrom(ORIGIN, [0, 1, 0], [1, 0, 0]),
  ZX: () => planeFrom(ORIGIN, [0, 0, 1], [0, 1, 0]),
  XZ: () => planeFrom(ORIGIN, [1, 0, 0], [0, -1, 0]),
  YX: () => planeFrom(ORIGIN, [0, 1, 0], [0, 0, -1]),
  ZY: () => planeFrom(ORIGIN, [0, 0, 1], [-1, 0, 0]),
  front: () => planeFrom(ORIGIN, [1, 0, 0], [0, -1, 0]),
  back: () => planeFrom(ORIGIN, [-1, 0, 0], [0, 1, 0]),
  left: () => planeFrom(ORIGIN, [0, -1, 0], [-1, 0, 0]),
  right: () => planeFrom(ORIGIN, [0, 1, 0], [1, 0, 0]),
  top: () => planeFrom(ORIGIN, [1, 0, 0], [0, 0, 1]),
  bottom: () => planeFrom(ORIGIN, [1, 0, 0], [0, 0, -1]),
};

// the plane of a part's outermost face along an axis: what
// part.faces().sort_by(Axis.Z)[-1] means for a box-like part
const FACE_FRAMES = {
  "z+": { x: [1, 0, 0], z: [0, 0, 1] }, "z-": { x: [1, 0, 0], z: [0, 0, -1] },
  "x+": { x: [0, 1, 0], z: [1, 0, 0] }, "x-": { x: [0, -1, 0], z: [-1, 0, 0] },
  "y+": { x: [-1, 0, 0], z: [0, 1, 0] }, "y-": { x: [1, 0, 0], z: [0, -1, 0] },
};
function facePlane(b, axis, end) {
  const k = { x: 0, y: 1, z: 2 }[axis];
  const ctr = [0, 1, 2].map((i) => (b.min[i] + b.max[i]) / 2);
  ctr[k] = end > 0 ? b.max[k] : b.min[k];
  const f = FACE_FRAMES[axis + (end > 0 ? "+" : "-")];
  return planeFrom(ctr, f.x, f.z);
}

// ----------------------------------------------------------------- parser
//
// Python is parsed to a small syntax tree first and then run, so blocks,
// loops and functions work: if / elif / else, for, while, def + return,
// lambda, list comprehensions, with-blocks (build123d builder mode), and the
// expression grammar with Python's precedence.

const COMPARE = new Set(["<", ">", "==", "!=", "<=", ">="]);

function parseProgram(toks) {
  let p = 0;
  const peek = (k = 0) => toks[Math.min(p + k, toks.length - 1)];
  const next = () => toks[p++];
  const isOp = (v, k = 0) => peek(k).type === "op" && peek(k).value === v;
  const isKw = (v, k = 0) => peek(k).type === "name" && peek(k).value === v;
  const fail = (msg, t = peek()) => { throw new Error(`line ${t.line}: ${msg}`); };
  const eat = (type, value) => {
    const t = next();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      fail(`expected ${value ?? type} but got "${t.value ?? t.type}"`, t);
    }
    return t;
  };
  const eatKw = (v) => { if (!isKw(v)) fail(`expected "${v}"`); return next(); };
  const ends = () => ["nl", "eof", ";", "dedent"].includes(peek().type);

  function program() {
    const body = [];
    while (peek().type !== "eof") {
      if (peek().type === "nl") { next(); continue; }
      if (peek().type === "dedent") { next(); continue; }
      body.push(...statement());
    }
    return body;
  }
  function block() {
    eat(":");
    if (peek().type !== "nl") {                // `if x: y = 1` on one line
      const body = [simpleStmt()];
      while (peek().type === ";") { next(); if (ends()) break; body.push(simpleStmt()); }
      if (peek().type === "nl") next();
      return body;
    }
    eat("nl");
    while (peek().type === "nl") next();
    if (peek().type !== "indent") fail("expected an indented block here");
    next();
    const body = [];
    while (peek().type !== "dedent" && peek().type !== "eof") {
      if (peek().type === "nl") { next(); continue; }
      body.push(...statement());
    }
    if (peek().type === "dedent") next();
    return body;
  }
  function statement() {
    const t = peek();
    if (t.type === "indent") fail("unexpected indentation");
    if (t.type === "op" && t.value === "@") {          // decorators: skip the line
      while (peek().type !== "nl" && peek().type !== "eof") next();
      next();
      return [];
    }
    if (t.type === "name") {
      if (t.value === "if") return [ifStmt()];
      if (t.value === "for") return [forStmt()];
      if (t.value === "while") {
        next();
        const cond = test();
        const body = block();
        let orelse = [];
        if (isKw("else")) { next(); orelse = block(); }
        return [{ t: "while", cond, body, orelse, line: t.line }];
      }
      if (t.value === "def") return [defStmt()];
      if (t.value === "with") return [withStmt()];
      if (t.value === "class" || t.value === "try") {
        fail(`"${t.value}" blocks aren't supported here — functions (def), loops (for/while), if/else and with-blocks are`);
      }
    }
    const out = [simpleStmt()];
    while (peek().type === ";") { next(); if (ends()) break; out.push(simpleStmt()); }
    if (peek().type === "nl") next();
    else if (!["eof", "dedent"].includes(peek().type)) fail(`unexpected "${peek().value ?? peek().type}"`);
    return out;
  }
  function simpleStmt() {
    const t = peek();
    if (t.type === "name") {
      switch (t.value) {
        case "pass": next(); return { t: "pass", line: t.line };
        case "break": next(); return { t: "break", line: t.line };
        case "continue": next(); return { t: "continue", line: t.line };
        case "return": next(); return { t: "return", v: ends() ? null : exprList(), line: t.line };
        case "raise": next(); return { t: "raise", v: ends() ? null : test(), line: t.line };
        case "import": case "from": return importStmt();
        case "global": case "nonlocal": case "assert": case "del":
          while (!ends()) next();
          return { t: "pass", line: t.line };
        default:
      }
    }
    const first = exprList();
    if (peek().type === ":" && first.t === "name") {       // annotation: width: float = 10
      next();
      test();
      if (!isOp("=")) return { t: "pass", line: t.line };
    }
    if (isOp("=")) {
      const parts = [first];
      while (isOp("=")) { next(); parts.push(exprList()); }
      const value = parts.pop();
      for (const tg of parts) checkTarget(tg);
      return { t: "assign", targets: parts, value, line: t.line };
    }
    if (peek().type === "op" && /^(\+|-|\*|\/|\/\/|%|\*\*|&|\||@)=$/.test(peek().value)) {
      const op = next().value.slice(0, -1);
      checkTarget(first);
      return { t: "aug", target: first, op, value: exprList(), line: t.line };
    }
    return { t: "expr", e: first, line: t.line };
  }
  function checkTarget(n) {
    if (n.t === "name" || n.t === "attr" || n.t === "index") return;
    if (n.t === "tuple" || n.t === "list") { n.items.forEach(checkTarget); return; }
    fail("can't assign to that");
  }
  function dotted() {
    let name = "";
    while (peek().type === ".") { next(); name += "."; }
    name += eat("name").value;
    while (peek().type === ".") { next(); name += "." + eat("name").value; }
    return name;
  }
  function importStmt() {
    const t = next();
    if (t.value === "import") {
      const mods = [];
      do {
        const mod = dotted();
        let alias = null;
        if (isKw("as")) { next(); alias = eat("name").value; }
        mods.push({ mod, alias });
      } while (peek().type === "," && next());
      return { t: "import", mods, line: t.line };
    }
    const mod = dotted();
    eatKw("import");
    if (isOp("*")) { next(); return { t: "from", mod, names: "*", line: t.line }; }
    const paren = peek().type === "(" && next();
    const names = [];
    do {
      if (paren && peek().type === ")") break;
      const n = eat("name").value;
      let alias = n;
      if (isKw("as")) { next(); alias = eat("name").value; }
      names.push([n, alias]);
    } while (peek().type === "," && next());
    if (paren) eat(")");
    return { t: "from", mod, names, line: t.line };
  }
  function ifStmt() {
    const t = next();
    const cond = test();
    const body = block();
    let orelse = [];
    if (isKw("elif")) orelse = [ifStmt()];
    else if (isKw("else")) { next(); orelse = block(); }
    return { t: "if", cond, body, orelse, line: t.line };
  }
  function targetList() {
    const one = () => {
      if (peek().type === "(" || peek().type === "[") {
        const close = next().type === "(" ? ")" : "]";
        const items = targetList();
        eat(close);
        return items;
      }
      return { t: "name", id: eat("name").value };
    };
    const items = [one()];
    while (peek().type === "," && !isKw("in", 1)) { next(); if (isKw("in")) break; items.push(one()); }
    return items.length === 1 ? items[0] : { t: "tuple", items };
  }
  function forStmt() {
    const t = next();
    const target = targetList();
    eatKw("in");
    const iter = exprList();
    const body = block();
    let orelse = [];
    if (isKw("else")) { next(); orelse = block(); }
    return { t: "for", target, iter, body, orelse, line: t.line };
  }
  function params(close) {
    const out = [];
    while (peek().type !== close) {
      if (isOp("/") || (isOp("*") && (peek(1).type === "," || peek(1).type === close))) { next(); }
      else if (isOp("*") || isOp("**")) {
        const kind = next().value === "*" ? "star" : "kwstar";
        out.push({ name: eat("name").value, [kind]: true });
        if (peek().type === ":" && close === ")") { next(); test(); }
      } else {
        const name = eat("name").value;
        if (peek().type === ":" && close === ")") { next(); test(); }    // annotation
        let def = null;
        if (isOp("=")) { next(); def = test(); }
        out.push({ name, def });
      }
      if (peek().type === ",") next(); else break;
    }
    return out;
  }
  function defStmt() {
    const t = next();
    const name = eat("name").value;
    eat("(");
    const ps = params(")");
    eat(")");
    if (isOp("->")) { next(); test(); }
    return { t: "def", name, params: ps, body: block(), line: t.line };
  }
  function withStmt() {
    const t = next();
    const items = [];
    do {
      const e = test();
      let as = null;
      if (isKw("as")) { next(); as = eat("name").value; }
      items.push({ e, as });
    } while (peek().type === "," && next());
    return { t: "with", items, body: block(), line: t.line };
  }

  // ---- expressions
  function exprList() {
    const first = test();
    if (peek().type !== ",") return first;
    const items = [first];
    while (peek().type === ",") {
      next();
      if (ends() || isOp("=") || [")", "]", "}", ":"].includes(peek().type) || isKw("in")) break;
      items.push(test());
    }
    return { t: "tuple", items };
  }
  function test() {
    if (isKw("lambda")) {
      const line = next().line;
      const ps = params(":");
      eat(":");
      return { t: "lambda", params: ps, body: test(), line };
    }
    const c = orTest();
    if (isKw("if") && !isKw("else", 1)) {
      const save = p;
      next();
      const cond = orTest();
      if (isKw("else")) { next(); return { t: "ifexp", cond, a: c, b: test() }; }
      p = save;                                     // a comprehension's `if`
    }
    return c;
  }
  function orTest() {
    let v = andTest();
    while (isKw("or")) { next(); v = { t: "bool", op: "or", l: v, r: andTest() }; }
    return v;
  }
  function andTest() {
    let v = notTest();
    while (isKw("and")) { next(); v = { t: "bool", op: "and", l: v, r: notTest() }; }
    return v;
  }
  function notTest() {
    if (isKw("not")) { next(); return { t: "not", v: notTest() }; }
    return comparison();
  }
  function comparison() {
    const first = bitOr();
    const ops = [], rest = [];
    for (;;) {
      let op = null;
      if (peek().type === "op" && COMPARE.has(peek().value)) op = next().value;
      else if (isKw("in")) { next(); op = "in"; }
      else if (isKw("not") && isKw("in", 1)) { next(); next(); op = "not in"; }
      else if (isKw("is")) { next(); op = "is"; if (isKw("not")) { next(); op = "is not"; } }
      if (!op) break;
      ops.push(op);
      rest.push(bitOr());
    }
    return ops.length ? { t: "cmp", first, ops, rest } : first;
  }
  const binLevel = (sub, opsList) => () => {
    let v = sub();
    while (peek().type === "op" && opsList.includes(peek().value)) {
      const op = next().value;
      v = { t: "bin", op, l: v, r: sub() };
    }
    return v;
  };
  function factor() {
    if (peek().type === "op" && ["-", "+", "~"].includes(peek().value)) {
      const op = next().value;
      return { t: "un", op, v: factor() };
    }
    return power();
  }
  const term = binLevel(factor, ["*", "/", "//", "%", "@"]);
  const arith = binLevel(term, ["+", "-"]);
  const bitAnd = binLevel(arith, ["&"]);
  const bitXor = binLevel(bitAnd, ["^"]);
  const bitOr = binLevel(bitXor, ["|"]);
  function power() {
    const base = primary();
    if (isOp("**")) { next(); return { t: "bin", op: "**", l: base, r: factor() }; }
    return base;
  }
  function primary() {
    let v = atom();
    for (;;) {
      if (peek().type === "(") v = { t: "call", fn: v, args: callArgs(), line: peek().line };
      else if (peek().type === "[") {
        next();
        v = subscript(v);
        eat("]");
      } else if (peek().type === ".") {
        next();
        v = { t: "attr", obj: v, name: eat("name").value };
      } else return v;
    }
  }
  function subscript(obj) {
    const part = () => (peek().type === ":" || peek().type === "]" ? null : test());
    const a = part();
    if (peek().type !== ":") {
      if (peek().type === ",") {                          // a[i, j] -> tuple index
        const items = [a];
        while (peek().type === ",") { next(); if (peek().type === "]") break; items.push(test()); }
        return { t: "index", obj, idx: { t: "tuple", items } };
      }
      return { t: "index", obj, idx: a };
    }
    next();
    const b = part();
    let step = null;
    if (peek().type === ":") { next(); step = part(); }
    return { t: "slice", obj, a, b, step };
  }
  function callArgs() {
    eat("(");
    const args = [];
    while (peek().type !== ")") {
      if (isOp("*")) { next(); args.push({ star: test() }); }
      else if (isOp("**")) { next(); args.push({ kwstar: test() }); }
      else if (peek().type === "name" && isOp("=", 1)) {
        const k = next().value;
        next();
        args.push({ kw: k, v: test() });
      } else {
        const e = test();
        if (isKw("for")) args.push({ v: { t: "comp", elt: e, gens: compFor(), kind: "list" } });   // f(x for x in y)
        else args.push({ v: e });
      }
      if (peek().type === ",") next(); else break;
    }
    eat(")");
    return args;
  }
  function compFor() {
    const gens = [];
    while (isKw("for")) {
      next();
      const target = targetList();
      eatKw("in");
      const iter = orTest();
      const conds = [];
      while (isKw("if")) { next(); conds.push(orTest()); }
      gens.push({ target, iter, conds });
    }
    return gens;
  }
  function atom() {
    const t = next();
    if (t.type === "num") return { t: "const", v: t.value };
    if (t.type === "str") {
      let v = t.value;
      while (peek().type === "str") v += next().value;     // "a" "b" concatenation
      return { t: "const", v };
    }
    if (t.type === "op" && t.value === "...") return { t: "const", v: null };
    if (t.type === "name") {
      if (t.value === "True") return { t: "const", v: true };
      if (t.value === "False") return { t: "const", v: false };
      if (t.value === "None") return { t: "const", v: null };
      return { t: "name", id: t.value, line: t.line };
    }
    if (t.type === "(") {
      if (peek().type === ")") { next(); return { t: "tuple", items: [] }; }
      const first = test();
      if (isKw("for")) { const gens = compFor(); eat(")"); return { t: "comp", elt: first, gens, kind: "list" }; }
      if (peek().type !== ",") { eat(")"); return first; }
      const items = [first];
      while (peek().type === ",") { next(); if (peek().type === ")") break; items.push(test()); }
      eat(")");
      return { t: "tuple", items };
    }
    if (t.type === "[") {
      if (peek().type === "]") { next(); return { t: "list", items: [] }; }
      const first = test();
      if (isKw("for")) { const gens = compFor(); eat("]"); return { t: "comp", elt: first, gens, kind: "list" }; }
      const items = [first];
      while (peek().type === ",") { next(); if (peek().type === "]") break; items.push(test()); }
      eat("]");
      return { t: "list", items };
    }
    if (t.type === "{") {
      const keys = [], vals = [];
      while (peek().type !== "}") {
        keys.push(test());
        eat(":");
        vals.push(test());
        if (peek().type === ",") next(); else break;
      }
      eat("}");
      return { t: "dict", keys, vals };
    }
    fail(`unexpected "${t.value ?? t.type}"`, t);
  }

  return program();
}

// ------------------------------------------------------------ interpreter

class ReturnSignal { constructor(v) { this.v = v; } }
class BreakSignal {}
class ContinueSignal {}
const MAX_STEPS = 200000, MAX_DEPTH = 150;

const DIM3 = ["Box", "Cylinder", "Cone", "Sphere", "Torus", "Wedge", "ConvexPolyhedron", "Hole", "CounterBoreHole", "CounterSinkHole"];
const HOLES = new Set(["Hole", "CounterBoreHole", "CounterSinkHole"]);
const DIM2 = ["Circle", "Ellipse", "Rectangle", "RectangleRounded", "Polygon", "RegularPolygon", "Triangle", "Trapezoid",
  "SlotOverall", "SlotCenterToCenter", "SlotCenterPoint"];
const DIM1 = ["Line", "Polyline", "FilletPolyline", "PolarLine", "Spline", "Bezier", "CenterArc", "EllipticalCenterArc",
  "ThreePointArc", "RadiusArc", "SagittaArc", "JernArc", "TangentArc"];

export function fromPython(src) {
  const program = parseProgram(tokenize(src));
  const langBox = { lang: "" };
  const env = makeEnv(langBox);
  let steps = 0, depth = 0;
  const tick = () => { if (++steps > MAX_STEPS) throw new Error("the code ran too long (an endless loop?)"); };

  // ---- scopes
  class Scope {
    constructor(parent) { this.vars = Object.create(null); this.parent = parent; }
    lookup(n) {
      for (let s = this; s; s = s.parent) if (n in s.vars) return s.vars[n];
      if (n in env) return env[n];
      throw new Error(`"${n}" isn't defined — supported: Box/Cylinder/Cone/Sphere/Torus/Wedge/ConvexPolyhedron/Hole/CounterBoreHole/CounterSinkHole, sketches (Rectangle, Circle, Ellipse, Polygon, RegularPolygon, RectangleRounded, Triangle, Trapezoid, Slot…), lines (Line, Polyline, arcs, Spline, Bezier) + make_face + extrude, BuildPart/BuildSketch/BuildLine, Locations/GridLocations/PolarLocations, Pos, Rot, Plane, Align, Mode, Axis, fillet/chamfer/mirror, cq.Workplane, and Python's range/len/min/max/sum/math`);
    }
    set(n, v) { this.vars[n] = v; }
  }
  const globals = new Scope(null);
  let lastShape = null;

  // ---- value helpers
  const truthy = (v) => !(v === null || v === undefined || v === false || v === 0 || v === ""
    || (Array.isArray(v) && v.length === 0));
  const asShape = (v) => {
    if (v?.__wp) return v.shape;
    if (v?.__handle) return v.__handle.kind === "part" ? v.__handle.shape : null;
    return isShape(v) ? v : null;
  };
  const asProfile = (v) => (isProfile(v) ? v : v?.__handle?.kind === "sketch" ? v.__handle.profile : null);
  const unwrap = (v) => {
    if (v?.__wp) return v.shape;
    if (v?.__handle) {
      const c = v.__handle;
      return c.kind === "part" ? c.shape : c.kind === "sketch" ? c.profile : c.wire;
    }
    return v;
  };
  const toIter = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === "string") return [...v];
    if (isLocSet(v)) return v.__locs;
    if (v?.__dict) return [...v.__dict.keys()];
    if (v?.__seq) return v.items();
    throw new Error("that can't be looped over");
  };
  const callValue = (f, c) => {
    if (typeof f !== "function") throw new Error("only functions can be called");
    return f(c);
  };
  const py = (fn) => (c) => fn(...c.args, c.kw);   // plain JS function as a Python builtin

  // ---- builder mode -------------------------------------------------------
  // with BuildPart() / BuildSketch() / BuildLine(): a stack of contexts. An
  // object made inside one joins it (mode ADD by default, SUBTRACT for holes)
  // at every active location; leaving a BuildSketch hands its sketch to the
  // enclosing BuildPart for the next extrude().
  const stack = [];
  const builderTop = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind !== "locs") return stack[i]; return null; };
  const IDENT = loc((s) => s, []);
  const compose = (o, i) => loc((s) => o.__loc(i.__loc(s)), o.__ops && i.__ops ? [...i.__ops, ...o.__ops] : null);
  const locsAfter = (idx) => {
    let out = [IDENT];
    for (let k = idx + 1; k < stack.length; k++) {
      if (stack[k].kind !== "locs") continue;
      const inner = stack[k].locs;
      out = out.flatMap((o) => inner.map((i) => compose(o, i)));
    }
    return out;
  };

  function combineInto(b, obj, mode, bb) {
    if (mode === "PRIVATE") return;
    if (b.kind === "part") {
      if (!isShape(obj)) throw new Error("only solids can join a BuildPart — sketches go in `with BuildSketch():` and become solids with extrude(amount=…)");
      if (mode === "ADD") { b.bbox = b.shape ? bbUnion(b.bbox, bb) : bb; b.shape = b.shape ? union(b.shape, obj) : obj; }
      else if (mode === "SUBTRACT") {
        if (!b.shape) throw new Error("nothing to subtract from yet — add a solid to the BuildPart first");
        b.shape = difference(b.shape, obj);
      } else if (mode === "INTERSECT") { b.bbox = b.shape ? bbIntersect(b.bbox, bb) : bb; b.shape = b.shape ? intersection(b.shape, obj) : obj; }
      else if (mode === "REPLACE") { b.shape = obj; b.bbox = bb; }
      else throw new Error(`unknown mode ${mode}`);
      if (b.shape) BB.set(b.shape, b.bbox);
    } else if (b.kind === "sketch") {
      if (!isProfile(obj)) throw new Error("a BuildSketch only takes 2D objects (Rectangle, Circle, … or make_face())");
      const op = { ADD: "UNION", SUBTRACT: "SUBTRACT", INTERSECT: "INTERSECT" }[mode];
      if (mode === "REPLACE" || !b.profile) {
        if (mode === "SUBTRACT") throw new Error("nothing to subtract from yet — add a shape to the BuildSketch first");
        b.profile = obj;
      } else if (op) b.profile = profileOp(op, [b.profile, obj]);
      else throw new Error(`unknown mode ${mode}`);
    } else if (b.kind === "line") {
      if (!isWire(obj)) throw new Error("a BuildLine only takes line objects (Line, Polyline, arcs, Spline…)");
      b.wire = b.wire ? joinWires(b.wire, obj) : obj;
    }
  }
  function place(obj, c, dim, name, defaultMode = "ADD") {
    const b = builderTop();
    if (!b) return;
    const mode = c.kw.mode ?? defaultMode;
    if (mode === "PRIVATE") return;
    const want = { 3: "part", 2: "sketch", 1: "line" }[dim];
    if (b.kind !== want) {
      if (dim === 2) throw new Error(`${name}(…) is a 2D sketch object — put it inside \`with BuildSketch():\`, then extrude(amount=…)`);
      if (dim === 3) throw new Error(`${name}(…) is a solid — it belongs directly in the BuildPart, not inside a Build${b.kind === "sketch" ? "Sketch" : "Line"}`);
      throw new Error(`${name}(…) is a line — draw it inside \`with BuildLine():\` (inside a BuildSketch, then make_face())`);
    }
    for (const L of locsAfter(stack.indexOf(b))) {
      combineInto(b, L.__loc(obj), mode, bbApply(BB.get(obj) ?? null, L.__ops));
    }
  }

  // primitives: bounding boxes, align= / rotation= keywords, and joining the
  // active builder
  const bbFor = (name, c) => {
    const n = (i, k, f) => { const v = arg(c, i, k, f); return typeof v === "number" ? v : f; };
    if (name === "Cylinder") { const r = n(0, "radius"), h = n(1, "height"); return bbOf([[-r, -r, -h / 2], [r, r, h / 2]]); }
    if (name === "Cone") { const r = Math.max(n(0, "bottom_radius", 0), n(1, "top_radius", 0)), h = n(2, "height"); return bbOf([[-r, -r, -h / 2], [r, r, h / 2]]); }
    if (name === "Sphere") { const r = n(0, "radius"); return bbOf([[-r, -r, -r], [r, r, r]]); }
    if (name === "Torus") { const R = n(0, "major_radius"), r = n(1, "minor_radius"); return bbOf([[-R - r, -R - r, -r], [R + r, R + r, r]]); }
    if (name === "Wedge") { const x = n(0, "xsize"), y = n(1, "ysize"), z = n(2, "zsize"); return bbOf([[-x / 2, -y / 2, -z / 2], [x / 2, y / 2, z / 2]]); }
    if (name === "Box") {
      const l = n(0, "length"), w = n(1, "width"), h = n(2, "height");
      let al = c.kw.align ?? arg(c, 3, "align");
      if (al === undefined) al = [ALIGN.CENTER, ALIGN.CENTER, ALIGN.CENTER];
      if (!Array.isArray(al)) al = [al, al, al];
      const mn = [alignShift(l, al[0]), alignShift(w, al[1]), alignShift(h, al[2])];
      return { min: mn, max: [mn[0] + l, mn[1] + w, mn[2] + h] };
    }
    return null;
  };
  const alignTo = (bb, al, dims) => {
    const list = Array.isArray(al) ? al : Array(dims).fill(al);
    return [0, 1, 2].map((k) => {
      const a = list[k];
      if (k >= dims || a === undefined || a === null || !bb) return 0;
      return a === ALIGN.MIN ? -bb.min[k] : a === ALIGN.MAX ? -bb.max[k] : -(bb.min[k] + bb.max[k]) / 2;
    });
  };
  // TangentArc(start, end, tangent=(dx, dy)): leaves `start` heading along
  // the tangent and curves round to `end` (builder-style line code leans on it)
  env.TangentArc = (c) => {
    const pts = (c.args.length === 1 && Array.isArray(c.args[0]) && Array.isArray(c.args[0][0])) ? c.args[0] : c.args;
    let s0 = pt2(pts[0], "TangentArc"), e0 = pt2(pts[1], "TangentArc");
    let t = pt2(c.kw.tangent ?? pts[2], "TangentArc tangent");
    if (c.kw.tangent_from_first === false) { [s0, e0] = [e0, s0]; t = [-t[0], -t[1]]; }
    const tl = Math.hypot(t[0], t[1]) || 1;
    const tx = t[0] / tl, ty = t[1] / tl, nx = -ty, ny = tx;          // left of the tangent
    const d = [e0[0] - s0[0], e0[1] - s0[1]];
    const dn = d[0] * nx + d[1] * ny;
    let pts2;
    if (Math.abs(dn) < 1e-9) pts2 = [s0, e0];                              // straight ahead
    else {
      const r = (d[0] * d[0] + d[1] * d[1]) / (2 * dn);                   // signed: + = curving left
      const cx = s0[0] + nx * r, cy = s0[1] + ny * r;
      const a0 = Math.atan2(s0[1] - cy, s0[0] - cx) / DEG, a1 = Math.atan2(e0[1] - cy, e0[0] - cx) / DEG;
      const norm = (x) => ((x % 360) + 360) % 360;
      const sweep = r > 0 ? norm(a1 - a0) : -norm(a0 - a1);
      pts2 = arcPts(cx, cy, Math.abs(r), a0, sweep);
    }
    if (c.kw.tangent_from_first === false) pts2 = pts2.reverse();
    return wire(pts2);
  };

  for (const [names, dim] of [[DIM3, 3], [DIM2, 2], [DIM1, 1]]) {
    for (const name of names) {
      const orig = env[name];
      env[name] = (c) => {
        let obj = orig(c);
        let bb = dim === 3 ? bbFor(name, c) : dim === 2 ? profileBBox(obj) : null;
        // build123d's align= on everything (Box already did its own)
        const al = c.kw.align;
        if (al !== undefined && name !== "Box" && dim > 1 && bb) {
          const sh = alignTo(bb, al, dim === 3 ? 3 : 2);
          if (sh.some((v) => v)) {
            obj = dim === 3 ? translate(sh, obj) : mapProfile(obj, ([x, y]) => [x + sh[0], y + sh[1]]);
            bb = bbApply(bb, [{ t: sh }]);
          }
        }
        // rotation= : (x, y, z) degrees on solids, one angle on sketches
        const rot = c.kw.rotation;
        if (rot !== undefined) {
          if (dim === 3) {
            const r = Array.isArray(rot) ? rot : [0, 0, rot];
            obj = rotate(r, obj);
            bb = bbApply(bb, [{ r }]);
          } else if (dim === 2) {
            const a = (Array.isArray(rot) ? rot[2] ?? rot[0] : rot) * DEG;
            obj = mapProfile(obj, ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
            bb = profileBBox(obj);
          }
        }
        // A builder hole with no depth goes all the way through, both ways. One
        // cylinder per radius (not the hanging hole plus a second one stacked on
        // it): coaxial overlapping cylinders leave the exact kernel a split wall
        // to fillet around, which it does very slowly.
        if (HOLES.has(name) && builderTop()?.kind === "part" && arg(c, name === "Hole" ? 1 : 3, "depth") == null) {
          const r = num(arg(c, 0, "radius"), `${name} radius`);
          const through = translate([0, 0, -1000], cylinder({ r, h: 2000, $fn: 48 }));
          if (name === "Hole") obj = through;
          else if (name === "CounterBoreHole") {
            const cbr = num(arg(c, 1, "counter_bore_radius"), "counter_bore_radius");
            const cbd = num(arg(c, 2, "counter_bore_depth"), "counter_bore_depth");
            obj = union(through, translate([0, 0, -cbd], cylinder({ r: cbr, h: cbd + 1000, $fn: 48 })));
          } else {
            const csr = num(arg(c, 1, "counter_sink_radius"), "counter_sink_radius");
            const ang = num(arg(c, 3, "counter_sink_angle") ?? 82, "counter_sink_angle");
            const csDepth = (csr - r) / Math.tan((ang / 2) * DEG);
            obj = union(through, translate([0, 0, -csDepth], cone({ r1: r, r2: csr, h: csDepth, $fn: 48 })),
              cylinder({ r: csr, h: 1000, $fn: 48 }));
          }
        }
        if (bb && isShape(obj)) BB.set(obj, bb);
        place(obj, c, dim, name, HOLES.has(name) ? "SUBTRACT" : "ADD");
        return obj;
      };
    }
  }

  // Build* contexts and their handles (`with BuildPart() as part:`)
  const asPlane = (v, what) => {
    if (v === undefined || v === null) return null;
    if (v?.__plane) return v;
    if (isLoc(v) && v.__ops && v.__ops.every((o) => o.t)) {
      const t = v.__ops.reduce((a, o) => a.map((x, k) => x + o.t[k]), [0, 0, 0]);
      return planeFrom(t, [1, 0, 0], [0, 0, 1]);
    }
    throw new Error(`${what} takes a Plane (Plane.XY, Plane.XZ.offset(5), …) or a face (part.faces().sort_by(Axis.Z)[-1])`);
  };
  env.BuildPart = (c) => ({ __builderReq: "part", plane: asPlane(c.args[0] ?? c.kw.workplane, "BuildPart"), mode: c.kw.mode });
  env.BuildSketch = (c) => ({ __builderReq: "sketch", plane: asPlane(c.args[0] ?? c.kw.workplane, "BuildSketch"), mode: c.kw.mode });
  env.BuildLine = (c) => ({ __builderReq: "line", mode: c.kw.mode });

  const srcOfCtx = (ctx) => ({ bb: () => ctx.bbox, shape: () => ctx.shape, ctx });
  const srcOfShape = (s) => ({ bb: () => BB.get(s) ?? null, shape: () => s, ctx: null });
  const axisArg = (c) => {
    const a = c.args[0] ?? c.kw.axis;
    if (a === "x" || a === "y" || a === "z") return a;
    throw new Error("pick faces and edges by Axis.X, Axis.Y or Axis.Z here (GeomType and Select filters aren't supported)");
  };
  const facesOf = (src) => () => {
    const seq = (axis) => ({
      __seq: true,
      index: (i) => {
        if (i !== 0 && i !== -1) throw new Error("only the first [0] and last [-1] face along an axis can be picked here");
        const b = src.bb();
        if (!b) throw new Error("this part's size isn't known here, so its faces can't be found — use Plane.XY.offset(height) instead");
        return facePlane(b, axis, i === 0 ? -1 : 1);
      },
      get first() { return this.index(0); },
      get last() { return this.index(-1); },
      items() { return [this.index(0), this.index(-1)]; },
    });
    return {
      sort_by: (c) => seq(axisArg(c)),
      group_by: (c) => seq(axisArg(c)),
      filter_by: () => { throw new Error("faces().filter_by(...) isn't supported — use faces().sort_by(Axis.Z)[-1] for the top face"); },
    };
  };
  const edgesOf = (src) => (c) => {
    if (c?.args?.[0] === "LAST" || c?.args?.[0] === "NEW") {
      throw new Error("edges(Select.LAST) (only the edges the last operation made) isn't supported — pick edges with .filter_by(Axis.Z) or .group_by(Axis.Z)[-1]");
    }
    const seq = (axis) => ({
      __seq: true,
      index: (i) => {
        if (axis !== "z") throw new Error("group_by/sort_by on edges works along Axis.Z here: [-1] = the top edges, [0] = the bottom ones");
        if (i !== 0 && i !== -1) throw new Error("only [0] (bottom) and [-1] (top) edge groups can be picked here");
        return { __edges: i === 0 ? "bottom" : "top", __src: src };
      },
      get first() { return this.index(0); },
      get last() { return this.index(-1); },
      items() { return [this.index(0), this.index(-1)]; },
    });
    return {
      __edges: "all", __src: src,
      filter_by: (cc) => ({ __edges: axisArg(cc), __src: src }),
      group_by: (cc) => seq(axisArg(cc)),
      sort_by: (cc) => seq(axisArg(cc)),
    };
  };
  function makeHandle(ctx) {
    const h = { __handle: ctx };
    const def = (k, get) => Object.defineProperty(h, k, { get, enumerable: true });
    def("part", () => ctx.shape);
    def("sketch", () => ctx.profile);
    def("sketch_local", () => ctx.profile);
    def("line", () => ctx.wire);
    def("edges", () => edgesOf(srcOfCtx(ctx)));
    def("faces", () => facesOf(srcOfCtx(ctx)));
    def("vertices", () => () => ({ __verts: ctx.profile, __ctx: ctx }));
    def("pending_edges", () => ctx.pendingWires);
    return h;
  }
  function enterWith(v, as, scope) {
    if (v?.__builderReq) {
      const parentPart = (() => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === "part") return { ctx: stack[i], idx: i }; return null; })();
      const ctx = {
        kind: v.__builderReq, mode: v.mode, name: as,
        shape: null, bbox: null, pending: [], profile: null, pendingWires: [], wire: null,
        plane: v.plane ?? parentPart?.ctx.plane ?? null,
        placeLocs: v.__builderReq === "sketch" && parentPart ? locsAfter(parentPart.idx) : [IDENT],
      };
      stack.push(ctx);
      if (as) scope.set(as, makeHandle(ctx));
      return ctx;
    }
    if (isLocSet(v) || isLoc(v)) {
      const ctx = { kind: "locs", locs: isLocSet(v) ? v.__locs : [v] };
      stack.push(ctx);
      if (as) scope.set(as, v);
      return ctx;
    }
    throw new Error("`with` works with BuildPart(), BuildSketch(), BuildLine(), Locations(…), GridLocations(…) and PolarLocations(…)");
  }
  function leaveWith(ctx) {
    stack.splice(stack.lastIndexOf(ctx), 1);
    if (ctx.kind === "locs") return;
    const parent = builderTop();
    if (ctx.kind === "line") {
      if (ctx.wire && parent?.kind === "sketch") parent.pendingWires.push(ctx.wire);
    } else if (ctx.kind === "sketch") {
      if (ctx.profile && parent?.kind === "part") {
        parent.pending.push({ profile: ctx.profile, plane: ctx.plane, locs: ctx.placeLocs });
      }
    } else if (ctx.kind === "part") {
      if (ctx.shape && parent?.kind === "part") combineInto(parent, ctx.shape, ctx.mode ?? "ADD", ctx.bbox);
      else if (ctx.shape && !parent) lastShape = { name: ctx.name, shape: ctx.shape };
    }
  }

  // builder-aware operations
  const extrudeLocal = (pr, amt, both) => {
    const h = Math.abs(amt);
    let s = profileToSolid(pr, both ? 2 * h : h);
    if (both) s = translate([0, 0, -h], s);
    else if (amt < 0) s = translate([0, 0, amt], s);
    const b = profileBBox(pr);
    const z0 = both ? -h : Math.min(0, amt), z1 = both ? h : Math.max(0, amt);
    if (b) BB.set(s, { min: [b.min[0], b.min[1], z0], max: [b.max[0], b.max[1], z1] });
    return s;
  };
  env.extrude = (c) => {
    if (c.kw.until !== undefined) throw new Error("extrude(until=…) isn't supported — give it an amount");
    if (c.kw.taper) throw new Error("extrude(taper=…) isn't supported — extrude straight, or hull() two sections in BREPcode");
    const b = builderTop();
    const given = c.kw.to_extrude ?? (c.args[0] !== undefined && typeof c.args[0] !== "number" ? c.args[0] : undefined);
    const amt = num(c.kw.amount ?? (given === undefined ? c.args[0] : c.args[1]), "extrude amount");
    const both = c.kw.both === true;
    const mode = c.kw.mode ?? "ADD";
    if (given === undefined) {
      if (b?.kind !== "part") throw new Error("extrude() needs a sketch (Rectangle, Circle, make_face(...)…) as its first argument");
      if (!b.pending.length) throw new Error("extrude(): there's no sketch to extrude — draw one in `with BuildSketch():` first");
      for (const pend of b.pending) {
        const local = extrudeLocal(pend.profile, amt, both);
        const plane = pend.plane;
        const onPlane = plane ? plane.__loc(local) : local;
        const pbb = plane ? bbApply(BB.get(local), plane.__ops) : BB.get(local);
        if (pbb) BB.set(onPlane, pbb);
        for (const L of pend.locs) combineInto(b, L.__loc(onPlane), mode, bbApply(pbb, L.__ops));
      }
      b.pending = [];
      return b.shape;
    }
    const pr = asProfile(given) ?? given;
    if (!isProfile(pr)) throw new Error("extrude() needs a sketch (Rectangle, Circle, make_face(...)…) as its first argument");
    const out = extrudeLocal(pr, amt, both);
    if (b?.kind === "part") combineInto(b, out, mode, BB.get(out));
    return out;
  };
  const origMakeFace = env.make_face;
  env.make_face = (c) => {
    const b = builderTop();
    if (b?.kind === "sketch" && !c.args.length && !c.kw.edges) {
      if (!b.pendingWires.length) throw new Error("make_face(): there are no lines to close — draw them in `with BuildLine():` inside this BuildSketch");
      const face = origMakeFace({ args: [b.pendingWires], kw: {} });
      b.pendingWires = [];
      combineInto(b, face, c.kw.mode ?? "ADD", null);
      return face;
    }
    const face = origMakeFace(c.kw.edges ? { args: [c.kw.edges], kw: {} } : c);
    if (b?.kind === "sketch") combineInto(b, face, c.kw.mode ?? "ADD", null);
    return face;
  };
  const edgeOp = (kind, sel, amount) => {
    const src = sel.__src;
    const shape = src.shape();
    if (!isShape(shape)) throw new Error(`there's no solid to ${kind} yet`);
    const res = kind === "fillet" ? dslFillet({ r: amount, edges: sel.__edges }, shape) : dslChamfer({ d: amount, edges: sel.__edges }, shape);
    const bb = src.bb();
    if (bb) BB.set(res, bb);
    if (src.ctx && stack.includes(src.ctx)) src.ctx.shape = res;
    return res;
  };
  const origFillet = env.fillet;
  env.fillet = (c) => {
    const t = c.args[0] ?? c.kw.objects;
    if (t?.__edges) return edgeOp("fillet", t, num(c.kw.radius ?? c.args[1], "fillet radius"));
    const res = origFillet(c);
    if (t?.__ctx && stack.includes(t.__ctx)) t.__ctx.profile = res;
    return res;
  };
  env.chamfer = (c) => {
    const t = c.args[0] ?? c.kw.objects;
    if (t?.__edges) return edgeOp("chamfer", t, num(c.kw.length ?? c.kw.distance ?? c.args[1], "chamfer length"));
    throw new Error("chamfer() here takes a solid's edges: chamfer(part.edges().group_by(Axis.Z)[-1], length=1)");
  };
  const mirrorAcross = (s, plane) => {
    const n = plane.z_dir, o = plane.origin;
    if (isProfile(s)) throw new Error("mirror a sketch by drawing it on both sides — mirror() here works on solids");
    const back = o.some((v) => v) ? translate(o.map((v) => -v), s) : s;
    const m = mirror(n, back);
    return o.some((v) => v) ? translate(o, m) : m;
  };
  env.mirror = (c) => {
    const about = c.kw.about ?? (c.args[1]?.__plane ? c.args[1] : c.args[0]?.__plane ? c.args[0] : null) ?? PLANES.XZ();
    const objs = c.kw.objects ?? (c.args[0]?.__plane ? undefined : c.args[0]);
    const b = builderTop();
    if (objs === undefined) {
      if (b?.kind !== "part" || !b.shape) throw new Error("mirror() needs something to mirror: mirror(part, about=Plane.YZ)");
      const m = mirrorAcross(b.shape, about);
      combineInto(b, m, c.kw.mode ?? "ADD", null);
      b.bbox = null;
      return m;
    }
    const shape = unwrap(objs);
    const m = mirrorAcross(shape, about);
    if (b?.kind === "part") combineInto(b, m, c.kw.mode ?? "ADD", null);
    return m;
  };
  env.add = (c) => {
    const b = builderTop();
    if (!b) throw new Error("add() only works inside a BuildPart / BuildSketch / BuildLine");
    const objs = c.args[0] ?? c.kw.objects;
    for (const o of (Array.isArray(objs) ? objs : [objs]).map(unwrap)) {
      const dim = isShape(o) ? 3 : isProfile(o) ? 2 : isWire(o) ? 1 : 0;
      if (!dim) throw new Error("add() takes solids, sketches or lines");
      place(o, c, dim, "add");
    }
    return null;
  };
  for (const name of ["split", "offset", "shell", "scale", "revolve", "section", "project", "thicken", "loft", "sweep"]) {
    if (!env[name]) env[name] = () => { throw new Error(`${name}() isn't supported here yet`); };
  }

  // namespaces
  const PlaneFn = (c) => {
    const o = c.kw.origin ?? c.args[0];
    if (o?.__plane) return o;
    const origin = Array.isArray(o) ? [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0] : [0, 0, 0];
    const xd = c.kw.x_dir ?? c.args[1] ?? [1, 0, 0];
    const zd = c.kw.z_dir ?? c.args[2] ?? [0, 0, 1];
    return planeFrom(origin, xd, zd);
  };
  for (const k of Object.keys(PLANES)) Object.defineProperty(PlaneFn, k, { get: PLANES[k], enumerable: true });
  env.Plane = PlaneFn;
  env.Mode = { ADD: "ADD", SUBTRACT: "SUBTRACT", INTERSECT: "INTERSECT", REPLACE: "REPLACE", PRIVATE: "PRIVATE" };
  env.Axis = { X: "x", Y: "y", Z: "z" };
  env.Select = { ALL: "ALL", LAST: "LAST", NEW: "NEW" };
  env.Until = { NEXT: "NEXT", LAST: "LAST", PREVIOUS: "PREVIOUS", FIRST: "FIRST" };
  env.GeomType = { LINE: "LINE", CIRCLE: "CIRCLE", PLANE: "PLANE", CYLINDER: "CYLINDER" };
  env.Vector = (c) => (c.args.length === 1 && Array.isArray(c.args[0]) ? c.args[0] : c.args);
  const posFn = env.Pos;
  env.Location = (c) => {
    const pos = c.args[0], rot = c.args[1];
    if (Array.isArray(pos) && Array.isArray(rot)) {
      return compose(posFn({ args: pos, kw: {} }), env.Rot({ args: rot, kw: {} }));
    }
    return posFn(c);
  };
  const origLocations = env.Locations;
  env.Locations = (c) => {
    const items = (c.args.length === 1 && Array.isArray(c.args[0]) && (Array.isArray(c.args[0][0]) || isLoc(c.args[0][0]))) ? c.args[0] : c.args;
    return { __locs: items.flatMap((p) => (isLocSet(p) ? p.__locs : isLoc(p) ? [p] : origLocations({ args: [p], kw: {} }).__locs)) };
  };

  // ---- Python builtins
  const pyRange = (a, b, s = 1) => {
    if (b === undefined) { b = a; a = 0; }
    const out = [];
    if (s === 0) throw new Error("range() step can't be 0");
    for (let i = a; s > 0 ? i < b : i > b; i += s) { out.push(i); if (out.length > MAX_STEPS) throw new Error("range() is too large"); }
    return out;
  };
  const flatArgs = (args) => (args.length === 1 && (Array.isArray(args[0]) || isLocSet(args[0])) ? toIter(args[0]) : args);
  Object.assign(env, {
    range: py((a, b, s) => pyRange(a, typeof b === "number" ? b : undefined, typeof s === "number" ? s : 1)),
    len: py((v) => (v?.__dict ? v.__dict.size : toIter(v).length)),
    abs: py((v) => Math.abs(v)),
    min: (c) => { const a = flatArgs(c.args); return c.kw.key ? a.reduce((x, y) => (callValue(c.kw.key, { args: [y], kw: {} }) < callValue(c.kw.key, { args: [x], kw: {} }) ? y : x)) : Math.min(...a); },
    max: (c) => { const a = flatArgs(c.args); return c.kw.key ? a.reduce((x, y) => (callValue(c.kw.key, { args: [y], kw: {} }) > callValue(c.kw.key, { args: [x], kw: {} }) ? y : x)) : Math.max(...a); },
    sum: (c) => {
      const items = toIter(c.args[0]);
      const start = c.args[1] ?? c.kw.start;
      if (start !== undefined) return items.reduce((a, b) => binop("+", a, b), start);
      if (!items.length) return 0;
      return items.every((x) => typeof x === "number") ? items.reduce((a, b) => a + b, 0) : items.reduce((a, b) => binop("+", a, b));
    },
    round: py((v, n) => { const f = 10 ** (typeof n === "number" ? n : 0); return Math.round(v * f) / f; }),
    int: py((v) => (typeof v === "string" ? parseInt(v, 10) : Math.trunc(v))),
    float: py((v) => Number(v)),
    str: py((v) => String(v)),
    bool: py((v) => truthy(v)),
    list: py((v) => (v === undefined ? [] : [...toIter(v)])),
    tuple: py((v) => (v === undefined ? [] : [...toIter(v)])),
    enumerate: py((v, start = 0) => toIter(v).map((x, i) => [i + (typeof start === "number" ? start : 0), x])),
    zip: (c) => { const ls = c.args.map(toIter); const n = Math.min(...ls.map((l) => l.length)); return Array.from({ length: n }, (_, i) => ls.map((l) => l[i])); },
    reversed: py((v) => [...toIter(v)].reverse()),
    sorted: (c) => { const a = [...toIter(c.args[0])]; const key = c.kw.key; a.sort((x, y) => { const kx = key ? callValue(key, { args: [x], kw: {} }) : x; const ky = key ? callValue(key, { args: [y], kw: {} }) : y; return kx < ky ? -1 : kx > ky ? 1 : 0; }); if (c.kw.reverse) a.reverse(); return a; },
    isinstance: () => true,
    print: () => null, show: () => null, show_object: () => null, show_all: () => null, show_topology: () => null,
    export_stl: () => null, export_step: () => null, export_gltf: () => null, set_port: () => null, set_defaults: () => null,
  });
  const MATH = {
    pi: Math.PI, e: Math.E, tau: 2 * Math.PI, inf: Infinity,
    sin: py(Math.sin), cos: py(Math.cos), tan: py(Math.tan), asin: py(Math.asin), acos: py(Math.acos), atan: py(Math.atan),
    atan2: py(Math.atan2), sqrt: py(Math.sqrt), hypot: py(Math.hypot), floor: py(Math.floor), ceil: py(Math.ceil),
    fabs: py(Math.abs), pow: py(Math.pow), exp: py(Math.exp), log: py((x, b) => (b ? Math.log(x) / Math.log(b) : Math.log(x))),
    log10: py(Math.log10), radians: py((d) => d * DEG), degrees: py((r) => r / DEG), copysign: py((a, b) => Math.sign(b) * Math.abs(a)),
    isclose: py((a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1)),
  };
  const NUMPY = {
    ...MATH,
    linspace: py((a, b, n = 50) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / Math.max(1, n - 1))),
    arange: py((a, b, s = 1) => pyRange(a, b, s)),
    array: py((v) => [...toIter(v)]),
    deg2rad: py((d) => d * DEG), rad2deg: py((r) => r / DEG),
  };
  const MODULES = { math: MATH, numpy: NUMPY, cmath: MATH };

  // ---- operators
  function binop(op, a, b) {
    const A = unwrap(a), B2 = unwrap(b);
    const both = (t) => typeof A === t && typeof B2 === t;
    switch (op) {
      case "+":
        if (both("number") || both("string")) return A + B2;
        if (Array.isArray(A) && Array.isArray(B2)) return [...A, ...B2];
        if (isShape(A) && isShape(B2)) { const r = union(A, B2); const bb = bbUnion(BB.get(A) ?? null, BB.get(B2) ?? null); if (bb) BB.set(r, bb); return r; }
        if (isProfile(A) && isProfile(B2)) return profileOp("UNION", [A, B2]);
        if (isWire(A) && isWire(B2)) return joinWires(A, B2);
        break;
      case "-":
        if (both("number")) return A - B2;
        if (isShape(A) && isShape(B2)) { const r = difference(A, B2); if (BB.get(A)) BB.set(r, BB.get(A)); return r; }
        if (isProfile(A) && isProfile(B2)) return profileOp("SUBTRACT", [A, B2]);
        break;
      case "*": {
        if (both("number")) return A * B2;
        if (typeof A === "string" && typeof B2 === "number") return A.repeat(B2);
        if (Array.isArray(A) && typeof B2 === "number") return Array.from({ length: B2 }, () => A).flat();
        if (isLoc(A)) {
          if (isLoc(B2)) return compose(A, B2);
          if (isLocSet(B2)) return { __locs: B2.__locs.map((l) => compose(A, l)) };
          if (isShape(B2) || isProfile(B2) || isWire(B2)) {
            const r = A.__loc(B2);
            if (isShape(r)) { const bb = bbApply(BB.get(B2) ?? null, A.__ops); if (bb) BB.set(r, bb); }
            return r;
          }
          throw new Error("a location (Pos/Rot/Plane) can only multiply a shape, sketch, wire or another location");
        }
        if (isLocSet(A)) {
          if (isProfile(B2)) return profileOp("UNION", A.__locs.map((l) => l.__loc(B2)));
          if (isShape(B2)) return union(...A.__locs.map((l) => l.__loc(B2)));
          if (isLoc(B2)) return { __locs: A.__locs.map((l) => compose(l, B2)) };
          throw new Error("GridLocations/PolarLocations multiply a sketch or a solid");
        }
        throw new Error("* only combines numbers, or a Pos/Rot/Plane with a shape");
      }
      case "/": if (both("number")) return A / B2; break;
      case "//": if (both("number")) return Math.floor(A / B2); break;
      case "%":
        if (both("number")) return ((A % B2) + B2) % B2;
        if (isWire(A) && typeof B2 === "number") return wireTangent(A, B2);
        break;
      case "**": if (both("number")) return A ** B2; break;
      case "@":
        if (isWire(A) && typeof B2 === "number") return wirePoint(A, B2);
        break;
      case "&":
        if (both("number")) return A & B2;
        if (isShape(A) && isShape(B2)) return intersection(A, B2);
        if (isProfile(A) && isProfile(B2)) return profileOp("INTERSECT", [A, B2]);
        break;
      case "|":
        if (both("number")) return A | B2;
        if (isShape(A) && isShape(B2)) return union(A, B2);
        if (isProfile(A) && isProfile(B2)) return profileOp("UNION", [A, B2]);
        break;
      case "^": if (both("number")) return A ^ B2; break;
      default:
    }
    if ((isProfile(A) && isShape(B2)) || (isShape(A) && isProfile(B2))) {
      throw new Error("can't mix a 2D sketch with a 3D solid — extrude(sketch, amount=…) the sketch first");
    }
    throw new Error(`${op} doesn't work between ${kindOf(A)} and ${kindOf(B2)}`);
  }
  const kindOf = (v) => (v === null || v === undefined ? "None" : typeof v === "number" ? "a number" : typeof v === "string" ? "text"
    : Array.isArray(v) ? "a list" : isShape(v) ? "a solid" : isProfile(v) ? "a sketch" : isWire(v) ? "a line" : isLoc(v) ? "a location" : "that");
  // wire @ t: the point a fraction t along it; wire % t: the tangent there
  function wireAt(w, t) {
    const P = w.__wire;
    const lens = [];
    let total = 0;
    for (let i = 1; i < P.length; i++) { const l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); lens.push(l); total += l; }
    let d = Math.max(0, Math.min(1, t)) * total;
    for (let i = 0; i < lens.length; i++) {
      if (d <= lens[i] || i === lens.length - 1) {
        const f = lens[i] ? Math.min(1, d / lens[i]) : 0;
        const a = P[i], b = P[i + 1];
        return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d: unit([b[0] - a[0], b[1] - a[1], 0]) };
      }
      d -= lens[i];
    }
    return { p: P[0], d: [1, 0, 0] };
  }
  const wirePoint = (w, t) => wireAt(w, t).p;
  const wireTangent = (w, t) => wireAt(w, t).d.slice(0, 2);
  const compare = (op, a, b) => {
    switch (op) {
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      case ">=": return a >= b;
      case "==": return Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
      case "!=": return Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) !== JSON.stringify(b) : a !== b;
      case "in": return Array.isArray(b) ? b.some((x) => x === a) : typeof b === "string" ? b.includes(a) : b?.__dict ? b.__dict.has(a) : false;
      case "not in": return !compare("in", a, b);
      case "is": return a === b;
      case "is not": return a !== b;
      default: throw new Error(`unknown comparison ${op}`);
    }
  };

  // ---- attribute access and indexing
  function getAttr(v, name) {
    if (v?.__wp) {
      const m = v.methods[name];
      if (!m) throw new Error(`CadQuery .${name}() isn't supported`);
      return m;
    }
    if (Array.isArray(v)) {
      const list = {
        append: py((x) => { v.push(x); return null; }), extend: py((x) => { v.push(...toIter(x)); return null; }),
        pop: py((i) => (i === undefined ? v.pop() : v.splice(i < 0 ? v.length + i : i, 1)[0])),
        insert: py((i, x) => { v.splice(i, 0, x); return null; }), reverse: py(() => { v.reverse(); return null; }),
        index: py((x) => v.indexOf(x)), count: py((x) => v.filter((y) => y === x).length),
        sort: (c) => { const r = env.sorted({ args: [v], kw: c.kw }); v.splice(0, v.length, ...r); return null; },
        X: v[0], Y: v[1], Z: v[2],
      };
      if (name in list) return list[name];
    }
    if (typeof v === "string") {
      const strs = { upper: py(() => v.toUpperCase()), lower: py(() => v.toLowerCase()), join: py((it) => toIter(it).join(v)),
        format: py((...a) => { let i = 0; return v.replace(/\{[^}]*\}/g, () => String(a[i++] ?? "")); }), strip: py(() => v.trim()) };
      if (name in strs) return strs[name];
    }
    if (v?.__dict) {
      const d = v.__dict;
      const dm = { get: py((k, f = null) => (d.has(k) ? d.get(k) : f)), keys: py(() => [...d.keys()]), values: py(() => [...d.values()]),
        items: py(() => [...d.entries()]) };
      if (name in dm) return dm[name];
    }
    if (isShape(v)) {
      if (name === "edges") return edgesOf(srcOfShape(v));
      if (name === "faces") return facesOf(srcOfShape(v));
      throw new Error(`.${name} isn't supported on solids — use +, -, & operators, fillet(part.edges()…), and Pos/Rot instead`);
    }
    if (isProfile(v) && name === "vertices") return () => ({ __verts: v });
    if (v && (typeof v === "object" || typeof v === "function") && name in v) return v[name];
    throw new Error(`unknown attribute .${name}`);
  }
  function getIndex(v, i) {
    if (v?.__seq) return v.index(i);
    if (v?.__dict) { if (!v.__dict.has(i)) throw new Error(`key ${JSON.stringify(i)} isn't in the dict`); return v.__dict.get(i); }
    if (Array.isArray(v) || typeof v === "string") {
      if (typeof i !== "number") throw new Error("list indices must be numbers");
      const k = i < 0 ? v.length + i : i;
      if (k < 0 || k >= v.length) throw new Error(`index ${i} is out of range`);
      return v[k];
    }
    if (isLocSet(v)) return v.__locs[i < 0 ? v.__locs.length + i : i];
    throw new Error("that can't be indexed with [ ]");
  }
  function slice(v, a, b, step) {
    const s = step ?? 1;
    const n = v.length;
    const norm = (x, d) => (x === null || x === undefined ? d : x < 0 ? Math.max(0, n + x) : Math.min(n, x));
    const out = [];
    if (s > 0) for (let i = norm(a, 0); i < norm(b, n); i += s) out.push(v[i]);
    else for (let i = a == null ? n - 1 : norm(a, n - 1); i > (b == null ? -1 : norm(b, -1)); i += s) out.push(v[i]);
    return typeof v === "string" ? out.join("") : out;
  }

  // ---- evaluation
  function makeFunction(name, params, body, defScope) {
    const defaults = params.map((pp) => (pp.def ? ev(pp.def, defScope) : undefined));
    const fn = (c) => {
      if (++depth > MAX_DEPTH) { depth = 0; throw new Error(`${name}() calls itself too deeply`); }
      const sc = new Scope(defScope);
      let pos = 0;
      params.forEach((pp, k) => {
        if (pp.star) { sc.set(pp.name, c.args.slice(pos)); pos = c.args.length; return; }
        if (pp.kwstar) { sc.set(pp.name, { __dict: new Map(Object.entries(c.kw)) }); return; }
        let v;
        if (pos < c.args.length) v = c.args[pos++];
        else if (pp.name in c.kw) v = c.kw[pp.name];
        else if (defaults[k] !== undefined || pp.def) v = defaults[k];
        else throw new Error(`${name}() is missing its "${pp.name}" argument`);
        sc.set(pp.name, v);
      });
      try {
        exec(body, sc);
        return null;
      } catch (e) {
        if (e instanceof ReturnSignal) return e.v;
        throw e;
      } finally { depth--; }
    };
    fn.__pyName = name;
    return fn;
  }
  function ev(n, sc) {
    switch (n.t) {
      case "const": return n.v;
      case "name": return sc.lookup(n.id);
      case "tuple": case "list": return n.items.map((x) => ev(x, sc));
      case "dict": return { __dict: new Map(n.keys.map((k, i) => [ev(k, sc), ev(n.vals[i], sc)])) };
      case "attr": return getAttr(ev(n.obj, sc), n.name);
      case "index": return getIndex(ev(n.obj, sc), ev(n.idx, sc));
      case "slice": {
        const v = ev(n.obj, sc);
        const g = (x) => (x ? ev(x, sc) : null);
        return slice(Array.isArray(v) || typeof v === "string" ? v : toIter(v), g(n.a), g(n.b), g(n.step));
      }
      case "call": {
        const f = ev(n.fn, sc);
        const c = { args: [], kw: {} };
        for (const a of n.args) {
          if (a.star) c.args.push(...toIter(ev(a.star, sc)));
          else if (a.kwstar) { const d = ev(a.kwstar, sc); if (d?.__dict) for (const [k, v] of d.__dict) c.kw[k] = v; }
          else if (a.kw) c.kw[a.kw] = ev(a.v, sc);
          else c.args.push(ev(a.v, sc));
        }
        return callValue(f, c);
      }
      case "bin": return binop(n.op, ev(n.l, sc), ev(n.r, sc));
      case "un": {
        const v = unwrap(ev(n.v, sc));
        if (n.op === "-") { if (typeof v === "number") return -v; if (Array.isArray(v)) return v.map((x) => -x); throw new Error("unary minus only works on numbers here"); }
        if (n.op === "~") return ~v;
        return v;
      }
      case "not": return !truthy(ev(n.v, sc));
      case "bool": {
        const l = ev(n.l, sc);
        if (n.op === "and") return truthy(l) ? ev(n.r, sc) : l;
        return truthy(l) ? l : ev(n.r, sc);
      }
      case "cmp": {
        let left = ev(n.first, sc);
        for (let i = 0; i < n.ops.length; i++) {
          const right = ev(n.rest[i], sc);
          if (!compare(n.ops[i], left, right)) return false;
          left = right;
        }
        return true;
      }
      case "ifexp": return truthy(ev(n.cond, sc)) ? ev(n.a, sc) : ev(n.b, sc);
      case "lambda": return makeFunction("lambda", n.params, [{ t: "return", v: n.body, line: n.line }], sc);
      case "comp": {
        const out = [];
        const inner = new Scope(sc);
        const run = (g) => {
          if (g === n.gens.length) { out.push(ev(n.elt, inner)); return; }
          const gen = n.gens[g];
          for (const item of toIter(ev(gen.iter, inner))) {
            tick();
            assignTo(gen.target, item, inner);
            if (gen.conds.every((c) => truthy(ev(c, inner)))) run(g + 1);
          }
        };
        run(0);
        return out;
      }
      default: throw new Error(`can't evaluate ${n.t}`);
    }
  }
  function assignTo(target, value, sc) {
    if (target.t === "name") { sc.set(target.id, value); return; }
    if (target.t === "tuple" || target.t === "list") {
      const vals = toIter(value);
      if (vals.length !== target.items.length) throw new Error(`can't unpack ${vals.length} values into ${target.items.length} names`);
      target.items.forEach((t, i) => assignTo(t, vals[i], sc));
      return;
    }
    if (target.t === "index") {
      const obj = ev(target.obj, sc), i = ev(target.idx, sc);
      if (obj?.__dict) { obj.__dict.set(i, value); return; }
      if (Array.isArray(obj)) { obj[i < 0 ? obj.length + i : i] = value; return; }
      throw new Error("can't assign into that");
    }
    if (target.t === "attr") {
      const obj = ev(target.obj, sc);
      if (obj && typeof obj === "object" && !obj.__handle) { obj[target.name] = value; return; }
      throw new Error(`can't set .${target.name}`);
    }
    throw new Error("can't assign to that");
  }
  function noteShape(name, v) {
    if (builderTop()) return;            // builder objects are collected by their context
    const s = asShape(v);
    if (s) lastShape = { name, shape: s };
  }
  function exec(body, sc) {
    for (const st of body) {
      tick();
      try {
        execStmt(st, sc);
      } catch (e) {
        if (e instanceof ReturnSignal || e instanceof BreakSignal || e instanceof ContinueSignal) throw e;
        if (e instanceof Error && !/^line \d+:/.test(e.message)) e.message = `line ${st.line}: ${e.message}`;
        throw e;
      }
    }
  }
  function execStmt(st, sc) {
    switch (st.t) {
      case "expr": noteShape(null, ev(st.e, sc)); return;
      case "assign": {
        const v = ev(st.value, sc);
        for (const tg of st.targets) {
          assignTo(tg, v, sc);
          if (tg.t === "name") noteShape(tg.id, v);
        }
        return;
      }
      case "aug": {
        const cur = ev(st.target, sc);
        const v = binop(st.op, cur, ev(st.value, sc));
        if (Array.isArray(cur) && st.op === "+") { cur.splice(0, cur.length, ...v); return; }   // list += mutates
        assignTo(st.target, v, sc);
        if (st.target.t === "name") noteShape(st.target.id, v);
        return;
      }
      case "if": exec(truthy(ev(st.cond, sc)) ? st.body : st.orelse, sc); return;
      case "while": {
        let broke = false;
        while (truthy(ev(st.cond, sc))) {
          tick();
          try { exec(st.body, sc); } catch (e) {
            if (e instanceof BreakSignal) { broke = true; break; }
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        if (!broke) exec(st.orelse, sc);
        return;
      }
      case "for": {
        let broke = false;
        for (const item of toIter(ev(st.iter, sc))) {
          tick();
          assignTo(st.target, item, sc);
          try { exec(st.body, sc); } catch (e) {
            if (e instanceof BreakSignal) { broke = true; break; }
            if (e instanceof ContinueSignal) continue;
            throw e;
          }
        }
        if (!broke) exec(st.orelse, sc);
        return;
      }
      case "break": throw new BreakSignal();
      case "continue": throw new ContinueSignal();
      case "return": throw new ReturnSignal(st.v ? ev(st.v, sc) : null);
      case "pass": return;
      case "raise": throw new Error(st.v ? String(ev(st.v, sc)?.message ?? ev(st.v, sc)) : "raise");
      case "def": sc.set(st.name, makeFunction(st.name, st.params, st.body, sc)); return;
      case "import":
        for (const { mod, alias } of st.mods) {
          const m = MODULES[mod.split(".")[0]];
          if (m) sc.set(alias ?? mod.split(".")[0], m);
          if (/^(build123d|cadquery)/.test(mod)) langBox.lang = langBox.lang || (mod.startsWith("cadquery") ? "cadquery" : "build123d");
        }
        return;
      case "from": {
        const m = MODULES[st.mod];
        if (m) {
          if (st.names === "*") Object.entries(m).forEach(([k, v]) => sc.set(k, v));
          else for (const [nm, alias] of st.names) if (nm in m) sc.set(alias, m[nm]);
        }
        if (/^build123d/.test(st.mod)) langBox.lang = langBox.lang || "build123d";
        return;
      }
      case "with": {
        const entered = [];
        try {
          for (const item of st.items) entered.push(enterWith(ev(item.e, sc), item.as, sc));
          exec(st.body, sc);
        } finally {
          for (let i = entered.length - 1; i >= 0; i--) leaveWith(entered[i]);
        }
        return;
      }
      default: throw new Error(`unsupported statement ${st.t}`);
    }
  }

  exec(program, globals);

  // ---- the result: conventional names first, then the last solid made
  const lang = langBox.lang || "build123d";
  for (const name of ["part", "result", "model", "shape", "solid", "body", "obj"]) {
    if (!(name in globals.vars)) continue;
    const s = asShape(globals.vars[name]);
    if (s) return { shape: s, lang };
  }
  if (lastShape) return { shape: lastShape.shape, lang };
  // Forgiving: a design that ends at a SKETCH gets a thin auto-extrude, the
  // same courtesy the OpenSCAD path extends.
  for (const name of ["sketch", "face", "profile", "part", "result", ...Object.keys(globals.vars)]) {
    const pr = asProfile(globals.vars[name]);
    if (pr) return { shape: profileToSolid(pr, 1), lang };
  }
  throw new Error("No solid was produced — assign one, e.g.  part = Box(20, 20, 10) - Cylinder(5, 12), extrude(sketch, amount=5) a sketch, or build it in `with BuildPart() as part:`");
}
