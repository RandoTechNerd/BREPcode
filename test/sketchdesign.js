// Sketch design suite: parts drawn the way the Design-mode sketcher draws them.
//
// Each model is made with the sketcher's own calls (sketch-model.js: lines,
// arcs, circles, trim, then constraints and dims, solved by the kernel's
// ConstraintSolver), written out as sketch({ … }) code, read back, and built
// on every kernel. Every check is against something worked out apart from the
// sketch: the gap between a tangent line and its curve, a dim's length, and the
// profile's area from a sampled outline of the intended shape.
//
// Started for a user report: a line made tangent to a circle in the sketch
// did not work (circles were refused; an arc touched away from its ends was
// left cutting through the line). New models go at the bottom.
//
//   node test/sketchdesign.js

import { ConstraintSolver } from "brep-io-kernel";
import * as dsl from "../src/dsl.js";
import * as codemap from "../src/codemap.js";
import * as SM from "../viewer/design/sketch-model.js";
import { build as buildModel } from "../index.js";
import { loadNvidiaKernel } from "../src/engine-node.js";

dsl.useSketchSolver(ConstraintSolver);

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
}

// ------------------------------------------------------------- the helpers
const PLUMBING = new Set(["compile", "captureSites", "tagCall", "nameOf"]);
const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && !PLUMBING.has(k));
const values = names.map((k) => dsl.tagCall(dsl[k]));
function evaluate(src) {
  const fn = new Function(...names, `"use strict";\n${src}\n//# sourceURL=${codemap.SITE_URL}`);
  dsl.captureSites(codemap.SITE_URL);
  try { return fn(...values); } finally { dsl.captureSites(null); }
}
function volumeOf(res) {
  let vol = 0;
  for (const s of res.solids) {
    const v = [...s.toSTL(s.name).matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i + 2 < v.length; i += 3) {
      const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  return vol;
}
const ENGINES = ["js", "split", ...(loadNvidiaKernel() ? ["nvidia-split"] : [])];
const quiet = async (fn) => {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; }
};
async function onEveryKernel(label, src, want, tol = 0.01) {
  const got = {};
  for (const engine of ENGINES) {
    try { got[engine] = await quiet(async () => volumeOf(await buildModel(evaluate(src), { engine }))); }
    catch (e) { got[engine] = `ERR ${String(e.message || e).slice(0, 140)}`; }
  }
  const bad = Object.entries(got).filter(([, x]) => typeof x !== "number" || Math.abs(x - want) / want > tol);
  check(`${label}: builds to ${want.toFixed(0)} mm³ on ${ENGINES.join(", ")}`, !bad.length,
    Object.entries(got).map(([k, x]) => `${k} ${typeof x === "number" ? x.toFixed(1) : x}`).join("; "));
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const radiusOf = (sk, c) => (c.kind === "circle" ? c.r : dist(sk.points[c.ids[0]], sk.points[c.ids[1]]));
// how far line li is from touching curve ci (0 = tangent)
function tangentGap(sk, li, ci) {
  const [a, b] = sk.curves[li].ids.map((k) => sk.points[k]);
  const c = sk.curves[ci], C = sk.points[c.ids[0]];
  const d = [b[0] - a[0], b[1] - a[1]];
  return Math.abs(Math.abs((C[0] - a[0]) * d[1] - (C[1] - a[1]) * d[0]) / Math.hypot(...d) - radiusOf(sk, c));
}
// every tangent rule in the sketch, as its gap
function worstTangent(sk) {
  let e = 0;
  for (const k of sk.constraints) {
    if (k.type !== "tangent") continue;
    const [a, b, center] = k.ids;
    const li = sk.curves.findIndex((c) => c.kind === "line" && c.ids.includes(a) && c.ids.includes(b));
    const ci = sk.curves.findIndex((c) => (c.kind === "arc" || c.kind === "circle") && c.ids[0] === center);
    e = Math.max(e, tangentGap(sk, li, ci));
  }
  return e;
}
// do two arcs at a joint run on smoothly? (unit tangents agree)
function lineArcSmooth(sk, li, ai) {
  const L = sk.curves[li], A = sk.curves[ai];
  const shared = A.ids.slice(1).find((p) => L.ids.includes(p));
  if (shared == null) return false;
  const P = sk.points, C = P[A.ids[0]], S = P[shared];
  const other = P[L.ids.find((p) => p !== shared)];
  const u = [other[0] - S[0], other[1] - S[1]], v = [S[0] - C[0], S[1] - C[1]];
  return Math.abs(u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v)) < 1e-4;
}
// area of the convex hull of sampled circles / points: the intended outline
function hullArea(shapes) {
  const pts = [];
  for (const s of shapes) {
    if (s.r) for (let i = 0; i < 4096; i++) { const t = (i / 4096) * 2 * Math.PI; pts.push([s.c[0] + s.r * Math.cos(t), s.c[1] + s.r * Math.sin(t)]); }
    else pts.push(s.c);
  }
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of [...pts].reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const h = [...lo.slice(0, -1), ...hi.slice(0, -1)];
  let a = 0;
  for (let i = 0; i < h.length; i++) a += h[i][0] * h[(i + 1) % h.length][1] - h[(i + 1) % h.length][0] * h[i][1];
  return Math.abs(a) / 2;
}
// write the sketch as code, read it back, and the code that extrudes it
function asModel(sk, h) {
  const bad = SM.unmet(sk);
  if (bad.length) check("every rule met before it is written", false, JSON.stringify(bad));
  const code = SM.sketchCode(sk);
  const src = `const s1 = ${code};\nreturn linearExtrude({ h: ${h} }, s1);`;
  const back = SM.readSketch(src, codemap.parseCode(src).calls.find((c) => c.name === "sketch"));
  return { code, src, roundTrip: SM.sketchCode(back) === code };
}
const curveIndex = (sk, kind, n = 0) => sk.curves.map((c, i) => [c, i]).filter(([c]) => c.kind === kind)[n][1];

// ---------------------------------------------- tangent, one pair at a time
console.log("\nTangent: a line and one circle or arc\n");
{
  // the report: a line beside a circle, made tangent
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], 10);
  SM.addLine(sk, [-20, 14], [20, 17], { auto: false });
  const err = SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(sk);
  check("a line and a circle can be made tangent", err === null, err);
  check("…and solve tangent (gap < 0.001 mm)", tangentGap(sk, 1, 0) < 1e-3, String(tangentGap(sk, 1, 0)));
  check("…the circle keeps its radius", sk.curves[0].r === 10);
  // picked the other way round (circle first)
  const sk2 = SM.emptySketch();
  SM.addLine(sk2, [-20, -14], [20, -12], { auto: false });
  SM.addCircle(sk2, [2, 1], 6);
  check("circle picked first works the same", SM.constrain(sk2, "tangent", [{ curve: 1 }, { curve: 0 }]) === null && (SM.solve(sk2), tangentGap(sk2, 0, 1) < 1e-3), String(tangentGap(sk2, 0, 1)));
  // a line through the circle: still made tangent (touching on the near side)
  const sk3 = SM.emptySketch();
  SM.addCircle(sk3, [0, 0], 10);
  SM.addLine(sk3, [-20, 3], [20, 4], { auto: false });
  SM.constrain(sk3, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(sk3);
  check("a line drawn through a circle is moved out to touch it", tangentGap(sk3, 1, 0) < 1e-3, String(tangentGap(sk3, 1, 0)));
  // a line through the centre: no side to prefer, still solved
  const sk4 = SM.emptySketch();
  SM.addCircle(sk4, [0, 0], 5);
  SM.addLine(sk4, [-20, 0.0], [20, 0.5], { auto: false });
  SM.constrain(sk4, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(sk4);
  check("a line through the centre is solved too", tangentGap(sk4, 1, 0) < 1e-3, String(tangentGap(sk4, 1, 0)));
}
{
  // a level line and a fixed circle: the line moves, the circle stays put
  const sk = SM.emptySketch();
  SM.addCircle(sk, [10, 10], 8);
  SM.addLine(sk, [-10, 25], [30, 25.5]);
  check("(the line was made level by the auto constraint)", sk.constraints.some((c) => c.type === "horizontal"));
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(sk);
  const y = sk.points[sk.curves[1].ids[0]][1];
  check("a level line drops onto a fixed circle's top (y = 18)", Math.abs(y - 18) < 1e-3 && dist(sk.points[0], [10, 10]) < 1e-9, JSON.stringify(sk.points));
  // the radius changes: it re-solves
  sk.curves[0].r = 12;
  SM.solve(sk);
  check("…a new radius re-solves it (y = 22)", Math.abs(sk.points[sk.curves[1].ids[0]][1] - 22) < 1e-3, JSON.stringify(sk.points));
  check("…still level", Math.abs(sk.points[sk.curves[1].ids[0]][1] - sk.points[sk.curves[1].ids[1]][1]) < 1e-6);
}
{
  // arcs: touched away from its ends, and from either end
  const free = SM.emptySketch();
  SM.addArc(free, [0, 0], [10, 0], [-10, 0.001]);
  SM.addLine(free, [-20, 14], [20, 17], { auto: false });
  SM.constrain(free, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(free);
  check("a line beside an arc, away from its ends, is made tangent (it used to cut through)", tangentGap(free, 1, 0) < 1e-3, String(tangentGap(free, 1, 0)));
  const ends = [[[10, 0], [14, -20]], [[0, 10], [-20, 14]]];
  for (const [k, [p, q]] of ends.entries()) {
    const sk = SM.emptySketch();
    SM.addArc(sk, [0, 0], [10, 0], [0, 10]);
    SM.addLine(sk, p, q, { auto: false });
    SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
    SM.solve(sk);
    check(`a line from the arc's ${k ? "end" : "start"} runs on smoothly`, tangentGap(sk, 1, 0) < 1e-3 && lineArcSmooth(sk, 1, 0), String(tangentGap(sk, 1, 0)));
    check("…using the shared point, not a new one", sk.points.length === 4 && sk.constraints.find((c) => c.type === "tangent").ids[3] === sk.curves[1].ids[0]);
  }
  // a line that ends on the circle (snapped to its rim): that end is the touch point
  const rim = SM.emptySketch();
  SM.addCircle(rim, [0, 0], 10);
  SM.addLine(rim, [10, 0], [12, 15], { auto: false });
  SM.constrain(rim, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(rim);
  const t = rim.constraints.find((c) => c.type === "tangent").ids[3];
  check("a line ending on a circle touches it at that end", t === rim.curves[1].ids[0] && tangentGap(rim, 1, 0) < 1e-3 && Math.abs(dist(rim.points[t], rim.points[0]) - 10) < 1e-3, JSON.stringify(rim.points));
  // two rings on one centre: the one picked
  const ring = SM.emptySketch();
  SM.addCircle(ring, [0, 0], 10);
  SM.addCircle(ring, [0, 0], 4);
  SM.addLine(ring, [-20, 7], [20, 7.5], { auto: false });
  SM.constrain(ring, "tangent", [{ curve: 2 }, { curve: 1 }]);
  SM.solve(ring);
  check("on concentric rings it touches the ring picked (the small one)", tangentGap(ring, 2, 1) < 1e-3, `small ${tangentGap(ring, 2, 1)} big ${tangentGap(ring, 2, 0)}`);
}
{
  // bookkeeping: the touch point survives writing, and goes with its curves
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], 10);
  SM.addLine(sk, [-20, 14], [20, 17], { auto: false });
  SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(sk);
  const code = SM.sketchCode(sk);
  check("the touch point is written with the rule (4 points, one tangent)", /\["tangent", 1, 2, 0, 3\]/.test(code) && SM.compact(sk).points.length === 4, code);
  const src = `const s1 = ${code};\nreturn linearExtrude({ h: 2 }, s1);`;
  const back = SM.readSketch(src, codemap.parseCode(src).calls.find((c) => c.name === "sketch"));
  check("…and reads back the same", SM.sketchCode(back) === code);
  const del = structuredClone(sk);
  SM.removeCurve(del, 0);
  check("deleting the circle drops the tangent", !del.constraints.some((c) => c.type === "tangent") && SM.compact(del).points.length === 2, JSON.stringify(del.constraints));
  const del2 = structuredClone(sk);
  SM.removeCurve(del2, 1);
  check("deleting the line drops the tangent", !del2.constraints.some((c) => c.type === "tangent") && SM.compact(del2).points.length === 1);
  check("tangent still needs two curves (said)", SM.constrain(sk, "tangent", [{ curve: 0 }]) === "pick two curves: a line, arc, circle or spline and another");
}
{
  // written by hand (or by the AI) in the code: sketch() solves it on its own
  const s = dsl.sketch({
    points: [[0, 0], [-30, 20], [30, 21], [0, 9]],
    curves: [["circle", 0, 12], ["line", 1, 2, "construction"]],
    constraints: [["tangent", 1, 2, 0, 3], ["fixed", 0]],
  });
  const P = s.sketch.points;
  const d = [P[2][0] - P[1][0], P[2][1] - P[1][1]];
  const gap = Math.abs(Math.abs((P[0][0] - P[1][0]) * d[1] - (P[0][1] - P[1][1]) * d[0]) / Math.hypot(...d) - 12);
  check("sketch({ constraints: [[\"tangent\", a, b, centre, p]] }) solves a circle tangent in code", gap < 1e-3, JSON.stringify(P));
}

// -------------------------------------------------------------- the models
console.log("\nModel 1: a slot (two arcs, two lines tangent at the joints)\n");
{
  // drawn roughly by hand, then: tangent at all four joints, centres level,
  // one centre fixed, 30 mm between centres, 6 mm radius, equal ends
  const sk = SM.emptySketch();
  const C1 = [0.4, -0.3], C2 = [29.1, 0.6];
  SM.addArc(sk, C2, [29.5, -5.8], [29.3, 6.4]);                 // right end, bottom -> top
  SM.addLine(sk, sk.points[2], [0.2, 6.2], { auto: false });      // top, right to left
  SM.addArc(sk, C1, [0.2, 6.2], [0.6, -6.1]);                    // left end, top -> bottom
  SM.addLine(sk, sk.points[5], sk.points[1], { auto: false });   // bottom, left to right
  const [A1, L1, A2, L2] = [0, 1, 2, 3];
  for (const [l, a] of [[L1, A1], [L1, A2], [L2, A1], [L2, A2]]) check(`tangent line ${l} / arc ${a}`, SM.constrain(sk, "tangent", [{ curve: l }, { curve: a }]) === null);
  const c1 = sk.curves[A2].ids[0], c2 = sk.curves[A1].ids[0];
  SM.constrain(sk, "horizontal", [{ point: c1 }, { point: c2 }]);
  SM.constrain(sk, "fixed", [{ point: c1 }]);
  SM.dimension(sk, [{ point: c1 }, { point: c2 }], 30);
  SM.dimension(sk, [{ curve: A2 }], 6);
  SM.constrain(sk, "equal", [{ curve: A1 }, { curve: A2 }]);
  SM.solve(sk);
  check("every joint is tangent", worstTangent(sk) < 1e-3 && [[L1, A1], [L1, A2], [L2, A1], [L2, A2]].every(([l, a]) => lineArcSmooth(sk, l, a)), String(worstTangent(sk)));
  check("30 mm between centres, both radii 6", Math.abs(dist(sk.points[c1], sk.points[c2]) - 30) < 1e-3
    && Math.abs(radiusOf(sk, sk.curves[A1]) - 6) < 1e-3 && Math.abs(radiusOf(sk, sk.curves[A2]) - 6) < 1e-3,
    `${dist(sk.points[c1], sk.points[c2])} ${radiusOf(sk, sk.curves[A1])} ${radiusOf(sk, sk.curves[A2])}`);
  check("it is one closed profile", SM.profileProblem(sk) === null, SM.profileProblem(sk));
  const m = asModel(sk, 4);
  check("written and read back unchanged", m.roundTrip, m.code);
  const C = sk.points[c1];
  await onEveryKernel("the slot", m.src, hullArea([{ c: C, r: 6 }, { c: [C[0] + 30, C[1]], r: 6 }]) * 4, 0.005);
}

console.log("\nModel 2: a link arm (two different ends, open tangents)\n");
{
  const sk = SM.emptySketch();
  const R1 = 10, R2 = 5, D = 50;
  // big end around (0,0), small end around (50,0), drawn a bit off
  SM.addArc(sk, [50.8, 0.7], [52, -5.5], [51, 5.9]);        // small end, CCW bottom -> top
  SM.addLine(sk, sk.points[2], [-1.5, 9.6], { auto: false });
  SM.addArc(sk, [0, 0], [-1.5, 9.6], [-2.1, -9.4]);          // big end, CCW top -> bottom
  SM.addLine(sk, sk.points[5], sk.points[1], { auto: false });
  for (const [l, a] of [[1, 0], [1, 2], [3, 0], [3, 2]]) SM.constrain(sk, "tangent", [{ curve: l }, { curve: a }]);
  const big = sk.curves[2].ids[0], small = sk.curves[0].ids[0];
  SM.constrain(sk, "fixed", [{ point: big }]);
  SM.constrain(sk, "horizontal", [{ point: big }, { point: small }]);
  SM.dimension(sk, [{ point: big }, { point: small }], D);
  SM.dimension(sk, [{ curve: 2 }], R1);
  SM.dimension(sk, [{ curve: 0 }], R2);
  SM.solve(sk);
  check("all four joints tangent", worstTangent(sk) < 1e-3 && [[1, 0], [1, 2], [3, 0], [3, 2]].every(([l, a]) => lineArcSmooth(sk, l, a)), String(worstTangent(sk)));
  check("sizes held (R10, R5, 50 apart)", Math.abs(radiusOf(sk, sk.curves[2]) - R1) < 1e-3 && Math.abs(radiusOf(sk, sk.curves[0]) - R2) < 1e-3
    && Math.abs(dist(sk.points[big], sk.points[small]) - D) < 1e-3, JSON.stringify(sk.points));
  const m = asModel(sk, 6);
  check("round trip", m.roundTrip);
  await onEveryKernel("the link arm", m.src, hullArea([{ c: [0, 0], r: R1 }, { c: [D, 0], r: R2 }]) * 6, 0.005);
  // a hole in each end: circles inside the arm
  const holes = structuredClone(sk);
  SM.addCircle(holes, holes.points[big], 4);
  SM.addCircle(holes, holes.points[small], 2);
  const mh = asModel(holes, 6);
  await onEveryKernel("…with a hole in each end", mh.src, (hullArea([{ c: [0, 0], r: R1 }, { c: [D, 0], r: R2 }]) - Math.PI * (16 + 4)) * 6, 0.005);
}

console.log("\nModel 3: a teardrop (two lines from a point, tangent to an arc)\n");
{
  const sk = SM.emptySketch();
  const R = 8, H = 22;
  SM.addArc(sk, [0.5, 0.3], [6.5, 5.9], [-6, 6.1]);      // the round end, CCW the long way under
  // that drew the short top arc; draw the long way: start on the left, end on the right
  sk.curves.pop(); sk.points.length = 0;
  SM.addArc(sk, [0.5, 0.3], [-6, 6.1], [6.5, 5.9]);
  SM.addLine(sk, sk.points[2], [0.4, H + 1], { auto: false });
  SM.addLine(sk, sk.points[3], sk.points[1], { auto: false });
  SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.constrain(sk, "tangent", [{ curve: 2 }, { curve: 0 }]);
  const c = sk.curves[0].ids[0], apex = sk.curves[1].ids[1];
  SM.constrain(sk, "fixed", [{ point: c }]);
  SM.constrain(sk, "vertical", [{ point: c }, { point: apex }]);
  SM.dimension(sk, [{ point: c }, { point: apex }], H);
  SM.dimension(sk, [{ curve: 0 }], R);
  SM.solve(sk);
  check("both sides tangent, apex on the axis", worstTangent(sk) < 1e-3 && lineArcSmooth(sk, 1, 0) && lineArcSmooth(sk, 2, 0)
    && Math.abs(sk.points[apex][0] - sk.points[c][0]) < 1e-3, JSON.stringify(sk.points));
  check("H 22 and R 8 held", Math.abs(dist(sk.points[c], sk.points[apex]) - H) < 1e-3 && Math.abs(radiusOf(sk, sk.curves[0]) - R) < 1e-3);
  const m = asModel(sk, 3);
  const C = sk.points[c];
  await onEveryKernel("the teardrop", m.src, hullArea([{ c: C, r: R }, { c: [C[0], C[1] + H] }]) * 3, 0.005);
}

console.log("\nModel 4: the teardrop again, the way a user makes it (circle, two lines, tangent, trim)\n");
{
  const sk = SM.emptySketch();
  const R = 10, H = 30;
  SM.addCircle(sk, [0, 0], R);
  SM.addLine(sk, [0.3, H - 0.4], [-15, -9], { auto: false });     // both lines run on past the circle
  SM.addLine(sk, sk.points[1], [16, -8], { auto: false });
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.constrain(sk, "tangent", [{ curve: 2 }, { curve: 0 }]);
  const apex = sk.curves[1].ids[0];
  SM.constrain(sk, "vertical", [{ point: 0 }, { point: apex }]);
  SM.dimension(sk, [{ point: 0 }, { point: apex }], H);
  SM.solve(sk);
  check("both lines tangent to the circle", worstTangent(sk) < 1e-3, String(worstTangent(sk)));
  const far = (li) => sk.points[sk.curves[li].ids[1]];
  // trim each line's overhang past the circle, then the top of the circle
  check("trim line 1 past its touch point", SM.trim(sk, 1, far(1)) === null && sk.curves.length === 3);
  check("trim line 2 past its touch point", SM.trim(sk, 2, far(2)) === null && sk.curves.length === 3);
  const touch = sk.constraints.filter((c) => c.type === "tangent").map((c) => c.ids[3]);
  check("…each line now ends on its touch point", touch.length === 2 && touch.every((t) => sk.curves.some((c) => c.kind === "line" && c.ids[1] === t)), JSON.stringify(sk.curves));
  check("trim the top of the circle (between the touches)", SM.trim(sk, 0, [0, R]) === null && sk.curves[0].kind === "arc", JSON.stringify(sk.curves[0]));
  check("…the arc ends on both touch points", touch.every((t) => sk.curves[0].ids.includes(t)), JSON.stringify(sk.curves[0]));
  SM.solve(sk);
  check("still tangent, still a closed profile", worstTangent(sk) < 1e-3 && SM.profileProblem(sk) === null, SM.profileProblem(sk));
  check("the joints run on smoothly", lineArcSmooth(sk, 1, 0) && lineArcSmooth(sk, 2, 0));
  const m = asModel(sk, 5);
  check("round trip", m.roundTrip, m.code);
  await onEveryKernel("the trimmed teardrop", m.src, hullArea([{ c: [0, 0], r: R }, { c: [0, H] }]) * 5, 0.005);
  // a radius change afterwards (the arc's radius is its start point now)
  SM.dimension(sk, [{ curve: 0 }], 12);
  SM.solve(sk);
  check("…and a new radius (12) re-solves it, tangent", worstTangent(sk) < 1e-3 && Math.abs(radiusOf(sk, sk.curves[0]) - 12) < 1e-3 && lineArcSmooth(sk, 1, 0) && lineArcSmooth(sk, 2, 0),
    `${worstTangent(sk)} r ${radiusOf(sk, sk.curves[0])}`);
  await onEveryKernel("…built at R12", asModel(sk, 5).src, hullArea([{ c: [0, 0], r: 12 }, { c: [0, H] }]) * 5, 0.005);
}

console.log("\nTrim: lines, arcs and circles\n");
{
  // a circle crossed by one line: trimmed between the two crossings
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], 10);
  SM.addLine(sk, [-20, 5], [20, 5], { auto: false });
  check("trim the cap above a chord: a circle becomes an arc", SM.trim(sk, 0, [0, 10]) === null && sk.curves[0].kind === "arc");
  const [, A, B] = sk.curves[0].ids.map((k) => sk.points[k]);
  check("…counter-clockwise from the left crossing round the bottom to the right one", Math.abs(A[1] - 5) < 1e-6 && A[0] < 0 && Math.abs(B[1] - 5) < 1e-6 && B[0] > 0, JSON.stringify([A, B]));
  SM.trim(sk, 1, [-18, 5]);
  SM.trim(sk, 1, [18, 5]);
  check("trimming the chord's ends leaves a D shape that closes", sk.curves.length === 2 && SM.profileProblem(sk) === null, JSON.stringify(sk.curves) + " " + SM.profileProblem(sk));
  const h = 5, ang = Math.acos(h / 10), area = 100 * (Math.PI - ang) + h * Math.sqrt(100 - h * h);
  await onEveryKernel("the D", asModel(sk, 2).src, area * 2, 0.005);
  // an arc cut in its middle by two lines: two arcs left
  const a = SM.emptySketch();
  SM.addArc(a, [0, 0], [10, 0], [-10, 0.001]);
  SM.addLine(a, [-3, -2], [-3, 20], { auto: false });
  SM.addLine(a, [3, -2], [3, 20], { auto: false });
  check("trim the middle of an arc between two lines: two arcs", SM.trim(a, 0, [0, 10]) === null && a.curves.filter((c) => c.kind === "arc").length === 2);
  check("…both still on the circle", a.curves.filter((c) => c.kind === "arc").every((c) => Math.abs(radiusOf(a, c) - 10) < 1e-6 && Math.abs(dist(a.points[c.ids[2]], a.points[c.ids[0]]) - 10) < 1e-6));
  // a lone circle: deleted, as a lone line is
  const lone = SM.emptySketch();
  SM.addCircle(lone, [0, 0], 4);
  check("a circle with nothing crossing it is deleted", SM.trim(lone, 0, [4, 0]) === null && lone.curves.length === 0);
  // a level line keeps its level when trimmed
  const lv = SM.emptySketch();
  SM.addLine(lv, [0, 0], [30, 0]);
  SM.addLine(lv, [10, -5], [10, 5], { auto: false });
  SM.trim(lv, 0, [25, 0]);
  check("a trimmed level line stays level (its rule moves to the piece)", lv.constraints.some((c) => c.type === "horizontal" && lv.curves.some((k) => k.kind === "line" && k.ids.join() === c.ids.join())), JSON.stringify(lv.constraints));
}

