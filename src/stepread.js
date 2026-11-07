// STEP (ISO 10303-21) reader for the STEP -> code converter (src/step2code.js).
//
// The Rust kernel already reads STEP (import_step_json), but it hands every
// surface back as a NURBS: a hole comes out as a rational B-spline, and the
// converter needs to know it was a CYLINDER of radius 3 on that axis. So this
// reads the file itself and keeps the analytic types: plane, cylinder, cone,
// sphere, torus, linear extrusion, B-spline (kept as "bspline", not recognised).
// The kernel stays the judge: step2code builds what it writes and compares
// volumes against the kernel's own exact import of the same file.
//
// readStep(text) -> {
//   unit,                       // mm per file unit (everything below is in mm)
//   solids: [{ id, name, color, matrix, faces }],   // placed, one per body
//   parts:  [{ key, name, color, solids: [solid ids] }], // distinct products
// }
// face: { id, surface, sense, loops: [{ outer, edges: [edge] }], color }
// surface: { type, o, z, x, r, R, angle, dir }   (unit vectors, mm)
// edge: { a, b, curve: { type: "line" | "circle" | "ellipse" | "other", o, z, x, r, pts } }
//   a/b are the edge's start/end points in the loop's direction; `pts` are
//   samples along it (a curved edge), start to end.

// ---------------------------------------------------------------- Part 21

// Statements of the DATA section, as { id -> { type, args } }. A complex
// entity ( A(..) B(..) ) is { type: "(complex)", parts: { A: args, B: args } }.
export function parsePart21(text) {
  const start = text.search(/\bDATA\s*;/);
  if (start < 0) throw new Error("not a STEP file: no DATA section");
  const ents = new Map();
  let i = text.indexOf(";", start) + 1;
  const n = text.length;
  while (i < n) {
    // one statement, up to a ';' outside strings and comments
    let j = i, inStr = false;
    let stmt = "";
    let segStart = i;
    while (j < n) {
      const c = text[j];
      if (inStr) {
        if (c === "'") { if (text[j + 1] === "'") { j += 2; continue; } inStr = false; }
        j++;
        continue;
      }
      if (c === "'") { inStr = true; j++; continue; }
      if (c === "/" && text[j + 1] === "*") {
        stmt += text.slice(segStart, j);
        const e = text.indexOf("*/", j + 2);
        j = e < 0 ? n : e + 2;
        segStart = j;
        continue;
      }
      if (c === ";") break;
      j++;
    }
    stmt += text.slice(segStart, j);
    i = j + 1;
    stmt = stmt.trim();
    if (!stmt) continue;
    if (/^ENDSEC\b/.test(stmt)) break;
    const m = /^#(\d+)\s*=\s*/.exec(stmt);
    if (!m) continue;
    const body = stmt.slice(m[0].length);
    try { ents.set(+m[1], parseEntity(body)); } catch { /* a malformed line: skip it */ }
  }
  return ents;
}

function parseEntity(body) {
  const p = { s: body, i: 0 };
  ws(p);
  if (p.s[p.i] === "(") {
    p.i++;
    const parts = {};
    for (;;) {
      ws(p);
      if (p.s[p.i] === ")") { p.i++; break; }
      const name = word(p);
      ws(p);
      parts[name] = p.s[p.i] === "(" ? list(p) : [];
    }
    return { type: "(complex)", parts };
  }
  const type = word(p);
  ws(p);
  return { type, args: list(p) };
}

