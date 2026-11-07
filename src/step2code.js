// STEP -> BREPcode: rebuild a STEP file's solids as editable code.
//
// A STEP file holds the finished shape, not the steps that made it, so each
// body is matched against shapes BREPcode can write exactly:
//
//   revolve   every face turns about one axis (planes across it, coaxial
//             cylinders, cones, tori, spheres): the half-section profile,
//             lines and true arcs, revolved
//   extrude   every face is a cap across one direction or a wall along it
//             (planes, cylinders): the part is cut into layers between cap
//             heights, each layer's cross-section traced exactly (lines and
//             arcs) and extruded; round holes that run through several
//             layers become one cylinder cut, with their diameter as a dial
//
// Anything else (B-spline surfaces, fillets along a layer edge, cross holes)
// is reported, and the caller keeps that body as an imported exact solid.
// None of this is trusted on its own: step2code-check.js builds every body's
// code and compares it with the kernel's own import of the same file, and a
// body whose difference volume is not essentially zero is kept imported.
//
// convertSolid(solid) -> { kind, expr, dials, why }   (one body, world placed)
// toCode(read, results, { title }) -> source text for the whole file

import { Matrix4, Euler } from "three";
import { vec, xf } from "./stepread.js";
import * as dsl from "./dsl.js";

const { sub, add, mul, dot, cross, len, unit } = vec;
const TAU = 2 * Math.PI;

// ---------------------------------------------------------------- samples

// points along an edge, start to end
export function edgePoints(e, n = 24) {
  const c = e.curve;
  if (c.type === "line") return [e.a, e.b];
  if (c.type === "circle" || c.type === "ellipse") {
    const r2 = c.type === "ellipse" ? c.r2 : c.r;
    const ang = (p) => { const q = sub(p, c.o); return Math.atan2(dot(q, c.y) / r2, dot(q, c.x) / c.r); };
    const t0 = ang(e.a);
    let sw = ((ang(e.b) - t0) % TAU + TAU) % TAU;
    if (sw < 1e-9) sw = TAU;
    const k = Math.max(2, Math.ceil(n * sw / TAU));
    const out = [];
    for (let i = 0; i <= k; i++) {
      const t = t0 + sw * (i / k);
      out.push(add(c.o, add(mul(c.x, c.r * Math.cos(t)), mul(c.y, r2 * Math.sin(t)))));
    }
    out[0] = e.a; out[out.length - 1] = e.b;
    return out;
  }
  if (e.pts?.length) return [e.a, ...e.pts.slice(1, -1), e.b];
  return [e.a, e.b];
}

function boundsOf(solid) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const f of solid.faces) for (const l of f.loops) for (const e of l.edges) for (const p of edgePoints(e, 8)) {
    for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  }
  return { lo, hi, size: len(sub(hi, lo)) || 1 };
}

// a direction with a fixed sign: +Z rather than -Z, so the same axis read off
// two faces compares equal
function canon(d) {
  const k = [0, 1, 2].reduce((m, i) => (Math.abs(d[i]) > Math.abs(d[m]) ? i : m), 0);
  return d[k] < 0 ? mul(d, -1) : d;
}
const parallel = (a, b, tol = 1e-7) => Math.abs(Math.abs(dot(a, b)) - 1) < tol;
const perpendicular = (a, b, tol = 1e-7) => Math.abs(dot(a, b)) < tol;

// the in-plane x for a direction: world axes stay world axes
function frameFor(d) {
  const ax = [0, 1, 2].findIndex((k) => Math.abs(Math.abs(d[k]) - 1) < 1e-9);
  const x = ax === 2 ? [1, 0, 0] : ax === 0 ? [0, 1, 0] : ax === 1 ? [0, 0, 1] : unit(Math.abs(d[2]) < 0.9 ? cross([0, 0, 1], d) : cross(d, [1, 0, 0]));
  const y = cross(d, x);
  return { d, x, y };
}

// ---------------------------------------------------------------- numbers

// A size as it was drawn: 15.9999999999998 is 16. One that really is not a
// round number (an arc's end where it meets a line: 4 + sqrt(1.25)) keeps 7
// decimals, because arcTo() wants its two ends on one circle to a millionth
// and four decimals put them 5e-5 apart.
export function num(v) {
  let r = Math.round(v * 1e4) / 1e4;
  if (Math.abs(v - r) > 1e-7) r = Math.round(v * 1e7) / 1e7;
  if (Object.is(r, -0) || Math.abs(r) < 1e-9) r = 0;
  return String(r);
}
const pt2 = (p) => `[${num(p[0])}, ${num(p[1])}]`;
const pt3 = (p) => `[${num(p[0])}, ${num(p[1])}, ${num(p[2])}]`;

// ---------------------------------------------------------------- 2D loops

// segments: { t: "line", p, q } | { t: "arc", c, r, a0, a1 } (a1 > a0, CCW)
//         | { t: "circle", c, r }
const segStart = (s) => (s.t === "line" ? s.p : [s.c[0] + s.r * Math.cos(s.a0), s.c[1] + s.r * Math.sin(s.a0)]);
const segEnd = (s) => (s.t === "line" ? s.q : [s.c[0] + s.r * Math.cos(s.a1), s.c[1] + s.r * Math.sin(s.a1)]);
const near2 = (a, b, tol) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol;

// join segments end to end into closed loops; each loop item remembers
// whether it runs reversed. null when the pieces do not close up.
function chainLoops(segs, tol) {
  const loops = [];
  const used = new Array(segs.length).fill(false);
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    if (segs[i].t === "circle") { loops.push([{ s: segs[i], rev: false }]); continue; }
    const loop = [{ s: segs[i], rev: false }];
    const start = segStart(segs[i]);
    let end = segEnd(segs[i]);
    let guard = 0;
    while (!near2(end, start, tol) && guard++ < segs.length + 2) {
      let found = -1, rev = false;
      for (let j = 0; j < segs.length; j++) {
        if (used[j] || segs[j].t === "circle") continue;
        if (near2(segStart(segs[j]), end, tol)) { found = j; rev = false; break; }
        if (near2(segEnd(segs[j]), end, tol)) { found = j; rev = true; break; }
      }
      if (found < 0) return null;
      used[found] = true;
      loop.push({ s: segs[found], rev });
      end = rev ? segStart(segs[found]) : segEnd(segs[found]);
    }
    if (!near2(end, start, tol)) return null;
    loops.push(loop);
  }
  return loops;
}