console.log("\nModel 5: a link arm from two whole circles (each line tangent to both), trimmed\n");
{
  const sk = SM.emptySketch();
  const R1 = 12, R2 = 6, D = 40;
  SM.addCircle(sk, [0, 0], R1);
  SM.addCircle(sk, [39, 1], R2);
  SM.addLine(sk, [-6, 13.5], [47, 7.5], { auto: false });
  SM.addLine(sk, [-6, -13], [46, -8], { auto: false });
  const [c1, c2] = [sk.curves[0].ids[0], sk.curves[1].ids[0]];
  SM.constrain(sk, "fixed", [{ point: c1 }]);
  SM.constrain(sk, "horizontal", [{ point: c1 }, { point: c2 }]);
  SM.dimension(sk, [{ point: c1 }, { point: c2 }], D);
  for (const l of [2, 3]) for (const c of [0, 1]) check(`tangent line ${l} / circle ${c}`, SM.constrain(sk, "tangent", [{ curve: l }, { curve: c }]) === null);
  SM.solve(sk);
  check("each line touches both circles", worstTangent(sk) < 1e-3 && Math.abs(dist(sk.points[c1], sk.points[c2]) - D) < 1e-3, String(worstTangent(sk)));
  // trim: both overhangs of both lines, then the inner side of each circle
  const end = (li, k) => sk.points[sk.curves[li].ids[k]];
  for (const [li, k] of [[2, 0], [2, 1], [3, 0], [3, 1]]) {
    const at = end(li, k);
    const ci = sk.curves.findIndex((c) => c.kind === "line" && dist(sk.points[c.ids[0]], at) + dist(sk.points[c.ids[1]], at) > 0 && (dist(sk.points[c.ids[0]], at) < 1e-9 || dist(sk.points[c.ids[1]], at) < 1e-9));
    check(`trim an overhang (${li}, ${k ? "right" : "left"})`, SM.trim(sk, ci, at) === null);
  }
  check("two lines left, touch point to touch point", sk.curves.filter((c) => c.kind === "line").length === 2
    && sk.curves.filter((c) => c.kind === "line").every((c) => c.ids.every((p) => sk.constraints.some((k) => k.type === "tangent" && k.ids[3] === p))), JSON.stringify(sk.curves));
  check("trim the big circle's inner side", SM.trim(sk, 0, [R1, 0]) === null && sk.curves[0].kind === "arc");
  check("trim the small circle's inner side", SM.trim(sk, 1, [D - R2, 0]) === null && sk.curves[1].kind === "arc");
  SM.solve(sk);
  check("closed, tangent, smooth at all four joints", SM.profileProblem(sk) === null && worstTangent(sk) < 1e-3
    && [2, 3].every((l) => [0, 1].every((a) => lineArcSmooth(sk, l, a))), SM.profileProblem(sk));
  const m = asModel(sk, 5);
  check("round trip", m.roundTrip, m.code);
  await onEveryKernel("the trimmed link arm", m.src, hullArea([{ c: [0, 0], r: R1 }, { c: [D, 0], r: R2 }]) * 5, 0.005);
  // and its holes: a circle at each centre
  SM.addCircle(sk, sk.points[c1], 5);
  SM.addCircle(sk, sk.points[c2], 2.5);
  await onEveryKernel("…with its two holes", asModel(sk, 5).src, (hullArea([{ c: [0, 0], r: R1 }, { c: [D, 0], r: R2 }]) - Math.PI * (25 + 6.25)) * 5, 0.005);
}