function ws(p) { while (p.i < p.s.length && /\s/.test(p.s[p.i])) p.i++; }
function word(p) {
  const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(p.s.slice(p.i, p.i + 200));
  if (!m) throw new Error("expected a name at " + p.s.slice(p.i, p.i + 20));
  p.i += m[0].length;
  return m[0].toUpperCase();
}
function list(p) {
  // at '('
  p.i++;
  const out = [];
  ws(p);
  if (p.s[p.i] === ")") { p.i++; return out; }
  for (;;) {
    ws(p);
    out.push(value(p));
    ws(p);
    const c = p.s[p.i];
    if (c === ",") { p.i++; continue; }
    if (c === ")") { p.i++; return out; }
    throw new Error("bad list at " + p.s.slice(p.i, p.i + 20));
  }
}
function value(p) {
  const c = p.s[p.i];
  if (c === "(") return list(p);
  if (c === "#") {
    const m = /^#(\d+)/.exec(p.s.slice(p.i, p.i + 20));
    p.i += m[0].length;
    return { ref: +m[1] };
  }
  if (c === "'") {
    let j = p.i + 1, out = "";
    for (;;) {
      const k = p.s.indexOf("'", j);
      if (k < 0) { out += p.s.slice(j); p.i = p.s.length; return decodeStr(out); }
      out += p.s.slice(j, k);
      if (p.s[k + 1] === "'") { out += "'"; j = k + 2; continue; }
      p.i = k + 1;
      return decodeStr(out);
    }
  }
  if (c === ".") {
    const k = p.s.indexOf(".", p.i + 1);
    const e = p.s.slice(p.i + 1, k).toUpperCase();
    p.i = k + 1;
    return e === "T" ? true : e === "F" ? false : { enum: e };
  }
  if (c === "$") { p.i++; return null; }
  if (c === "*") { p.i++; return null; }
  if (c === '"') { const k = p.s.indexOf('"', p.i + 1); p.i = k + 1; return null; } // binary
  if (/[-+0-9.]/.test(c)) {
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(p.s.slice(p.i, p.i + 40));
    p.i += m[0].length;
    return +m[0];
  }
  // a typed value: LENGTH_MEASURE(2.5)
  const name = word(p);
  ws(p);
  const args = p.s[p.i] === "(" ? list(p) : [];
  return { typed: name, args };
}
// \X2\00E9\X0\ and friends: enough to keep a part name readable
function decodeStr(s) {
  return s
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (_, h) => h.match(/.{4}/g).map((q) => String.fromCharCode(parseInt(q, 16))).join(""))
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, ch) => String.fromCharCode(ch.charCodeAt(0) + 128));
}

// ---------------------------------------------------------------- vectors

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// 4x4 as a flat column-major-free row list: { R: [[3x3]], t: [3] }
const IDENT = { R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] };
function apply(T, p) {
  return [
    T.R[0][0] * p[0] + T.R[0][1] * p[1] + T.R[0][2] * p[2] + T.t[0],
    T.R[1][0] * p[0] + T.R[1][1] * p[1] + T.R[1][2] * p[2] + T.t[1],
    T.R[2][0] * p[0] + T.R[2][1] * p[1] + T.R[2][2] * p[2] + T.t[2],
  ];
}
function applyDir(T, d) {
  return [
    T.R[0][0] * d[0] + T.R[0][1] * d[1] + T.R[0][2] * d[2],
    T.R[1][0] * d[0] + T.R[1][1] * d[1] + T.R[1][2] * d[2],
    T.R[2][0] * d[0] + T.R[2][1] * d[1] + T.R[2][2] * d[2],
  ];
}
function compose(A, B) { // A after B
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => A.R[i][0] * B.R[0][j] + A.R[i][1] * B.R[1][j] + A.R[i][2] * B.R[2][j]));
  return { R, t: apply(A, B.t) };
}
function invert(T) {
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => T.R[j][i]));
  const t = mul([0, 1, 2].map((i) => R[i][0] * T.t[0] + R[i][1] * T.t[1] + R[i][2] * T.t[2]), -1);
  return { R, t };
}
const frameT = (f) => ({ R: [[f.x[0], f.y[0], f.z[0]], [f.x[1], f.y[1], f.z[1]], [f.x[2], f.y[2], f.z[2]]], t: f.o });
export const xf = { apply, applyDir, compose, invert, IDENT, frameT };
export const vec = { sub, add, mul, dot, cross, len, unit };

// ---------------------------------------------------------------- reader

