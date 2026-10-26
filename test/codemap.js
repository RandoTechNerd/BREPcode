// Design mode, phase 0: the code as a parse tree, and exact shape-to-code links.
//
// The viewer used to find a shape's call by pairing the Nth traced primitive
// with the Nth call it could see in the text, which gives up (or worse, guesses)
// on loops, helper functions and a variable used twice. Now every shape a word
// returns remembers the line:col it was called from, compile() carries that
// onto the trace, and src/codemap.js resolves it to the call's exact range.
// These tests run the code the way the viewer does (new Function with a
// sourceURL, the vocabulary wrapped by tagCall) and check the ranges.

import { PartHistory } from "brep-io-kernel";
import * as dsl from "../src/dsl.js";
import * as codemap from "../src/codemap.js";
import { runEngine } from "../src/engine.js";
import { loadRustKernel, loadManifoldNode } from "../src/engine-node.js";
import { findParams, applyParam } from "../viewer/params.js";
import { faceEdges } from "../viewer/faceedges.js";
import { mapTraceToSites } from "../viewer/assist.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

// The viewer's evaluate(), minus the language sniffing: every form puts the
// user's first line on body line 2.
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
async function traceOf(src) {
  const shape = evaluate(src);
  const ph = new PartHistory();
  const trace = [];
  await dsl.compile(shape, ph, trace);
  return { trace, ph };
}
async function mapOf(src, editor = src, runText = src) {
  const { trace, ph } = await traceOf(runText);
  const m = codemap.mapTraceSites(trace, runText, editor, { words });
  return { ...m, trace, ph, text: (id) => (m.byId[id] ? editor.slice(m.byId[id].start, m.byId[id].end) : null) };
}

console.log("\nparseCode: calls with exact ranges, parents and params\n");
{
  const src = `const w = 20;          // width
const size = [10, -2.5, 3];
let label = "hi";
const flag = true;
const derived = w * 2;
return union(translate([w, 0, 0], cube([w, 10, 5])), cylinder({ r: 3, h: 8 }));`;
  const m = codemap.parseCode(src);
  check("parses", m.ok, m.error);
  const at = (c) => src.slice(c.start, c.end);
  const union = m.calls.find((c) => c.name === "union");
  const tr = m.calls.find((c) => c.name === "translate");
  const cu = m.calls.find((c) => c.name === "cube");
  const cy = m.calls.find((c) => c.name === "cylinder");
  check("nested call ranges are the calls' own text",
    at(cu) === "cube([w, 10, 5])" && at(tr).startsWith("translate([w, 0, 0], cube(") && at(cy) === "cylinder({ r: 3, h: 8 })",
    `${at(cu)} | ${at(cy)}`);
  check("parents follow the argument nesting",
    m.calls[cu.parent] === tr && m.calls[tr.parent] === union && m.calls[cy.parent] === union && union.parent === null);
  check("line:col points at the callee name (what a stack frame reports)",
    cu.line === 6 && src.split("\n")[5].slice(cu.col - 1).startsWith("cube("));
  const P = Object.fromEntries(m.params.map((p) => [p.name, p]));
  check("top-level params found in order", m.params.map((p) => p.name).join(",") === "w,size,label,flag,derived");
  check("number literal range", src.slice(P.w.valueStart, P.w.valueEnd) === "20" && P.w.literal.value === 20);
  check("vector literal with a negative part",
    P.size.literal.kind === "vector" && P.size.literal.value.join() === "10,-2.5,3"
    && src.slice(P.size.literal.parts[1].start, P.size.literal.parts[1].end) === "-2.5");
  check("string / bool literals", P.label.literal.value === "hi" && P.flag.literal.value === true);
  check("an expression is a param with no literal (not a dial)", P.derived.literal === null);
  check("OpenSCAD does not parse, and says so rather than guessing",
    codemap.parseCode("cube([1,2,3]);\nmodule m() { sphere(2); }").ok === false);

  // params agree with the scanner the slider panel uses
  const scanned = findParams(src);
  const agree = scanned.filter((p) => p.kind === "number" || p.kind === "vector").every((p) => {
    const q = P[p.name];
    return q && src.slice(q.valueStart, q.valueEnd) === src.slice(p.start, p.end);
  });
  check("param ranges agree with params.js findParams", agree, JSON.stringify(scanned.map((p) => [p.name, p.start, p.end])));
  const next = applyParam(src, "w", 25);
  check("applyParam writes at the exact range", next.startsWith("const w = 25;          // width\n"), next.split("\n")[0]);
  const vec = applyParam(src, "size", 7, 1);
  check("applyParam writes one vector part", vec.split("\n")[1] === "const size = [10, 7, 3];", vec.split("\n")[1]);
}