console.log("\nModel 6: a rounded plate (4 lines, 4 corner arcs, a hole), sized by dims\n");
{
  const W = 60, Hh = 40, r = 5;
  const sk = SM.emptySketch();
  // drawn roughly: the corners' centres a little off, the lines by eye
  const ctr = [[5.3, 4.6], [54.6, 5.2], [55.1, 35.4], [4.7, 34.8]];
  const rough = (c, a) => [c[0] + 5.2 * Math.cos(a), c[1] + 5.2 * Math.sin(a)];
  const Q = Math.PI / 2;
  // bottom, right, top, left lines and the corner arcs between them, CCW
  SM.addArc(sk, ctr[0], rough(ctr[0], 2 * Q), rough(ctr[0], 3 * Q));
  SM.addLine(sk, sk.points[2], rough(ctr[1], 3 * Q));
  SM.addArc(sk, ctr[1], sk.points[3], rough(ctr[1], 0));
  SM.addLine(sk, sk.points[5], rough(ctr[2], 0));
  SM.addArc(sk, ctr[2], sk.points[6], rough(ctr[2], Q));
  SM.addLine(sk, sk.points[8], rough(ctr[3], Q));
  SM.addArc(sk, ctr[3], sk.points[9], rough(ctr[3], 2 * Q));
  SM.addLine(sk, sk.points[11], sk.points[1]);
  check("8 curves, 12 points, the lines made level / plumb", sk.curves.length === 8 && sk.points.length === 12
    && sk.constraints.filter((c) => c.type === "horizontal" || c.type === "vertical").length === 4, JSON.stringify(sk.constraints));
  for (const [l, a] of [[1, 0], [1, 2], [3, 2], [3, 4], [5, 4], [5, 6], [7, 6], [7, 0]]) SM.constrain(sk, "tangent", [{ curve: l }, { curve: a }]);
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.dimension(sk, [{ curve: 0 }], r);
  for (const a of [2, 4, 6]) SM.constrain(sk, "equal", [{ curve: 0 }, { curve: a }]);
  SM.dimension(sk, [{ curve: 1 }], W - 2 * r);
  SM.dimension(sk, [{ curve: 3 }], Hh - 2 * r);
  SM.solve(sk);
  const xs = sk.curves.filter((c) => c.kind === "arc").flatMap((c) => c.ids.slice(1)).map((k) => sk.points[k]);
  const bw = Math.max(...xs.map((p) => p[0])) - Math.min(...xs.map((p) => p[0])), bh = Math.max(...xs.map((p) => p[1])) - Math.min(...xs.map((p) => p[1]));
  check("tangent at all 8 joints", worstTangent(sk) < 1e-3 && [[1, 0], [1, 2], [3, 2], [3, 4], [5, 4], [5, 6], [7, 6], [7, 0]].every(([l, a]) => lineArcSmooth(sk, l, a)), String(worstTangent(sk)));
  check("60 x 40 overall, R5 corners", Math.abs(bw - W) < 1e-2 && Math.abs(bh - Hh) < 1e-2 && [0, 2, 4, 6].every((a) => Math.abs(radiusOf(sk, sk.curves[a]) - r) < 1e-3), `${bw} x ${bh}`);
  const cx = sk.points[0][0] + (W / 2 - r), cy = sk.points[0][1] + (Hh / 2 - r);
  SM.addCircle(sk, [cx, cy], 4);
  const m = asModel(sk, 3);
  check("round trip", m.roundTrip);
  await onEveryKernel("the rounded plate with a hole", m.src, (W * Hh - (4 - Math.PI) * r * r - Math.PI * 16) * 3, 0.005);
}