export function readStep(text) {
  const E = parsePart21(text);
  const get = (r) => (r && r.ref != null ? E.get(r.ref) : null);
  const typeOf = (r) => get(r)?.type;
  const scale = lengthUnit(E);

  const point = (r) => { const e = get(r); return e?.args?.[1] ? e.args[1].slice(0, 3).map((v, k) => (v ?? 0) * scale).concat([0, 0, 0].slice(e.args[1].length)) : [0, 0, 0]; };
  const direction = (r) => { const e = get(r); return e?.args?.[1] ? unit([e.args[1][0] ?? 0, e.args[1][1] ?? 0, e.args[1][2] ?? 0]) : null; };
  const placement = (r) => {
    const e = get(r);
    const o = point(e?.args?.[1]);
    let z = direction(e?.args?.[2]) || [0, 0, 1];
    let x = direction(e?.args?.[3]);
    if (!x || Math.abs(dot(x, z)) > 1 - 1e-9) x = Math.abs(z[2]) < 0.9 ? unit(cross([0, 0, 1], z)) : unit(cross(z, [1, 0, 0]));
    x = unit(sub(x, mul(z, dot(x, z))));
    return { o, z, x, y: cross(z, x) };
  };

  // ---- curves
  const curveCache = new Map();
  function curve(r) {
    if (curveCache.has(r.ref)) return curveCache.get(r.ref);
    const e = get(r);
    let c = { type: "other" };
    if (e?.type === "LINE") {
      const o = point(e.args[1]);
      const v = get(e.args[2]);
      c = { type: "line", o, dir: direction(v?.args?.[1]) || [1, 0, 0] };
    } else if (e?.type === "CIRCLE") {
      c = { type: "circle", ...placement(e.args[1]), r: e.args[2] * scale };
    } else if (e?.type === "ELLIPSE") {
      c = { type: "ellipse", ...placement(e.args[1]), r: e.args[2] * scale, r2: e.args[3] * scale };
    } else if (e?.type === "SURFACE_CURVE" || e?.type === "SEAM_CURVE" || e?.type === "INTERSECTION_CURVE") {
      c = curve(e.args[1]);
    } else if (e?.type === "TRIMMED_CURVE") {
      c = curve(e.args[1]);
    } else if (e?.type === "B_SPLINE_CURVE_WITH_KNOTS" || e?.type === "(complex)" || e?.type === "POLYLINE") {
      c = { type: "other", ent: e };
    }
    curveCache.set(r.ref, c);
    return c;
  }

  // ---- surfaces
  function surface(r) {
    const e = get(r);
    switch (e?.type) {
      case "PLANE": return { type: "plane", ...placement(e.args[1]) };
      case "CYLINDRICAL_SURFACE": return { type: "cylinder", ...placement(e.args[1]), r: e.args[2] * scale };
      case "CONICAL_SURFACE": return { type: "cone", ...placement(e.args[1]), r: e.args[2] * scale, angle: e.args[3] * angleUnit(E) };
      case "SPHERICAL_SURFACE": return { type: "sphere", ...placement(e.args[1]), r: e.args[2] * scale };
      case "TOROIDAL_SURFACE": return { type: "torus", ...placement(e.args[1]), R: e.args[2] * scale, r: e.args[3] * scale };
      case "SURFACE_OF_LINEAR_EXTRUSION": {
        const v = get(e.args[2]);
        return { type: "extrusion", dir: direction(v?.args?.[1]) || [0, 0, 1], profile: curve(e.args[1]) };
      }
      case "SURFACE_OF_REVOLUTION": {
        const ax = get(e.args[2]);
        return { type: "revolution", o: point(ax?.args?.[1]), z: direction(ax?.args?.[2]) || [0, 0, 1] };
      }
      default: return { type: e?.type === "(complex)" || /B_SPLINE/.test(e?.type || "") ? "bspline" : "other" };
    }
  }

  // ---- B-spline curve sampling (for edges that are not lines or circles)
  function bsplinePoints(e, n = 16) {
    let deg, cps, mults, knots, weights = null;
    if (e.type === "B_SPLINE_CURVE_WITH_KNOTS") {
      deg = e.args[1]; cps = e.args[2]; mults = e.args[6]; knots = e.args[7];
    } else if (e.type === "(complex)") {
      const b = e.parts.B_SPLINE_CURVE, k = e.parts.B_SPLINE_CURVE_WITH_KNOTS, w = e.parts.RATIONAL_B_SPLINE_CURVE;
      if (!b || !k) return null;
      deg = b[0]; cps = b[1]; mults = k[0]; knots = k[1]; weights = w?.[0] ?? null;
    } else if (e.type === "POLYLINE") {
      return e.args[1].map(point);
    } else return null;
    const P = cps.map(point);
    const U = [];
    mults.forEach((m, i) => { for (let k = 0; k < m; k++) U.push(knots[i]); });
    const W = weights || P.map(() => 1);
    const out = [];
    const u0 = U[deg], u1 = U[U.length - deg - 1];
    for (let s = 0; s <= n; s++) out.push(deBoor(deg, U, P, W, u0 + (u1 - u0) * (s / n)));
    return out;
  }

  // ---- styles: colour per solid and per face
  const colorOf = new Map();
  for (const [, e] of E) {
    if (e.type !== "STYLED_ITEM" && e.type !== "OVER_RIDING_STYLED_ITEM") continue;
    const item = e.args[2]?.ref;
    const rgb = findColour(E, e.args[1]);
    if (item != null && rgb) colorOf.set(item, rgb);
  }

  // ---- faces of one MANIFOLD_SOLID_BREP, placed by T
  function solidFaces(brepRef, T) {
    const brep = get(brepRef);
    const shells = [];
    if (brep.type === "MANIFOLD_SOLID_BREP") shells.push(brep.args[1]);
    else if (brep.type === "BREP_WITH_VOIDS") { shells.push(brep.args[1]); shells.push(...(brep.args[2] || [])); }
    const faces = [];
    for (const sh of shells) {
      const shell = get(sh);
      for (const fr of shell?.args?.[1] || []) {
        const f = get(fr);
        if (!f || (f.type !== "ADVANCED_FACE" && f.type !== "FACE_SURFACE")) continue;
        const surf = placeSurface(surface(f.args[2]), T);
        const sense = f.args[3] !== false;
        const loops = [];
        for (const br of f.args[1] || []) {
          const b = get(br);
          const loop = get(b?.args?.[1]);
          const bsense = b?.args?.[2] !== false;
          const edges = [];
          if (loop?.type === "EDGE_LOOP") {
            for (const oer of loop.args[1] || []) {
              const oe = get(oer);           // ORIENTED_EDGE('', *, *, #edge_curve, .T.)
              const ec = get(oe?.args?.[3]); // EDGE_CURVE('', v1, v2, curve, same_sense)
              if (!ec) continue;
              const v1 = point(get(ec.args[1])?.args?.[1]), v2 = point(get(ec.args[2])?.args?.[1]);
              const fwd = oe.args[4] !== false;
              const c = curve(ec.args[3]);
              const same = ec.args[4] !== false;
              let pts = null;
              if (c.type === "other" && c.ent) {
                pts = bsplinePoints(c.ent);
                if (pts && !same) pts = pts.reverse();
              }
              let a = v1, b2 = v2;
              let cc = c;
              // a circle edge runs counter-clockwise about its axis when the
              // edge curve agrees with the circle; flip the axis otherwise
              if (c.type === "circle" || c.type === "ellipse") cc = same ? c : { ...c, z: mul(c.z, -1), y: mul(c.y, -1) };
              if (!fwd) { [a, b2] = [b2, a]; if (pts) pts = [...pts].reverse(); if (cc.type === "circle" || cc.type === "ellipse") cc = { ...cc, z: mul(cc.z, -1), y: mul(cc.y, -1) }; }
              edges.push({
                id: oe.args[3].ref, a: apply(T, a), b: apply(T, b2),
                curve: placeCurve(cc, T), pts: pts ? pts.map((q) => apply(T, q)) : null,
              });
            }
          } else if (loop?.type === "VERTEX_LOOP") {
            continue;     // a cone apex / sphere pole: no edge
          } else if (loop?.type === "POLY_LOOP") {
            const P = (loop.args[1] || []).map(point).map((q) => apply(T, q));
            P.forEach((q, k) => edges.push({ id: null, a: q, b: P[(k + 1) % P.length], curve: { type: "line", o: q, dir: unit(sub(P[(k + 1) % P.length], q)) }, pts: null }));
          }
          if (!bsense) {
            edges.reverse();
            for (const ed of edges) {
              [ed.a, ed.b] = [ed.b, ed.a];
              if (ed.pts) ed.pts = [...ed.pts].reverse();
              if (ed.curve.type === "circle" || ed.curve.type === "ellipse") ed.curve = { ...ed.curve, z: mul(ed.curve.z, -1), y: mul(ed.curve.y, -1) };
            }
          }
          loops.push({ outer: b?.type === "FACE_OUTER_BOUND", edges });
        }
        if (loops.length && !loops.some((l) => l.outer)) loops[0].outer = true;
        faces.push({ id: fr.ref, surface: surf, sense, loops, color: colorOf.get(fr.ref) ?? null });
      }
    }
    return faces;
  }

  // ---- products, representations and placements
  //
  // The product tree, the way STEP processors read it: a PRODUCT_DEFINITION
  // (one part or sub-assembly) has shape representations (SHAPE_DEFINITION_
  // REPRESENTATION), and each NEXT_ASSEMBLY_USAGE_OCCURRENCE places a child
  // product in a parent through a CONTEXT_DEPENDENT_SHAPE_REPRESENTATION,
  // whose transformation lays one frame onto another. Whichever of the two
  // frames lives in the CHILD's representation is the child's own frame.
  const pdName = new Map();          // PRODUCT_DEFINITION id -> name
  for (const [id, e] of E) {
    if (e.type !== "PRODUCT_DEFINITION") continue;
    const pdf = get(e.args[2]);
    const prod = get(pdf?.args?.[2]);
    pdName.set(id, (prod?.args?.[1] || prod?.args?.[0] || "").trim() || `part${id}`);
  }
  const pdRep = new Map();           // PRODUCT_DEFINITION -> [rep]
  for (const [, e] of E) {
    if (e.type !== "SHAPE_DEFINITION_REPRESENTATION") continue;
    const pds = get(e.args[0]);
    const pd = pds?.args?.[2]?.ref;
    if (pd != null && E.get(pd)?.type === "PRODUCT_DEFINITION" && e.args[1]?.ref != null) push(pdRep, pd, e.args[1].ref);
  }
  // the same geometry in another representation (no transformation)
  const repLinks = new Map();
  for (const [, e] of E) {
    if (e.type !== "SHAPE_REPRESENTATION_RELATIONSHIP" && e.type !== "REPRESENTATION_RELATIONSHIP") continue;
    const a = e.args[2]?.ref, b = e.args[3]?.ref;
    if (a != null && b != null) { push(repLinks, a, b); push(repLinks, b, a); }
  }
  const repsOf = (pd) => {
    const out = new Set(), stack = [...(pdRep.get(pd) || [])];
    while (stack.length) { const r = stack.pop(); if (out.has(r)) continue; out.add(r); stack.push(...(repLinks.get(r) || [])); }
    return out;
  };
  const repHas = (rep, item) => !!E.get(rep)?.args?.[1]?.some?.((x) => x?.ref === item);

  // assembly links: parent PD -> [{ child PD, T }]
  const kids = new Map();
  const isChildPd = new Set();
  for (const [, e] of E) {
    if (e.type !== "CONTEXT_DEPENDENT_SHAPE_REPRESENTATION") continue;
    const rel = get(e.args[0]);
    const pds = get(e.args[1]);
    const nauo = get(pds?.args?.[2]);
    if (rel?.type !== "(complex)" || nauo?.type !== "NEXT_ASSEMBLY_USAGE_OCCURRENCE") continue;
    const parentPd = nauo.args[3]?.ref, childPd = nauo.args[4]?.ref;
    const idt = get(rel.parts.REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION?.[0]);
    let T = IDENT;
    if (idt?.type === "ITEM_DEFINED_TRANSFORMATION") {
      const i1 = idt.args[2]?.ref, i2 = idt.args[3]?.ref;
      const childReps = repsOf(childPd);
      const in1 = [...childReps].some((r) => repHas(r, i1));
      const in2 = [...childReps].some((r) => repHas(r, i2));
      const [a, b] = in2 && !in1 ? [i2, i1] : [i1, i2];
      T = compose(frameT(placement({ ref: b })), invert(frameT(placement({ ref: a }))));
    }
    push(kids, parentPd, { child: childPd, T, name: (nauo.args[1] || nauo.args[0] || "").trim() });
    isChildPd.add(childPd);
  }

  const solids = [];
  const parts = new Map();
  const breps = (rep) => (E.get(rep)?.args?.[1] || []).filter((it) => { const t = typeOf(it); return t === "MANIFOLD_SOLID_BREP" || t === "BREP_WITH_VOIDS"; }).map((it) => it.ref);
  // MAPPED_ITEM inside a representation: another rep placed by two frames
  const mapped = (rep) => (E.get(rep)?.args?.[1] || []).map(get).filter((m) => m?.type === "MAPPED_ITEM").map((m) => {
    const rm = get(m.args[1]);
    return { rep: rm?.args?.[1]?.ref, T: compose(frameT(placement(m.args[2])), invert(frameT(placement(rm?.args?.[0])))) };
  });
  const reached = new Set();
  function addBrep(b, T, key, name) {
    reached.add(b);
    const faces = solidFaces({ ref: b }, T);
    const color = colorOf.get(b) ?? majority(faces.map((f) => f.color));
    if (!parts.has(key)) parts.set(key, { key, name, color, solids: [] });
    const s = { id: solids.length, part: key, name, brep: b, color, matrix: T, faces };
    solids.push(s);
    parts.get(key).solids.push(s.id);
  }
  function walkRep(rep, T, key, name, depth) {
    if (depth > 32) return;
    for (const b of breps(rep)) addBrep(b, T, key, name);
    for (const m of mapped(rep)) if (m.rep != null) walkRep(m.rep, compose(T, m.T), key, name, depth + 1);
  }
  function walkPd(pd, T, depth) {
    if (depth > 32) return;
    const name = pdName.get(pd);
    for (const r of repsOf(pd)) walkRep(r, T, pd, name, depth);
    for (const k of kids.get(pd) || []) walkPd(k.child, compose(T, k.T), depth + 1);
  }
  for (const pd of pdName.keys()) if (!isChildPd.has(pd)) walkPd(pd, IDENT, 0);
  // breps no product reached (a file with no product structure)
  for (const [id, e] of E) {
    if ((e.type === "MANIFOLD_SOLID_BREP" || e.type === "BREP_WITH_VOIDS") && !reached.has(id)) addBrep(id, IDENT, `brep${id}`, (e.args[0] || "").trim() || "part");
  }
  return { unit: scale, solids, parts: [...parts.values()] };
}

