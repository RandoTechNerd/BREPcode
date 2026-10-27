// Design mode, phase 1: the shell's model browser, timeline and move writer.
//
// Everything Design mode shows is computed from the code and the last build's
// trace, never from the kernel's geometry, so it is tested here the way the
// viewer runs a model (new Function with a sourceURL, the vocabulary wrapped
// by tagCall) on the JS kernel's feature list. The DOM half (rows, steps, the
// gizmo dragging in a real window) is scripts/design-check.cjs.

import { readFileSync, existsSync } from "node:fs";
import { PartHistory } from "brep-io-kernel";
import * as dsl from "../src/dsl.js";
import * as codemap from "../src/codemap.js";
import { dragSpanFor } from "../viewer/assist.js";
import { moveText, ridersOf, instanceSpan } from "../viewer/design-move.js";
import { buildTree, primaryFid, rowForFid, callCategory } from "../viewer/design-tree.js";
import { linkFeatures, referencedIds, stepLabel, failedSteps, deleteStepText } from "../viewer/design-timeline.js";
import * as F from "../viewer/design/features.js";
import { build as buildModel } from "../index.js";
import { loadNvidiaKernel } from "../src/engine-node.js";
import { findResizeTarget } from "../viewer/assist.js";
import { ConstraintSolver } from "brep-io-kernel";
import * as SM from "../viewer/design/sketch-model.js";

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
// What the viewer has after a build: the map, the trace, the feature list.
async function build(src, runText = src) {
  const ph = new PartHistory();
  const trace = [];
  await dsl.compile(evaluate(runText), ph, trace);
  const sites = codemap.mapTraceSites(trace, runText, src, { words }).byId;
  const features = ph.features.map((f) => ({ type: f.type, params: { ...f.inputParams } }));
  return { sites, trace, features, ph };
}
const posOf = (ph, id) => ph.features.find((f) => f.inputParams.id === id)?.inputParams.transform?.position;
const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 1e-6);

const PEGS = `const w = 60;
const peg = (x) => translate([x, 20, 8], cylinder({ r: 4, h: 12, id: "peg" }));
return fillet({ r: 1, edges: "z" }, difference(
  union(
    cube([w, 40, 8], { id: "base" }),
    peg(10), peg(50)),
  translate([30, 20, -1], cylinder({ r: 6, h: 10 }))));`;

console.log("\nmoveText: the one writer behind the body drag and the gizmo\n");
{
  // folding into a wrapper that holds a sibling would move the sibling too
  const src = "return translate([1, 0, 0], cube(5), sphere(3));";
  const at = src.indexOf("cube(5)");
  const r = moveText(src, { start: at, end: at + 7 }, { x: 2, y: 0, z: 0 });
  check("a move does not fold into a wrapper that has other children", r.how === "wrap" && r.next.includes("translate([1, 0, 0], translate([2, 0, 0], cube(5)), sphere(3))"));
  const one = "return translate([1, 0, 0], cube(5));";
  const o = moveText(one, { start: one.indexOf("cube(5)"), end: one.indexOf("cube(5)") + 7 }, { x: 2, y: 0, z: 0 });
  check("…but still folds into a sole-child translate", o.how === "fold" && o.next.includes("translate([3, 0, 0], cube(5))"));
  const sv = "return cube([10, 20, 30]);";
  const ss = { start: sv.indexOf("cube"), end: sv.indexOf("cube") + "cube([10, 20, 30])".length };
  const vs = F.scaleText(sv, ss, [2, 1, 0.5], [0, 0, 0]);
  check("a per-axis scale writes scale([x, y, z], { about }, …)", vs.next.includes("scale([2, 1, 0.5], { about: [0, 0, 0] }, cube([10, 20, 30]))"));
  check("…equal factors write one number", F.scaleText(sv, ss, [1.5, 1.5, 1.5], [0, 0, 0]).next.includes("scale(1.5, "));
  check("…a zero or negative factor writes nothing", F.scaleText(sv, ss, [1, -1, 1], [0, 0, 0]).how === "none");
  // the timeline's Delete step: an edit of the call the step links to
  const dsrc = "return difference(union(cube(10), sphere(4)), chamfer({ d: 1, edges: \"z\" }, cylinder({ r: 2, h: 20 })));";
  const spanOf = (s) => ({ start: dsrc.indexOf(s), end: dsrc.indexOf(s) + s.length });
  const dSphere = deleteStepText(dsrc, spanOf("sphere(4)"));
  check("deleting a shape among several takes it out of the list", dSphere.next === "return difference(union(cube(10)), chamfer({ d: 1, edges: \"z\" }, cylinder({ r: 2, h: 20 })));");
  const dCh = deleteStepText(dsrc, spanOf("chamfer({ d: 1, edges: \"z\" }, cylinder({ r: 2, h: 20 }))"));
  check("…deleting a wrapper (a chamfer) keeps what it wrapped", dCh.how === "unwrap" && dCh.next.includes("union(cube(10), sphere(4)), cylinder({ r: 2, h: 20 }))"));
  const tsrc = "return union(cube(20), translate([25, 0, 0], sphere(6)));";
  const tDel = deleteStepText(tsrc, { start: tsrc.indexOf("sphere(6)"), end: tsrc.indexOf("sphere(6)") + 9 });
  check("…a shape goes with the translate() that only carries it", tDel.next === "return union(cube(20));");
  check("…the shape a difference cuts from is refused", !!deleteStepText(dsrc, spanOf("union(cube(10), sphere(4))")).error);
  check("…and so is the whole model", !!deleteStepText("return cube(10);", { start: 7, end: 15 }).error);
  // a closed spline: the last piece runs back into the first point (one loop, no loose end)
  const csk = { points: [], curves: [], constraints: [], dims: [] };
  const segs = SM.addSpline(csk, [[0, 0], [10, 0], [10, 10], [0, 10]], { closed: true });
  const first = csk.curves[segs[0]].ids[0], last = csk.curves[segs[segs.length - 1]].ids[3];
  check("a closed spline has one piece per point and ends where it began", segs.length === 4 && first === last);
  check("…an open one still has one piece fewer than its points", SM.addSpline({ points: [], curves: [], constraints: [], dims: [] }, [[0, 0], [5, 5], [10, 0]]).length === 2);
  const shellSrc = readFileSync(new URL("../viewer/design-shell.js", import.meta.url), "utf8");
  check("toolbar tips name their key, and buttons with choices say hold",
    /const KEYS = \{[^}]*presspull: "Q"/.test(shellSrc) && /hold for options/.test(shellSrc) && /title="\$\{esc\(tipFor\(t\)\)\}"/.test(shellSrc));
  check("a held button opens its choices; a choice opens the dialog preset or the sketch tool",
    /holdT = setTimeout\(\(\) => \{ heldOpen = true; openFly\(b\); \}, HOLD_MS\)/.test(shellSrc)
    && /openFeature\(t\.id, sub\?\.preset\)/.test(shellSrc) && /openSketch\(sub\?\.sketchTool\)/.test(shellSrc)
    && /Object\.assign\(spec\.init\(env\), ctx\.preset \|\| \{\}\)/.test(readFileSync(new URL("../viewer/design/dialogs.js", import.meta.url), "utf8")));
  check("a dialog, a sketch, Esc or a second click ends Press-pull",
    /\(t\.dialog \|\| t\.id === "sketch"\) && tool === "presspull"\) setTool\("select"\)/.test(shellSrc)
    && /t\.id === "presspull" && tool === "presspull"\) \{ setTool\("select"\)/.test(shellSrc)
    && /e\.key === "Escape" && tool === "presspull"/.test(shellSrc));
}
{
  const src = `return cube([10, 10, 10]);`;
  const span = { start: 7, end: 25 };
  let r = moveText(src, span, { x: 5, y: -2.04, z: 0 });
  check("wraps a bare call in translate()", r.how === "wrap" && r.next === `return translate([5, -2, 0], cube([10, 10, 10]));`, r.next);
  check("reports where the moved call now sits", r.next.slice(r.start, r.end) === "cube([10, 10, 10])");
  const again = moveText(r.next, { start: r.start, end: r.end }, { x: 1, y: 1, z: 1 });
  check("a second move folds into that translate()", again.how === "fold"
    && again.next === `return translate([6, -1, 1], cube([10, 10, 10]));`, again.next);
  check("…and still reports the call", again.next.slice(again.start, again.end) === "cube([10, 10, 10])");
  const d = `return difference(cube([9, 9, 9]), drill([1, 2, 3], [0, 0, -1], { d: 4 }));`;
  const ds = d.indexOf("drill("), de = d.lastIndexOf(")") ;
  r = moveText(d, { start: ds, end: de }, { x: 1, y: 0, z: 0.5 });
  check("a drill's point is rewritten, not wrapped", r.how === "drill"
    && r.next.includes("drill([2, 2, 3.5], [0, 0, -1], { d: 4 })") && !r.next.includes("translate"), r.next);
  r = moveText(src, span, { x: 0.01, y: -0.04, z: 0 });
  check("a move that rounds to nothing writes nothing", r.how === "none" && r.next === src);
  r = moveText(src, span, { x: -0.04, y: 3, z: 0 });
  check("no -0 in the written vector", r.next.includes("translate([0, 3, 0]"), r.next);
}

console.log("\nmoveText on a real map: the shape lands where the gizmo put it\n");
{
  const src = `return difference(
  cube([40, 20, 10]),
  translate([20, 10, -1], cylinder({ r: 3, h: 12 })));`;
  const b = await build(src);
  const cyl = Object.entries(b.sites).find(([, s]) => s.kind === "cylinder");
  const span = dragSpanFor(src, cyl[1]);
  check("the cutter's span is its own call (not the whole difference)", !span.whole);
  const r = moveText(src, span, { x: 5, y: 0, z: 0 });
  check("folds into the translate() already there", r.how === "fold" && r.next.includes("translate([25, 10, -1], cylinder("), r.next);
  const after = await build(r.next);
  check("the rebuilt cutter sits 5 mm over", near(posOf(after.ph, cyl[0]), [25, 10, -1]), JSON.stringify(posOf(after.ph, cyl[0])));
  const cube = Object.entries(b.sites).find(([, s]) => s.kind === "cube");
  const whole = dragSpanFor(src, cube[1]);
  check("the main shape's span is the whole difference", whole.whole && whole.label === "difference(…)");
  const r2 = moveText(src, whole, { x: 0, y: 0, z: 2 });
  const after2 = await build(r2.next);
  check("moving the main shape moves the cutter with it",
    near(posOf(after2.ph, cube[0]), [0, 0, 2]) && near(posOf(after2.ph, cyl[0]), [20, 10, 1]));
}