// a loop that is all arcs of one circle (a hole the file split at its seam,
// or into halves) is that circle
function circleLoops(loops, tol) {
  return loops.map((l) => {
    if (l.length === 1 && l[0].s.t === "circle") return l;
    const s0 = l[0].s;
    if (s0.t !== "arc" || !l.every(({ s }) => s.t === "arc" && near2(s.c, s0.c, tol * 10) && Math.abs(s.r - s0.r) < tol * 10)) return l;
    const sweep = l.reduce((n, { s }) => n + (s.a1 - s.a0), 0);
    return Math.abs(sweep - TAU) < 1e-6 ? [{ s: { t: "circle", c: s0.c, r: s0.r }, rev: false }] : l;
  });
}

function loopPolygon(loop, n = 32) {
  const out = [];
  for (const { s, rev } of loop) {
    if (s.t === "line") { out.push(rev ? s.q : s.p); continue; }
    const a0 = s.t === "circle" ? 0 : s.a0, a1 = s.t === "circle" ? TAU : s.a1;
    const k = Math.max(2, Math.ceil(n * (a1 - a0) / TAU));
    for (let i = 0; i < k; i++) {
      const t = rev ? a1 - (a1 - a0) * (i / k) : a0 + (a1 - a0) * (i / k);
      out.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]);
    }
  }
  return out;
}
function area2(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
}
function inside2(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
// a point just inside the loop's first piece, for nesting tests
function probePoint(loop) {
  const poly = loopPolygon(loop, 64);
  const a = poly[0], b = poly[1 % poly.length];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// loops -> regions: [{ outer, holes }], by how many other loops hold each one
function nestLoops(loops) {
  const polys = loops.map((l) => loopPolygon(l, 64));
  const depth = loops.map((l, i) => {
    const p = probePoint(l);
    return polys.reduce((n, q, j) => n + (j !== i && inside2(p, q) ? 1 : 0), 0);
  });
  const regions = [];
  loops.forEach((l, i) => { if (depth[i] % 2 === 0) regions.push({ outer: l, poly: polys[i], depth: depth[i], holes: [] }); });
  loops.forEach((l, i) => {
    if (depth[i] % 2 === 0) return;
    const p = probePoint(l);
    // the outer one level up that holds it
    const owner = regions.filter((r) => r.depth === depth[i] - 1 && inside2(p, r.poly))
      .sort((a, b) => Math.abs(area2(a.poly)) - Math.abs(area2(b.poly)))[0];
    if (owner) owner.holes.push(l);
  });
  return regions;
}

// a loop written as a 2D profile: circle2d, polygon, or path2d with arcTo
// circleName(circle) -> a diameter dial's name, for a round hole that has one
function loopCode(loop, ccw, circleName = null) {
  if (loop.length === 1 && loop[0].s.t === "circle") {
    const s = loop[0].s;
    const d = circleName?.(s);
    return { code: d ? `circle2d({ d: ${d}, center: ${pt2(s.c)} })` : `circle2d({ r: ${num(s.r)}, center: ${pt2(s.c)} })`, circle: s };
  }
  // run it the way asked (outer CCW, holes either: region2d orders them)
  const poly = loopPolygon(loop, 64);
  let items = loop;
  if ((area2(poly) > 0) !== ccw) items = [...loop].reverse().map(({ s, rev }) => ({ s, rev: !rev }));
  const first = items[0];
  const start = first.rev ? segEnd(first.s) : segStart(first.s);
  const parts = [pt2(start)];
  const allLines = items.every(({ s }) => s.t === "line");
  for (let i = 0; i < items.length; i++) {
    const { s, rev } = items[i];
    const end = rev ? segStart(s) : segEnd(s);
    const last = i === items.length - 1;
    if (s.t === "line") { if (!last) parts.push(pt2(end)); continue; }
    parts.push(`arcTo(${pt2(end)}, { center: ${pt2(s.c)}${rev ? ", cw: true" : ""} })`);
  }
  if (allLines) return { code: `polygon([${parts.join(", ")}])` };
  return { code: `path2d(${parts.join(", ")})` };
}

// ---------------------------------------------------------------- revolve

function axisOf(f) {
  const s = f.surface;
  if (s.type === "cylinder" || s.type === "cone" || s.type === "torus") return { o: s.o, a: canon(s.z) };
  return null;
}
function onLine(p, L, tol) {
  const q = sub(p, L.o);
  return len(sub(q, mul(L.a, dot(q, L.a)))) < tol;
}

export function tryRevolve(solid, B = boundsOf(solid)) {
  const tol = Math.max(1e-6, B.size * 1e-7);
  const curved = solid.faces.filter((f) => f.surface.type !== "plane");
  if (!curved.length) return { why: "no curved faces to turn about" };
  const bad = solid.faces.find((f) => !["plane", "cylinder", "cone", "torus", "sphere"].includes(f.surface.type));
  if (bad) return { why: `a ${bad.surface.type} face is not part of a turned shape` };
  const first = curved.map(axisOf).find(Boolean);
  if (!first) return { why: "only spheres: no axis" };
  // the axis through the point nearest the world origin, for tidy numbers
  const L = { a: first.a, o: sub(first.o, mul(first.a, dot(first.o, first.a))) };
  for (const f of solid.faces) {
    const s = f.surface;
    if (s.type === "plane") { if (!parallel(s.z, L.a)) return { why: "a flat face is not square to the axis" }; continue; }
    if (s.type === "sphere") { if (!onLine(s.o, L, tol)) return { why: "a sphere is off the axis" }; continue; }
    if (!parallel(s.z, L.a) || !onLine(s.o, L, tol)) return { why: "two round faces turn about different axes" };
  }
  const fr = frameFor(L.a);
  const H = (p) => dot(sub(p, L.o), L.a);
  const R = (p) => { const q = sub(p, L.o); return len(sub(q, mul(L.a, dot(q, L.a)))); };
  const facePts = (f) => f.loops.flatMap((l) => l.edges.flatMap((e) => edgePoints(e, 48)));
  const allH = solid.faces.flatMap(facePts).map(H);
  const midH = (Math.min(...allH) + Math.max(...allH)) / 2;

  const segs = [];
  for (const f of solid.faces) {
    const s = f.surface;
    const pts = facePts(f);
    if (!pts.length) continue;
    if (s.type === "plane") {
      const h = H(s.o);
      let rmax = 0, rmin = Infinity;
      for (const l of f.loops) for (const e of l.edges) {
        const P = edgePoints(e, 48);
        for (const p of P) rmax = Math.max(rmax, R(p));
        rmin = Math.min(rmin, e.curve.type === "line" ? segDist(e.a, e.b, L) : Math.min(...P.map(R)));
      }
      if (containsAxis(f, L, fr)) rmin = 0;
      if (rmax - rmin > tol) segs.push({ t: "line", p: [rmin, h], q: [rmax, h] });
    } else if (s.type === "cylinder") {
      const hs = pts.map(H);
      segs.push({ t: "line", p: [s.r, Math.min(...hs)], q: [s.r, Math.max(...hs)] });
    } else if (s.type === "cone") {
      const rh = pts.map((p) => [R(p), H(p)]);
      let lo = rh.reduce((m, p) => (p[1] < m[1] ? p : m)), hi = rh.reduce((m, p) => (p[1] > m[1] ? p : m));
      // a cone that runs to its tip has one rim: the tip is on the axis
      const rims = f.loops.filter((l) => l.edges.length).length;
      if (rims === 1 && Math.abs(lo[1] - hi[1]) < tol) {
        const k = Math.tan(s.angle) * (dot(s.z, L.a) > 0 ? 1 : -1);
        const tipH = H(s.o) - s.r / k;
        if (tipH > lo[1]) hi = [0, tipH]; else lo = [0, tipH];
      }
      segs.push({ t: "line", p: lo, q: hi });
    } else if (s.type === "torus" || s.type === "sphere") {
      const c = s.type === "torus" ? [s.R, H(s.o)] : [0, H(s.o)];
      const rr = s.r;
      let phis = pts.map((p) => Math.atan2(H(p) - c[1], R(p) - c[0]));
      if (s.type === "sphere") {
        // a sphere cap with one rim runs on to a pole: the one away from the rest
        const rims = f.loops.filter((l) => l.edges.length).length;
        const lo = Math.min(...phis), hi = Math.max(...phis);
        if (rims <= 1) {
          const up = H(s.o) + rr * Math.sin(hi) < midH ? false : (H(s.o) >= midH);
          phis = up ? [lo, Math.PI / 2] : [-Math.PI / 2, hi];
          if (rims === 0) phis = [-Math.PI / 2, Math.PI / 2];
        }
      }
      const arc = shortArc(phis);
      if (!arc) return { why: "a rounded face's profile could not be traced" };
      segs.push({ t: "arc", c, r: rr, a0: arc[0], a1: arc[1] });
    }
  }
  // split faces give the same profile piece twice
  const uniq = dedupeSegs(segs, tol);
  // close each piece that reaches the axis along the axis
  const onAxis = [];
  for (const sg of uniq) for (const p of [segStart(sg), segEnd(sg)]) if (Math.abs(p[0]) < tol * 10) onAxis.push(p[1]);
  const axisH = [...new Set(onAxis.map((h) => Math.round(h / tol) * tol))].sort((a, b) => a - b);
  // points meeting a piece on the axis line itself are not ends
  const ends = axisH.filter((h) => uniq.filter((sg) => near2(segStart(sg), [0, h], tol * 10) || near2(segEnd(sg), [0, h], tol * 10)).length % 2 === 1);
  for (let i = 0; i + 1 < ends.length; i += 2) uniq.push({ t: "line", p: [0, ends[i]], q: [0, ends[i + 1]] });
  for (const sg of uniq) if (sg.t === "line") { if (Math.abs(sg.p[0]) < tol * 10) sg.p = [0, sg.p[1]]; if (Math.abs(sg.q[0]) < tol * 10) sg.q = [0, sg.q[1]]; }
  const chained = chainLoops(uniq, tol * 50);
  if (!chained) return { why: "the turned profile does not close" };
  const loops = circleLoops(chained, tol);
  const regions = nestLoops(loops);
  const on = placementFor(L.o, L.a, fr.x, "revolve");
  const bodies = regions.map((rg) => {
    const outer = loopCode(rg.outer, true).code;
    const prof = rg.holes.length ? `region2d(${outer}, ${rg.holes.map((h) => loopCode(h, false).code).join(", ")})` : outer;
    return `revolve(${on}, ${prof})`;
  });
  return { kind: "revolve", expr: bodies.length === 1 ? bodies[0] : `union(${bodies.join(", ")})`, dials: [] };
}

function segDist(a, b, L) {
  // closest approach of segment ab to the axis line, in the plane across it
  const P = (p) => { const q = sub(p, L.o); return sub(q, mul(L.a, dot(q, L.a))); };
  const A = P(a), Bq = P(b), d = sub(Bq, A);
  const t = Math.max(0, Math.min(1, -dot(A, d) / (dot(d, d) || 1)));
  return len(add(A, mul(d, t)));
}
// does a flat face cross the axis (a disk, not a ring)?
function containsAxis(f, L, fr) {
  const P = (p) => { const q = sub(p, L.o); return [dot(q, fr.x), dot(q, fr.y)]; };
  let inside = 0;
  for (const l of f.loops) {
    const poly = l.edges.flatMap((e) => edgePoints(e, 48).slice(0, -1)).map(P);
    if (poly.length >= 3 && inside2([0, 0], poly)) inside++;
  }
  return inside % 2 === 1;
}
// the shorter arc through a set of angles (torus and sphere profile pieces)
function shortArc(phis) {
  if (!phis.length) return null;
  const s = phis.map((p) => ((p % TAU) + TAU) % TAU).sort((a, b) => a - b);
  // the biggest gap between neighbours is where the arc is NOT
  let gap = -1, at = 0;
  for (let i = 0; i < s.length; i++) {
    const g = (i + 1 < s.length ? s[i + 1] : s[0] + TAU) - s[i];
    if (g > gap) { gap = g; at = i; }
  }
  let a0 = at + 1 < s.length ? s[at + 1] : s[0];
  let a1 = s[at];
  if (a1 < a0) a1 += TAU;
  if (a0 > Math.PI) { a0 -= TAU; a1 -= TAU; }
  return a1 - a0 > 1e-9 ? [a0, a1] : null;
}
function dedupeSegs(segs, tol) {
  const out = [];
  const same = (a, b) => {
    if (a.t !== b.t) return false;
    if (a.t === "line") return (near2(a.p, b.p, tol * 10) && near2(a.q, b.q, tol * 10)) || (near2(a.p, b.q, tol * 10) && near2(a.q, b.p, tol * 10));
    return near2(a.c, b.c, tol * 10) && Math.abs(a.r - b.r) < tol * 10 && Math.abs(a.a0 - b.a0) < 1e-6 && Math.abs(a.a1 - b.a1) < 1e-6;
  };
  for (const s of segs) if (!out.some((o) => same(o, s))) out.push(s);
  return out;
}

// ---------------------------------------------------------------- extrude

export function tryExtrude(solid, d, B = boundsOf(solid)) {
  const tol = Math.max(1e-6, B.size * 1e-7);
  const fr = frameFor(d);
  const H = (p) => dot(p, d);
  const P2 = (p) => [dot(p, fr.x), dot(p, fr.y)];
  const caps = [], walls = [], others = [];
  for (const f of solid.faces) {
    const s = f.surface;
    if (s.type === "plane" && parallel(s.z, d)) caps.push({ f, h: H(s.o) });
    else if (s.type === "plane" && perpendicular(s.z, d)) walls.push({ f, kind: "plane" });
    else if (s.type === "cylinder" && parallel(s.z, d)) walls.push({ f, kind: "cyl" });
    else others.push(f);
  }
  if (caps.length < 2) return { why: others.length ? `a ${others[0].surface.type} face runs neither along nor across ${dirName(d)}` : "no flat top and bottom" };
  const levels = [];
  for (const c of caps) if (!levels.some((h) => Math.abs(h - c.h) < tol)) levels.push(c.h);
  levels.sort((a, b) => a - b);
  // the rest may be the top or bottom edges rounded or bevelled: traced as
  // if sharp (each wall run on up to the face), and rounded again in the code
  const blend = others.length ? edgeBlends(others, d, levels, tol, H) : null;
  if (blend?.why) return { why: blend.why };
  const snap = blend ? blend.snap : (h) => h;

  // each wall: its pieces of boundary, sorted into vertical runs (along d)
  // and level runs (at one height)
  const W = [];
  for (const w of walls) {
    const s = w.f.surface;
    const cyl = w.kind === "cyl";
    const c2 = cyl ? P2(s.o) : null;
    const u = cyl ? null : unit(cross(d, s.z));
    const S = cyl ? (p) => { const q = P2(p); return Math.atan2(q[1] - c2[1], q[0] - c2[0]); } : (p) => dot(p, u);
    const vert = [], level = [];
    let hlo = Infinity, hhi = -Infinity;
    for (const l of w.f.loops) for (const e of l.edges) {
      const pts = edgePoints(e, 24);
      const hs = pts.map((p) => snap(H(p)));
      const h0 = Math.min(...hs), h1 = Math.max(...hs);
      hlo = Math.min(hlo, h0); hhi = Math.max(hhi, h1);
      if (h1 - h0 < tol) {
        // a run at one height: its span of s (an arc's sweep, for a cylinder)
        if (cyl) {
          const ccw = e.curve.type === "circle" ? dot(e.curve.z, d) > 0 : true;
          const t0 = S(e.a);
          let sw = ((S(e.b) - t0) % TAU + TAU) % TAU;
          if (near3(e.a, e.b, tol)) sw = TAU;
          else if (!ccw) sw = sw - TAU;
          level.push({ h: h0, s0: t0, sw });
        } else level.push({ h: h0, s0: Math.min(S(e.a), S(e.b)), s1: Math.max(S(e.a), S(e.b)) });
      } else {
        const p0 = P2(pts[0]);
        if (!pts.every((p) => near2(P2(p), p0, tol * 10))) return { why: "a side wall has a sloping or curved edge (a fillet or a cross hole)" };
        vert.push({ s: S(pts[0]), h0, h1 });
      }
    }
    W.push({ w, cyl, c2, r: s.r, u, o2: cyl ? null : P2(s.o), oS: cyl ? 0 : dot(s.o, u), vert, level, hlo, hhi });
  }

  const slabs = [];
  for (let k = 0; k + 1 < levels.length; k++) {
    const z0 = levels[k], z1 = levels[k + 1], m = (z0 + z1) / 2;
    const segs = [];
    for (const w of W) {
      if (!(w.hlo < m && m < w.hhi)) continue;
      const cuts = w.vert.filter((v) => v.h0 < m && m < v.h1).map((v) => v.s);
      const above = w.level.filter((l) => l.h > m);
      const covered = (s) => above.reduce((n, l) => n + (w.cyl ? (inSweep(s, l.s0, l.sw) ? 1 : 0) : (s > l.s0 && s < l.s1 ? 1 : 0)), 0) % 2 === 1;
      if (w.cyl) {
        const cs = [...new Set(cuts.map((a) => ((a % TAU) + TAU) % TAU))].sort((a, b) => a - b);
        if (!cs.length) { if (covered(0.123)) segs.push({ t: "circle", c: w.c2, r: w.r }); continue; }
        for (let i = 0; i < cs.length; i++) {
          const a0 = cs[i], a1 = i + 1 < cs.length ? cs[i + 1] : cs[0] + TAU;
          if (a1 - a0 < 1e-9) continue;
          if (covered((a0 + a1) / 2)) segs.push({ t: "arc", c: w.c2, r: w.r, a0, a1 });
        }
      } else {
        const cs = [...cuts].sort((a, b) => a - b);
        for (let i = 0; i + 1 < cs.length; i++) {
          if (cs[i + 1] - cs[i] < tol) continue;
          if (covered((cs[i] + cs[i + 1]) / 2)) {
            const at = (s) => [w.o2[0] + P2(w.u)[0] * (s - w.oS), w.o2[1] + P2(w.u)[1] * (s - w.oS)];
            segs.push({ t: "line", p: at(cs[i]), q: at(cs[i + 1]) });
          }
        }
      }
    }
    if (!segs.length) { slabs.push({ z0, z1, regions: [], key: "" }); continue; }
    const merged = mergeLines(segs, tol);
    const chained = chainLoops(merged, tol * 50);
    if (!chained) return { why: `the cross-section at ${dirName(d)} ${num(m)} does not close` };
    const loops = circleLoops(chained, tol);
    const regions = nestLoops(loops);
    slabs.push({ z0, z1, regions, key: sectionKey(merged) });
  }
  // neighbouring layers with the same section are one extrude
  const groups = [];
  for (const s of slabs) {
    const g = groups[groups.length - 1];
    if (g && g.key === s.key && Math.abs(g.z1 - s.z0) < tol) g.z1 = s.z1;
    else groups.push({ ...s });
  }
  const solidGroups = groups.filter((g) => g.regions.length);
  if (!solidGroups.length) return { why: "no material between the flat faces" };
  // hundreds of layer pieces are not code anyone would edit, and building
  // them took half a minute a body (and the kernel's union often gave up)
  const pieces = solidGroups.reduce((n, g) => n + g.regions.length, 0);
  if (pieces > MAX_PIECES) return { why: `it would take ${pieces} extruded layers (more than ${MAX_PIECES} is not code worth editing)` };
  // two ways to write the holes: drilled afterwards (the code a person would
  // write), or left in each layer's outline (no cutter at all, so no boolean
  // to refuse: a hole that also notches the layer above made the drill's
  // cutter run along that notch, coincident cylinders, and the kernel
  // refused the subtract). The checker keeps the first that rebuilds exactly.
  const copy = () => solidGroups.map((g) => ({ ...g, regions: g.regions.map((r) => ({ ...r, holes: [...r.holes] })) }));
  const drilled = emitExtrude(copy(), fr, tol, "drill", blend);
  // (rounded edges: only drilled, or the round would run round each hole rim)
  if (blend) return { ...drilled, variants: [drilled] };
  const inOutline = emitExtrude(copy(), fr, tol, "region");
  return { ...drilled, variants: inOutline.expr === drilled.expr ? [drilled] : [drilled, inOutline] };
}

const MAX_PIECES = 40;

// Faces that round or bevel the edges of the very top or very bottom face:
// a quarter cylinder lying across d (a straight edge), a torus about d (an
// arc edge, or where two rounded edges meet a rounded corner), a sphere
// (three rounds at a corner); a 45 degree plane or cone (a chamfer). Each
// side takes one size. snap(h) moves a wall's edge from where the round
// starts to the face it rounds, so the layers trace as if the edge were
// sharp; the code then rounds it with fillet() / chamfer() on "top" or
// "bottom", the solid's highest and lowest edges in Z.
function edgeBlends(faces, d, levels, tol, H) {
  const top = levels[levels.length - 1], bottom = levels[0];
  const side = { top: null, bottom: null };
  for (const f of faces) {
    const s = f.surface;
    let kind = null, size = null;
    if (s.type === "cylinder" && perpendicular(s.z, d)) { kind = "fillet"; size = s.r; }
    else if (s.type === "torus" && parallel(s.z, d)) { kind = "fillet"; size = s.r; }
    else if (s.type === "sphere") { kind = "fillet"; size = s.r; }
    else if (s.type === "plane" && Math.abs(Math.abs(dot(s.z, d)) - Math.SQRT1_2) < 1e-6) kind = "chamfer";
    else if (s.type === "cone" && parallel(s.z, d) && Math.abs(Math.abs(s.angle) - Math.PI / 4) < 1e-6) kind = "chamfer";
    if (!kind) return { why: `a ${s.type} face runs neither along nor across ${dirName(d)}` };
    const hs = f.loops.flatMap((l) => l.edges.flatMap((e) => edgePoints(e, 12))).map(H);
    const a = Math.min(...hs), b = Math.max(...hs);
    size ??= b - a;
    const at = Math.abs(b - top) < tol && Math.abs(b - a - size) < tol * 100 ? "top"
      : Math.abs(a - bottom) < tol && Math.abs(b - a - size) < tol * 100 ? "bottom" : null;
    if (!at) return { why: `a rounded or bevelled edge that is not on the very top or bottom (a ${s.type} face)` };
    const prev = side[at];
    if (prev && (prev.kind !== kind || Math.abs(prev.size - size) > tol * 100)) return { why: `the ${at} edges are rounded or bevelled by different amounts` };
    side[at] = { kind, size };
  }
  if (!parallel(d, [0, 0, 1])) return { why: `rounded edges on a part that does not stand along Z (fillet's "top" and "bottom" are in Z)` };
  // a layer edge where a round starts would be moved too: too close to call
  for (const [k, H0, sgn] of [["top", top, -1], ["bottom", bottom, 1]]) {
    const b = side[k];
    if (b && levels.some((h) => Math.abs(h - (H0 + sgn * b.size)) < tol * 10)) return { why: `a layer edge sits where the ${k} round starts` };
  }
  const snap = (h) => {
    if (side.top && Math.abs(h - (top - side.top.size)) < tol * 10) return top;
    if (side.bottom && Math.abs(h - (bottom + side.bottom.size)) < tol * 10) return bottom;
    return h;
  };
  return { ...side, snap };
}

function inSweep(a, s0, sw) {
  const t = sw >= 0 ? ((a - s0) % TAU + TAU) % TAU : ((s0 - a) % TAU + TAU) % TAU;
  return t > 1e-9 && t < Math.abs(sw) - 1e-9;
}
const near3 = (a, b, tol) => Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol && Math.abs(a[2] - b[2]) < tol;
const dirName = (d) => (parallel(d, [0, 0, 1]) ? "Z" : parallel(d, [1, 0, 0]) ? "X" : parallel(d, [0, 1, 0]) ? "Y" : `[${d.map(num).join(", ")}]`);

// two straight pieces in a row along one line are one piece (a wall split in
// two by the file); keeps the outlines short
function mergeLines(segs, tol) {
  const lines = segs.filter((s) => s.t === "line"), rest = segs.filter((s) => s.t !== "line");
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i], b = lines[j];
      for (const [p, q] of [[a.p, a.q], [a.q, a.p]]) for (const [r, s] of [[b.p, b.q], [b.q, b.p]]) {
        if (!near2(q, r, tol * 10)) continue;
        const d1 = [q[0] - p[0], q[1] - p[1]], d2 = [s[0] - r[0], s[1] - r[1]];
        if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) > tol * (Math.hypot(...d1) + Math.hypot(...d2)) || d1[0] * d2[0] + d1[1] * d2[1] < 0) continue;
        // q is only a joint if no other piece ends there
        if (segs.filter((o) => o !== a && o !== b && (near2(segStart(o), q, tol * 10) || near2(segEnd(o), q, tol * 10))).length) continue;
        lines[i] = { t: "line", p, q: s };
        lines.splice(j, 1);
        changed = true;
        break outer;
      }
    }
  }
  return [...lines, ...rest];
}

