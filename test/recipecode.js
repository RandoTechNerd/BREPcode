// Every code example the recipe library shows the model must actually build.
//
// The recipes are instructions: the model is told to copy these patterns. An
// example that does not run teaches a mistake, and the user gets the failure.
// test/docs.js already does this for LLM_PROMPT.md; the recipes shipped without
// the same check, which is how a prompt came to advertise colorize() for months
// without anyone noticing it did not exist.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import * as dsl from "../index.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const DIR = "viewer/recipes";
const names = Object.keys(dsl).filter((k) => typeof dsl[k] === "function");
const values = names.map((n) => dsl[n]);

// Examples are illustrative fragments as often as whole models: `difference(a,
// b)` on its own is a perfectly good teaching snippet. Both must EVALUATE to a
// shape — that is what proves the vocabulary and the argument shapes are real.
const evalSnippet = (src) => {
  let fn;
  try { fn = new Function(...names, `"use strict"; return (\n${src}\n);`); }
  catch { fn = new Function(...names, `"use strict";\n${src}`); }
  return fn(...values);
};

const isShape = (v) => !!(v && typeof v === "object" && v.__brepscript);

// Examples that edit an import are correct in context, so give them the import
// they name rather than excusing them from the check.
const stub = toSTL(await build(dsl.cube([120, 65, 5])), "stub");
for (const f of ["frame.stl", "tray.stl", "part.stl"]) dsl.registerImport(f, stub);

let total = 0;
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md")) {
  const text = readFileSync(join(DIR, file), "utf8");
  const blocks = [...text.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const [i, raw] of blocks.entries()) {
    total++;
    const label = `${file} example ${i + 1}`;
    // Snippets legitimately reference a part the reader already has.
    const src = `const part = cube([40, 40, 12]);\nconst a = part, b = translate([5,5,5], cube([10,10,10]));\n${raw}`;
    let shape;
    try {
      shape = evalSnippet(src);
    } catch (e) {
      check(label, false, `did not evaluate — ${e.message.slice(0, 90)}`);
      continue;
    }
    if (!isShape(shape)) {
      check(label, false, "evaluated but produced no shape");
      continue;
    }
    try {
      const stl = toSTL(await build(shape), "t");
      const tris = (stl.match(/facet normal/g) || []).length;
      check(`${label} builds`, tris > 0, `${tris} triangles`);
    } catch (e) {
      check(`${label} builds`, false, e.message.slice(0, 90));
    }
  }
}

check("the library actually contains examples to check", total > 0, `${total} found`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