console.log("\nFinish as a new body keeps a model written without return\n");
{
  const starter = "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),\n)";
  check("the starter model's bare expression becomes a return", SM.returnBare(starter) === "return " + starter);
  check("…after a const too", SM.returnBare("const w = 4;\ncube([w, 2, 2]);") === "const w = 4;\nreturn cube([w, 2, 2]);");
  check("code that already returns is left alone", SM.returnBare("return cube(2);") === null);
  check("…as is code that ends in no expression", SM.returnBare("const a = cube(2);") === null && SM.returnBare("oops(") === null);
}

console.log("\nModel 7 (novel): a keyhole hanger plate (crossing trims, an arc tangent to two plumb lines, a hole with a big arc)\n");
{
  const R = 5, w = 4, L = 15;
  const sk = SM.emptySketch();
  SM.addRect(sk, [-20, -15], [20, 30]);                                  // the plate, 40 x 45
  SM.addCircle(sk, [0.2, -0.3], R);                                       // the round end of the keyhole
  const l1 = SM.addLine(sk, [2.1, -1], [2.2, L + 0.4]);                   // slot sides, drawn into the circle
  const l2 = SM.addLine(sk, [-1.8, -1.2], [-2.1, L + 0.3]);
  check("the slot sides were drawn plumb (auto constraint)", sk.constraints.filter((c) => c.type === "vertical").length === 4);
  const top1 = sk.curves[l1].ids[1], top2 = sk.curves[l2].ids[1];
  const arc = SM.addArc(sk, [0, L], sk.points[top1], sk.points[top2]);   // the slot's round top, from one side's end to the other's
  check("the arc starts and ends on the slot sides' top points", sk.curves[arc].ids[1] === top1 && sk.curves[arc].ids[2] === top2, JSON.stringify(sk.curves[arc]));
  SM.constrain(sk, "tangent", [{ curve: l1 }, { curve: arc }]);
  SM.constrain(sk, "tangent", [{ curve: l2 }, { curve: arc }]);
  const hole = sk.curves[4].ids[0], arcC = sk.curves[arc].ids[0];
  SM.constrain(sk, "fixed", [{ point: hole }]);
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.constrain(sk, "vertical", [{ point: hole }, { point: arcC }]);
  SM.dimension(sk, [{ point: hole }, { point: arcC }], L);
  SM.constrain(sk, "horizontal", [{ point: top1 }, { point: top2 }]);
  SM.dimension(sk, [{ point: top1 }, { point: top2 }], w);
  SM.dimension(sk, [{ curve: 0 }], 40);
  SM.dimension(sk, [{ curve: 1 }], 45);
  SM.solve(sk);
  const P = sk.points, H = P[hole];
  check("slot 4 wide, centred on the hole, its top 15 above", Math.abs(dist(P[top1], P[top2]) - w) < 1e-3 && Math.abs(P[arcC][0] - H[0]) < 1e-3
    && Math.abs(P[arcC][1] - H[1] - L) < 1e-3 && Math.abs(P[top1][0] - P[sk.curves[l1].ids[0]][0]) < 1e-6, JSON.stringify(P));
  check("the top arc is tangent to both sides", worstTangent(sk) < 1e-3 && lineArcSmooth(sk, l1, arc) && lineArcSmooth(sk, l2, arc), String(worstTangent(sk)));
  // trim: the sides' stubs inside the circle, then the circle between the sides
  const stub = (li) => sk.points[sk.curves[li].ids[0]];
  check("trim the first side's stub inside the circle", SM.trim(sk, l1, stub(l1)) === null);
  const l2now = sk.curves.findIndex((c) => c.kind === "line" && c.ids.includes(top2));
  check("trim the second side's stub", SM.trim(sk, l2now, stub(l2now)) === null);
  const ci = sk.curves.findIndex((c) => c.kind === "circle");
  check("trim the circle between the slot sides", SM.trim(sk, ci, [H[0], H[1] + R]) === null && sk.curves.filter((c) => c.kind === "arc").length === 2, JSON.stringify(sk.curves));
  SM.solve(sk);
  check("the keyhole closes, inside the plate", SM.profileProblem(sk) === null && worstTangent(sk) < 1e-3, SM.profileProblem(sk));
  const half = (a, x) => (x * Math.sqrt(a * a - x * x) + a * a * Math.asin(x / a)) / 2;
  const keyhole = Math.PI * R * R + (2 * w / 2 * L - (half(R, w / 2) - half(R, -w / 2))) + Math.PI * (w / 2) ** 2 / 2;
  const m = asModel(sk, 4);
  check("round trip", m.roundTrip, m.code);
  await onEveryKernel("the keyhole plate", m.src, (40 * 45 - keyhole) * 4, 0.005);
  // the slot made wider from its dim: re-solves, still tangent, still builds
  sk.dims.find((d) => d.value === w).value = 6;
  SM.solve(sk);
  const kw = Math.PI * R * R + (6 * L - (half(R, 3) - half(R, -3))) + Math.PI * 9 / 2;
  check("…a 6 mm slot re-solves tangent", worstTangent(sk) < 1e-3 && SM.profileProblem(sk) === null, String(worstTangent(sk)));
  await onEveryKernel("…and builds at 6 mm", asModel(sk, 4).src, (40 * 45 - kw) * 4, 0.005);
}