function sectionKey(segs) {
  const k = (s) => s.t === "line"
    ? [pt2(s.p), pt2(s.q)].sort().join("-")
    : `${s.t}${pt2(s.c)}${num(s.r)}${s.t === "arc" ? num(s.a0) + num(s.a1) : ""}`;
  return segs.map(k).sort().join("|");
}

// the plane option for a profile laid across d through the origin
function placementFor(o, d, x, mode) {
  const isZ = parallel(d, [0, 0, 1]) && dot(d, [0, 0, 1]) > 0 && near3(x, [1, 0, 0], 1e-9);
  const atOrigin = near3(o, [0, 0, 0], 1e-9);
  if (mode === "revolve") {
    // revolve spins about the plane's y axis (normal x x): a profile in XZ
    // spins about Z, and its own x is the radius
    if (isZ && atOrigin) return "{}";
    const normal = cross(x, d);
    return `{ on: { origin: ${pt3(o)}, normal: ${pt3(normal)}, x: ${pt3(x)} } }`;
  }
  if (isZ && atOrigin) return null;
  return `{ normal: ${pt3(d)}, x: ${pt3(x)}${atOrigin ? "" : `, origin: ${pt3(o)}`} }`;
}

// Does layer a's material hold all of layer b's? Every point on b's outlines
// is in a (or on its edge), and none of a's holes reaches into b.
function holds(a, b, tol) {
  const polys = (g) => g.regions.map((rg) => ({ outer: loopPolygon(rg.outer, 48), holes: rg.holes.map((h) => loopPolygon(h, 48)) }));
  const A = polys(a), Bp = polys(b);
  const edgeNear = (p, poly) => poly.some((q, i) => segPointDist(p, q, poly[(i + 1) % poly.length]) < tol * 20);
  const inMaterial = (p, P) => P.some((r) => (inside2(p, r.outer) || edgeNear(p, r.outer)) && !r.holes.some((h) => inside2(p, h) && !edgeNear(p, h)));
  for (const r of Bp) for (const poly of [r.outer, ...r.holes]) for (const p of poly) if (!inMaterial(p, A)) return false;
  // a hole of a strictly inside b's material: b would fill it
  const inB = (p) => Bp.some((r) => inside2(p, r.outer) && !edgeNear(p, r.outer) && !r.holes.some((h) => inside2(p, h) || edgeNear(p, h)));
  for (const r of A) for (const h of r.holes) if (h.some(inB)) return false;
  return true;
}
function segPointDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

