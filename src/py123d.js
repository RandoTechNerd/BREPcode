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
  cube, cylinder, cone, sphere, torus, freeform,
  union, difference, intersection, translate, rotate,
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
  return new RegExp(`^\\s*\\w+\\s*=\\s*(?:${PY_OBJ})\\s*\\(`, "m").test(src)
    && new RegExp(`\\b(Pos|Rot|Align|Location|make_face|extrude)\\b|\\*\\s*(?:${PY_OBJ})\\(`).test(src);
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
    "DoubleTangentArc", "TangentArc", "IntersectingLine", "ParabolicCenterArc", "HyperbolicCenterArc", "Helix"]) {
    env[name] = () => {
      throw new Error(`${name} isn't supported — supported BuildLine objects: Line, Polyline, FilletPolyline, PolarLine, Spline, Bezier, CenterArc, EllipticalCenterArc, ThreePointArc, RadiusArc, SagittaArc, JernArc. Chain them with + and close with make_face(...)`);
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
  });
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
    });
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
    if (/\bfor\b[^\n]*\bin\b[^\n]*Locations\s*\(/.test(src)) {
      throw new Error("for-loops aren't supported — multiply the locations by the shape instead: holes += GridLocations(25, 15, 2, 2) * Circle(2.5)");
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
      throw new Error(`"${t.value}" isn't defined — supported: Box/Cylinder/Cone/Sphere/Torus/Wedge/ConvexPolyhedron/Hole/CounterBoreHole/CounterSinkHole, sketches (Rectangle, Circle, Ellipse, Polygon, RegularPolygon, RectangleRounded, Triangle, Trapezoid, Slot…), lines (Line, Polyline, arcs, Spline, Bezier) + make_face + extrude, Pos, Rot, Align, Plane.XY, cq.Workplane`);
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
        } else if (isProfile(v) && name === "vertices") {
          // fillet(sketch.vertices(), radius=…) — the marker fillet() reads
          const p = v;
          v = () => ({ __verts: p });
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
          else if (isShape(r) || r?.__wp || isProfile(r) || isWire(r)) v = v.__loc(r?.__wp ? env.__needShape(r) : r);
          else throw new Error("a location (Pos/Rot) can only multiply a shape, sketch, wire or another location");
        } else if (isLocSet(v)) {
          // GridLocations(…) * Circle(…) — one copy per location, combined
          if (isProfile(r)) v = profileOp("UNION", v.__locs.map((l) => l.__loc(r)));
          else if (isShape(r) || r?.__wp) {
            const s = r?.__wp ? env.__needShape(r) : r;
            v = union(...v.__locs.map((l) => l.__loc(s)));
          } else throw new Error("GridLocations/PolarLocations multiply a sketch or a solid");
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
      else if (isProfile(vs) && isProfile(rs)) v = profileOp(op === "+" ? "UNION" : "SUBTRACT", [vs, rs]);
      else if (isWire(vs) && isWire(rs) && op === "+") v = joinWires(vs, rs);
      else if ((isProfile(vs) && isShape(rs)) || (isShape(vs) && isProfile(rs))) {
        throw new Error("can't mix a 2D sketch with a 3D solid — extrude(sketch, amount=…) the sketch first");
      }
      else throw new Error(`${op} needs two numbers, two solids, two sketches, or two wires`);
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
      if (isProfile(vs) && isProfile(rs)) v = profileOp(op === "&" ? "INTERSECT" : "UNION", [vs, rs]);
      else if (isShape(vs) && isShape(rs)) v = op === "&" ? intersection(vs, rs) : union(vs, rs);
      else throw new Error(`${op} needs two solids or two sketches`);
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
        const rv = v?.__wp ? env.__needShape(v) : v;
        if (isProfile(cur) && isProfile(rv)) {
          v = profileOp(op === "-=" ? "SUBTRACT" : op === "&=" ? "INTERSECT" : "UNION", [cur, rv]);
        } else if (isWire(cur) && isWire(rv) && (op === "+=" || op === "|=")) {
          v = joinWires(cur, rv);
        } else if (isShape(cur)) {
          if (isProfile(rv)) throw new Error(`${name} ${op} sketch — extrude(sketch, amount=…) it first`);
          v = op === "+=" || op === "|=" ? union(cur, rv)
            : op === "-=" ? difference(cur, rv)
            : intersection(cur, rv);
        } else {
          throw new Error(`${name} ${op} … needs ${name} to already be a solid, sketch or wire`);
        }
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
  // Forgiving: a design that ends at a SKETCH gets a thin auto-extrude, the
  // same courtesy the OpenSCAD path extends — add extrude(sketch, amount=h)
  // for a real thickness.
  for (const name of ["sketch", "face", "profile", "part", "result", ...Object.keys(vars)]) {
    if (isProfile(vars[name])) {
      return { shape: profileToSolid(vars[name], 1), lang: langBox.lang || "build123d" };
    }
  }
  throw new Error("No solid was produced — assign one, e.g.  part = Box(20, 20, 10) - Cylinder(5, 12), or extrude(sketch, amount=5) a sketch");
}