console.log("\nexact sites: nested calls\n");
{
  const src = `union(
  translate([5, 0, 0], cube([10, 10, 10])),
  difference(cylinder({ r: 6, h: 8 }), translate([0, 0, -1], cylinder({ r: 2, h: 10 }))),
)`;
  const m = await mapOf(src);
  const ids = m.trace.map((t) => t.id);
  check("every primitive placed exactly", m.unresolved.length === 0 && ids.every((id) => m.byId[id]?.exact),
    `unresolved ${m.unresolved}`);
  check("the cube maps to its own call, not the translate around it", m.text(ids[0]) === "cube([10, 10, 10])", m.text(ids[0]));
  check("the outer cylinder", m.text(ids[1]) === "cylinder({ r: 6, h: 8 })", m.text(ids[1]));
  check("the cutter cylinder inside its translate", m.text(ids[2]) === "cylinder({ r: 2, h: 10 })", m.text(ids[2]));
  check("no pattern groups in a flat model", m.patterns.length === 0);
  check("each trace entry carries the chain of sites above it",
    m.trace[0].path?.length === 3 && m.trace[2].path?.length === 4, JSON.stringify(m.trace.map((t) => t.path?.length)));
}

console.log("\nexact sites: helper functions\n");
{
  const src = `function post(x) {
  return translate([x, 0, 0], cylinder({ r: 2, h: 12 }));
}
return union(cube([40, 10, 4]), post(5), post(20), post(35));`;
  const m = await mapOf(src);
  const cyl = m.trace.filter((t) => t.code === "P.CY");
  check("three posts traced", cyl.length === 3);
  check("all three map to the ONE cylinder call inside the helper",
    cyl.every((t) => m.text(t.id) === "cylinder({ r: 2, h: 12 })"), cyl.map((t) => m.text(t.id)).join(" | "));
  const pat = m.byId[cyl[0].id].pattern;
  check("...as a pattern group of three", pat?.count === 3 && pat.ids.length === 3 && m.byId[cyl[2].id].pattern.index === 2);
  check("the cube outside the helper is its own site", m.text(m.trace[0].id) === "cube([40, 10, 4])" && !m.byId[m.trace[0].id].pattern);
  // what the old count-based mapper could do with the same model
  const old = mapTraceToSites(m.trace, src);
  check("(the old mapper could not place the posts at all)", !old || cyl.every((t) => !old[t.id]));
}

console.log("\nexact sites: loops (one site, many instances)\n");
{
  const src = `const n = 5;
const teeth = [];
for (let i = 0; i < n; i++) {
  teeth.push(rotate([0, 0, i * 72], translate([10, 0, 0], cube([4, 2, 3]))));
}
return union(cylinder({ r: 10, h: 3 }), ...teeth);`;
  const m = await mapOf(src);
  const cubes = m.trace.filter((t) => t.code === "P.CU");
  check("five teeth traced", cubes.length === 5);
  check("every tooth maps to the cube call in the loop body",
    cubes.every((t) => m.text(t.id) === "cube([4, 2, 3])"));
  check("one pattern of five", m.patterns.length === 1 && m.patterns[0].length === 5);
  check("instance indices run 0..4 in emission order",
    cubes.map((t) => m.byId[t.id].pattern.index).join() === "0,1,2,3,4");

  const viaMap = `return union(...[0, 15, 30].map((x) => translate([x, 0, 0], sphere({ r: 4 }))));`;
  const mm = await mapOf(viaMap);
  check("an arrow function in .map() is a loop too",
    mm.trace.length === 3 && mm.trace.every((t) => mm.text(t.id) === "sphere({ r: 4 })") && mm.patterns.length === 1);
}