console.log("\nresize handles edit the right number when a size is a name\n");
{
  const { findResizeTarget } = await import("../viewer/assist.js");
  const at = (t, ax) => {
    const site = { kind: "cube", start: t.indexOf("cube("), end: t.lastIndexOf(")") };
    const r = findResizeTarget(t, site, ax);
    return r ? t.slice(r.numStart, r.numEnd) : null;
  };
  const t = `const w = 60;\nreturn cube([w, 40, 8]);`;
  check("x of cube([w, 40, 8]) is w's declared 60 (it rewrote the 40)", at(t, 0) === "60" && at(t, 0) !== null);
  check("y is 40, z is 8 (z rewrote the 40 too)", at(t, 1) === "40" && at(t, 2) === "8", `${at(t, 1)} ${at(t, 2)}`);
  check("x of cube([w * 2, 10, 5]) has no handle rather than a wrong one", at(`return cube([w * 2, 10, 5]);`, 0) === null);
  check("plain literals unchanged", [0, 1, 2].map((a) => at(`return cube([ 20,  10 , 5 ]);`, a)).join() === "20,10,5");
}

console.log("\nhandle gestures: Alt free move, double-click numbers, Alt box corner\n");
{
  const { numberFieldsFor, writeNumbers, parseTyped, boxCornerText } = await import("../viewer/design-edit.js");
  const siteOf = async (src, kind) => {
    const b = await build(src);
    const id = Object.keys(b.sites).find((k) => b.sites[k].kind === kind);
    return { id, site: b.sites[id], b };
  };
  // the cube's box [min, max] as the kernel will build it
  const boxOf = (ph, id) => {
    const p = ph.features.find((f) => f.inputParams.id === id).inputParams;
    const min = p.transform.position;
    return { min, max: [min[0] + p.sizeX, min[1] + p.sizeY, min[2] + p.sizeZ] };
  };

  // 1. Alt-drag = free move: a 3D screen-plane delta, written by moveText
  {
    const src = `return translate([5, 0, 0], cube([10, 10, 10]));`;
    const { site } = await siteOf(src, "cube");
    const r = moveText(src, site, { x: 1.04, y: -2, z: 3.55 });
    check("Alt free move writes all three axes, folded into the translate()", r.how === "fold"
      && r.next === `return translate([6, -2, 3.6], cube([10, 10, 10]));`, r.next);
  }

  // 2. double-click: the numbers behind a dot, typed back at their exact ranges
  {
    const src = `const w = 60;\nreturn difference(cube([w, 40, 8]), translate([10, 10, -1], cylinder({ r: 3, h: 10 })));`;
    const { site } = await siteOf(src, "cube");
    const face = numberFieldsFor(src, site, { kind: "face", axis: 0 });
    check("a face dot's box is that side's number (x of [w, 40, 8] is w's 60)",
      face.length === 1 && face[0].value === 60 && src.slice(face[0].numStart, face[0].numEnd) === "60", JSON.stringify(face));
    const corner = numberFieldsFor(src, site, { kind: "corner" });
    check("a box corner's boxes are its three sizes", corner.map((f) => `${f.label}=${f.value}`).join() === "x=60,y=40,z=8");
    const typed = writeNumbers(src, [{ ...corner[1], value: parseTyped(" 42.5 ") }, { ...corner[0], value: 64 }]);
    check("typed values land at their exact ranges, nothing else changes",
      typed === src.replace("const w = 60;", "const w = 64;").replace("[w, 40, 8]", "[w, 42.5, 8]"), typed);
    const again = numberFieldsFor(typed, (await siteOf(typed, "cube")).site, { kind: "corner" });
    check("…and read back the same (round trip)", again.map((f) => f.value).join() === "64,42.5,8");
    const cyl = await siteOf(src, "cylinder");
    check("a cylinder corner's boxes are its named sizes", numberFieldsFor(src, cyl.site, { kind: "corner" }).map((f) => `${f.label}=${f.value}`).join() === "r=3,h=10");
    check("typed text that is not a number is refused", parseTyped("12mm") === null && parseTyped("") === null && parseTyped("-.5") === -0.5);
    const after = await build(typed);
    const cube = Object.keys(after.sites).find((k) => after.sites[k].kind === "cube");
    check("the typed sizes build", near(boxOf(after.ph, cube).max, [64, 42.5, 8]));
  }

  // 3. Alt-drag a box corner: three sizes change, the OPPOSITE corner stays
  {
    const cases = [
      { src: `return cube([20, 10, 6]);`, label: "a plain cube" },
      { src: `return translate([5, 5, 0], cube([20, 10, 6]));`, label: "inside a translate()" },
      { src: `return cube([20, 10, 6], { center: true });`, label: "a centred cube" },
      { src: `const w = 20;\nreturn difference(cube([w, 10, 6]), translate([4, 4, -1], cylinder({ r: 1, h: 9 })));`, label: "a named size, as a boolean's main shape" },
      { src: `return cube(10);`, label: "cube(10)" },
    ];
    for (const { src, label } of cases) {
      const { id, site, b } = await siteOf(src, "cube");
      const before = boxOf(b.ph, id);
      let ok = true, detail = "";
      for (const signs of [[1, 1, 1], [-1, -1, -1], [1, -1, 1], [-1, 1, -1]]) {
        const delta = { x: 3 * signs[0], y: -2 * signs[1], z: 1.5 * signs[2] };   // grow x and z, shrink y
        const r = boxCornerText(src, site, { signs, delta, centered: /center: true/.test(src) });
        if (!r) { ok = false; detail = "refused"; break; }
        const nb = await build(r.next);
        const nid = Object.keys(nb.sites).find((k) => nb.sites[k].kind === "cube");
        const after = boxOf(nb.ph, nid);
        // the corner opposite the grabbed one, per axis
        const fixedBefore = signs.map((s, a) => (s > 0 ? before.min[a] : before.max[a]));
        const fixedAfter = signs.map((s, a) => (s > 0 ? after.min[a] : after.max[a]));
        const movedAfter = signs.map((s, a) => (s > 0 ? after.max[a] : after.min[a]));
        const movedWant = signs.map((s, a) => (s > 0 ? before.max[a] : before.min[a]) + [delta.x, delta.y, delta.z][a]);
        if (!near(fixedAfter, fixedBefore) || !near(movedAfter, movedWant)) {
          ok = false; detail = `${signs}: fixed ${fixedBefore} -> ${fixedAfter}, corner ${movedAfter} want ${movedWant} | ${r.next.replace(/\n/g, " ")}`; break;
        }
        if (/freeform/.test(r.next) || (r.next.match(/cube\(/g) || []).length !== 1) { ok = false; detail = `structure changed: ${r.next}`; break; }
      }
      check(`box corner on ${label}: the dragged corner follows, the opposite one stays`, ok, detail);
    }
    const src = `return cube([20, 10, 6]);`;
    const { site } = await siteOf(src, "cube");
    const r = boxCornerText(src, site, { signs: [1, 1, 1], delta: { x: 2, y: 0, z: 0 } });
    check("only the sizes that changed are rewritten, no translate needed from the max corner",
      r.next === `return cube([22, 10, 6]);`, r.next);
    const shared = `const s = 10;\nreturn cube([s, s, 4]);`;
    const ss = await siteOf(shared, "cube");
    check("two sides sharing one name and pulled apart is refused, not mangled",
      boxCornerText(shared, ss.site, { signs: [1, 1, 1], delta: { x: 2, y: 5, z: 0 } }) === null);
    const expr = `return cube([4 * 5, 10, 6]);`;
    const es = await siteOf(expr, "cube");
    check("an expression size is refused", boxCornerText(expr, es.site, { signs: [1, 1, 1], delta: { x: 1, y: 1, z: 1 } }) === null);
  }
}

console.log("\nwhat rides along: helpers called from inside a moved boolean\n");
{
  const b = await build(PEGS);
  const cube = Object.keys(b.sites).find((k) => b.sites[k].kind === "cube");
  const span = dragSpanFor(PEGS, b.sites[cube]);
  check("grabbing the cube moves the whole union", span.whole && span.label === "union(…)");
  const inside = Object.keys(b.sites).filter((id) => b.sites[id].start >= span.start && b.sites[id].end <= span.end);
  check("by range alone the pegs are missed (their cylinder is in the helper)", inside.length === 1);
  const riders = ridersOf(span, { sites: b.sites, trace: b.trace, runText: PEGS, editorText: PEGS });
  check("ridersOf finds the cube and both pegs through the trace path", riders.length === 3
    && riders.filter((id) => b.sites[id].kind === "cylinder").length === 2, riders.join());
  const cutter = Object.keys(b.sites).find((k) => b.sites[k].kind === "cylinder" && !b.sites[k].pattern);
  check("…not the cutter outside the union", !riders.includes(cutter));
  const r = moveText(PEGS, span, { x: 4, y: 0, z: 0 });
  const after = await build(r.next);
  const pegs = after.ph.features.filter((f) => after.sites[f.inputParams.id]?.pattern);
  check("and the written move really moves the pegs", pegs.length === 2
    && near(pegs[0].inputParams.transform.position, [14, 20, 8]) && near(pegs[1].inputParams.transform.position, [54, 20, 8]),
    JSON.stringify(pegs.map((f) => f.inputParams.transform.position)));
}

console.log("\nmodel browser: one row per call, nested as written\n");
{
  const b = await build(PEGS);
  const t = buildTree(PEGS, b.sites, words);
  check("parses", t.ok, t.error);
  const model = t.groups.find((g) => g.kind === "model");
  const helper = t.groups.find((g) => g.kind === "helper");
  check("model group first, then the peg() helper", t.groups[0] === model && helper?.label === "peg()",
    t.groups.map((g) => g.key).join(","));
  const row = (g, name, n = 0) => g.rows.filter((r) => r.name === name)[n];
  check("nesting follows the code: fillet > difference > union > cube",
    row(model, "fillet").depth === 0 && row(model, "difference").depth === 1
    && row(model, "union").depth === 2 && row(model, "cube").depth === 3);
  check("rows carry exact call ranges",
    PEGS.slice(row(model, "cube").start, row(model, "cube").end) === `cube([w, 40, 8], { id: "base" })`);
  check("the id: option shows as the row's name", row(model, "cube").userName === "base");
  check("categories: shape, boolean, op, helper",
    row(model, "cube").category === "shape" && row(model, "union").category === "boolean"
    && row(model, "fillet").category === "op" && row(model, "peg").category === "helper");
  const hc = row(helper, "cylinder");
  check("a helper's shape is ONE row marked ×2", hc.pattern?.count === 2 && hc.fids.length === 2);
  // per call, as traced by the build: peg(10) is one peg, peg(50) the other
  const pr = [row(model, "peg", 0), row(model, "peg", 1)];
  check("each peg(…) call row selects the peg that call built",
    pr.every((r) => r.fids.length === 1 && hc.fids.includes(r.fids[0])) && pr[0].fids[0] !== pr[1].fids[0], JSON.stringify(pr.map((r) => r.fids)));
  check("the union holds the cube and both pegs, cube first",
    row(model, "union").fids.length === 3 && row(model, "union").fids[0] === row(model, "cube").ownFids[0],
    row(model, "union").fids.join());
  check("clicking a boolean selects its main shape", primaryFid(row(model, "difference")) === row(model, "cube").ownFids[0]);
  check("the selected feature marks its own call's row", rowForFid(t, hc.ownFids[1]) === hc);
  check("args are summarised, shapes left to their rows", row(model, "translate").args === "[30, 20, -1]", row(model, "translate").args);
  check("a translate is a transform", callCategory("translate", false) === "transform");
}
{
  const src = `const plate = cube([30, 30, 3]);
const holes = [];
for (let i = 0; i < 3; i++) holes.push(translate([5 + i * 10, 15, -1], cylinder({ r: 2, h: 5 })));
return difference(plate, ...holes);`;
  const b = await build(src);
  const t = buildTree(src, b.sites, words);
  const v = t.groups.find((g) => g.kind === "variable");
  check("a shape held in a variable is its own group", v?.label === "plate" && v.rows[0].name === "cube");
  const loop = t.groups.find((g) => g.kind === "model").rows.find((r) => r.name === "cylinder");
  check("a loop's call is one row with ×3", loop?.pattern?.count === 3, JSON.stringify(loop?.pattern));
  const stale = buildTree(src, null, words);
  check("before a build the tree still shows, with nothing to select", stale.ok && stale.groups.length && stale.groups.every((g) => g.rows.every((r) => !r.fids.length)));
  check("code that does not parse gives no tree, not a throw", buildTree("cube([1,", null, words).ok === false);
}

console.log("\ntimeline: the kernel's steps, each linked back to its call\n");
{
  const b = await build(PEGS);
  const steps = linkFeatures(b.features, { sites: b.sites, trace: b.trace, runText: PEGS, editorText: PEGS });
  const text = (s) => (s.link ? PEGS.slice(s.link.start, s.link.end) : null);
  check("one step per kernel feature, in order", steps.length === b.features.length && steps.every((s, i) => s.index === i));
  const prim = steps.filter((s) => /^P\./.test(s.type));
  check("every primitive links to its exact call", prim.length === 4 && prim.every((s) => s.link?.exact));
  const bools = steps.filter((s) => s.type === "B");
  check("the UNION links to union(…)", /^union\(/.test(text(bools.find((s) => s.op === "UNION")) ?? ""), text(bools[0]));
  check("the SUBTRACT links to difference(…)", /^difference\(/.test(text(bools.find((s) => s.op === "SUBTRACT")) ?? ""));
  const fil = steps.find((s) => s.type === "F");
  check("the fillet links to fillet(…)", /^fillet\(/.test(text(fil) ?? ""), text(fil));
  check("the fillet's refs come from its edge names", fil.refs.length === 1 && fil.refs[0] === Object.keys(b.sites).find((k) => b.sites[k].kind === "cube"));
  check("labels: Box, Union, Cut, Fillet",
    stepLabel(steps[0]) === "Box" && stepLabel(bools[0]) === "Union" && stepLabel(bools[1]) === "Cut" && stepLabel(fil) === "Fillet");
  // the editor text is the run text plus whitespace around it (trim)
  const padded = `\n\n${PEGS}\n`;
  const pb = await build(padded, PEGS);
  const ps = linkFeatures(pb.features, { sites: pb.sites, trace: pb.trace, runText: PEGS, editorText: padded });
  check("links shift with a trimmed run text", /^union\(/.test(padded.slice(ps[3].link.start, ps[3].link.end)));
  // a rewritten run text (autoFix): booleans cannot be placed, primitives still are
  const rs = linkFeatures(pb.features, { sites: pb.sites, trace: pb.trace, runText: PEGS + " ", editorText: "x" + PEGS });
  check("a rewritten run text leaves booleans unlinked, never wrongly linked",
    rs.filter((s) => s.type === "B").every((s) => !s.link));
  check("referencedIds never mistakes P.CU1 for P.CU12",
    referencedIds({ id: "B9", boolean: { targets: ["P.CU12"] } }, ["P.CU1", "P.CU12"]).join() === "P.CU12");
}

console.log("\nthe viewer: wiring, Code mode untouched\n");
{
  const html = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const build = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  const files = ["design-shell.js", "design-tree.js", "design-timeline.js", "design-gizmo.js", "design-move.js",
    "handle-dots.js", "design-edit.js"];
  check("every design-*.js module is in VIEWER_JS", files.every((f) => build.includes(`"${f}"`)));
  check("every design-*.js module exists", files.every((f) => existsSync(new URL(`../viewer/${f}`, import.meta.url))));
  check("the body drag writes through moveText", /const moved = moveText\(text, drag\.span, drag\.delta\)/.test(html));
  check("the body drag and the gizmo share moveMembersOf", /moveMembersOf\(fid, site\)/.test(html) && /moveMembers: \(fid\) =>/.test(html));
  check("the gizmo's press stands the body drag aside", /designUI\?\.gizmoOwnsPointer\(\)/.test(html));
  check("spawnHandles / clearHandles tell the shell", /designUI\?\.onSelect\(fid\)/.test(html) && /designUI\?\.onSelect\(null\)/.test(html));
  check("the shell is switched by the mode", /initModeSwitch\(\{ onChange: \(m\) => \{\s*if \(m === "design"\) rememberCodeLayout\(\);\s*designUI\.setActive\(m === "design"\);/.test(html));
  // windows in Design mode: a right-hand column, never on Design's own panels
  check("Design mode windows live in a right-hand column", /case "dz-right-full": case "dz-right-top": case "dz-right-bottom":/.test(html)
    && /if \(inDesign\(\)\) \{[\s\S]{0,400}"dz-right-top" : "dz-right-full"/.test(html));
  check("switching to Design moves the open windows; back to Code puts them back", /if \(m === "design"\) \{ relayoutForDesign\(\); noteDesignLayout\(\); \}\s*else restoreCodeLayout\(\);/.test(html)
    && /if \(s\.after != null && spot\(c\) !== s\.after\) continue;/.test(html)
    && /if \(inDesign\(\)\) relayoutForDesign\(\);/.test(html));
  check("Design panels stay in front and step left of the column",
    /body\.design-mode #dz-dlg, body\.design-mode #dz-sk \{ right: calc\(12px \+ var\(--dz-rcol, 0px\)\) !important; \}/.test(html)
    && /body\.design-mode #dz-bar, body\.design-mode #dz-side, body\.design-mode #dz-time,[\s\S]{0,120}z-index: 100000 !important/.test(html));
  const shell = readFileSync(new URL("../viewer/design-shell.js", import.meta.url), "utf8");
  check("every shell element is hidden outside Design mode",
    /body:not\(\.design-mode\) \.dz-ui \{ display: none !important; \}/.test(shell)
    && (shell.match(/className = "dz-ui"/g) || []).length >= 3);
  const gizmo = readFileSync(new URL("../viewer/design-gizmo.js", import.meta.url), "utf8");
  check("TransformControls comes in as a three/addons import (the site build copies it)",
    /from "three\/addons\/controls\/TransformControls\.js"/.test(gizmo));
  const design = readFileSync(new URL("../viewer/design.js", import.meta.url), "utf8");
  check("the phase 0 placeholder note is gone", !/design-note/.test(design));

  // handle dots: the drag handles are screen-sized dots on hit spheres
  const dots = readFileSync(new URL("../viewer/handle-dots.js", import.meta.url), "utf8");
  const H = await import("../viewer/handle-dots.js");
  check("dot sizes: corners 6 px, faces 5 px, 20 px hit, 16 px ring, 600 ms dwell",
    H.DOT_PX.corner === 6 && H.DOT_PX.face === 5 && H.HIT_PX === 20 && H.RING_PX === 16 && H.DWELL_MS === 600);
  check("handle-dots.js ships with the site", build.includes(`"handle-dots.js"`));
  check("sized from view depth every frame", /sizeHandleDots\?\.\(\)/.test(html) && /matrixWorldInverse/.test(dots));
  check("each handle is ONE hit mesh carrying userData.handle (drag paths unchanged)",
    /const h = handleDots\.make\(\{ kind: solidMat === faceHandleMat \? "face" : "corner", dirs \}\);[\s\S]{0,80}h\.userData\.handle = handleData;/.test(html));
  check("face dots move both ways along their normal; box corners along width and depth",
    /\{ kind: "face", axis, sign, fid \}, \[out, out\.clone\(\)\.negate\(\)\]\)/.test(html) && /if \(boxy\) return \[new THREE\.Vector3\(Math\.sign\(x - c\.x\)/.test(html));
  check("the dwell is a setting (mat.handleDwellMs, default 600)",
    /handleDwellMs: 600/.test(html) && /id="mat-dwell"/.test(html) && /handleDots\.hover\(onHandle\?\.object \?\? null, mat\.handleDwellMs \?\? 600\)/.test(html));
  check("Design mode pre-highlights the face under the pointer", /designUI\.hoverFace\(/.test(html) && /hoverFace\(mesh\) \{\s*setHoverFace/.test(shell));
  // the 2026-10-26 Design review
  const sk = readFileSync(new URL("../viewer/design/sketcher.js", import.meta.url), "utf8");
  check("a drag on the sketch pad never spins the view (the model-spin handler asks the sketch)",
    /controls\.spinGate && !controls\.spinGate\(e\)/.test(html) && /orbit\.spinGate = offPad/.test(sk) && /orbit\.spinGate = null/.test(sk));
  check("the sketch pad covers the whole model, not a fixed 300 mm", /S\.ext = Math\.max\(150/.test(sk) && /const ext = S\.ext/.test(sk));
  check("Design mode holds the camera across rebuilds and while sketching",
    /designUI\?\.isActive\(\) && framedRadius/.test(html) && /if \(designUI\?\.sketching\?\.\(\)\) return false/.test(html));
  check("scale never goes through zero (no flip) and has per-axis handles",
    /MIN_SCALE = 0\.02/.test(gizmo) && /scale: \["XY", "YZ", "XZ"\]/.test(gizmo));
  check("a face's push/pull arrows show without a dwell and can be grabbed",
    /dot\.always = true/.test(dots) && /pickArrow\(raycaster, group\)/.test(dots) && /handleDots\.pickArrow\(rc, handleGroup\)/.test(html));
  check("a resize drag shows a signed distance label, gone on release and on abandon",
    /handleDots\.label\(e\.clientX, e\.clientY, drag\.amount\)/.test(html)
    && (html.match(/handleDots\.hideLabel\(\)/g) || []).length >= 2 && /v > 0 \? "\+"/.test(dots));
  const guard = readFileSync(new URL("../scripts/design-check.cjs", import.meta.url), "utf8");
  check("the Electron check is guarded: failures print and exit, never a main-process dialog",
    /process\.on\("uncaughtException"/.test(guard) && /"\.\/design-check-run\.cjs"/.test(guard) && /"\.\/design2-check-run\.cjs"/.test(guard)
    && /try \{\s*const done = require\(RUN\);/.test(guard));
  check("the old model-space beads are gone", !/shapedHandleGeo|SphereGeometry\(1, 28, 20\)/.test(html));
}

// ======================================================== phase 2: features
//
// Every dialog writes through design/features.js; these check the TEXT each
// writes, then that the text builds to the right solid on every kernel this
// machine has (the JS kernel always; the Rust one; NVIDIA SMLib when built).

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
async function volumes(src) {
  const out = {};
  for (const engine of ENGINES) {
    try { out[engine] = await quiet(async () => volumeOf(await buildModel(evaluate(src), { engine }))); }
    catch (e) { out[engine] = `ERR ${String(e.message || e).slice(0, 120)}`; }
  }
  return out;
}
async function onEveryKernel(label, src, want, tol = 0.01) {
  const v = await volumes(src);
  const bad = Object.entries(v).filter(([, x]) => typeof x !== "number" || Math.abs(x - want) / want > tol);
  check(`${label}: builds to ${want.toFixed(0)} mm³ on ${ENGINES.join(", ")}`, !bad.length,
    Object.entries(v).map(([k, x]) => `${k} ${typeof x === "number" ? x.toFixed(1) : x}`).join("; "));
}
// A rectangle face as features.faceOutline sees one: its loop, normal, middle.
const rectFace = (z, x0, y0, x1, y1, up = true) => ({
  normal: [0, 0, up ? 1 : -1], point: [(x0 + x1) / 2, (y0 + y1) / 2, z],
  loops: [[[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]],
});
const planeOf = (outline) => { const pl = F.facePlane(outline); return (p) => dsl.worldToPlane(pl, p); };

console.log("\nPhase 2: where a feature goes\n");
{
  const { sites, trace } = await build(PEGS);
  const cubeId = Object.keys(sites).find((id) => sites[id].kind === "cube");
  const pegId = Object.keys(sites).find((id) => sites[id].kind === "cylinder" && sites[id].name === "peg");
  const b = F.bodySpan(PEGS, cubeId, { sites, trace, runText: PEGS });
  check("a body is its outermost call (the fillet around everything)", PEGS.slice(b.start, b.end).startsWith("fillet({ r: 1"));
  const bp = F.bodySpan(PEGS, pegId, { sites, trace, runText: PEGS });
  check("…for a peg built in a helper too (found through the trace path)", bp.start === b.start && bp.end === b.end);
  const src = `return group(cube([10, 10, 10]), translate([20, 0, 0], rotate([0, 0, 30], cylinder({ r: 3, h: 5 }))));`;
  const s2 = await build(src);
  const cyl = Object.keys(s2.sites).find((id) => s2.sites[id].kind === "cylinder");
  const bb = F.bodySpan(src, cyl, { sites: s2.sites, trace: s2.trace, runText: src });
  check("inside a group(), each member is its own body", src.slice(bb.start, bb.end).startsWith("translate([20"));
  const sh = F.shapeSpan(src, s2.sites[cyl]);
  check("a shape span takes its transforms with it", src.slice(sh.start, sh.end) === "translate([20, 0, 0], rotate([0, 0, 30], cylinder({ r: 3, h: 5 })))");
}

console.log("\nPhase 2: what each feature writes, and that it builds everywhere\n");
{
  const box = `return cube([40, 30, 10]);`;
  const span = { start: 7, end: box.length - 1 };
  // fillet / chamfer by picked edge names
  const fil = F.edgeOpText(box, span, { kind: "fillet", amount: 2, edges: ["P.CU1_PX|P.CU1_PZ[0]", "P.CU1_NX|P.CU1_PZ[0]"] });
  check("fillet: one readable call around the body", fil.next === `return fillet({ r: 2, edges: ["P.CU1_PX|P.CU1_PZ[0]", "P.CU1_NX|P.CU1_PZ[0]"] }, cube([40, 30, 10]));`, fil.next);
  await onEveryKernel("fillet two top edges", fil.next, 12000 - 2 * (4 - Math.PI) * 30, 0.002);
  const ch = F.edgeOpText(box, span, { kind: "chamfer", amount: 1, edges: ["P.CU1_PZ|P.CU1_PY[0]"] });
  await onEveryKernel("chamfer (edge pair written either way round)", ch.next, 12000 - 0.5 * 40, 0.002);
  const stale = await volumes(`return fillet({ r: 2, edges: ["P.CU9_PX|P.CU9_PZ[0]"] }, cube([40, 30, 10]));`);
  check("a stale edge name is refused with a reason, not silently ignored", /no edge "P\.CU9_PX\|P\.CU9_PZ\[0\]"/.test(String(stale.js)), String(stale.js));

  // shell
  const hol = F.shellText(`return cube([40, 30, 20]);`, { start: 7, end: 25 }, { wall: 2, open: F.openKeys([[0, 0, 1]]) });
  check("shell: shelled({ wall, open }) around the shape", hol.next === `return shelled({ wall: 2, open: "top" }, cube([40, 30, 20]));`, hol.next);
  await onEveryKernel("open-top box, 2 mm walls", hol.next, 40 * 30 * 20 - 36 * 26 * 18);
  await onEveryKernel("closed hollow cylinder", `return shelled({ wall: 2 }, cylinder({ r: 10, h: 20 }));`, Math.PI * (100 * 20 - 64 * 16), 0.01);
  await onEveryKernel("rounded box shelled (the cavity rounds by r - wall)", `return shelled({ wall: 2 }, fillet({ r: 4, edges: "z" }, cube([40, 30, 20])));`,
    (1200 - 4 * 16 * (1 - Math.PI / 4)) * 20 - (36 * 26 - 4 * 4 * (1 - Math.PI / 4)) * 16, 0.005);
  check("a slanted face cannot be left open (said, not guessed)", F.openKeys([[0.6, 0, 0.8]]) === null);

  // hole: simple / counterbore / countersink, added to an existing difference
  const plate = `return difference(\n  cube([40, 30, 10]),\n  translate([5, 5, -1], cylinder({ r: 1, h: 12 })));`;
  const pspan = { start: 7, end: plate.length - 1 };
  const h1 = F.addTool(plate, pspan, F.holeCall({ point: [20, 15, 10], normal: [0, 0, 1], d: 4, through: true, kind: "counterbore", cbD: 8, cbDepth: 3 }));
  check("a hole joins the body's own difference() as one more line",
    h1.next.endsWith(`cylinder({ r: 1, h: 12 })),\n  drill([20, 15, 10], [0, 0, 1], { d: 4, through: true, cbore: { d: 8, depth: 3 } }));`), h1.next);
  await onEveryKernel("counterbored through hole", h1.next, 12000 - Math.PI * 12 - Math.PI * 4 * 7 - Math.PI * 16 * 3, 0.003);
  const h2 = F.addTool(box, span, F.holeCall({ point: [20, 15, 10], normal: [0, 0, 1], d: 4, depth: 8, kind: "countersink", csD: 8 }));
  check("…and wraps a body that is not a difference yet", h2.next.startsWith("return difference(cube([40, 30, 10]), drill([20, 15, 10]"), h2.next);
  await onEveryKernel("countersunk blind hole", h2.next, 12000 - Math.PI * 4 * 8 - (Math.PI * 2 / 3) * (16 + 8 + 4) + Math.PI * 4 * 2, 0.003);

  // mirror and patterns
  const mir = F.mirrorText(`return cube([30, 10, 10]);`, { start: 7, end: 25 }, { normal: [1, 0, 0], at: 30, join: true });
  check("mirror writes mirrored({ normal, at })", mir.next === `return mirrored({ normal: [1, 0, 0], at: 30, join: true }, cube([30, 10, 10]));`, mir.next);
  await onEveryKernel("mirrored and joined", mir.next, 6000);
  const holes = `return difference(cube([60, 20, 5]), translate([12, 10, -1], cylinder({ r: 2, h: 7 })));`;
  const cutter = { start: holes.indexOf("translate"), end: holes.length - 2 };
  const lin = F.linearPatternText(holes, F.shapeSpan(holes, cutter), { count: 4, step: [12, 0, 0] });
  check("a pattern of a cutter wraps the placed cutter", lin.next.includes("linearPattern({ count: 4, step: [12, 0, 0] }, translate([12, 10, -1], cylinder("), lin.next);
  await onEveryKernel("4 holes from one patterned cutter", lin.next, 6000 - 4 * Math.PI * 4 * 5, 0.003);
  const circ = F.circularPatternText(`return translate([20, 0, 0], cube([5, 5, 5]));`, { start: 7, end: 45 }, { count: 6 });
  await onEveryKernel("circular pattern of 6", circ.next, 6 * 125);
  const grid = F.linearPatternText(`return cube([5, 5, 5]);`, { start: 7, end: 22 }, { count: 3, step: [10, 0, 0], count2: 2, step2: [0, 10, 0] });
  check("a grid writes count2/step2", /count2: 2, step2: \[0, 10, 0\]/.test(grid.next), grid.next);
  await onEveryKernel("3 x 2 grid", grid.next, 6 * 125);

  // combine
  const two = `return group(\n  cube([20, 20, 10]),\n  translate([10, 10, 0], cylinder({ r: 5, h: 20 })));`;
  const tgt = { start: two.indexOf("cube"), end: two.indexOf("),\n") + 1 };
  const tool = { start: two.indexOf("translate"), end: two.length - 2 };
  const comb = F.combineText(two, tgt, [tool], "difference");
  check("combine moves the tool body into op(target, tool)", comb.next === `return group(\n  difference(cube([20, 20, 10]), translate([10, 10, 0], cylinder({ r: 5, h: 20 }))));`, comb.next);
  await onEveryKernel("combine: cut", comb.next, 4000 - Math.PI * 25 * 10, 0.003);
  check("a body in a variable is refused with a reason", !!F.combineText(`const a = cube(5);\nreturn group(cube(3), a);`, { start: 34, end: 41 }, [{ start: 10, end: 17 }]).error);

  // extrude a picked face: join / cut / new body / symmetric; a round face as a cylinder
  const top = rectFace(10, 10, 10, 30, 20);
  const ej = F.extrudeText(box, span, top, { h: 5, mode: "join", toPlane: planeOf(top) });
  check("extrude join writes union(body, linearExtrude({ h, on }, polygon))",
    ej.next === `return union(cube([40, 30, 10]), linearExtrude({ h: 5, on: { origin: [0, 0, 10], normal: [0, 0, 1] } }, polygon([[10, 10], [30, 10], [30, 20], [10, 20]])));`, ej.next);
  await onEveryKernel("extrude join", ej.next, 12000 + 1000);
  const ec = F.extrudeText(box, span, top, { h: 4, mode: "cut", toPlane: planeOf(top) });
  check("extrude cut goes in from the face, 0.5 proud", /reverse: true, proud: 0\.5/.test(ec.next), ec.next);
  await onEveryKernel("extrude cut", ec.next, 12000 - 800);
  const en = F.extrudeText(box, span, top, { h: 5, mode: "new", toPlane: planeOf(top) });
  check("extrude new body sits beside it in a group()", en.next.startsWith("return group(cube([40, 30, 10]), linearExtrude("), en.next);
  const side = { normal: [1, 0, 0], point: [40, 15, 5], loops: [[[40, 0, 0], [40, 30, 0], [40, 30, 10], [40, 0, 10]]] };
  await onEveryKernel("extrude a side face (+X)", F.extrudeText(box, span, side, { h: 5, mode: "join", toPlane: planeOf(side) }).next, 12000 + 1500);
  const ring = Array.from({ length: 48 }, (_, i) => [5 * Math.cos(i * Math.PI / 24), 5 * Math.sin(i * Math.PI / 24), 10]);
  const disc = { normal: [0, 0, 1], point: [0, 0, 10], loops: [ring] };
  const ed = F.extrudeText(`return cylinder({ r: 5, h: 10 });`, { start: 7, end: 32 }, disc, { h: 6, mode: "join", toPlane: planeOf(disc) });
  check("a round face extrudes as a cylinder (exact), not a 48-gon", /translate\(\[0, 0, 10\], cylinder\(\{ r: 5, h: 6 \}\)\)/.test(ed.next), ed.next);
  const sym = F.extrudeText(box, span, top, { h: 6, mode: "new", symmetric: true, toPlane: planeOf(top) });
  check("symmetric extrude is centred on the face", /h: 6, center: true/.test(sym.next), sym.next);
}

console.log("\nPhase 2: press-pull\n");
{
  const box = `return cube([40, 30, 10]);`;
  const site = { kind: "cube", start: 7, end: 25 };
  const tgt = (axis) => findResizeTarget(box, site, axis);
  const top = rectFace(10, 0, 0, 40, 30);
  const ctx = { body: { start: 7, end: 25 }, outline: top, target: tgt(2), sign: 1, axis: 2, siteSpan: site, toPlane: planeOf(top) };
  let r = F.pressPullText(box, ctx, 5);
  check("pull a box's top out: its height grows", r.how === "size" && r.next === `return cube([40, 30, 15]);`, r.next);
  r = F.pressPullText(box, ctx, -4);
  check("push it in: the height shrinks", r.how === "size" && r.next === `return cube([40, 30, 6]);`, r.next);
  r = F.pressPullText(box, ctx, -12);
  check("push it past the box: the face cuts on through", r.how === "cut" && /difference\(cube\(\[40, 30, 10\]\), linearExtrude\(\{ h: 12, reverse: true/.test(r.next), r.next);
  const bottom = { ...rectFace(0, 0, 0, 40, 30, false) };
  const rb = F.pressPullText(box, { ...ctx, outline: bottom, sign: -1, toPlane: planeOf(bottom) }, 3);
  check("pull the bottom down: height + 3 and moved down 3 (the top stays put)", rb.next === `return translate([0, 0, -3], cube([40, 30, 13]));`, rb.next);
  const rc = F.pressPullText(`return cube([40, 30, 10], { center: true });`, { ...ctx, siteSpan: { start: 7, end: 43 }, centered: true, target: findResizeTarget(`return cube([40, 30, 10], { center: true });`, { kind: "cube", start: 7, end: 43 }, 2) }, 4);
  check("a centred box grows and moves half way", rc.next === `return translate([0, 0, 2], cube([40, 30, 14], { center: true }));`, rc.next);
  // the size is a const above the call and gains a digit: the translate still wraps the call
  const named = `const w = 9;\nreturn union(cube([w, 10, 5]), sphere({ r: 2 }));`;
  const nsite = { kind: "cube", start: named.indexOf("cube"), end: named.indexOf(")", named.indexOf("cube")) + 1 };
  const rn = F.pressPullText(named, { body: nsite, outline: null, target: findResizeTarget(named, nsite, 0), sign: -1, axis: 0, siteSpan: nsite }, 2);
  check("a named size above the call: the const changes and the translate wraps the call", rn.next === `const w = 11;\nreturn union(translate([-2, 0, 0], cube([w, 10, 5])), sphere({ r: 2 }));`, rn.next);
  const pocket = rectFace(10, 10, 10, 30, 20);
  const rp = F.pressPullText(`return union(cube([40, 30, 10]), sphere({ r: 1 }));`, { body: { start: 7, end: 50 }, outline: pocket, target: null, toPlane: planeOf(pocket) }, 3);
  check("a face with no size behind it: joined as its outline", rp.how === "join" && /^return union\(union\(cube/.test(rp.next) === false && /linearExtrude\(\{ h: 3, on:/.test(rp.next), rp.next);
  // a boss pushed down past its own 5 mm: the cut goes on 3 mm into the base
  const boss = `return union(cube([40, 30, 10]), translate([10, 10, 10], cube([20, 10, 5])));`;
  const bsite = { kind: "cube", start: boss.indexOf("cube([20"), end: boss.length - 3 };
  const btop = rectFace(15, 10, 10, 30, 20);
  const past = F.pressPullText(boss, { body: { start: 7, end: boss.length - 1 }, outline: btop, target: findResizeTarget(boss, bsite, 2), sign: 1, axis: 2, siteSpan: bsite, toPlane: planeOf(btop) }, -8);
  check("a boss pushed past its height cuts on into the body", past.how === "cut" && past.next.startsWith("return difference(union("), past.next);
  await onEveryKernel("…3 mm deep in the base", past.next, 12000 - 200 * 3, 0.002);
  const inside = F.pressPullText(boss, { body: { start: 7, end: boss.length - 1 }, outline: btop, target: findResizeTarget(boss, bsite, 2), sign: 1, axis: 2, siteSpan: bsite, toPlane: planeOf(btop) }, -2);
  check("…while a push inside its height just shrinks it", inside.next.includes("cube([20, 10, 3])"), inside.next);
}

console.log("\nPhase 2: rotate and scale gizmo writes\n");
{
  const src = `return cube([40, 30, 10]);`;
  const span = { start: 7, end: 25 };
  let r = F.rotateText(src, span, 2, 45, [20, 15, 5]);
  check("rotate wraps with the shape's centre as about", r.next === `return rotate([0, 0, 45], { about: [20, 15, 5] }, cube([40, 30, 10]));`, r.next);
  r = F.rotateText(r.next, { start: r.start, end: r.end }, 2, 15, [20, 15, 5]);
  check("a second turn about the same axis and point folds in", r.how === "fold" && r.next === `return rotate([0, 0, 60], { about: [20, 15, 5] }, cube([40, 30, 10]));`, r.next);
  const r2 = F.rotateText(r.next, { start: r.start, end: r.end }, 0, 10, [20, 15, 5]);
  check("a turn about another axis nests (Euler angles do not add)", r2.how === "wrap", r2.next);
  await onEveryKernel("rotated about its centre keeps its volume", r.next, 12000);
  const built = await quiet(() => buildModel(evaluate(`return rotate([0, 0, 90], { about: [20, 15, 5] }, cube([40, 30, 10]));`), { engine: "js" }));
  const pts = [...built.solids[0].toSTL("s").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2]]);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  check("…and turns in place (90° about its centre: 30 wide, 40 deep, same middle)",
    Math.abs(Math.min(...xs) - 5) < 1e-3 && Math.abs(Math.max(...xs) - 35) < 1e-3 && Math.abs(Math.min(...ys) + 5) < 1e-3 && Math.abs(Math.max(...ys) - 35) < 1e-3,
    `${Math.min(...xs)}..${Math.max(...xs)} x ${Math.min(...ys)}..${Math.max(...ys)}`);
  let s = F.scaleText(src, span, 1.5, [20, 15, 5]);
  check("scale wraps with about", s.next === `return scale(1.5, { about: [20, 15, 5] }, cube([40, 30, 10]));`, s.next);
  s = F.scaleText(s.next, { start: s.start, end: s.end }, 2, [20, 15, 5]);
  check("…and folds by multiplying", s.next === `return scale(3, { about: [20, 15, 5] }, cube([40, 30, 10]));`, s.next);
  await onEveryKernel("scaled ×3 about its centre", s.next, 12000 * 27);
  // as the gizmo hands it over: shapeSpan of the cube's own call, which grows
  // out through the rotate / scale already around it
  const viaShell = (t, fn) => { const c = t.indexOf("cube("); return fn(t, F.shapeSpan(t, { start: c, end: t.indexOf(")", c) + 1 })); };
  const once = `return union(rotate([0, 0, 30], { about: [5, 5, 5] }, cube([10, 10, 10])), sphere({ r: 2 }));`;
  const g1 = viaShell(once, (t, sp) => F.rotateText(t, sp, 2, 30, [5, 5, 5]));
  check("a second gizmo turn folds into the rotate around the shape", g1.how === "fold" && g1.next === `return union(rotate([0, 0, 60], { about: [5, 5, 5] }, cube([10, 10, 10])), sphere({ r: 2 }));`, g1.next);
  const g2 = viaShell(once, (t, sp) => F.rotateText(t, sp, 0, 10, [5, 5, 5]));
  check("…a turn about another axis wraps outside it (it turns after)", g2.how === "wrap" && g2.next.startsWith("return union(rotate([10, 0, 0], { about: [5, 5, 5] }, rotate([0, 0, 30]"), g2.next);
  const g3 = viaShell(`return scale(2, { about: [5, 5, 5] }, cube([10, 10, 10]));`, (t, sp) => F.scaleText(t, sp, 1.5, [5, 5, 5]));
  check("a second gizmo scale folds by multiplying", g3.how === "fold" && g3.next === `return scale(3, { about: [5, 5, 5] }, cube([10, 10, 10]));`, g3.next);
}

console.log("\nPhase 2: a face's outline, and the failed step\n");
{
  // two triangles of a 10 x 4 rectangle at z = 3, unwelded (as a mesh arrives)
  const q = [0, 0, 3, 10, 0, 3, 10, 4, 3, 0, 0, 3, 10, 4, 3, 0, 4, 3];
  const o = F.faceOutline({ positions: q });
  check("a flat face's outline: one loop of its 4 corners, normal +Z", o && o.loops.length === 1 && o.loops[0].length === 4 && o.normal[2] > 0.999, JSON.stringify(o?.loops));
  check("…on the plane z = 3 with its origin there", JSON.stringify(F.facePlane(o)) === JSON.stringify({ origin: [0, 0, 3], normal: [0, 0, 1] }));
  const bent = [0, 0, 0, 10, 0, 0, 10, 4, 0, 0, 0, 0, 10, 4, 0, 0, 4, 5];
  check("a face that is not flat has no outline", F.faceOutline({ positions: bent }) === null);
  const ring = Array.from({ length: 32 }, (_, i) => [3 * Math.cos(i / 5.09), 3 * Math.sin(i / 5.09), 0]);
  check("a ring of points is a circle", Math.abs((F.circleOf(ring)?.r ?? 0) - 3) < 1e-6);

  const src = `return fillet({ r: 20, edges: "z" }, cube([40, 30, 10]));`;
  const { trace, features } = await build(src);
  const f = { reason: "Rust kernel, F F2: NVIDIA kernel: fillet did not produce a closed solid", features, trace, runText: src, editorText: src };
  const r = failedSteps(f, { words });
  check("a kernel refusal marks the step it names (F2)", r && r.steps[r.index].id === "F2", JSON.stringify(r?.steps.map((s) => s.id)));
  check("…linked to its call", r && src.slice(r.steps[r.index].link.start, r.steps[r.index].link.end).startsWith("fillet("));
  const g = failedSteps({ ...f, reason: "something odd" }, { words });
  check("a message naming no step blames the last one", g.index === g.steps.length - 1);
  // a fillet refused while the list was being written never became a step:
  // the red goes on a step of its own for it, not on the box before it
  const stale = `return fillet({ r: 2, edges: ["P.CU9_PX|P.CU9_PZ[0]"] }, cube([40, 30, 10]));`;
  const st = await build(`return cube([40, 30, 10]);`, `return cube([40, 30, 10]);`);
  const sf = failedSteps({ reason: `fillet(): no edge "P.CU9_PX|P.CU9_PZ[0]" on this shape`, features: st.features, trace: [], runText: stale, editorText: stale }, { words });
  check("a refused fillet with no step of its own: a red Fillet step, not the Box", sf.steps[sf.index].label === "Fillet" && sf.steps[sf.index - 1]?.type === "P.CU",
    JSON.stringify(sf.steps.map((s) => s.label ?? s.type)));
  check("…linked to the fillet() call", stale.slice(sf.steps[sf.index].link.start, sf.steps[sf.index].link.end).startsWith("fillet({ r: 2"));
  const pend = failedSteps({ reason: "kernel said no", features: st.features, pending: { label: "Chamfer", link: { start: 7, end: 20 } } }, { words });
  check("a dialog's failed preview marks the dialog's own feature", pend.steps[pend.index].label === "Chamfer" && pend.index === pend.steps.length - 1);

  // picks during a preview: the dialog keeps the model's face names from when
  // it opened, and a pick on any other face is the preview's own
  const D = await import("../viewer/design/dialogs.js");
  check("the dialog marks faces it did not open on as the preview's (and maps them back)", /const baseFaces = new Set\(host\.modelMeshes\(\)/.test(readFileSync(new URL("../viewer/design/dialogs.js", import.meta.url), "utf8"))
    && typeof D._test.diffSpan === "function");
  const ds = D._test.diffSpan("return cube(5);", "return fillet(1, cube(5));");
  check("a dialog's edit span is the text it wrote", ds.start === 7 && "return fillet(1, cube(5));".slice(ds.start, ds.end) === "fillet(1, cube(5))".slice(0, ds.end - ds.start), JSON.stringify(ds));
}

console.log("\nPhase 2: wiring\n");
{
  const html = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../viewer/design-shell.js", import.meta.url), "utf8");
  const gizmo = readFileSync(new URL("../viewer/design-gizmo.js", import.meta.url), "utf8");
  const build_ = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  const D = await import("../viewer/design/dialogs.js");
  {
    // an in-thread build: edges come without segments, by the faces they join.
    // A click near the top's +X side picks P|PX, near +Y picks P|PY (the top
    // face borders all four, so only the face across can tell them apart)
    const quad = (name, q) => ({ userData: { faceName: name }, geometry: { index: { array: [0, 1, 2, 0, 2, 3] }, attributes: { position: { array: q.flat() } } } });
    const meshes = [
      quad("PZ", [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]), quad("PX", [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]),
      quad("NX", [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]]), quad("PY", [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]),
      quad("NY", [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]])];
    const edges = ["NX", "NY", "PX", "PY"].map((f) => ({ name: `${f}|PZ[0]`, faces: [f, "PZ"].sort() }));
    const picks = [[0.95, 0.5, 1], [0.5, 0.95, 1], [0.05, 0.4, 1], [0.6, 0.05, 1]].map((p) => D.nearestEdge(edges, p, meshes)?.name);
    check("an edge pick without segments takes the edge nearest the click", picks.join() === "PX|PZ[0],PY|PZ[0],NX|PZ[0],NY|PZ[0]", picks.join());
  }
  {
    // a face or body whose feature has no call in the code: a message, not a TypeError
    const env = { bodyOf: () => null };
    const sq = { fid: "X1", outline: { loops: [[[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0]]], normal: [0, 0, 1], point: [5, 5, 0] } };
    let rv, cb;
    try { rv = D._test.SPECS.revolve.write("return cube(1);", { face: sq, axis: "0", angle: 360, op: "join" }, env); } catch (e) { rv = { threw: String(e) }; }
    try { cb = D._test.SPECS.combine.write("return cube(1);", { fid: "X1", bodies: [{ fid: "X2" }], op: "union" }, env); } catch (e) { cb = { threw: String(e) }; }
    check("revolve / combine on a shape with no call: an error message, no throw", !!rv?.error && !rv.threw && !!cb?.error && !cb.threw, JSON.stringify({ rv, cb }));
  }
  check("ten feature dialogs", ["extrude", "revolve", "hole", "fillet", "chamfer", "shell", "mirror", "linear", "circular", "combine"].every((d) => D.DIALOGS.includes(d)));
  check("the dialogs load lazily (dynamic import on first use)", /await import\("\.\/design\/dialogs\.js"\)/.test(shell) && !/^import .*design\/dialogs/m.test(shell));
  check("…and press-pull too", /await import\("\.\/design\/presspull\.js"\)/.test(shell));
  check("no placeholder tools left in the ribbon", !/phase2: true/.test(shell) && !/coming in Design mode phase 2/.test(shell));
  check("the site build ships viewer/design/", /"design\/features\.js", "design\/dialogs\.js", "design\/presspull\.js"/.test(build_) && /split\('"\.\.\/\.\.\/src\/'\)\.join\('"\.\.\/src\/'\)/.test(build_));
  check("fix (a): in Design mode a pick does not open the code card", /const design = !!designUI\?\.isActive\(\);\s*if \(!design\) \{\s*toggleCard\(panel, openBtn, true\);/.test(html));
  check("fix (b): the hint talks dots, not squares and balls", !/drag a <b>square<\/b>|corner ball<\/b>/.test(html) && /double-click<\/b> a dot to type the numbers/.test(html));
  check("fix (c): no plane squares or centre block on the move gizmo", /translate: \["XY", "YZ", "XZ", "XYZ"\]/.test(gizmo));
  check("Ask about this: re-pinning a spot keeps one pin-tracking loop", /if \(!pinTracking\) \{ pinTracking = true; requestAnimationFrame\(trackPin\); \}/.test(html)
    && /askPin\.hidden = true; pinTracking = false; return;/.test(html));
  // macOS and Linux fire contextmenu on the press, before any drag: the menu
  // must wait for the release there, or every right-drag pan opens it
  check("right-click menu: a contextmenu during the press waits for the release, and opens only if the pointer stayed put",
    /if \(rightHeld\) \{ menuOnRelease = true; return; \}/.test(html)
    && /const still = rightDown && Math\.hypot\(e\.clientX - rightDown\[0\], e\.clientY - rightDown\[1\]\) <= 6;[\s\S]{0,80}if \(still\) openShapeMenuAt\(e\.clientX, e\.clientY\);/.test(html));
  const sketcherSrc = readFileSync(new URL("../viewer/design/sketcher.js", import.meta.url), "utf8");
  check("sketch Finish refuses when the code changed while it was open (it would undo that)", /async function finish\(\) \{[\s\S]{0,400}if \(host\.text\(\) !== S\.orig\) \{ setMsg\(/.test(sketcherSrc));
  check("a feature dialog closes an open sketch first", /if \(dialog\) await dialog\.cancel\(\);\s*\/\/[^\n]*\n\s*if \(sketcher\?\.active \|\| sketcher\?\.choosing\) sketcher\.cancel\(\);/.test(shell));
  check("rotate and scale are gizmo modes", /rotate: "rotate", scale: "scale"/.test(shell));
  check("a failed build reaches Design mode with the kernel's reason", /designUI\?\.buildResult\?\.\(ok, ok \? null : lastBuildFailure\)/.test(html)
    && /reason: String\(e\?\.message \|\| e\), stage: attempt/.test(html));
  check("a preview builds without an undo step; OK is one", /preview\(text\) \{[\s\S]{0,400}rebuild\(\);/.test(html) && /commit\(text, \{ built = false \} = \{\}\) \{[\s\S]{0,300}pushHistory\(\);/.test(html));
}

// ========================================================= phase 3: sketches
//
// sketch({ on, points, curves, constraints, dims }) is solved by the kernel's
// own ConstraintSolver and builds as an exact profile; the sketcher's model
// (design/sketch-model.js) edits one and writes it back as code.

dsl.useSketchSolver(ConstraintSolver);
const RECT = (w, extra = "") => `sketch({ on: "XY", points: [[0, 0], [60, 0], [60, 40], [0, 40]${extra ? ", " + extra.points : ""}],
  curves: [["line", 0, 1], ["line", 1, 2], ["line", 2, 3], ["line", 3, 0]${extra ? ", " + extra.curves : ""}],
  constraints: [["horizontal", 0, 1], ["vertical", 1, 2], ["horizontal", 2, 3], ["vertical", 3, 0], ["fixed", 0]],
  dims: [["distance", 0, 1, ${w}], ["distance", 1, 2, 40]] })`;

console.log("\nPhase 3: sketch() builds, solved, on every kernel\n");
{
  await onEveryKernel("a 60 x 40 sketch extruded 8", `return linearExtrude({ h: 8 }, ${RECT(60)});`, 60 * 40 * 8);
  await onEveryKernel("its width dim set to 75: the solver moves the points", `return linearExtrude({ h: 8 }, ${RECT(75)});`, 75 * 40 * 8);
  await onEveryKernel("the dim as a named const (a slider)", `const w = 50;\nreturn linearExtrude({ h: 8 }, ${RECT("w")});`, 50 * 40 * 8);
  const holed = RECT(60, { points: "[45, 20]", curves: `["circle", 4, 5]` });
  await onEveryKernel("a circle inside is a hole", `return linearExtrude({ h: 8 }, ${holed});`, 60 * 40 * 8 - Math.PI * 25 * 8, 0.003);
  const arc = `sketch({ on: { origin: [0, 0, 10], normal: [0, 0, 1] }, points: [[0, 0], [20, 0], [20, 10], [10, 10], [0, 10]],
    curves: [["line", 0, 1], ["line", 1, 2], ["arc", 3, 2, 4], ["line", 4, 0]] })`;
  await onEveryKernel("an arc in the outline stays an arc (a D shape)", `return linearExtrude({ h: 5 }, ${arc});`, (200 + Math.PI * 50) * 5, 0.003);
  const twoOut = `sketch({ points: [[10, 10], [20, 10], [20, 20], [10, 20], [40, 20]], curves: [["line", 0, 1], ["line", 1, 2], ["line", 2, 3], ["line", 3, 0], ["circle", 4, 5]] })`;
  await onEveryKernel("two separate outlines cut as two (islands)", `return difference(cube([60, 40, 8]), linearExtrude({ h: 20, center: true }, ${twoOut}));`, 19200 - 800 - Math.PI * 25 * 8, 0.003);
  const ring = `sketch({ points: [[10, 0], [14, 0], [14, 6], [10, 6], [0, -5], [0, 20]], curves: [["line", 0, 1], ["line", 1, 2], ["line", 2, 3], ["line", 3, 0], ["line", 4, 5, "construction"]] })`;
  await onEveryKernel("revolved about a construction line of the sketch (a ring, clear of the axis)", `return revolve({ angle: 360, axis: [4, 5] }, ${ring});`, Math.PI * (196 - 100) * 6, 0.01);
  const bez = `sketch({ points: [[0, 0], [30, 0], [30, 10], [20, 25], [10, 25], [0, 10]], curves: [["line", 0, 1], ["line", 1, 2], ["bezier", 2, 3, 4, 5], ["line", 5, 0]] })`;
  const v = await volumes(`return linearExtrude({ h: 4 }, ${bez});`);
  check("a spline (Bezier) outline builds on every kernel", Object.values(v).every((x) => typeof x === "number" && x > 30 * 10 * 4), JSON.stringify(v));
  // the kernel's own sketch record carries the constraints and dims
  const ph = new PartHistory();
  await dsl.compile(evaluate(`return linearExtrude({ h: 8 }, ${RECT(70)});`), ph);
  const sk = ph.features.find((f) => f.type === "S").persistentData.sketch;
  const types = sk.constraints.map((c) => c.type).join("");
  check("persistentData.sketch carries the constraints (━ │ ⏚) and the dims (⟺ 70, 40)",
    types.includes("━") && types.includes("│") && sk.constraints.some((c) => c.type === "⟺" && c.value === 70) && sk.constraints.some((c) => c.type === "⟺" && c.value === 40), JSON.stringify(sk.constraints));
  const xs = sk.points.map((p) => p.x);
  check("…and its points are the solved ones (width 70)", Math.max(...xs) - Math.min(...xs) === 70, JSON.stringify(sk.points));
  let err = "";
  try { dsl.sketch({ points: [[0, 0], [10, 0], [10, 10]], curves: [["line", 0, 1], ["line", 1, 2]] }); } catch (e) { err = e.message; }
  check("an open chain is refused, saying so", /does not close/.test(err), err);
  // exactly what Finish wrote on the default model in the Electron check
  // (sketch on its top face, a rectangle and a circle, extruded and joined;
  // the bare-expression model turned into a return)
  const finished = `const sketch1 = sketch({
  on: { origin: [0, 0, 12], normal: [0, 0, 1] },
  points: [[6, 24.5], [24, 24.5], [24, 11.5], [6, 11.5], [4.5, 2.5]],
  curves: [["line", 0, 1], ["line", 1, 2], ["line", 2, 3], ["line", 3, 0], ["circle", 4, 2.5]],
  constraints: [["horizontal", 0, 1], ["vertical", 1, 2], ["horizontal", 2, 3], ["vertical", 3, 0]],
});
return union(difference(
  cube([30, 30, 12]),
  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),
), linearExtrude({ h: 10 }, sketch1));`;
  await onEveryKernel("the sketcher's Finish on the default model", finished, 30 * 30 * 12 - Math.PI * 64 * 12 + 18 * 13 * 10 + Math.PI * 6.25 * 10, 0.003);
}

console.log("\nPhase 3: the sketcher's model\n");
{
  const sk = SM.emptySketch("XY");
  SM.addRect(sk, [0, 0], [30, 20]);
  check("a rectangle is 4 lines, 4 corners, level and plumb sides", sk.curves.length === 4 && sk.points.length === 4
    && sk.constraints.filter((c) => c.type === "horizontal").length === 2 && sk.constraints.filter((c) => c.type === "vertical").length === 2);
  SM.addLine(sk, [0, 0], [50.5, 1]);
  check("a line drawn nearly level is made level (auto constraint)", sk.constraints.some((c) => c.type === "horizontal" && c.ids.join() === "0,4"));
  SM.removeCurve(sk, 4);
  const r = SM.dimension(sk, [{ curve: 0 }], 42);
  SM.constrain(sk, "fixed", [{ point: 0 }]);
  SM.solve(sk);
  check("a length dim re-solves the rectangle (30 → 42), the fixed corner stays", sk.points[1][0] === 42 && sk.points[0][0] === 0 && sk.points[2][0] === 42, JSON.stringify(sk.points));
  check("…and it is one closed profile", SM.profileProblem(sk) === null && r.dim === 0);
  check("perpendicular needs two lines (said, not guessed)", SM.constrain(sk, "perpendicular", [{ curve: 0 }]) === "pick two lines");
  SM.addCircle(sk, [20, 10], 4);
  const code = SM.sketchCode(sk);
  check("written as sketch({ on, points, curves, constraints, dims })", /^sketch\(\{\n  on: "XY",\n  points: \[\[0, 0\], \[42, 0\]/.test(code) && /\["circle", 4, 4\]/.test(code) && /dims: \[\["distance", 0, 1, 42\]\]/.test(code), code);
  const src = `const sk1 = ${code};\nreturn linearExtrude({ h: 5 }, sk1);`;
  const m = codemap.parseCode(src).calls.find((c) => c.name === "sketch");
  const back = SM.readSketch(src, m);
  check("read back from the code it wrote (round trip)", SM.sketchCode(back) === code, SM.sketchCode(back));
  await onEveryKernel("…and it builds: 42 x 20 less a round hole", src, (42 * 20 - Math.PI * 16) * 5, 0.003);
  // a dim made a parameter
  const pr = SM.promoteDim(src, back, 0, "width");
  check("a dim promoted to a const: the param goes on top, the dim names it", pr.text.startsWith("const width = 42;\n") && /\["distance", 0, 1, width\]/.test(SM.sketchCode(back)));
  const named = pr.text.replace(code, SM.sketchCode(back));
  await onEveryKernel("…then the slider's value drives the sketch (width 55)", named.replace("const width = 42;", "const width = 55;"), (55 * 20 - Math.PI * 16) * 5, 0.003);
  const again = SM.readSketch(named, codemap.parseCode(named).calls.find((c) => c.name === "sketch"));
  check("…and reads back with its name and the param's value", again.dims[0].name === "width" && again.dims[0].value === 42);
  check("a name that is taken is refused", !!SM.promoteDim(named, again, 0, "width").error);
  {
    // an existing sketch written with names: its plane, a radius and a point
    // coordinate go back as written; an edited radius goes back as its number
    const src2 = `const rr = 4, cx = 2;\nconst P = { origin: [0, 0, 5], normal: [0, 0, 1] };\nconst s1 = sketch({ on: P, points: [[cx, 0]], curves: [["circle", 0, rr]] });\nreturn linearExtrude({ h: 3 }, s1);`;
    const sk2 = SM.readSketch(src2, codemap.parseCode(src2).calls.find((c) => c.name === "sketch"));
    const out2 = SM.sketchCode(sk2);
    check("editing a sketch keeps its named plane, radius and point", /on: P,/.test(out2) && /\["circle", 0, rr\]/.test(out2) && /\[\[cx, 0\]\]/.test(out2), out2);
    sk2.curves[0].r = 6;
    sk2.points[0][0] = 3;
    const out3 = SM.sketchCode(sk2);
    check("…an edited radius or point is written as its new number", /\["circle", 0, 6\]/.test(out3) && /\[\[3, 0\]\]/.test(out3) && /on: P,/.test(out3), out3);
  }
  // trim and offset
  const t = SM.emptySketch();
  SM.addLine(t, [0, 0], [20, 0], { auto: false });
  SM.addLine(t, [10, -5], [10, 5], { auto: false });
  SM.trim(t, 0, [15, 0]);
  const lens = t.curves.filter((c) => c.kind === "line").map((c) => Math.hypot(t.points[c.ids[1]][0] - t.points[c.ids[0]][0], t.points[c.ids[1]][1] - t.points[c.ids[0]][1]));
  check("trim cuts the piece of a line beyond a crossing away", lens.length === 2 && lens.includes(10) && lens.filter((l) => l === 10).length === 2, JSON.stringify(lens));
  const o = SM.emptySketch();
  SM.addRect(o, [0, 0], [20, 10]);
  SM.offset(o, 0, 2);
  const xsO = o.points.map((p) => p[0]);
  check("offset copies a closed outline 2 mm out", Math.min(...xsO) === -2 && Math.max(...xsO) === 22 && o.curves.length === 8, JSON.stringify(o.points));
  const sp = SM.emptySketch();
  SM.addSpline(sp, [[0, 0], [10, 8], [20, 0]]);
  check("a spline through 3 points is 2 Beziers", sp.curves.length === 2 && sp.curves.every((c) => c.kind === "bezier"));
  SM.toggleConstruction(sp, 0);
  check("construction toggles", sp.curves[0].construction === true);
  check("an arc through 3 clicks: centre, start, end on its circle", (() => { const a = SM.emptySketch(); SM.addArc(a, [0, 0], [10, 0], [0, 25]); const e = a.points[2]; return Math.abs(Math.hypot(...e) - 10) < 1e-6; })());
  // tangent: a line meeting an arc at its end
  const tg = SM.emptySketch();
  SM.addArc(tg, [0, 0], [10, 0], [0, 10]);
  SM.addLine(tg, [10, 0], [12, -8], { auto: false });
  check("tangent between a line and an arc it starts on", SM.constrain(tg, "tangent", [{ curve: 1 }, { curve: 0 }]) === null && tg.constraints.some((c) => c.type === "tangent"));
  SM.solve(tg);
  const [L0, L1] = tg.curves[1].ids.map((k) => tg.points[k]);
  const [C, P] = [tg.points[tg.curves[0].ids[0]], tg.points[tg.curves[1].ids[0]]];
  const dot = ((L1[0] - L0[0]) * (P[0] - C[0]) + (L1[1] - L0[1]) * (P[1] - C[1])) / (Math.hypot(L1[0] - L0[0], L1[1] - L0[1]) * Math.hypot(P[0] - C[0], P[1] - C[1]));
  check("…solved: the line square to the radius where they meet", Math.abs(dot) < 1e-3, String(dot));
}

console.log("\nPhase 3: wiring\n");
{
  const shell = readFileSync(new URL("../viewer/design-shell.js", import.meta.url), "utf8");
  const html = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const build_ = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  const render = readFileSync(new URL("../src/render.js", import.meta.url), "utf8");
  check("Sketch is on the toolbar and loads the sketcher lazily", /id: "sketch", label: "Sketch"/.test(shell) && /await import\("\.\/design\/sketcher\.js"\)/.test(shell));
  check("the viewer hands sketch() the kernel's solver (and waits for it before a sketch builds)",
    /dsl\.useSketchSolver\(k\.ConstraintSolver\)/.test(html) && /\/\\bsketch\\s\*\\\(\/\.test\(src\) && !dsl\.hasSketchSolver\(\)/.test(html));
  check("so does the CLI / Node path", /useSketchSolver\(ConstraintSolver\)/.test(render));
  check("the site build ships the sketcher", /"design\/sketcher\.js", "design\/sketch-model\.js"/.test(build_) && /'"\.\.\/\.\.\/vendor\/'\)\.join\('"\.\.\/vendor\/'\)/.test(build_));
}

console.log("\nA shape made by a helper: the edit wraps that one call of it\n");
{
  // the phone stand's shape: one helper makes the body AND the window cut,
  // and a scale of the window once went into the helper and scaled both
  const STAND = `const across = (pts, h, y0) => translate([0, y0 + h, 0], rotate([90, 0, 0], linearExtrude({ h }, polygon(pts))));
const win = [[10, 4], [30, 4], [30, 20]];
const cuts = [];
cuts.push(across(win, 42, -1));
return difference(across([[0, 0], [40, 0], [40, 30], [0, 30]], 40, 0), ...cuts);`;
  const { sites } = await build(STAND);
  const ids = Object.keys(sites);
  const callOf = (id) => STAND.slice(sites[id].callers?.[0]?.start, sites[id].callers?.[0]?.end);
  check("an arrow helper is named by its const", ids.length === 2 && ids.every((id) => sites[id].fn === "across"), JSON.stringify(sites));
  check("each copy traces to its own call of the helper",
    ids.map(callOf).sort().join(" | ") === "across([[0, 0], [40, 0], [40, 30], [0, 30]], 40, 0) | across(win, 42, -1)", ids.map(callOf).join(" | "));
  const winId = ids.find((id) => callOf(id) === "across(win, 42, -1)");
  const inst = instanceSpan(sites[winId]);
  check("instanceSpan is the window's helper call", STAND.slice(inst.start, inst.end) === "across(win, 42, -1)");
  const r = F.scaleText(STAND, F.shapeSpan(STAND, inst), 0.5, [20, 20, 12]);
  check("a scale of the window wraps only that call",
    r.next.includes("cuts.push(scale(0.5, { about: [20, 20, 12] }, across(win, 42, -1)));") && r.next.startsWith("const across = (pts, h, y0) => translate("), r.next);
  const m = moveText(STAND, inst, { x: 5, y: 0, z: 0 });
  const m2 = moveText(m.next, { start: m.start, end: m.end }, { x: 5, y: 0, z: 0 });
  check("a second move chains onto the span the first one handed back",
    m2.how === "fold" && m2.next.includes("cuts.push(translate([10, 0, 0], across(win, 42, -1)));"), m2.next);
  check("a shape in the open is not redirected", instanceSpan({ fn: null }) === null);
  check("a helper that cannot be traced to one call is refused",
    instanceSpan({ fn: "post", callers: [{ name: "map", fn: null, start: 0, end: 1 }] })?.shared === "post");
  const RET = "const a = 1;\nreturn union(cube(1), sphere(2));";
  const ret = codemap.parseCode(RET).ret;
  check("the whole model is the return value", RET.slice(ret.start, ret.end) === "union(cube(1), sphere(2))");
  const tree = buildTree(STAND, sites, words);
  const rows = (tree.groups ?? tree).flatMap((g) => g.rows ?? []);
  const at = STAND.indexOf("across(win");
  const winRow = rows.find((x) => x.key === `${at}:${at + "across(win, 42, -1)".length}`);
  check("the model browser's helper-call row selects only what that call made", winRow && winRow.fids.join() === winId, JSON.stringify(winRow?.fids));
  const gz = readFileSync(new URL("../viewer/design-gizmo.js", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../viewer/design-shell.js", import.meta.url), "utf8");
  check("a released change is held until its build lands",
    /cur\.held = c\.matrix\.clone\(\)\.multiply\(cur\.held\)/.test(gz) && /userData\.designHeld/.test(gz) && /dropHolds/.test(shell));
  check("a build landing mid-drag rebases the drag", /gizmo\.rebase\(m\)/.test(shell));
  check("nothing picked: move / rotate / scale take the whole model", /const target = selectedFid \?\? MODEL/.test(shell));
  check("the browser's selection has a draggable split and pops out to its own window",
    /id="dz-split" role="separator"/.test(shell) && /function popSel\(out/.test(shell) && /#dz-selwin \{/.test(shell));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
