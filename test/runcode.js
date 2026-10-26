// src/runcode.js: editor-style code runs outside the viewer with the editor's
// own forgiveness, so scripts and benchmarks never fail where the app wouldn't.
import { runEditorCode } from "../src/runcode.js";
import { build } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const builds = async (src) => { const { shape } = runEditorCode(src); return (await build(shape, { engine: "split" })).solids.length > 0; };

console.log("\nrunEditorCode\n");
check("a variable named like a DSL word shadows it (const screw)", await builds(
  "const screw = 3;\nconst slot = cube([10, 10, screw]);\nreturn slot;"));
check("a forgotten return on the final shape is supplied", await builds(
  "const a = cube([10, 10, 4]);\ndifference(a, translate([5, 5, -1], cylinder({ r: 2, h: 6 })));"));
check("a bare expression is its own model", await builds("cube([5, 6, 7])"));
check("OpenSCAD is translated first", runEditorCode("cube([5,5,5]); sphere(3);").lang === "openscad");
let threw = false;
try { runEditorCode("const a = 1;"); } catch (e) { threw = /return/.test(e.message); }
check("code with no shape says what is missing", threw);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
