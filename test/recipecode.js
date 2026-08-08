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

console.log("\na cutter made from a traced outline keeps ALL of the shape\n");
{
  // The workflow: somebody traces a gingerbread man, gets an extrusion, and
  // says "make this a cookie cutter". A traced figure arrives as SEVERAL closed
  // loops — a body and two detached arms — and the failure everyone hits is
  // that the arms quietly do not survive the offset, so the cutter is a
  // gingerbread torso. This proves every loop makes it through.
  const { fromOpenSCAD } = await import("../src/openscad.js");
  const SCAD = `
H = 15; WALL = 0.9;
body = [[0,40],[10,34],[12,22],[26,20],[26,12],[12,8],[14,-8],[6,-24],[-6,-24],[-14,-8],
        [-12,8],[-26,12],[-26,20],[-12,22],[-10,34]];
armL = [[-34,26],[-27,30],[-25,22],[-32,19]];
armR = [[34,26],[32,19],[25,22],[27,30]];
module ring(pts) {
  linear_extrude(H) difference() {
    offset(delta=WALL/2) polygon(pts);
    offset(delta=-WALL/2) polygon(pts);
  }
}
ring(body); ring(armL); ring(armR);
`;
  let xs = [], ys = [], facets = 0, err = "";
  try {
    const stl = toSTL(await build(fromOpenSCAD(SCAD)), "t");
    facets = (stl.match(/facet normal/g) || []).length;
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)];
    xs = v.map((m) => +m[1]); ys = v.map((m) => +m[2]);
  } catch (e) { err = String(e.message || e); }

  check("a multi-loop traced outline builds as a cutter", facets > 100, err || `${facets} facets`);
  // The arms sit beyond |x| = 26. If a loop were dropped the extent collapses
  // to the body and this is the assertion that catches it.
  check("...with the DETACHED ARMS still on it",
    Math.max(...xs) > 30 && Math.min(...xs) < -30,
    `x extent ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}`);
  check("...and the full height of the figure",
    Math.max(...ys) > 39 && Math.min(...ys) < -23,
    `y extent ${Math.min(...ys).toFixed(1)}..${Math.max(...ys).toFixed(1)}`);
  // A wall, not a slab: the outline is hollow, so the footprint area is a
  // fraction of the solid shape's.
  check("...and it is a WALL, not a filled slab", facets < 900, `${facets} facets`);
}

console.log("\nthe recipe tells the model not to throw parts away\n");
{
  const cc = readFileSync(new URL("../viewer/recipes/cookiecutter.md", import.meta.url), "utf8");
  check("it covers converting a shape that is already on screen",
    /ALREADY on screen/i.test(cc));
  check("...saying copy the existing points verbatim", /verbatim/i.test(cc));
  check("...keep every loop", /Keep every loop/i.test(cc));
  check("...and never drop a feature to make the offset behave",
    /Never delete a feature/i.test(cc));
  check("specks are distinguished from real limbs",
    /never a real limb or\s+fin/i.test(cc));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
