// "Ask about this…": the pinned spot (viewer/selection-context.js).
//
// The viewer fills the context from a pick and the last build's map; here the
// map comes from a real build the way test/design.js makes one (the trace,
// mapTraceSites, bodySpan), and the edits the built-in assistant writes at
// the spot are built on every kernel this machine has. The DOM half (the
// right-click menu, the pin, the chat chip) is scripts/design-check.cjs --ask.

import { PartHistory } from "brep-io-kernel";
import * as dsl from "../src/dsl.js";
import * as codemap from "../src/codemap.js";
import * as F from "../viewer/design/features.js";
import * as SC from "../viewer/selection-context.js";
import { build as buildModel } from "../index.js";
import { loadNvidiaKernel } from "../src/engine-node.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const PLUMBING = new Set(["compile", "captureSites", "tagCall", "nameOf"]);
const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function" && !PLUMBING.has(k));
const values = names.map((k) => dsl.tagCall(dsl[k]));
const words = new Set(names);
const TAIL = `\n//# sourceURL=${codemap.SITE_URL}`;
function evaluate(src) {
  let fn;
  try { fn = new Function(...names, `"use strict"; return (\n${src}\n);${TAIL}`); }
  catch { fn = new Function(...names, `"use strict";\n${src}${TAIL}`); }
  dsl.captureSites(codemap.SITE_URL);
  try { return fn(...values); } finally { dsl.captureSites(null); }
}
async function mapOf(src) {
  const ph = new PartHistory();
  const trace = [];
  await dsl.compile(evaluate(src), ph, trace);
  return { sites: codemap.mapTraceSites(trace, src, src, { words }).byId, trace };
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
async function onEveryKernel(label, src, want, tol = 0.003) {
  const out = {};
  for (const engine of ENGINES) {
    try { out[engine] = await quiet(async () => volumeOf(await buildModel(evaluate(src), { engine }))); }
    catch (e) { out[engine] = `ERR ${String(e.message || e).slice(0, 120)}`; }
  }
  const bad = Object.entries(out).filter(([, x]) => typeof x !== "number" || Math.abs(x - want) / want > tol);
  check(`${label}: builds to ${want.toFixed(0)} mm³ on ${ENGINES.join(", ")}`, !bad.length,
    Object.entries(out).map(([k, x]) => `${k} ${typeof x === "number" ? x.toFixed(1) : x}`).join("; "));
}

// What the viewer does on "Ask about this…": the pick, plus the build's map.
async function pin(src, kind, pick) {
  const { sites, trace } = await mapOf(src);
  const fid = Object.keys(sites).find((id) => sites[id].kind === kind);
  return SC.makeSelectionContext({
    text: src, fid, mode: "design", ...pick,
    feature: { start: sites[fid].start, end: sites[fid].end, name: sites[fid].kind },
    body: F.bodySpan(src, fid, { sites, trace, runText: src }),
  });
}

const PLATE = `return difference(
  cube([40, 30, 10]),
  translate([5, 5, -1], cylinder({ r: 1, h: 12 })));`;
const TOP_EDGES = ["P.CU1_PX|P.CU1_PZ[0]", "P.CU1_NX|P.CU1_PZ[0]", "P.CU1_PY|P.CU1_PZ[0]", "P.CU1_NY|P.CU1_PZ[0]"];
const TOP = { point: [20.004, 15.0, 10], normal: [0, 0, 2], face: "P.CU1_PZ", solid: "P", edges: TOP_EDGES.map((name) => ({ name })) };

console.log("\nThe context: one object, read from the pick and the build's map\n");
const ctx = await pin(PLATE, "cube", TOP);
{
  check("versioned, a point", ctx.version === SC.SELECTION_CONTEXT_VERSION && ctx.kind === "point");
  check("the point (rounded) and a unit normal", ctx.point.join() === "20,15,10" && ctx.normal.join() === "0,0,1", JSON.stringify([ctx.point, ctx.normal]));
  check("the face and its edges by the names fillet() takes", ctx.face === "P.CU1_PZ" && ctx.edges.length === 4 && ctx.edges[0] === TOP_EDGES[0]);
  check("the call that made it, with its line and exact text", ctx.feature.code === "cube([40, 30, 10])" && ctx.feature.line === 2, JSON.stringify(ctx.feature));
  check("the body it belongs to (the difference around it)", ctx.body.name === "difference" && ctx.body.code.startsWith("difference(") && ctx.body.line === 1);
  check("room for what comes later: sketch plane, reference photo, scan", "sketchPlane" in ctx && "reference" in ctx && "scan" in ctx
    && ctx.sketchPlane === null && ctx.reference === null && ctx.scan === null);
  check("which way it faces, in words", SC.facing([0, 0, 1]) === "top" && SC.facing([0, -1, 0]) === "front (-Y)" && SC.facing([0.6, 0, 0.8]) === "slanted");
  check("the chip's label", SC.selectionLabel(ctx) === "top face of cube, line 2", SC.selectionLabel(ctx));
}

console.log("\nWhat a connected AI is told, and what get_state.selection carries\n");
{
  const p = SC.describeSelectionContext(ctx);
  check("the prompt says what 'here' means", /"here", "this", "this face"/i.test(p) && p.includes("[20, 15, 10]") && p.includes("the top face"));
  check("…names the edges and quotes the call with its line", p.includes(JSON.stringify(TOP_EDGES[0])) && p.includes("line 2") && p.includes("cube([40, 30, 10])"));
  check("…and how an edit there is written (drill into the body's difference)", p.includes("drill([20, 15, 10], [0, 0, 1]") && /difference\(/.test(p));
  const a = SC.forAgent(ctx);
  check("forAgent is plain JSON", JSON.stringify(JSON.parse(JSON.stringify(a))) === JSON.stringify(a));
  check("…with the call, the body, the edges and how to edit", a.call.code === "cube([40, 30, 10])" && a.body.name === "difference"
    && a.edges.length === 4 && a.facing === "top" && /drill/.test(a.howToEdit) && a.featureId === ctx.fid);
  check("no context, no note", SC.describeSelectionContext(null) === "" && SC.forAgent(null) === null);
  const photo = SC.makeSelectionContext({ point: [0, 0, 0], normal: [0, 0, 1], reference: { kind: "photo", name: "mat.jpg", mmPerPx: 0.25, plane: { origin: [0, 0, 0], normal: [0, 0, 1] } } });
  check("a reference photo rides along with its scale", SC.describeSelectionContext(photo).includes('photo "mat.jpg", scale 0.25 mm per pixel')
    && SC.forAgent(photo).reference.mmPerPx === 0.25);
}

console.log("\nThe built-in assistant at the spot: a hole, a round\n");
{
  const h = SC.parseHoleRequest("put a 5 mm hole here");
  check("'a 5 mm hole here': 5 mm, through", h.d === 5 && h.through);
  const m3 = SC.parseHoleRequest("M3 hole 8 mm deep");
  check("'M3 hole 8 mm deep': a 3.3 mm clearance hole, blind 8", m3.d === 3.3 && !m3.through && m3.depth === 8, JSON.stringify(m3));
  check("'counterbore hole radius 2': d 4, counterbored", SC.parseHoleRequest("counterbore hole radius 2")?.kind === "counterbore"
    && SC.parseHoleRequest("counterbore hole radius 2").d === 4);
  check("not a hole: 'what is this?'", SC.parseHoleRequest("what is this?") === null && SC.selectionEdit(ctx, "what is this?", PLATE) === null);

  const r = SC.selectionEdit(ctx, "put a 5 mm hole here", PLATE);
  check("the hole joins the body's own difference() as one more line",
    r.code.endsWith(`cylinder({ r: 1, h: 12 })),\n  drill([20, 15, 10], [0, 0, 1], { d: 5, through: true }));`), r.code);
  check("…and the reply says where", /5 mm through hole at \[20, 15, 10\] on the top face/.test(r.reply), r.reply);
  await onEveryKernel("plate with the pin's hole", r.code, 12000 - Math.PI * 10 - Math.PI * 6.25 * 10);

  // the user typed above it before sending: the spans follow the text
  const typed = `const w = 40;\n${PLATE}`;
  const moved = SC.relocate(ctx, typed);
  check("typing above the call moves its span, not stale", !moved.feature.stale && moved.feature.line === 3
    && typed.slice(moved.feature.start, moved.feature.end) === "cube([40, 30, 10])");
  const r2 = SC.selectionEdit(ctx, "a 4 mm hole", typed);
  check("…and the edit still lands in that body", r2.code.startsWith("const w = 40;\nreturn difference(") && r2.code.includes("drill([20, 15, 10], [0, 0, 1], { d: 4, through: true })"), r2.code);

  // a second ask at the same pin, after the first edit changed the body
  const r3 = SC.selectionEdit(ctx, "M3 hole 8 mm deep", r.code);
  check("a second hole at the same pin finds the edited body again",
    (r3.code.match(/drill\(/g) || []).length === 2 && r3.code.includes("{ d: 3.3, depth: 8 }") && (r3.code.match(/difference\(/g) || []).length === 1, r3.code);

  // a body that is not a difference yet
  const BOX = `return cube([40, 30, 10]);`;
  const bctx = await pin(BOX, "cube", TOP);
  const rb = SC.selectionEdit(bctx, "drill a 6mm hole here", BOX);
  check("a plain body is wrapped in difference(body, drill(…))", rb.code === `return difference(cube([40, 30, 10]), drill([20, 15, 10], [0, 0, 1], { d: 6, through: true }));`, rb.code);
  const rf = SC.selectionEdit(bctx, "round these edges 1 mm", BOX);
  check("'round these edges 1 mm': the face's edges, by name, around the body",
    rf.code === `return fillet({ r: 1, edges: [${TOP_EDGES.map((e) => JSON.stringify(e)).join(", ")}] }, cube([40, 30, 10]));`, rf.code);
  await onEveryKernel("box with the pin's face rounded", rf.code, 12000 - (1 - Math.PI / 4) * 140, 0.002);

  const gone = SC.selectionEdit(ctx, "a 5 mm hole here", `return sphere({ r: 10 });`);
  check("the call is gone from the code: says so, writes nothing", gone && gone.code === undefined && /can't find/.test(gone.reply));
  check("the help for what it cannot do names the spot", /top face of cube, line 2/.test(SC.anchorHelp(ctx)) && /connect an AI/.test(SC.anchorHelp(ctx)));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