console.log("\nexact sites: reused variables\n");
{
  const src = `const peg = cylinder({ r: 1.5, h: 6 });
const plate = cube([30, 30, 3]);
return union(plate, translate([5, 5, 3], peg), translate([25, 25, 3], peg));`;
  const m = await mapOf(src);
  const pegs = m.trace.filter((t) => t.code === "P.CY");
  check("the variable's one call owns both copies",
    pegs.length === 2 && pegs.every((t) => m.text(t.id) === "cylinder({ r: 1.5, h: 6 })"));
  check("...as a pattern", m.byId[pegs[0].id].pattern?.count === 2);
  check("the plate maps through its variable to its call", m.text(m.trace[0].id) === "cube([30, 30, 3])");
}

console.log("\nexact sites: words that wrap their own shapes, and modifiers\n");
{
  const src = `return difference(
  fillet({ r: 1, edges: "z" }, cube({ size: [20, 20, 10], center: true })),
  drill([0, 0, 5], [0, 0, 1], { d: 4 }),
);`;
  const m = await mapOf(src);
  check("a centred cube (a translate made inside cube()) still maps to the cube call",
    m.text(m.trace[0].id) === `cube({ size: [20, 20, 10], center: true })`, m.text(m.trace[0].id));
  check("a drill's internal cylinder maps to the drill call", m.text(m.trace[1].id) === "drill([0, 0, 5], [0, 0, 1], { d: 4 })", m.text(m.trace[1].id));
  check("kinds are the call names", m.byId[m.trace[1].id].kind === "drill" && m.byId[m.trace[0].id].kind === "cube");
}

console.log("\nexact sites: the editor text is not always the text that ran\n");
{
  const run = `union(cube([5, 5, 5]), sphere({ r: 2 }))`;
  const editor = "\n\n   " + run + "\n\n";          // the viewer trims before it runs
  const m = await mapOf(run, editor, run);
  check("a trimmed run maps back into the untrimmed editor text",
    m.text(m.trace[0].id) === "cube([5, 5, 5])" && m.byId[m.trace[0].id].start === editor.indexOf("cube"));

  // autoFix rewrote something earlier in the text: ranges are found by the
  // call's own text instead of by shifting
  const ranText = `const a = 1;\nreturn union(cube([5, 5, 5]), sphere({ r: 2 }));`;
  const edText = `const a = 1    // autoFix added the semicolon\nreturn union(cube([5, 5, 5]), sphere({ r: 2 }));`;
  const m2 = await mapOf(ranText, edText, ranText);
  check("a rewritten run still maps by the call's text",
    m2.text(m2.trace[1].id) === "sphere({ r: 2 })" && edText.slice(m2.byId[m2.trace[1].id].start).startsWith("sphere({ r: 2 })"));

  // a call whose text the editor no longer has is left for the fallback
  const m3 = await mapOf(ranText, `return cube([9, 9, 9]);`, ranText);
  check("a call the editor no longer contains is unresolved, not guessed", m3.unresolved.length === 2 && !Object.keys(m3.byId).length);

  // a namespace call (no site of its own) is left to the old mapper
  const t4 = [{ id: "X1", code: "P.CU" }];
  check("an entry with no site is unresolved", codemap.mapTraceSites(t4, run, run).unresolved[0] === "X1");
}

