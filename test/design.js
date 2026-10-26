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
import { moveText, ridersOf } from "../viewer/design-move.js";
import { buildTree, primaryFid, rowForFid, callCategory } from "../viewer/design-tree.js";
import { linkFeatures, referencedIds, stepLabel } from "../viewer/design-timeline.js";

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
  check("each peg(…) call row selects what the helper builds", row(model, "peg", 1).fids.join() === hc.fids.join());
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
  const files = ["design-shell.js", "design-tree.js", "design-timeline.js", "design-gizmo.js", "design-move.js"];
  check("every design-*.js module is in VIEWER_JS", files.every((f) => build.includes(`"${f}"`)));
  check("every design-*.js module exists", files.every((f) => existsSync(new URL(`../viewer/${f}`, import.meta.url))));
  check("the body drag writes through moveText", /const moved = moveText\(text, drag\.span, drag\.delta\)/.test(html));
  check("the body drag and the gizmo share moveMembersOf", /moveMembersOf\(fid, site\)/.test(html) && /moveMembers: \(fid\) =>/.test(html));
  check("the gizmo's press stands the body drag aside", /designUI\?\.gizmoOwnsPointer\(\)/.test(html));
  check("spawnHandles / clearHandles tell the shell", /designUI\?\.onSelect\(fid\)/.test(html) && /designUI\?\.onSelect\(null\)/.test(html));
  check("the shell is switched by the mode", /initModeSwitch\(\{ onChange: \(m\) => designUI\.setActive\(m === "design"\) \}\)/.test(html));
  const shell = readFileSync(new URL("../viewer/design-shell.js", import.meta.url), "utf8");
  check("every shell element is hidden outside Design mode",
    /body:not\(\.design-mode\) \.dz-ui \{ display: none !important; \}/.test(shell)
    && (shell.match(/className = "dz-ui"/g) || []).length === 3);
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
  check("Design mode pre-highlights the face under the pointer", /designUI\.hoverFace\(/.test(html) && /hoverFace\(mesh\) \{ setHoverFace/.test(shell));
  check("a resize drag shows a signed distance label, gone on release and on abandon",
    /handleDots\.label\(e\.clientX, e\.clientY, drag\.amount\)/.test(html)
    && (html.match(/handleDots\.hideLabel\(\)/g) || []).length >= 2 && /v > 0 \? "\+"/.test(dots));
  const guard = readFileSync(new URL("../scripts/design-check.cjs", import.meta.url), "utf8");
  check("the Electron check is guarded: failures print and exit, never a main-process dialog",
    /process\.on\("uncaughtException"/.test(guard) && /require\("\.\/design-check-run\.cjs"\)/.test(guard));
  check("the old model-space beads are gone", !/shapedHandleGeo|SphereGeometry\(1, 28, 20\)/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