// mode "drill": round holes come out of the layers and are drilled; "region":
// they stay in each layer's outline, with their diameter dials all the same
function emitExtrude(groups0, fr, tol, mode = "drill", blend = null) {
  const on = placementFor([0, 0, 0], fr.d, fr.x, "extrude");
  const onPart = on ? `, on: ${on}` : "";
  // round holes running through layers in a row: pulled out of the layers,
  // and drilled afterwards, one drill() per hole
  const runs = [];
  const inRegion = [];       // "region": the round holes left in the outlines
  groups0.forEach((g, gi) => g.regions.forEach((rg) => rg.holes.forEach((h) => {
    if (h.length !== 1 || h[0].s.t !== "circle") return;
    if (mode === "region") { inRegion.push(h[0].s); return; }
    const c = h[0].s;
    const run = runs.find((x) => x.last === gi - 1 && near2(x.c, c.c, tol * 10) && Math.abs(x.r - c.r) < tol * 10);
    if (run) { run.last = gi; run.z1 = g.z1; run.refs.push([rg, h]); }
    else runs.push({ c: c.c, r: c.r, first: gi, last: gi, z0: g.z0, z1: g.z1, refs: [[rg, h]] });
  })));
  for (const h of runs) for (const [rg, l] of h.refs) rg.holes = rg.holes.filter((x) => x !== l);
  // layers that only differed by where a hole starts are one layer again
  const groups = [];
  for (const g of groups0) {
    const key = g.regions.map((rg) => [rg.outer, ...rg.holes].map((l) => sectionKey(l.map((x) => x.s))).join("/")).sort().join("|");
    const last = groups[groups.length - 1];
    if (last && last.key2 === key && Math.abs(last.z1 - g.z0) < tol) last.z1 = g.z1;
    else groups.push({ ...g, key2: key });
  }

  // is there material at this 2D point just above (side +1) or below (-1) z?
  const solidAt = (p, z, side) => groups.some((g) => (side > 0 ? g.z0 < z + tol && g.z1 > z + tol : g.z1 > z - tol && g.z0 < z - tol)
    && g.regions.some((rg) => inside2(p, loopPolygon(rg.outer, 64)) && !rg.holes.some((h) => inside2(p, loopPolygon(h, 64)))));
  // a narrow hole under a wide one on the same axis is one counterbored hole
  const holes = [];
  const used = new Set();
  for (const h of [...runs].sort((a, b) => a.z0 - b.z0)) {
    if (used.has(h)) continue;
    used.add(h);
    const wide = runs.find((w) => !used.has(w) && near2(w.c, h.c, tol * 10) && w.r > h.r + tol && Math.abs(w.z0 - h.z1) < tol);
    const under = runs.find((w) => !used.has(w) && near2(w.c, h.c, tol * 10) && w.r < h.r - tol && Math.abs(w.z0 - h.z1) < tol);
    if (wide) { used.add(wide); holes.push({ c: h.c, r: h.r, z0: h.z0, z1: wide.z1, cb: { r: wide.r, depth: wide.z1 - wide.z0 }, up: true }); }
    else if (under) { used.add(under); holes.push({ c: h.c, r: under.r, z0: h.z0, z1: under.z1, cb: { r: h.r, depth: h.z1 - h.z0 }, up: false }); }
    else holes.push({ c: h.c, r: h.r, z0: h.z0, z1: h.z1, cb: null, up: null });
  }

  // dials: one per hole size, one per layer thickness
  const dials = [];
  // (in an outline a hole shows once per layer it passes through: count it once)
  const round = mode === "region" ? inRegion.filter((h, i) => inRegion.findIndex((o) => near2(o.c, h.c, tol * 10) && Math.abs(o.r - h.r) < tol * 10) === i) : holes;
  const sizes = [...new Set(round.map((h) => num(2 * h.r)))].sort((a, b) => +a - +b);
  const holeName = (d) => (sizes.length === 1 ? "holeD" : `holeD${sizes.indexOf(d) + 1}`);
  for (const s of sizes) {
    const n = round.filter((h) => num(2 * h.r) === s).length;
    dials.push({ name: holeName(s), value: s, note: `hole diameter (${n} hole${n > 1 ? "s" : ""})` });
  }
  // layers stacked with no gap read as a base and what sits on it: each
  // thickness is a dial, and the layers above move when one changes
  const stacked = groups.every((g, i) => i === 0 || Math.abs(g.z0 - groups[i - 1].z1) < tol);
  const zName = [];
  if (stacked) groups.forEach((g, i) => {
    const name = groups.length === 1 ? "thickness" : `t${i + 1}`;
    dials.push({ name, value: num(g.z1 - g.z0), note: groups.length === 1 ? "how thick" : `layer ${i + 1} thickness` });
    zName.push(name);
  });
  const base = num(groups[0].z0);
  const sum = (terms) => (terms.length ? (base === "0" ? terms.join(" + ") : `${base} + ${terms.join(" + ")}`) : base);
  const startOf = (i) => (stacked ? sum(zName.slice(0, i)) : num(groups[i].z0));
  // a height as dials when it is a layer edge, else a number
  const zExpr = (z) => {
    if (!stacked) return num(z);
    for (let i = 0; i <= groups.length; i++) {
      const edge = i < groups.length ? groups[i].z0 : groups[groups.length - 1].z1;
      if (Math.abs(edge - z) < tol) return sum(zName.slice(0, i));
    }
    return num(z);
  };
  const pointAt = (c2, z) => {
    const out = [0, 1, 2].map((k) => {
      const zk = fr.d[k];
      const flat = Math.abs(fr.x[k]) < 1e-12 && Math.abs(fr.y[k]) < 1e-12;
      if (flat && Math.abs(Math.abs(zk) - 1) < 1e-12) { const e = zExpr(z); return zk > 0 ? e : (e === "0" ? "0" : `-(${e})`); }
      return num(c2[0] * fr.x[k] + c2[1] * fr.y[k] + z * zk);
    });
    return `[${out.join(", ")}]`;
  };
  const dirCode = (s) => pt3(mul(fr.d, s));

  // Layers that only TOUCH make a union of faces lying on faces, the one case
  // the kernel's boolean is weakest at ("unsupported tangent-curve surface
  // intersection", "invalid topology" on real parts). So a layer that sits
  // wholly on the layer below is extruded down through it, and one that fits
  // wholly inside the layer above runs up into it: the union then overlaps
  // real volume. (A boss on a base reads that way too: from the bottom up.)
  const lo = groups.map((_, i) => i), hi = groups.map((_, i) => i);
  if (stacked) groups.forEach((g, i) => {
    while (lo[i] > 0 && holds(groups[lo[i] - 1], g, tol)) lo[i]--;
    while (hi[i] < groups.length - 1 && holds(groups[hi[i] + 1], g, tol)) hi[i]++;
  });
  const bodies = [];
  groups.forEach((g, i) => {
    for (const rg of g.regions) {
      const outer = loopCode(rg.outer, true).code;
      const dialOf = mode === "region" ? (c) => holeName(num(2 * c.r)) : null;
      const prof = rg.holes.length ? `region2d(${outer}, ${rg.holes.map((h) => loopCode(h, false, dialOf).code).join(", ")})` : outer;
      const start = startOf(stacked ? lo[i] : i);
      const h = stacked ? zName.slice(lo[i], hi[i] + 1).join(" + ") : num(g.z1 - g.z0);
      bodies.push(`linearExtrude({ h: ${h}${start === "0" ? "" : `, start: ${start}`}${onPart} }, ${prof})`);
    }
  });
  // one level deeper when the layers sit inside the holes' difference()
  const pad = holes.length ? "  " : "";
  let expr = bodies.length === 1 ? bodies[0] : `union(\n  ${pad}${bodies.join(`,\n  ${pad}`)},\n${pad})`;
  // the rounded or bevelled top / bottom edges, before the holes are drilled
  // (so a hole's rim stays sharp, as the file has it)
  if (blend) {
    const sides = ["bottom", "top"].filter((k) => blend[k]);
    for (const k of sides) {
      const b = blend[k];
      const name = (b.kind === "fillet" ? (sides.length > 1 ? `${k}R` : "edgeR") : (sides.length > 1 ? `${k}Chamfer` : "edgeChamfer"));
      dials.push({ name, value: num(b.size), note: `${k} edges ${b.kind === "fillet" ? "rounded" : "chamfered"}` });
      expr = `${b.kind}({ ${b.kind === "fillet" ? "r" : "d"}: ${name}, edges: "${k}" }, ${expr})`;
    }
  }
  if (holes.length) {
    const cuts = holes.map((h) => {
      const d = holeName(num(2 * h.r));
      const openTop = !solidAt(h.c, h.z1, +1), openBot = !solidAt(h.c, h.z0, -1);
      const fromTop = h.up != null ? h.up : openTop || !openBot;
      if (!(fromTop ? openTop : openBot)) {
        // a closed pocket inside the part: a plain cut where it is
        const z0 = zExpr(h.z0), hh = num(h.z1 - h.z0);
        return `linearExtrude({ h: ${hh}${z0 === "0" ? "" : `, start: ${z0}`}${onPart} }, circle2d({ d: ${d}, center: ${pt2(h.c)} }))`;
      }
      const through = fromTop ? openBot : openTop;
      const opts = [`d: ${d}`];
      if (through) opts.push("through: true");
      else opts.push(`depth: ${num(h.z1 - h.z0)}`);
      if (h.cb) opts.push(`cbore: { d: ${num(2 * h.cb.r)}, depth: ${num(h.cb.depth)} }`);
      return `drill(${pointAt(h.c, fromTop ? h.z1 : h.z0)}, ${dirCode(fromTop ? 1 : -1)}, { ${opts.join(", ")} })`;
    });
    expr = `difference(\n  ${expr},\n  ${cuts.join(",\n  ")},\n)`;
  }
  return { kind: "extrude", expr, dials };
}