console.log("\nstable ids (opt-in)\n");
{
  const src = `return union(
  cube({ size: [20, 20, 4], id: "base" }),
  translate([10, 10, 4], cylinder({ r: 3, h: 10 }), { id: "post" }),
  sphere({ r: 1 }),
);`;
  const m = await mapOf(src);
  const by = Object.fromEntries(m.trace.map((t) => [t.code, t.name ?? null]));
  check("id in an options object names the feature", by["P.CU"] === "base");
  check("a trailing { id } names a transform and what it holds", by["P.CY"] === "post");
  check("unnamed stays unnamed", by["P.S"] === null);
  check("the name reaches the feature map", m.byId[m.trace[0].id].name === "base");
  // ids keep their name when a shape is inserted in front of them
  const m2 = await mapOf(src.replace("return union(", "return union(\n  cube([1, 1, 1]),"));
  const base2 = m2.trace.find((t) => t.name === "base");
  check("...and keep it when emission order shifts", base2 && base2.id !== m.trace[0].id, `${base2?.id} vs ${m.trace[0].id}`);
  let threw = null;
  try { evaluate(`return translate([1, 2, 3], cube(2), { id: "moved" })`); } catch (e) { threw = e; }
  check("a trailing { id } never reaches collect() as a non-shape", !threw, threw?.message);
  check("importedMesh keeps its file name (id is not stored as `name`)",
    dsl.tagCall(dsl.importedMesh)("part.stl", { id: "imp" }).name === "part.stl");
}

