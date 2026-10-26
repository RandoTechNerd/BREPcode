// "Modify this STEP": the file comes in EXACT (importedSolid on the Rust
// kernel's IMPORT3D stepText, not the OpenCASCADE-to-mesh import), takes an
// edit, and goes out as exact STEP in the same frame.
//
//   node test/stepedit.js

import { readFileSync } from "node:fs";
import { build, cube, difference, drill, translate, fillet, registerImport, importedSolid } from "../index.js";
import { exactSTEP } from "../src/stepexport.js";
import { measureFaces } from "../src/selfcheck.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const count = (step, entity) => (step.match(new RegExp(`=${entity}\\(`, "g")) || []).length;

console.log("\nmodify a STEP, exactly\n");
// a part somewhere off the origin, written as exact STEP: "the user's file"
const original = translate([100, -20, 5], difference(fillet({ r: 6, edges: "z" }, cube([80, 50, 10])),
  drill([20, 25, 10], [0, 0, 1], { d: 8, through: true })));
const src = await exactSTEP(await build(original, { engine: "split" }), "bracket");
registerImport("bracket.step", src);

const edited = await build(difference(importedSolid("bracket.step"),
  drill([160, 5, 15], [0, 0, 1], { d: 6.6, through: true, cbore: { d: 11, depth: 4 } })), { engine: "split" });
check("the imported STEP and its edit build on the exact lane", edited.engine === "exact" && edited.kernel === "rust", `${edited.kernel} ${edited.engine}`);
const m = measureFaces(edited.solids.flatMap((s) => s.faces));
check("the part stayed where the file put it", m.bounds.min.join() === "100,-20,5" && m.bounds.max.join() === "180,30,15", JSON.stringify(m.bounds));
const old = m.holes.find((h) => Math.abs(h.d - 8) < 1e-3), cb = m.holes.find((h) => h.cbore);
check("the file's own Ø8 hole is still a true cylinder at (120, 5)", old && Math.abs(old.point[0] - 120) < 1e-3 && Math.abs(old.point[1] - 5) < 1e-3);
check("the new counterbored hole is where the edit put it", cb && Math.abs(cb.point[0] - 160) < 1e-3 && Math.abs(cb.d - 6.6) < 1e-3 && Math.abs(cb.cbore.d - 11) < 1e-3, JSON.stringify(cb));
const out = await exactSTEP(edited, "bracket-edited");
check("it exports as exact STEP: real cylinders, not facets",
  count(out, "MANIFOLD_SOLID_BREP") === 1 && count(out, "CYLINDRICAL_SURFACE") >= 3 && count(out, "PLANE") < 40,
  `${count(out, "CYLINDRICAL_SURFACE")} cylinders, ${count(out, "PLANE")} planes`);

console.log("\nthe app\n");
{
  const V = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("a dropped .step registers its text for the exact import, with the mesh as fallback",
    /if \(isStep\) dsl\.registerImport\(file\.name, new TextDecoder\(\)\.decode\(buf\), \{ mesh: contents \}\)/.test(V));
  check("...goes in the editor as importedSolid(), not importedMesh()",
    /const call = isStep \? `importedSolid\(\$\{JSON\.stringify\(file\.name\)\}\)`/.test(V));
  check("...and keeps the file's frame (not recentred)", /const centered = !isStep &&/.test(V));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