// ---------------------------------------------------------------- one body

// The directions worth trying for an extrude: every flat face's normal and
// every cylinder's axis, the most common first.
function candidateDirs(solid) {
  const c = [];
  for (const f of solid.faces) {
    const s = f.surface;
    const d = s.type === "plane" || s.type === "cylinder" ? canon(s.z) : null;
    if (!d) continue;
    const hit = c.find((x) => parallel(x.d, d));
    if (hit) hit.n++; else c.push({ d, n: 1 });
  }
  return c.sort((a, b) => b.n - a.n).map((x) => x.d);
}

// every way this body can be written, best first (the checker keeps the
// first one that rebuilds the body exactly)
export function convertSolid(solid) {
  const B = boundsOf(solid);
  const tries = [];
  const why = [];
  const rv = tryRevolve(solid, B);
  if (rv.expr) tries.push(rv); else why.push(`revolve: ${rv.why}`);
  // every direction: a wrong one is turned down by the first face that runs
  // across it, which costs next to nothing (a part extruded along its 45
  // degree face was missed when only the four commonest were tried)
  for (const d of candidateDirs(solid)) {
    const ex = tryExtrude(solid, d, B);
    if (ex.expr) { tries.push(...ex.variants); if (tries.length >= 4) break; } else why.push(`extrude ${dirName(d)}: ${ex.why}`);
  }
  return { tries, why: [...new Set(why)] };
}

