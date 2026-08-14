// One model, several materials.
//
// The Material panel has exactly one answer for the whole model: one filament,
// one roughness, one pattern. Real objects are not like that. "The body should
// be balsa but the screws titanium", "only the middle in glitter, not the whole
// thing" — both are the same request, and before this the answer was no.
//
// finish(name, shape) says what ONE piece is made of. The right-click menu's
// "Material & pattern…" block sets the same thing by hand. Both write a
// per-FEATURE override that beats the panel for that piece and leaves every
// other piece following it.
//
// The traps this file exists to catch:
//
//   * the finish must reach the VIEWER, which means the trace, which means
//     every one of the eight places compile() records a shape;
//   * a name may be a Cookiecad spool OR a Material-panel preset — "titanium"
//     is a real answer even though there is no titanium filament;
//   * the geometry must not change. A material is a look. An STL that shifted
//     by so much as a vertex because somebody picked gold would be a bug in
//     the one direction that matters;
//   * and the OpenSCAD bridge has to pass the arguments the right way round —
//     see the note on argument order at the bottom, which is a bug this file
//     found rather than one it was written for.

import { PartHistory } from "brep-io-kernel";
import { build, toSTL } from "../index.js";
import {
  compile, finish, colorize, glow, cube, cylinder, sphere, union, difference, translate, group,
} from "../src/dsl.js";
import { fromOpenSCAD, getWarnings } from "../src/openscad.js";
import { SPOOLS, findSpool } from "../viewer/filaments.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// compile() FILLS a trace array — the same one the viewer reads to decide what
// each mesh is made of. No runHistory: nothing here needs the geometry, only
// the record of what was asked for.
async function traceOf(shape) {
  const trace = [];
  await compile(shape, new PartHistory(), trace);
  return trace;
}
const finishes = async (shape) => Object.fromEntries(
  (await traceOf(shape)).filter((t) => t.finish).map((t) => [t.id, t.finish]));

console.log("\nfinish() marks one piece and only that piece\n");
{
  const model = union(
    finish("cc-golddust", cube([20, 20, 8])),
    cylinder({ r: 3, h: 30 }),
    cube([40, 40, 6]),
  );
  const f = await finishes(model);
  check("the tagged shape carries its material", Object.values(f).includes("cc-golddust"),
    JSON.stringify(f));
  check("...and it is the ONLY one that does", Object.keys(f).length === 1,
    `${Object.keys(f).length} shapes came back tagged`);

  // The whole point of the request: two materials in one object.
  const two = union(
    finish("Balsa", cube([40, 40, 6])),
    finish("Titanium", cylinder({ r: 1.5, h: 12 })),
  );
  const t = Object.values(await finishes(two)).sort();
  check("two materials in one model", t.length === 2 && t[0] === "Balsa" && t[1] === "Titanium",
    JSON.stringify(t));
}

console.log("\nit survives the operations a real model puts it through\n");
{
  // A finish set on a piece that is then moved, grouped or cut is still that
  // piece's finish — otherwise it would only work on models built in one line.
  const moved = translate([10, 0, 0], finish("Brass", cylinder({ r: 4, h: 10 })));
  check("through translate()", Object.values(await finishes(moved)).includes("Brass"));

  const grouped = group(finish("Steel", cube([5, 5, 5])), cube([9, 9, 9]));
  check("through group()", Object.values(await finishes(grouped)).includes("Steel"));

  const cut = difference(finish("Oak wood", cube([30, 30, 10])),
    translate([15, 15, -1], cylinder({ r: 4, h: 12 })));
  check("through difference() — the body keeps it",
    Object.values(await finishes(cut)).includes("Oak wood"));

  // Wrapping several shapes at once is the natural way to say "all of this
  // part is titanium", and it has to reach every one of them.
  const many = finish("Copper", cube([4, 4, 4]), cylinder({ r: 2, h: 8 }), sphere({ r: 3 }));
  const n = Object.keys(await finishes(many)).length;
  check("finish() over several shapes tags all THREE, not just the first",
    n === 3, `${n} tagged`);
}

console.log("\na material and a colour are different questions\n");
{
  // Both can be true at once: brass-coloured PLA is not brass. The viewer
  // keys its material cache on the pair, so both must arrive.
  const both = colorize("#ff0000", finish("Titanium", cube([10, 10, 10])));
  const tr = (await traceOf(both)).filter((t) => t.finish);
  check("a shape can carry a colour AND a material",
    tr.length === 1 && tr[0].color && tr[0].finish === "Titanium",
    JSON.stringify(tr.map((t) => ({ c: t.color, f: t.finish }))));

  const lit = glow("#39ff14", 2, finish("cc-darkmagic", sphere({ r: 4 })));
  const g = (await traceOf(lit)).filter((t) => t.finish && t.emissive);
  check("...and a glow AND a material", g.length === 1, JSON.stringify(g.length));
}

console.log("\nthe name is a spool OR a material, and both are real answers\n");
{
  // The viewer resolves a spool through findSpool and a preset by name. A name
  // that is neither is still recorded — "walnut" is a legitimate thing to say
  // about a part even when nothing can render it — but it must not throw.
  check("a spool id resolves", !!findSpool("cc-golddust"));
  check("...and the short form does too", !!findSpool("golddust"),
    "the menu stores cc-golddust, but a person types golddust");
  check("a preset name is NOT a spool", findSpool("Titanium") === null,
    "it has to fall through to the Material presets instead");
  check("nonsense resolves to nothing rather than throwing", findSpool("banana") === null);

  const odd = finish("walnut burl", cube([10, 10, 10]));
  check("an unknown material is still recorded",
    Object.values(await finishes(odd)).includes("walnut burl"));

  // Every spool the menu offers must actually be findable by the id the menu
  // puts in the option value, or picking it would silently do nothing.
  const unreachable = SPOOLS.filter((s) => findSpool(s.id) === null).map((s) => s.id);
  check("every spool in the list is reachable by its own id", unreachable.length === 0,
    unreachable.join(", "));
}