console.log("\nTrim keeps the size it was given\n");
{
  // a circle's radius (a number, or a named param) is a dim once it is an arc
  const src = "const holeR = 6;\nconst s1 = sketch({ on: \"XY\", points: [[0, 0], [-20, 3], [20, 3]], curves: [[\"circle\", 0, holeR], [\"line\", 1, 2]] });\nreturn linearExtrude({ h: 2 }, s1);";
  const sk = SM.readSketch(src, codemap.parseCode(src).calls.find((c) => c.name === "sketch"));
  SM.trim(sk, 0, [0, 6]);
  const d = sk.dims.find((x) => x.type === "distance" && x.ids[0] === 0);
  check("a trimmed circle's radius becomes a dim, by the same name", d && d.value === 6 && d.name === "holeR", JSON.stringify(sk.dims));
  check("…written as that name", /\["distance", 0, \d+, holeR\]/.test(SM.sketchCode(sk)), SM.sketchCode(sk));
  // an arc's radius dim on the end that is trimmed away moves to the other end
  const a = SM.emptySketch();
  SM.addArc(a, [0, 0], [10, 0], [-10, 0.001]);
  SM.dimension(a, [{ curve: 0 }], 10);
  SM.addLine(a, [5, -2], [5, 20], { auto: false });
  SM.trim(a, 0, [9.9, 1]);
  check("trimming off an arc's start keeps its radius dim", a.dims.length === 1 && a.dims[0].value === 10 && a.curves[0].ids.includes(a.dims[0].ids[1]), JSON.stringify({ c: a.curves, d: a.dims }));
}

console.log("\nA rule that cannot be met is said, not reported as added\n");
{
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], 10);
  SM.addLine(sk, [-20, 14], [20, 17], { auto: false });
  SM.constrain(sk, "fixed", [{ point: 0 }, { point: 1 }, { point: 2 }]);
  SM.constrain(sk, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(sk);
  const bad = SM.unmet(sk);
  check("a tangent between a fixed line and a fixed circle that miss is reported unmet", bad.length === 1 && bad[0].type === "tangent", JSON.stringify(bad));
  // the same with the centre free: met, nothing reported
  const ok = SM.emptySketch();
  SM.addCircle(ok, [0, 0], 10);
  SM.addLine(ok, [-20, 14], [20, 17], { auto: false });
  SM.constrain(ok, "fixed", [{ point: 1 }, { point: 2 }]);
  SM.constrain(ok, "tangent", [{ curve: 1 }, { curve: 0 }]);
  SM.solve(ok);
  check("…free to move, the circle comes to the line and nothing is unmet", SM.unmet(ok).length === 0 && tangentGap(ok, 1, 0) < 1e-3, JSON.stringify(SM.unmet(ok)));
  // a rectangle with a dim and a fixed corner (the everyday case) is all met
  const r = SM.emptySketch();
  SM.addRect(r, [0, 0], [30, 20]);
  SM.dimension(r, [{ curve: 0 }], 42);
  SM.constrain(r, "fixed", [{ point: 0 }]);
  SM.solve(r);
  check("an ordinary dimensioned rectangle reports nothing unmet", SM.unmet(r).length === 0, JSON.stringify(SM.unmet(r)));
}

console.log("\nModel 8 (novel): a revolved knob (a rounded top edge: an arc tangent to a plumb side and a level top)\n");
{
  const R = 15, h1 = 10, rf = 4;
  const sk = SM.emptySketch();
  // drawn by eye: up the axis, across the bottom, up the side, round the corner, back along the top
  const bottom = SM.addLine(sk, [0, 0], [R + 0.3, 0.2]);
  const side = SM.addLine(sk, sk.points[1], [R + 0.1, h1 - 0.4]);
  const corner = SM.addArc(sk, [R - rf - 0.2, h1 - 0.3], sk.points[2], [R - rf + 0.3, h1 + rf + 0.2]);
  const top = SM.addLine(sk, sk.points[sk.curves[corner].ids[2]], [0.1, h1 + rf - 0.1]);
  const axis = SM.addLine(sk, sk.points[sk.curves[top].ids[1]], sk.points[0]);
  check("5 curves; bottom and top level, side and axis plumb", sk.curves.length === 5
    && ["horizontal", "vertical"].every((t) => sk.constraints.filter((c) => c.type === t).length === 2), JSON.stringify(sk.constraints));
  SM.constrain(sk, "tangent", [{ curve: side }, { curve: corner }]);
  SM.constrain(sk, "tangent", [{ curve: top }, { curve: corner }]);
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.dimension(sk, [{ curve: bottom }], R);
  SM.dimension(sk, [{ curve: side }], h1);
  SM.dimension(sk, [{ curve: corner }], rf);
  SM.solve(sk);
  check("the corner arc runs on smoothly into the side and the top", worstTangent(sk) < 1e-3 && lineArcSmooth(sk, side, corner) && lineArcSmooth(sk, top, corner), String(worstTangent(sk)));
  check("R15 x 10 side, R4 corner", Math.abs(dist(...sk.curves[bottom].ids.map((k) => sk.points[k])) - R) < 1e-3
    && Math.abs(radiusOf(sk, sk.curves[corner]) - rf) < 1e-3, JSON.stringify(sk.points));
  check("closed", SM.profileProblem(sk) === null, SM.profileProblem(sk));
  const code = SM.sketchCode(sk);
  const c = SM.compact(sk);
  const ax = c.curves[axis].ids;
  const src = `const s1 = ${code};\nreturn revolve({ angle: 360, axis: [${ax.join(", ")}] }, s1);`;
  // Pappus: the cylinder, the disc under the top, and the quarter round
  const want = Math.PI * R * R * h1 + Math.PI * (R - rf) ** 2 * rf + (Math.PI * rf * rf / 4) * 2 * Math.PI * ((R - rf) + 4 * rf / (3 * Math.PI));
  await onEveryKernel("the knob, revolved about its own axis edge", src, want, 0.005);
}

console.log("\nTangent: two circles or arcs\n");
{
  // outside each other
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], 10);
  SM.addCircle(sk, [25, 3], 6);
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  check("two circles can be made tangent", SM.constrain(sk, "tangent", [{ curve: 0 }, { curve: 1 }]) === null && sk.constraints.some((c) => c.type === "tangentArcs"));
  SM.solve(sk);
  const d = dist(sk.points[0], sk.points[1]);
  check("…they touch from outside (centres 16 apart)", Math.abs(d - 16) < 1e-3 && SM.unmet(sk).length === 0, String(d));
  // one inside the other
  const inn = SM.emptySketch();
  SM.addCircle(inn, [0, 0], 10);
  SM.addCircle(inn, [2, 1], 4);
  SM.constrain(inn, "fixed", [{ point: 0 }]);
  SM.constrain(inn, "tangent", [{ curve: 0 }, { curve: 1 }]);
  SM.solve(inn);
  check("a small circle inside a big one touches it from inside (centres 6 apart)", Math.abs(dist(inn.points[0], inn.points[1]) - 6) < 1e-3, String(dist(inn.points[0], inn.points[1])));
  // two arcs that share an end run on smoothly
  const s2 = SM.emptySketch();
  SM.addArc(s2, [0, 0], [10, 0], [0, 10]);
  SM.addArc(s2, [0, 16], [0.5, 10], [-6, 16]);
  const shared = s2.points.findIndex((p) => dist(p, [0, 10]) < 1e-9);
  s2.curves[1].ids[1] = shared;                       // drawn from the first arc's end
  SM.constrain(s2, "tangent", [{ curve: 0 }, { curve: 1 }]);
  SM.solve(s2);
  const [c1, c2, p] = s2.constraints.find((c) => c.type === "tangentArcs").ids;
  const cr = (s2.points[c2][0] - s2.points[c1][0]) * (s2.points[p][1] - s2.points[c1][1]) - (s2.points[c2][1] - s2.points[c1][1]) * (s2.points[p][0] - s2.points[c1][0]);
  check("two arcs from a shared end: the end is the touch point, centres in line with it", p === shared && Math.abs(cr) < 1e-2, `${p} ${cr}`);
  check("same centre: refused, said", (() => { const z = SM.emptySketch(); SM.addCircle(z, [0, 0], 3); SM.addCircle(z, [0, 0], 5); return /share a centre/.test(SM.constrain(z, "tangent", [{ curve: 0 }, { curve: 1 }])); })());
  check("in code: [\"tangentArcs\", A, B, p] solves too", (() => {
    const s = dsl.sketch({ points: [[0, 0], [20, 0], [10, 0]], curves: [["circle", 0, 8], ["circle", 1, 5, "construction"]], constraints: [["fixed", 0], ["tangentArcs", 0, 1, 2]] });
    return Math.abs(dist(s.sketch.points[0], s.sketch.points[1]) - 13) < 1e-3;
  })());
}