// one candidate as a model of its own (what the checker builds), placed
// where the file has it when T is given
export function sourceFor(t, T = null) {
  const dials = (t.dials || []).map((d) => `const ${d.name} = ${d.value};`).join("\n");
  return `${dials}\nreturn ${T ? placeCode(T, t.expr) : t.expr};`;
}

// ---------------------------------------------------------------- parts

// The bodies to convert: one per distinct solid in the file, in the part's
// OWN frame (as it was drawn: square to its axes, round numbers), with every
// place the assembly puts a copy of it. A screw used eight times is converted
// once and placed eight times; a part the assembly turned 30 degrees is still
// written square, inside one rotate().
export function planBodies(read) {
  const byBrep = new Map();
  for (const s of read.solids) {
    if (!byBrep.has(s.brep)) byBrep.set(s.brep, []);
    byBrep.get(s.brep).push(s);
  }
  return [...byBrep.values()].map((instances) => ({
    name: instances[0].name,
    color: instances[0].color,
    instances,
    local: placeSolid(instances[0], xf.invert(instances[0].matrix)),
  }));
}
// a body read by stepread moved by T (its faces, edges and surfaces)
export function placeSolid(s, T) {
  const P = (p) => (p ? xf.apply(T, p) : p), D = (d) => (d ? xf.applyDir(T, d) : d);
  const curve = (c) => ({ ...c, o: P(c.o), z: D(c.z), x: D(c.x), y: D(c.y), dir: D(c.dir) });
  const surface = (f) => ({ ...f, o: P(f.o), z: D(f.z), x: D(f.x), y: D(f.y), dir: D(f.dir), profile: f.profile ? curve(f.profile) : f.profile });
  return {
    ...s,
    matrix: xf.compose(T, s.matrix),
    faces: s.faces.map((f) => ({
      ...f,
      surface: surface(f.surface),
      loops: f.loops.map((l) => ({ ...l, edges: l.edges.map((e) => ({ ...e, a: P(e.a), b: P(e.b), curve: curve(e.curve), pts: e.pts ? e.pts.map(P) : e.pts })) })),
    })),
  };
}
// the import name a kept body is registered under
export function keptName(title, body, used) {
  const clean = (s) => String(s || "body").replace(/[^\w.\- ]+/g, "_").trim() || "body";
  let base = `${clean(title)}-${clean(body)}.step`, out = base, k = 2;
  while (used.has(out)) out = base.replace(/\.step$/, `-${k++}.step`);
  used.add(out);
  return out;
}