console.log("\nit refuses what it cannot mean\n");
{
  let threw = "";
  try { finish("Titanium"); } catch (e) { threw = e.message; }
  check("a material with no shape is refused", /needs a shape/.test(threw), threw);

  threw = "";
  try { finish("", cube([5, 5, 5])); } catch (e) { threw = e.message; }
  check("a shape with no material is refused", /needs a material/.test(threw), threw);

  threw = "";
  try { finish("   ", cube([5, 5, 5])); } catch (e) { threw = e.message; }
  check("...and whitespace is not a material name", /needs a material/.test(threw), threw);
}

console.log("\nTHE GEOMETRY DOES NOT MOVE\n");
{
  // A material is a look. If choosing gold changed the part by one vertex,
  // everything else in this file would be beside the point.
  const plain = cube([30, 20, 10]);
  const fancy = finish("cc-fairyfloss", cube([30, 20, 10]));
  const a = toSTL(await build(plain), "a");
  const b = toSTL(await build(fancy), "b");
  const verts = (s) => [...s.matchAll(/vertex\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)\s+(-?[\d.eE+]+)/g)]
    .map((m) => m.slice(1).join(",")).join("|");
  check("the STL is byte-for-byte the same shape", verts(a) === verts(b),
    `${verts(a).length} vs ${verts(b).length} chars of vertex data`);

  const multi = await build(union(
    finish("Balsa", cube([40, 40, 6])),
    finish("Titanium", translate([18, 18, 6], cylinder({ r: 1.5, h: 12 }))),
  ));
  check("a two-material model still builds one real solid",
    toSTL(multi, "m").includes("vertex"));
}

console.log("\ncallable from pasted OpenSCAD, with the arguments the right way round\n");
{
  // The DSL bridge passes a child FIRST, because that is what the shape-taking
  // functions want: glueSocket(gap = 0.2) part() -> glueSocket(shape, {gap}).
  // But finish("Titanium") part() is the opposite shape of call, and passing
  // the child first handed finish() a SOLID as its material name — which came
  // back as "[object Object]" with no error at all. Positional args present is
  // the tell.
  const m = fromOpenSCAD('finish("Titanium") cube([10, 10, 10]);');
  const f = await finishes(m);
  check("finish() from OpenSCAD names the material, not the shape",
    Object.values(f).includes("Titanium"), JSON.stringify(f));
  check("...and did not warn its way out", !getWarnings().some((w) => /finish/.test(w)),
    getWarnings().join(" | "));

  // The same bug, in the function that measures a fit: clearance(0.3) part()
  // passed the solid as the GAP, so the gap became NaN.
  const c = fromOpenSCAD("clearance(0.4) cube([10, 10, 10]);");
  check("clearance() from OpenSCAD takes the number as the gap",
    !!c && !getWarnings().some((w) => /clearance.*returned no shape/.test(w)),
    getWarnings().join(" | "));

  // ...while the child-first family must be untouched by the fix.
  const g = fromOpenSCAD("glueSocket(gap = 0.25) cylinder(r = 5, h = 4);");
  check("a shape-first DSL call still works", !!g,
    "glueSocket(gap=…) part() must keep passing the part first");
}

console.log("\nthe viewer is wired to all of it\n");
{
  // These are single points of failure that no unit test can reach: the maps
  // live inside one 15k-line inline module. The first version of this feature
  // shipped a matForFeature that read `codeFinish` without declaring it, which
  // is a ReferenceError on EVERY build — caught by reading the file, because
  // there is nothing else that can catch it.
  const V = readFileSync("viewer/index.html", "utf8");
  const has = (needle, label) => check(label, V.includes(needle), needle);

  has("const featureFinish = {}", "the manual override map is declared");
  has("const featurePattern = {}", "the manual pattern map is declared");
  has("let codeFinish = {}", "the code-set finish map is declared");
  has("codeFinish[t.id] = t.finish", "...and is filled from the build trace");
  has("featureFinish[fid] ?? codeFinish[fid]", "a hand-set material beats the code's");
  has("+ (fin || \"-\") + \"|\" + (pat ?? \"-\")",
    "the material cache is keyed on material AND pattern");
  has("if (m.userData.finish) applyFinishTo(m, m.userData.finish)",
    "a panel change re-asserts each piece's own material");
  has("!m.userData.finish", "...and does not paint the panel's filament over it");
  has("uTexKind: sharedFx.kind || sharedTex.kind", "a piece can carry its own pattern");
  has("const patK = pat ?? (fin ? presetFor(fin)?.texture ?? null : null)",
    "a preset's own pattern is resolved before the shader compiles");
  has('id="sm-material"', "the menu has a material picker");
  has('id="sm-pattern"', "...and a pattern picker");
  has('id="sm-more"', "...behind the expand row the user asked for");
  has("o.value.toLowerCase() === lc",
    'the picker matches finish("titanium") to the "Titanium" entry');
  has("kitFor(F.findSpool(fin))", "the GLB export reads each mesh's own filament");
  has("const anyFinish", "...and loads the spool table when any piece needs one");
  has("window.__brepMatReport", "and there is a hook to prove which piece got what");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