function push(m, k, v) { if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
function majority(list) {
  const c = new Map();
  for (const x of list) if (x) c.set(x, (c.get(x) || 0) + 1);
  let best = null, n = 0;
  for (const [k, v] of c) if (v > n) { best = k; n = v; }
  return best;
}

function placeSurface(s, T) {
  const o = { ...s };
  if (s.o) o.o = apply(T, s.o);
  for (const k of ["z", "x", "y", "dir"]) if (s[k]) o[k] = applyDir(T, s[k]);
  if (s.profile) o.profile = placeCurve(s.profile, T);
  return o;
}
function placeCurve(c, T) {
  const o = { ...c };
  if (c.o) o.o = apply(T, c.o);
  for (const k of ["z", "x", "y", "dir"]) if (c[k]) o[k] = applyDir(T, c[k]);
  return o;
}

function deBoor(p, U, P, W, u) {
  const n = P.length - 1;
  let k = p;
  for (let i = p; i < U.length - p - 1; i++) if (u >= U[i] && u < U[i + 1]) k = i;
  if (u >= U[n + 1]) k = n;
  const d = [];
  for (let j = 0; j <= p; j++) {
    const q = P[k - p + j] || P[P.length - 1], w = W[k - p + j] ?? 1;
    d.push([q[0] * w, q[1] * w, q[2] * w, w]);
  }
  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const den = U[i + p - r + 1] - U[i];
      const a = den ? (u - U[i]) / den : 0;
      for (let c = 0; c < 4; c++) d[j][c] = (1 - a) * d[j - 1][c] + a * d[j][c];
    }
  }
  const h = d[p][3] || 1;
  return [d[p][0] / h, d[p][1] / h, d[p][2] / h];
}

