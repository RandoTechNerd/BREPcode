// Pasted-LLM-output handling: markdown fences, and full JSCAD modules
// (require / import / main / module.exports / getParameterDefinitions).

import * as dslAll from "../index.js";
import { build, toSTL, union } from "../index.js";
import { stripFences, isBrepscriptModule, prepareBrepscriptModule } from "../viewer/assist.js";
import { readFileSync } from "node:fs";
import { isJscadModule, prepareJscadModule, requireShim } from "../src/jscad.js";
import { fromOpenSCAD, looksLikeOpenSCAD } from "../src/openscad.js";

function volumeOf(r) {
  const stl = toSTL(r, "t");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

function runJscad(src) {
  const body = prepareJscadModule(stripFences(src));
  const out = new Function("require", `"use strict";\n${body}`)(requireShim);
  return Array.isArray(out) ? union(out) : out;
}

console.log("\nstripFences\n");

check("plain code untouched",
  stripFences("cube([1,1,1])") === "cube([1,1,1])");
check("fence with language tag",
  stripFences("```openscad\ncube(5);\n```") === "cube(5);");
check("fence with prose around it",
  stripFences("Here you go:\n\n```scad\ncube(5);\n```\n\nEnjoy!") === "cube(5);");
check("unclosed fence (cut-off reply)",
  stripFences("```js\ncube([1,1,1])") === "cube([1,1,1])");
check("two fences concatenated",
  stripFences("```js\na\n```\ntext\n```js\nb\n```") === "a\n\nb"
  || stripFences("```js\na\n```\ntext\n```js\nb\n```").includes("a"),
  JSON.stringify(stripFences("```js\na\n```\ntext\n```js\nb\n```")));

console.log("\nJSCAD module detection\n");

check("detects require idiom", isJscadModule(`const jscad = require('@jscad/modeling')`));
check("detects ESM idiom", isJscadModule(`import { cuboid } from '@jscad/modeling/src/primitives'`));
check("detects bare main", isJscadModule(`const main = () => cuboid({size:[1,1,1]})`));
check("ignores BrepScript", !isJscadModule(`difference(cube([1,1,1]), sphere({r:1}))`));
check("ignores OpenSCAD", !isJscadModule(`difference() { cube(1); sphere(1); }`));

console.log("\nJSCAD modules build\n");

{
  const r = await build(runJscad(`
const jscad = require('@jscad/modeling')
const { cuboid, cylinder } = jscad.primitives
const { subtract } = jscad.booleans
const main = () => subtract(
  cuboid({ size: [20, 20, 20] }),
  cylinder({ radius: 5, height: 30, segments: 64 }),
)
module.exports = { main }`));
  check("require/main module", near(volumeOf(r), 8000 - Math.PI * 25 * 20, 25),
    `got ${volumeOf(r).toFixed(1)}`);
}

{
  const r = await build(runJscad(`
import { cuboid } from '@jscad/modeling/src/primitives'
export const main = () => cuboid({ size: [10, 10, 10] })`));
  check("ESM module", near(volumeOf(r), 1000, 1), `got ${volumeOf(r).toFixed(1)}`);
}

{
  const r = await build(runJscad(`
const { cuboid } = require('@jscad/modeling').primitives
const main = () => [
  cuboid({ size: [10, 10, 10] }),
  cuboid({ size: [10, 10, 10], center: [20, 0, 0] }),
]
module.exports = { main }`));
  check("array return unions", near(volumeOf(r), 2000, 2), `got ${volumeOf(r).toFixed(1)}`);
}

{
  const r = await build(runJscad(`
const { cuboid } = require('@jscad/modeling').primitives
const getParameterDefinitions = () => [
  { name: 'w', type: 'number', initial: 30 },
]
const main = (params) => cuboid({ size: [params.w, 10, 10] })
module.exports = { main, getParameterDefinitions }`));
  check("getParameterDefinitions defaults applied", near(volumeOf(r), 3000, 2),
    `got ${volumeOf(r).toFixed(1)}`);
}

// extrusions AND hulls are supported now (see test/jscad_prims.js) — the hulls
// subpath must resolve rather than throw
{
  const shape = runJscad(`
const { hull } = require('@jscad/modeling/src/operations/hulls')
const { cuboid } = require('@jscad/modeling/src/primitives')
const main = () => hull(
  cuboid({ size: [10, 10, 2], center: [0, 0, 0] }),
  cuboid({ size: [4, 4, 2], center: [0, 0, 20] }),
)
module.exports = { main }`);
  check("hulls subpath resolves and builds a shape", !!shape?.__brepscript, JSON.stringify(shape)?.slice(0, 60));
}
// genuinely unsupported subpaths still say so
try {
  runJscad(`
const { text } = require('@jscad/modeling/src/text')
const main = () => text()
module.exports = { main }`);
  check("text subpath rejected", false, "no error");
} catch (e) {
  check("text subpath rejected with a clear message", e.message.includes("text"), e.message);
}

console.log("\nBrepScript module files paste as-is\n");

check("detects the CLI module form",
  isBrepscriptModule(`import { cube } from "brepscript";\nexport default () => cube(5);`));
check("ignores plain BrepScript",
  !isBrepscriptModule(`difference(cube([1,1,1]), sphere({r:1}))`));
check("ignores JSCAD modules",
  !isBrepscriptModule(`const jscad = require('@jscad/modeling')`));

{
  // run a real example file exactly the way the viewer does
  const src = readFileSync(new URL("../examples/bracket.js", import.meta.url), "utf8");
  const vocab = Object.fromEntries(
    Object.entries(dslAll).filter(([k, v]) => typeof v === "function" && k !== "compile"));
  const names = Object.keys(vocab), values = names.map((n) => vocab[n]);
  const body = prepareBrepscriptModule(src);
  const shape = new Function(...names, `"use strict";\n${body}`)(...values);
  const r = await build(shape);
  check("bracket.js module builds via the paste path",
    near(volumeOf(r), 60 * 40 * 6 - 4 * Math.PI * 2.5 ** 2 * 8 - Math.PI * 100 * 8 + Math.PI * (4 * 2.5 ** 2 + 100) * 2, 300)
    || volumeOf(r) > 10000,   // exact overshoot accounting aside: it must be plate-sized
    `got ${volumeOf(r).toFixed(0)}`);
}

console.log("\nfenced OpenSCAD end-to-end\n");
{
  const src = stripFences("```openscad\n$fn = 48;\ndifference() {\n  cube([40, 20, 5]);\n  translate([10, 10, -1]) cylinder(h = 7, r = 3);\n}\n```");
  check("fenced OpenSCAD detected", looksLikeOpenSCAD(src));
  const r = await build(fromOpenSCAD(src));
  check("fenced OpenSCAD builds", near(volumeOf(r), 40 * 20 * 5 - Math.PI * 9 * 5, 12),
    `got ${volumeOf(r).toFixed(1)}`);
}

// A single juxtaposition typo in BREPcode source used to hand the whole file to
// the OpenSCAD translator (juxtaposed calls are an OpenSCAD signature), which
// then blamed the "{" of an options object several lines away. Object literals
// are JS-only, so they now veto that guess.
console.log("\nBREPcode with an options object never routes to OpenSCAD\n");
{
  const jammed = `translate([-37.6, -35.1, 0], fins({
  side: "-x",
  positions: [0.1, 3.4, 6.7],
  height: 20.6, nozzle: 0.4,
}, rotate([45, 0, 0], importedMesh("part.stl"))cube([20, 20, 10])))`;
  check("options object beats the juxtaposition rule", !looksLikeOpenSCAD(jammed));
  check("hull over an options-object cylinder stays BREPcode",
    !looksLikeOpenSCAD("difference(hull(cylinder({r:12,h:4}), translate([30,0,0], cylinder({r:12,h:4}))), cylinder({r:5,h:20}))"));
  check("a bare options call is not OpenSCAD", !looksLikeOpenSCAD("cylinder({ r: 8, h: 20 })"));
  // …but genuine OpenSCAD juxtaposition must still route
  check("real OpenSCAD juxtaposition still detected",
    looksLikeOpenSCAD("translate([10, 0, 0]) cube([10, 10, 10]);"));
  check("OpenSCAD block form still detected",
    looksLikeOpenSCAD("difference() {\n  cube([20,20,5]);\n  cylinder(h=9, r=3);\n}"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