console.log("\nModel 9 (novel): a bone link (two ends joined by concave fillets tangent to both), from whole circles\n");
{
  const R1 = 12, R2 = 6, D = 30, Rf = 20;
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], R1);
  SM.addCircle(sk, [D + 0.7, -0.4], R2);
  SM.addCircle(sk, [21, 23], Rf);       // the fillets, drawn roughly where they go
  SM.addCircle(sk, [20, -25], Rf);
  const [c1, c2] = [0, 1].map((i) => sk.curves[i].ids[0]);
  SM.constrain(sk, "fixed", [{ point: c1 }]);
  SM.constrain(sk, "horizontal", [{ point: c1 }, { point: c2 }]);
  SM.dimension(sk, [{ point: c1 }, { point: c2 }], D);
  for (const f of [2, 3]) for (const e of [0, 1]) check(`fillet ${f} tangent to end ${e}`, SM.constrain(sk, "tangent", [{ curve: f }, { curve: e }]) === null);
  SM.solve(sk);
  const F = [2, 3].map((f) => sk.points[sk.curves[f].ids[0]]);
  check("each fillet touches both ends from outside", SM.unmet(sk).length === 0
    && F.every((p) => Math.abs(dist(p, sk.points[c1]) - (R1 + Rf)) < 1e-3 && Math.abs(dist(p, sk.points[c2]) - (R2 + Rf)) < 1e-3), JSON.stringify(sk.points));
  // trim: the ends' inner sides, the fillets' outer parts
  const C1 = sk.points[c1], C2 = sk.points[c2];
  check("trim the big end's inner side", SM.trim(sk, 0, [C1[0] + R1, C1[1]]) === null && sk.curves[0].kind === "arc");
  check("trim the small end's inner side", SM.trim(sk, 1, [C2[0] - R2, C2[1]]) === null && sk.curves[1].kind === "arc");
  for (const f of [2, 3]) {
    const c = sk.points[sk.curves[f].ids[0]];
    check(`trim fillet ${f}'s far side`, SM.trim(sk, f, [c[0], c[1] + (c[1] > 0 ? Rf : -Rf)]) === null && sk.curves[f].kind === "arc", JSON.stringify(sk.curves[f]));
  }
  SM.solve(sk);
  check("a closed outline of four arcs, every rule met", sk.curves.length === 4 && sk.curves.every((c) => c.kind === "arc") && SM.profileProblem(sk) === null && SM.unmet(sk).length === 0,
    `${SM.profileProblem(sk)} ${JSON.stringify(SM.unmet(sk))}`);
  // the area, counted on a grid from the intended shape: either end's disc,
  // or the web between the four touch points less the two fillet discs
  const Fx = (D * D + (R1 + Rf) ** 2 - (R2 + Rf) ** 2) / (2 * D), Fy = Math.sqrt((R1 + Rf) ** 2 - Fx * Fx);
  const T = (cx, r, sgn) => [cx + (Fx - cx) * r / Math.hypot(Fx - cx, Fy), sgn * Fy * r / Math.hypot(Fx - cx, Fy)];
  const web = [T(0, R1, 1), T(D, R2, 1), T(D, R2, -1), T(0, R1, -1)];
  const inPoly = (x, y) => { let k = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, yi] = web[i], [xj, yj] = web[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) k = !k; } return k; };
  let n = 0;
  const h = 0.02;
  for (let x = -R1; x <= D + R2; x += h) for (let y = -R1; y <= R1; y += h) {
    if (x * x + y * y <= R1 * R1 || (x - D) ** 2 + y * y <= R2 * R2) { n++; continue; }
    if (inPoly(x, y) && (x - Fx) ** 2 + (y - Fy) ** 2 > Rf * Rf && (x - Fx) ** 2 + (y + Fy) ** 2 > Rf * Rf) n++;
  }
  const area = n * h * h;
  const m = asModel(sk, 5);
  check("round trip", m.roundTrip, m.code);
  await onEveryKernel("the bone link", m.src, area * 5, 0.005);
}

console.log("\nOffset: outlines with arcs (a slot wall, a teardrop gasket, a keyhole rim)\n");
{
  // a slot R6, 30 between centres, drawn the way Model 1 is
  const slot = () => {
    const sk = SM.emptySketch();
    SM.addArc(sk, [30, 0], [30, -6], [30, 6]);
    SM.addLine(sk, sk.points[2], [0, 6], { auto: false });
    SM.addArc(sk, [0, 0], [0, 6], [0, -6]);
    SM.addLine(sk, sk.points[5], sk.points[1], { auto: false });
    return sk;
  };
  const area = (r) => 30 * 2 * r + Math.PI * r * r;
  const out = slot();
  check("offset a slot 2 mm outward", SM.offset(out, 1, 2) === null && out.curves.length === 8, JSON.stringify(out.curves.slice(4)));
  const outer = { ...out, curves: out.curves.slice(4) };
  check("…an R8 slot, tangent at its joints, closed", outer.curves.filter((c) => c.kind === "arc").every((c) => Math.abs(radiusOf(out, c) - 8) < 1e-6)
    && SM.profileProblem({ ...out, curves: out.curves.slice(4) }) === null);
  check("…and the two together make a ring (the old slot is its hole)", SM.profileProblem(out) === null);
  await onEveryKernel("the slot wall, 2 mm thick", asModel(out, 3).src, (area(8) - area(6)) * 3, 0.005);
  const inn = slot();
  check("offset it 2 mm inward: R4", SM.offset(inn, 0, -2) === null && inn.curves.slice(4).filter((c) => c.kind === "arc").every((c) => Math.abs(radiusOf(inn, c) - 4) < 1e-6));
  await onEveryKernel("…the inner wall", asModel(inn, 3).src, (area(6) - area(4)) * 3, 0.005);
  check("too far inward (an arc would vanish) is refused, said", /would vanish/.test(SM.offset(slot(), 0, -7)));
}
{
  // the trimmed teardrop (Model 4's steps), offset outward 1.5
  const sk = SM.emptySketch();
  const R = 10, H = 30, d = 1.5;
  SM.addCircle(sk, [0, 0], R);
  SM.addLine(sk, [0.3, H - 0.4], [-15, -9], { auto: false });
  SM.addLine(sk, sk.points[1], [16, -8], { auto: false });
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  for (const l of [1, 2]) SM.constrain(sk, "tangent", [{ curve: l }, { curve: 0 }]);
  const apex = sk.curves[1].ids[0];
  SM.constrain(sk, "vertical", [{ point: 0 }, { point: apex }]);
  SM.dimension(sk, [{ point: 0 }, { point: apex }], H);
  SM.solve(sk);
  for (const l of [1, 2]) SM.trim(sk, l, sk.points[sk.curves[l].ids[1]]);
  SM.trim(sk, 0, [0, R]);
  SM.solve(sk);
  const before = sk.curves.length;
  check("offset the teardrop 1.5 mm outward", SM.offset(sk, 1, d) === null && sk.curves.length === before + 3, JSON.stringify(sk.curves));
  // the offset of a teardrop: its arc R11.5 about the same centre, and the
  // apex moved out along the axis by d / sin(half angle)
  const half = Math.asin(R / H), apex2 = [0, H + d / Math.sin(half)];
  const want = hullArea([{ c: [0, 0], r: R + d }, { c: apex2 }]) - hullArea([{ c: [0, 0], r: R }, { c: [0, H] }]);
  check("…its new apex is d / sin(half angle) further out", sk.points.some((p) => dist(p, apex2) < 1e-3), JSON.stringify(sk.points));
  await onEveryKernel("the teardrop gasket", asModel(sk, 2).src, want * 2, 0.005);
}

console.log("\nThe user's report: lines drawn first, a circle, shift-pick both, Tangent\n");
{
  // 1. a rectangle drawn line by line (auto level / plumb), a circle beside it;
  //    the circle and the right-hand side made tangent (circle picked first)
  const sk = SM.emptySketch();
  const chain = [[0, 0], [30, 0], [30, 20], [0, 20]];
  for (let i = 0; i < 4; i++) SM.addLine(sk, chain[i], chain[(i + 1) % 4]);
  SM.addCircle(sk, [45, 10], 8);
  const right = 1, circle = 4;
  check("(the drawn rectangle got its level / plumb rules)", sk.constraints.filter((c) => c.type === "horizontal" || c.type === "vertical").length === 4);
  const r = SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: circle }, { curve: right }]));
  check("circle + the right side, Tangent: added (no AI needed, nothing refused)", r.ok === true, JSON.stringify(r));
  check("…the side touches the circle and stays plumb; the rectangle stays closed",
    tangentGap(sk, right, circle) < 1e-3 && Math.abs(sk.points[1][0] - sk.points[2][0]) < 1e-6 && SM.profileProblem(sk) === null, JSON.stringify(sk.points));
  // the other way round: the line picked first
  const sk2 = SM.emptySketch();
  for (let i = 0; i < 4; i++) SM.addLine(sk2, chain[i], chain[(i + 1) % 4]);
  SM.addCircle(sk2, [45, 10], 8);
  check("…and the same with the line picked first", SM.attempt(sk2, (k) => SM.constrain(k, "tangent", [{ curve: 1 }, { curve: 4 }])).ok && tangentGap(sk2, 1, 4) < 1e-3);
  // "these lines": the top and the bottom too, so the circle sits in the corner
  // and then is held by three sides
  const both = SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: circle }, { curve: 0 }]));
  check("a second line (the bottom) tangent to the same circle as well", both.ok && tangentGap(sk, 0, circle) < 1e-3 && tangentGap(sk, right, circle) < 1e-3, JSON.stringify(both));
}
{
  // 2. an open U of lines with a circle at its mouth: both long lines tangent,
  //    then the circle trimmed to a round end (a slot end drawn the classic way)
  const sk = SM.emptySketch();
  SM.addLine(sk, [30, 8.5], [0, 8.5]);
  SM.addLine(sk, [0, 8.5], [0, -8.5]);
  SM.addLine(sk, [0, -8.5], [30, -8.5]);
  SM.addCircle(sk, [31, 0.5], 8);
  SM.constrain(sk, "fixed", [{ point: 1 }]);
  SM.dimension(sk, [{ curve: 1 }], 16);
  for (const l of [0, 2]) check(`line ${l} tangent to the circle`, SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: l }, { curve: 3 }])).ok);
  check("both touch it", tangentGap(sk, 0, 3) < 1e-3 && tangentGap(sk, 2, 3) < 1e-3, JSON.stringify(sk.points));
  const C = sk.points[sk.curves[3].ids[0]];
  check("trim the circle's inner side", SM.trim(sk, 3, [C[0] - 8, C[1]]) === null && sk.curves[3].kind === "arc");
  // the lines' open ends now end on the arc only if they reach the touch points;
  // trim each line's overhang past its touch (if any) so the outline closes
  for (const l of [0, 2]) {
    const far = sk.points[sk.curves[l].ids[l === 0 ? 0 : 1]];
    if (dist(far, C) > 8 + 1e-3 && far[0] > C[0]) SM.trim(sk, l, far);
  }
  SM.solve(sk);
  const p = SM.profileProblem(sk);
  check("a closed U with a round end", p === null, p + " " + JSON.stringify(sk.curves));
  const len = Math.abs(sk.points[sk.curves[3].ids[0]][0] - sk.points[1][0]);
  await onEveryKernel("…built: a 16-wide bar with one round end", asModel(sk, 4).src, (16 * len + Math.PI * 64 / 2) * 4, 0.005);
}
{
  // 3. the same ask when the sketch cannot give way: refused, and why
  const sk = SM.emptySketch();
  for (const [a, b] of [[[0, 0], [30, 0]], [[30, 0], [30, 20]], [[30, 20], [0, 20]], [[0, 20], [0, 0]]]) SM.addLine(sk, a, b);
  SM.addCircle(sk, [45, 10], 8);
  SM.constrain(sk, "fixed", [{ point: 0 }, { point: 4 }]);
  SM.dimension(sk, [{ curve: 0 }], 30);
  SM.dimension(sk, [{ curve: 1 }], 20);
  SM.solve(sk);
  const r = SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: 4 }, { curve: 1 }]));
  check("a fully held rectangle and a fixed circle 7 mm off: Tangent is refused, not silently ignored", r.ok === false && !sk.constraints.some((c) => c.type === "tangent"));
  check("…and the rules that stop it are named (the circle's Fixed, the width)", r.culprits.some((c) => c.type === "fixed") && r.culprits.some((c) => c.kind === "dim"), JSON.stringify(r.culprits));
  SM.applyWithout(sk, r.changed, r.culprits.find((c) => c.kind === "dim"));
  check("…dropping the width (one click) makes it tangent", tangentGap(sk, 1, 4) < 1e-3 && SM.unmet(sk).length === 0);
}