// mm per file length unit
function lengthUnit(E) {
  const PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
  // the unit the geometric context names, if there is one
  for (const [, e] of E) {
    if (e.type !== "(complex)" || !e.parts.GLOBAL_UNIT_ASSIGNED_CONTEXT) continue;
    for (const u of e.parts.GLOBAL_UNIT_ASSIGNED_CONTEXT[0] || []) {
      const v = unitValue(E, E.get(u?.ref), PREFIX);
      if (v != null) return v;
    }
  }
  for (const [, e] of E) {
    const v = unitValue(E, e, PREFIX);
    if (v != null) return v;
  }
  return 1;
}
function unitValue(E, e, PREFIX) {
  if (e?.type !== "(complex)" || !e.parts.LENGTH_UNIT) return null;
  if (e.parts.SI_UNIT) {
    const [pre, name] = e.parts.SI_UNIT;
    if (name?.enum !== "METRE") return null;
    return (pre?.enum ? PREFIX[pre.enum] ?? 1 : 1) * 1000;
  }
  if (e.parts.CONVERSION_BASED_UNIT) {
    const m = E.get(e.parts.CONVERSION_BASED_UNIT[1]?.ref);   // LENGTH_MEASURE_WITH_UNIT
    const k = m?.args?.[0]?.args?.[0] ?? m?.args?.[0];
    const base = unitValue(E, E.get(m?.args?.[1]?.ref), PREFIX);
    if (Number.isFinite(k) && base != null) return k * base;
    const nm = String(e.parts.CONVERSION_BASED_UNIT[0] || "").toUpperCase();
    if (/INCH/.test(nm)) return 25.4;
    if (/FOOT|FEET/.test(nm)) return 304.8;
  }
  return null;
}
function angleUnit(E) {
  for (const [, e] of E) {
    if (e.type !== "(complex)" || !e.parts.PLANE_ANGLE_UNIT) continue;
    if (e.parts.SI_UNIT) return 1;
    if (e.parts.CONVERSION_BASED_UNIT) {
      const m = E.get(e.parts.CONVERSION_BASED_UNIT[1]?.ref);
      const k = m?.args?.[0]?.args?.[0] ?? m?.args?.[0];
      if (Number.isFinite(k)) return k;
      return Math.PI / 180;
    }
  }
  return 1;
}

function findColour(E, styles, depth = 0) {
  if (depth > 8 || styles == null) return null;
  const list = Array.isArray(styles) ? styles : [styles];
  for (const s of list) {
    if (Array.isArray(s)) { const c = findColour(E, s, depth + 1); if (c) return c; continue; }
    const e = s?.ref != null ? E.get(s.ref) : null;
    if (!e) continue;
    if (e.type === "COLOUR_RGB") {
      const h = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0");
      return `#${h(e.args[1])}${h(e.args[2])}${h(e.args[3])}`;
    }
    if (e.type === "DRAUGHTING_PRE_DEFINED_COLOUR") {
      const NAMED = { red: "#ff0000", green: "#00ff00", blue: "#0000ff", yellow: "#ffff00", magenta: "#ff00ff", cyan: "#00ffff", black: "#000000", white: "#ffffff" };
      const c = NAMED[String(e.args[0]).toLowerCase()];
      if (c) return c;
      continue;
    }
    for (const a of e.args || []) {
      if (a?.ref != null || Array.isArray(a)) { const c = findColour(E, a, depth + 1); if (c) return c; }
    }
  }
  return null;
}