console.log("\ncolour write-back\n");
{
  const src = `function post(x) { return translate([x, 0, 0], cylinder({ r: 2, h: 12 })); }
return union(cube([40, 10, 4]), post(5), post(20));`;
  const m = await mapOf(src);
  const cy = m.trace.find((t) => t.code === "P.CY");
  const s = m.byId[cy.id];
  const one = codemap.colorizeAt(src, s.start, s.end, "#e05a5a");
  check("wraps the shape's own call", one.includes(`translate([x, 0, 0], colorize("#e05a5a", cylinder({ r: 2, h: 12 })))`), one.split("\n")[0]);
  const m1 = await mapOf(one);
  const cols = m1.trace.filter((t) => t.code === "P.CY").map((t) => t.color);
  check("the rebuilt trace carries the colour on every instance of the pattern", cols.length === 2 && cols.every((c) => c === "#e05a5a"), cols.join());
  check("...and the cube is untouched", !m1.trace.find((t) => t.code === "P.CU").color);
  const s1 = m1.byId[m1.trace.find((t) => t.code === "P.CY").id];
  const two = codemap.colorizeAt(one, s1.start, s1.end, "#3bb0e8");
  check("a second colour replaces the string instead of wrapping twice",
    two.includes(`colorize("#3bb0e8", cylinder(`) && (two.match(/colorize\(/g) || []).length === 1);
  const back = codemap.uncolorizeAt(two, s1.start, s1.end);
  check("clearing takes the wrapper off again", back === src);
  check("clearing a shape with no colorize is a no-op", codemap.uncolorizeAt(src, s.start, s.end) === null);
}

console.log("\nface names and the edges around a face\n");
{
  const src = `return union(fillet({ r: 1, edges: "z" }, cube([10, 10, 10])), translate([5, 5, 5], cylinder({ r: 3, h: 10 })));`;
  const { trace, ph } = await traceOf(src);
  const json = await ph.toJSON();
  const r = await runEngine(json, { rust: await loadRustKernel(), manifold: loadManifoldNode });
  const faces = r.solids.flatMap((s) => s.faces || []);
  const fnames = faces.map((f) => f.name);
  const cu = trace.find((t) => t.code === "P.CU").id;
  check("the exact kernel names every face after its feature", fnames.includes(`${cu}_PZ`) && fnames.some((n) => n.includes(":BLEND:")),
    fnames.join(" "));
  const top = faceEdges(faces, `${cu}_PZ`).map((e) => e.name);
  const cy = trace.find((t) => t.code === "P.CY").id;
  check("the top face is bounded by the four sides, the four blends and the cylinder",
    top.length === 9 && top.includes(`${cu}_NX|${cu}_PZ[0]`) && top.includes(`${cu}_PZ|${cy}_S[0]`), top.join(" "));
  check("edge names are the sorted pair (the form fillet() takes)",
    top.every((n) => { const p = n.replace(/\[\d+\]$/, ""); const a = `${cu}_PZ`; const o = p.startsWith(a + "|") ? p.slice(a.length + 1) : p.slice(0, p.length - a.length - 1); return [a, o].sort().join("|") === p; }));

  // the JS kernel's own EDGE names agree with the adjacency answer
  await ph.runHistory({ throwOnFeatureError: true });
  const solid = ph.scene.children.find((o) => o.type === "SOLID");
  solid.updateWorldMatrix(true, true);
  const jsFaces = [], jsEdges = [];
  solid.traverse((o) => {
    if (o.type === "FACE" && o.geometry) {
      jsFaces.push({ name: o.name, positions: o.geometry.attributes.position.array, index: o.geometry.index?.array, matrix: o.matrixWorld.elements });
    }
    if (o.type === "EDGE" && String(o.name).includes("|")) jsEdges.push(o.name);
  });
  const fromKernel = codemap.edgesOfFace(`${cu}_NX`, jsEdges).sort();
  const fromMesh = faceEdges(jsFaces, `${cu}_NX`).map((e) => e.name).sort();
  check("JS kernel: adjacency gives exactly the kernel's edge names", fromKernel.length > 0 && fromKernel.join() === fromMesh.join(),
    `${fromKernel.join(" ")}  vs  ${fromMesh.join(" ")}`);
  check("edgesOfFace never splits a blend face's own '|'",
    codemap.edgesOfFace("F4:BLEND:A|B[0]", ["F4:BLEND:A|B[0]|P.CU1_PZ[0]", "P.CU1_NX|P.CU1_PZ[0]"]).length === 1);
}

console.log("\nthe viewer: face names on meshes, the switch, the wiring\n");
{
  const { readFileSync } = await import("node:fs");
  const html = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("each face mesh keeps the kernel's full face name", /mesh\.userData\.faceName = nm/.test(html));
  check("evaluated code carries a sourceURL so its frames are recognisable", /sourceURL=\$\{codemap\.SITE_URL\}/.test(html));
  check("the vocabulary is wrapped by tagCall", /values = names\.map\(\(n\) => dsl\.tagCall\(vocab\[n\]\)\)/.test(html));
  check("the feature map tries exact sites first", /function buildFeatureMap[\s\S]{0,1600}codemap\.mapTraceSites/.test(html));
  check("right-click colour writes to the code", /codemap\.colorizeAt\(/.test(html));
  check("the Code | Design switch is installed", /initModeSwitch\(\{ onChange/.test(html));
  const design = readFileSync(new URL("../viewer/design.js", import.meta.url), "utf8");
  check("the mode is remembered as brepcode.mode", /"brepcode\.mode"/.test(design) && /design-mode/.test(design));
  const build = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  check("the site build ships acorn, design.js and faceedges.js",
    /vendor\/acorn\/acorn\.mjs/.test(build) && /"design\.js"/.test(build) && /"faceedges\.js"/.test(build));
}

console.log("\ncost\n");
{
  const src = `const p = []; for (let i = 0; i < 4000; i++) p.push(translate([i, 0, 0], cube([1, 1, 1]))); return group(...p);`;
  const t0 = performance.now();
  const fn = new Function(...names, `"use strict";\n${src}${TAIL}`);
  fn(...names.map((k) => dsl[k]));
  const plain = performance.now() - t0;
  const t1 = performance.now();
  evaluate(src);
  const tagged = performance.now() - t1;
  console.log(`  (4000-shape loop: ${plain.toFixed(0)} ms plain, ${tagged.toFixed(0)} ms with call sites)`);
  check("call sites cost well under a second on a 4000-shape loop", tagged < 1000, `${tagged.toFixed(0)} ms`);
  dsl.captureSites(null);
  const g = dsl.tagCall(dsl.cube)([1, 1, 1]);
  check("capture is off outside an evaluation (CLI and library paths pay nothing)", !g.site);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