// ---------------------------------------------------------------- the file

const ident = (s, used) => {
  let b = String(s || "part").normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "_$1") || "part";
  b = b.charAt(0).toLowerCase() + b.slice(1);
  if (RESERVED.has(b)) b += "_";
  let n = b, k = 2;
  while (used.has(n)) n = `${b}_${k++}`;
  used.add(n);
  return n;
};
// JavaScript's words, and BREPcode's own (every function the editor hands a
// model): a part named "Drill" or "Cube" must not become const drill = ...,
// which would hide the drill() its own code calls, and cube() from whoever
// edits it next
const RESERVED = new Set(["return", "const", "let", "var", "function", "class", "new", "delete", "in", "of", "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue", "try", "catch", "finally", "throw", "typeof", "instanceof", "void", "this", "super", "null", "true", "false", "import", "export", "with", "yield", "await", "enum",
  ...Object.keys(dsl).filter((k) => typeof dsl[k] === "function")]);

// results: per solid, { ok: true, expr, dials, kind } or { ok: false, importName, why }
export function toCode(read, results, { title = "part" } = {}) {
  const lines = [];
  const conv = results.filter((r) => r.ok).length;
  lines.push(`// Converted from STEP: ${title}.`);
  lines.push(`// ${conv} of ${results.length} bod${results.length === 1 ? "y" : "ies"} rebuilt as code and checked against the file (same shape, to the kernel's tolerance).`);
  if (conv < results.length) lines.push("// The rest are kept as the file's own exact solids (importedSolid): see the note on each.");
  lines.push("");
  const used = new Set();
  // A part converted once (r.plan, the same object on every copy) is written
  // once: its dials, then, when the assembly places it more than once, a
  // function of it that each copy calls. Each copy is moved where the file
  // has it (r.T: one rotate / translate, nothing when it sits as drawn).
  const plans = [...new Set(results.filter((r) => r.ok).map((r) => r.plan).filter(Boolean))];
  const many = results.length > 1;
  const partName = new Map(), partExpr = new Map();
  const dialLines = [], partLines = [];
  for (const p of plans) {
    const r = results.find((x) => x.plan === p);
    const nm = ident(p.name, used);
    partName.set(p, nm);
    let e = r.expr;
    const prefix = many && plans.length > 1 ? nm + "_" : "";
    for (const d of r.dials || []) {
      const dn = prefix ? prefix + d.name.charAt(0).toUpperCase() + d.name.slice(1) : d.name;
      if (prefix) e = e.replace(new RegExp(`\\b${d.name}\\b`, "g"), dn);
      dialLines.push(`const ${dn} = ${d.value};${" ".repeat(Math.max(1, 28 - dn.length - String(d.value).length))}// ${d.note}`);
    }
    const copies = results.filter((x) => x.plan === p).length;
    if (copies > 1) { partLines.push(`// ${p.name}: placed ${copies} times`, `const ${nm} = () => ${indent(e)};`, ""); partExpr.set(p, `${nm}()`); }
    else partExpr.set(p, e);
  }
  // a body whose own STEP could not be written has nothing to import: it is
  // left out, and its note says so
  const shapeOf = (r) => (r.ok ? placeCode(r.T || xf.IDENT, partExpr.get(r.plan) ?? r.expr) : r.missing ? null : `importedSolid(${JSON.stringify(r.importName)})`);
  const exprs = results.map(shapeOf);
  const bodyName = new Map();
  read.solids.forEach((s, i) => bodyName.set(i, results[i].ok && results.filter((x) => x.plan === results[i].plan).length === 1 ? partName.get(results[i].plan) : ident(s.name, used)));
  lines.push(...dialLines);
  if (dialLines.length) lines.push("");
  lines.push(...partLines);
  const colorWrap = (e, c) => (c ? `colorize(${JSON.stringify(c)}, ${e})` : e);
  if (results.length === 1) {
    const r = results[0];
    if (!r.ok) lines.push(`// ${read.solids[0].name}: kept as the file's solid (${r.why}).`);
    if (exprs[0] == null) { lines.push("// ...and its solid could not be copied out of the file either: open it as a mesh instead."); lines.push("return group();"); }
    else lines.push(`return ${colorWrap(indent(exprs[0]), read.solids[0].color)};`);
    return lines.join("\n") + "\n";
  }
  // several bodies: an assembly, one entry per body, in file order
  lines.push("return assembly({");
  read.solids.forEach((s, i) => {
    const r = results[i];
    if (!r.ok) lines.push(`  // ${s.name}: kept as the file's solid (${r.why}).`);
    if (exprs[i] == null) { lines.push(`  // ${s.name}: left out (its solid could not be copied out of the file).`); return; }
    lines.push(`  ${bodyName.get(i)}: { shape: ${indent(exprs[i], "  ")}${s.color ? `, color: ${JSON.stringify(s.color)}` : ""} },`);
  });
  lines.push("});");
  return lines.join("\n") + "\n";
}
const indent = (e, pre = "") => e.split("\n").map((l, i) => (i ? pre + l : l)).join("\n");

// rotate/translate that reproduce a placement matrix (for repeated parts)
export function placeCode(T, inner) {
  const m = new Matrix4().set(
    T.R[0][0], T.R[0][1], T.R[0][2], T.t[0],
    T.R[1][0], T.R[1][1], T.R[1][2], T.t[1],
    T.R[2][0], T.R[2][1], T.R[2][2], T.t[2],
    0, 0, 0, 1);
  const e = new Euler().setFromRotationMatrix(m, "XYZ");
  const deg = [e.x, e.y, e.z].map((a) => num(a * 180 / Math.PI));
  let out = inner;
  if (deg.some((a) => a !== "0")) out = `rotate([${deg.join(", ")}], ${out})`;
  if (T.t.some((v) => num(v) !== "0")) out = `translate(${pt3(T.t)}, ${out})`;
  return out;
}
export { xf };