console.log("\nSplines: tangent at an end, trim, fitted offset\n");
// the unit direction a spline leaves its end with, and the curve's there
const leaves = (sk, S, end) => {
  const P = sk.points, [a, h] = S.ids[0] === end ? [S.ids[0], S.ids[1]] : [S.ids[3], S.ids[2]];
  const v = [P[h][0] - P[a][0], P[h][1] - P[a][1]], l = Math.hypot(...v);
  return [v[0] / l, v[1] / l];
};
const area2 = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
// the sketch's own outline, sampled densely (lines, arcs, Beziers): to check the kernels build what it says
function outlineArea(sk) {
  const P = sk.points, pts = [];
  const loop = []; const used = new Set();
  const ends = (c) => (c.kind === "line" ? c.ids : c.kind === "arc" ? [c.ids[1], c.ids[2]] : [c.ids[0], c.ids[3]]);
  let i = sk.curves.findIndex((c) => !c.construction && c.kind !== "circle"), from = ends(sk.curves[i])[0];
  while (i >= 0 && !used.has(i)) {
    used.add(i);
    const c = sk.curves[i], [e0, e1] = ends(c), fwd = e0 === from;
    const samp = [];
    if (c.kind === "line") samp.push(P[c.ids[0]], P[c.ids[1]]);
    else if (c.kind === "arc") {
      const C = P[c.ids[0]], r = radiusOf(sk, c), s = Math.atan2(P[c.ids[1]][1] - C[1], P[c.ids[1]][0] - C[0]);
      let w = Math.atan2(P[c.ids[2]][1] - C[1], P[c.ids[2]][0] - C[0]) - s; while (w <= 0) w += 2 * Math.PI;
      for (let k = 0; k <= 400; k++) samp.push([C[0] + r * Math.cos(s + w * k / 400), C[1] + r * Math.sin(s + w * k / 400)]);
    } else for (let k = 0; k <= 400; k++) samp.push(SM.bezAt(c.ids.map((x) => P[x]), k / 400));
    pts.push(...(fwd ? samp : samp.reverse()).slice(0, -1));
    from = fwd ? e1 : e0;
    i = sk.curves.findIndex((k, j) => !used.has(j) && !k.construction && k.kind !== "circle" && ends(k).includes(from));
  }
  return area2(pts);
}
{
  // a spline drawn on from an arc's end: Tangent makes it leave square to the radius
  const sk = SM.emptySketch();
  SM.addArc(sk, [0, 0], [10, 0], [0, 10]);
  SM.addSpline(sk, [[0, 10], [-8, 18], [-20, 14]]);
  check("spline + arc (sharing an end): Tangent added", SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: 1 }, { curve: 0 }])).ok);
  const e = sk.points[2], C = sk.points[0], u = leaves(sk, sk.curves[1], 2);
  check("…the spline leaves the arc's end square to the radius (smooth)", Math.abs(u[0] * (e[0] - C[0]) + u[1] * (e[1] - C[1])) / dist(e, C) < 1e-4, JSON.stringify(u));
  // a spline ending ON a circle's rim (no shared point): tangent there, and kept on the rim
  const rim = SM.emptySketch();
  SM.addCircle(rim, [0, 0], 10);
  SM.addSpline(rim, [[10, 0], [16, 8], [26, 6]]);
  check("spline ending on a circle's rim: Tangent added", SM.attempt(rim, (k) => SM.constrain(k, "tangent", [{ curve: 0 }, { curve: 1 }])).ok);
  const e2 = rim.points[rim.curves[1].ids[0]], u2 = leaves(rim, rim.curves[1], rim.curves[1].ids[0]), c2 = rim.points[0];
  check("…its end stays on the rim and leaves along the circle", Math.abs(dist(e2, c2) - 10) < 1e-3 && Math.abs(u2[0] * (e2[0] - c2[0]) + u2[1] * (e2[1] - c2[1])) / 10 < 1e-3, JSON.stringify([e2, u2, c2]));
  // a spline on from a line's end, and from another spline's end
  const ln = SM.emptySketch();
  SM.addLine(ln, [0, 0], [20, 0]);
  SM.addSpline(ln, [[20, 0], [30, 8], [40, 4]]);
  check("spline + line: Tangent added, the spline leaves level", SM.attempt(ln, (k) => SM.constrain(k, "tangent", [{ curve: 0 }, { curve: 1 }])).ok && Math.abs(leaves(ln, ln.curves[1], 1)[1]) < 1e-4);
  const two = SM.emptySketch();
  SM.addSpline(two, [[0, 0], [10, 8], [20, 0]]);
  SM.addSpline(two, [[20, 0], [24, 10], [34, 6]]);
  const s1 = two.curves[1], s2 = two.curves[2];
  check("spline + spline (sharing an end): Tangent added", SM.attempt(two, (k) => SM.constrain(k, "tangent", [{ curve: 1 }, { curve: 2 }])).ok);
  const a1 = leaves(two, s1, s1.ids[3]), a2 = leaves(two, s2, s2.ids[0]);
  check("…they run on smoothly (the two handles in line, either side)", Math.abs(a1[0] * a2[1] - a1[1] * a2[0]) < 1e-4 && a1[0] * a2[0] + a1[1] * a2[1] < 0, JSON.stringify([a1, a2]));
  const far = SM.emptySketch();
  SM.addCircle(far, [0, 0], 5);
  SM.addSpline(far, [[20, 0], [30, 8], [40, 4]]);
  check("a spline that doesn't reach the curve: refused, saying how", /start or end it on that curve/.test(SM.constrain(far, "tangent", [{ curve: 0 }, { curve: 1 }])));
}
{
  // trim: a spline cut by a line keeps exactly its shape (split, not refitted)
  const sk = SM.emptySketch();
  SM.addSpline(sk, [[0, 0], [10, 10], [20, 0]]);
  const B0 = sk.curves[0].ids.map((k) => [...sk.points[k]]);
  SM.addLine(sk, [5, -5], [5, 20], { auto: false });
  check("trim a spline's end off at a crossing line", SM.trim(sk, 0, [1, 1]) === null && sk.curves.filter((c) => c.kind === "bezier").length === 2);
  const piece = sk.curves.find((c) => c.kind === "bezier" && Math.abs(sk.points[c.ids[0]][0] - 5) < 1e-3);
  const Q = piece.ids.map((k) => sk.points[k]);
  const worst = Math.max(...Array.from({ length: 21 }, (_, i) => { const p = SM.bezAt(Q, i / 20); return Math.min(...Array.from({ length: 2001 }, (_, j) => dist(p, SM.bezAt(B0, j / 2000)))); }));
  check("…the piece left starts on the line and lies on the old curve (< 0.01 mm)", piece && worst < 0.01, String(worst));
  // a lone spline: deleted, like a lone line
  const lone = SM.emptySketch();
  SM.addSpline(lone, [[0, 0], [5, 5], [10, 0]]);
  SM.trim(lone, 0, [5, 4]);
  check("a spline with nothing crossing it is deleted", lone.curves.length === 1, JSON.stringify(lone.curves));
}
{
  // offset: a closed spline blob, 2 mm out; every fitted piece within 0.01 mm
  // of the true offset (each sample's distance to the blob, less 2)
  const sk = SM.emptySketch();
  SM.addSpline(sk, [[0, 0], [20, -2], [24, 14], [6, 18]], { closed: true });
  const orig = sk.curves.map((c) => c.ids.map((k) => [...sk.points[k]]));
  check("offset a closed spline 2 mm outward", SM.offset(sk, 0, 2) === null && SM.profileProblem(sk) === null, SM.profileProblem(sk));
  const fits = sk.curves.slice(orig.length).map((c) => c.ids.map((k) => sk.points[k]));
  const truthPts = orig.flatMap((B) => Array.from({ length: 400 }, (_, i) => SM.bezAt(B, i / 400)));
  const worst = Math.max(...fits.flatMap((Q) => Array.from({ length: 21 }, (_, i) => Math.abs(Math.min(...truthPts.map((q) => dist(SM.bezAt(Q, i / 20), q))) - 2))));
  check(`…${fits.length} fitted pieces, each within 0.02 mm of 2 mm off the blob (0.01 fit + sampling)`, worst < 0.02, String(worst));
  await onEveryKernel("the blob's 2 mm wall", asModel(sk, 3).src, (outlineArea({ ...sk, curves: sk.curves.slice(orig.length) }) - outlineArea({ ...sk, curves: sk.curves.slice(0, orig.length) })) * 3, 0.005);
}

console.log("\nModel 10 (novel): a cam (an arc and two spline flanks running smoothly off it to a nose)\n");
{
  const sk = SM.emptySketch();
  const R = 10;
  SM.addArc(sk, [0, 0], [7.07, 7.07], [-7.07, 7.07]);          // the back of the cam, round the bottom... drawn the short way first
  sk.curves.pop(); sk.points.length = 0;
  SM.addArc(sk, [0, 0], [-7.07, 7.07], [7.07, 7.07]);           // the long way: left top, round the bottom, to right top
  SM.addSpline(sk, [[7.07, 7.07], [6, 16], [0.4, 24]]);          // right flank up to the nose
  const nose = sk.curves[sk.curves.length - 1].ids[3];
  SM.addSpline(sk, [sk.points[nose], [-6, 16], [-7.07, 7.07]]);  // left flank back down
  check("an arc and two flanks: one closed outline", SM.profileProblem(sk) === null, SM.profileProblem(sk));
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.dimension(sk, [{ curve: 0 }], R);
  // (a spline through 3 points is 2 Bezier pieces: the flanks touch the arc with pieces 1 and 4)
  for (const f of [1, 4]) check(`flank piece ${f} tangent to the arc`, SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: f }, { curve: 0 }])).ok);
  const C = sk.points[0];
  const smooth = (S, end) => { const u = leaves(sk, S, end), e = sk.points[end]; return Math.abs(u[0] * (e[0] - C[0]) + u[1] * (e[1] - C[1])) / dist(e, C) < 1e-4; };
  check("both flanks leave the arc smoothly", smooth(sk.curves[1], sk.curves[0].ids[2]) && smooth(sk.curves[4], sk.curves[0].ids[1]));
  // no cusp: at the arc's end (CCW) the flank goes on CCW; at its start it leaves the other way
  const onward = (S, end, sgn) => { const u = leaves(sk, S, end), e = sk.points[end], r = dist(e, C); return (u[0] * -(e[1] - C[1]) + u[1] * (e[0] - C[0])) / r * sgn > 0.999; };
  check("…and on the way the arc runs (no cusp)", onward(sk.curves[1], sk.curves[0].ids[2], 1) && onward(sk.curves[4], sk.curves[0].ids[1], -1));
  check("every rule met, still closed", SM.unmet(sk).length === 0 && SM.profileProblem(sk) === null);
  const m = asModel(sk, 6);
  check("round trip", m.roundTrip, m.code);
  await onEveryKernel("the cam (area of its own outline, sampled)", m.src, outlineArea(sk) * 6, 0.005);
  // and its 1.5 mm outer wall, from offset
  const wall = SM.cloneSketch(sk);
  check("offset the cam 1.5 mm out (arc + fitted spline flanks)", SM.offset(wall, 0, 1.5) === null && SM.profileProblem(wall) === null, SM.profileProblem(wall));
  const n0 = sk.curves.length;
  await onEveryKernel("…the cam's wall", asModel(wall, 6).src, (outlineArea({ ...wall, curves: wall.curves.slice(n0) }) - outlineArea(sk)) * 6, 0.005);
}

console.log("\nHow constrained (blue / white, the count) and refusing a rule that fights\n");
{
  const r = SM.emptySketch();
  SM.addRect(r, [0, 0], [30, 20]);
  check("a bare rectangle has 4 left to lock (its corner x, y, width, height)", SM.analyse(r).dof === 4);
  SM.constrain(r, "fixed", [{ point: 0 }]);
  SM.dimension(r, [{ curve: 0 }], 30);
  const a = SM.analyse(r);
  check("…fixed corner + width: 1 left; only the bottom (fixed, measured) line is locked", a.dof === 1 && a.curveLocked.join() === "true,false,false,false", JSON.stringify(a));
  SM.dimension(r, [{ curve: 1 }], 20);
  SM.solve(r);
  check("…+ height: fully defined, every line locked", SM.analyse(r).dof === 0 && SM.analyse(r).curveLocked.every(Boolean));
  const free = SM.emptySketch();
  SM.addCircle(free, [0, 0], 5);
  check("a lone circle (its radius is its number) has 2 left: where it is", SM.analyse(free).dof === 2);
  const t = SM.emptySketch();
  SM.addCircle(t, [0, 0], 10);
  SM.addLine(t, [-20, 14], [20, 14]);
  SM.constrain(t, "fixed", [{ point: 1 }, { point: 2 }]);
  check("(tangent to a fixed level line: added)", SM.attempt(t, (k) => SM.constrain(k, "tangent", [{ curve: 1 }, { curve: 0 }])).ok);
  const ta = SM.analyse(t);
  check("a circle tangent to a fixed line can still slide along it: 1 left, the circle blue, the line white", ta.dof === 1 && !ta.curveLocked[0] && ta.curveLocked[1], JSON.stringify(ta));
}
{
  // the fight: a 15 mm dim on a line pinned 10 long
  const d = SM.emptySketch();
  SM.addLine(d, [0, 0], [10, 0]);
  SM.constrain(d, "fixed", [{ point: 0 }, { point: 1 }]);
  const before = JSON.stringify(d);
  const r = SM.attempt(d, (k) => { SM.dimension(k, [{ curve: 0 }], 15); });
  check("a dim that fights two Fixed points is refused and the sketch left exactly as it was", r.ok === false && JSON.stringify(d) === before);
  check("…both Fixed rules named as the way out", r.culprits.length === 2 && r.culprits.every((c) => c.type === "fixed"), JSON.stringify(r.culprits));
  SM.applyWithout(d, r.changed, r.culprits[1]);
  check("…dropping one: the line is 15 long, the dim kept", Math.abs(dist(d.points[0], d.points[1]) - 15) < 1e-3 && d.dims.length === 1 && SM.unmet(d).length === 0);
  const ok = SM.emptySketch();
  SM.addLine(ok, [0, 0], [10, 0]);
  check("an ordinary change goes straight through", SM.attempt(ok, (k) => { SM.dimension(k, [{ curve: 0 }], 25); }).ok === true && Math.abs(dist(ok.points[0], ok.points[1]) - 25) < 1e-3);
  check("a refused selection says why (and changes nothing)", SM.attempt(ok, (k) => SM.constrain(k, "perpendicular", [{ curve: 0 }])).error === "pick two lines");
}
{
  // names written in the code survive a solve (they used to turn into numbers on open)
  const src = "const cx = 2, rr = 4;\nconst s1 = sketch({ on: \"XY\", points: [[cx, 0], [20, 0]], curves: [[\"circle\", 0, rr], [\"line\", 0, 1, \"construction\"]] });\nreturn linearExtrude({ h: 3 }, s1);";
  const sk = SM.readSketch(src, codemap.parseCode(src).calls.find((c) => c.name === "sketch"));
  SM.solve(sk);
  check("a point written as a const keeps its name through a solve", /\[\[cx, 0\]/.test(SM.sketchCode(sk)), SM.sketchCode(sk));
  check("…and through a copy (undo / attempt)", /\[\[cx, 0\]/.test(SM.sketchCode(SM.cloneSketch(sk))));
}

console.log("\nModel 11: the user's screenshot (a circle, three lines whose top ends sit about on it: tangent, trim, a cone)\n");
{
  // read off the screenshot: R 10.607 about the origin; the lines' top ends
  // a little inside (left) and outside (right) the circle, as clicked
  const R = 10.607;
  const sk = SM.emptySketch();
  SM.addCircle(sk, [0, 0], R);
  SM.addLine(sk, [-9.08, -4.7], [-4.5, -16]);
  SM.addLine(sk, [-4.5, -16], [4.97, -16]);
  SM.addLine(sk, [4.97, -16], [9.54, -5.49]);
  const [left, bottom, right] = [1, 2, 3];
  const topL = sk.curves[left].ids[0], topR = sk.curves[right].ids[1];
  check("(the bottom line was made level)", sk.constraints.some((c) => c.type === "horizontal"));
  // the screenshot's own pick: circle, then a side line, then Tangent
  const a = SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: 0 }, { curve: left }]));
  check("circle + the left line: Tangent added (the screenshot's refusal is gone)", a.ok === true, JSON.stringify(a));
  check("…the line's loose top end is where it touches: on the circle, the line square to the radius there",
    sk.constraints.some((c) => c.type === "tangent" && c.ids[3] === topL) && Math.abs(dist(sk.points[topL], sk.points[0]) - R) < 1e-3 && tangentGap(sk, left, 0) < 1e-3, JSON.stringify(sk.points));
  const b = SM.attempt(sk, (k) => SM.constrain(k, "tangent", [{ curve: 0 }, { curve: right }]));
  check("circle + the right line: Tangent added, its top end on the circle too", b.ok === true && Math.abs(dist(sk.points[topR], sk.points[0]) - R) < 1e-3 && tangentGap(sk, right, 0) < 1e-3, JSON.stringify(b));
  check("the bottom stays level, the radius stays 10.607", Math.abs(sk.points[sk.curves[bottom].ids[0]][1] - sk.points[sk.curves[bottom].ids[1]][1]) < 1e-6 && sk.curves[0].r === R);
  // trim the circle's lower part, inside the cone
  const C = sk.points[0];
  check("trim the circle between the two touch points (its lower part)", SM.trim(sk, 0, [C[0], C[1] - R]) === null && sk.curves[0].kind === "arc", JSON.stringify(sk.curves[0]));
  check("…the arc ends on both lines' top ends", sk.curves[0].ids.includes(topL) && sk.curves[0].ids.includes(topR));
  SM.solve(sk);
  check("a closed cone, every rule met, still tangent both sides", SM.profileProblem(sk) === null && SM.unmet(sk).length === 0 && worstTangent(sk) < 1e-3 && lineArcSmooth(sk, left, 0) && lineArcSmooth(sk, right, 0), SM.profileProblem(sk));
  // the cone is exactly the convex hull of the circle and the two bottom corners
  const P = sk.points, c = P[sk.curves[0].ids[0]], [bl, br] = sk.curves[bottom].ids.map((k) => P[k]);
  const m = asModel(sk, 10);
  check("round trip", m.roundTrip, m.code);
  await onEveryKernel("the cone, extruded 10", m.src, hullArea([{ c, r: R }, { c: bl }, { c: br }]) * 10, 0.005);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
