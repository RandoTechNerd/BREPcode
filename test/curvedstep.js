// Curved STEP export: the DSL tree mirrored into OCCT (replicad) must emit
// genuine analytic surfaces — CYLINDRICAL/SPHERICAL/CONICAL/TOROIDAL — not
// the faceted planes the mesh kernel produces.
//
// Node can't import the dual-format emscripten loader directly, so this test
// converts it to CJS in the temp dir and injects the initialised replicad
// via the _setReplicad hook.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { buildCurved, stepToStl, _setReplicad } from "../viewer/curved.js";
import {
  cube, cylinder, cone, sphere, torus, polygon, linearExtrude,
  difference, union, translate, rotate, scale, importedMesh, registerImport,
  hull, freeform, fillet, texture,
} from "../src/dsl.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

// ---- boot replicad in node
const loaderSrc = readFileSync("node_modules/replicad-opencascadejs/src/replicad_single.js", "utf8")
  .replace(/export default Module;\s*$/, "module.exports = Module;");
const loaderPath = join(tmpdir(), "brepcode-replicad-loader.cjs");
writeFileSync(loaderPath, loaderSrc);
const require = createRequire(import.meta.url);
const initOC = require(loaderPath);
const replicad = await import("replicad");
replicad.setOC(await initOC({
  locateFile: () => "node_modules/replicad-opencascadejs/src/replicad_single.wasm",
}));
_setReplicad(replicad);

const stepOf = async (root) => (await buildCurved(root)).blobSTEP().text();
const count = (s, re) => (s.match(re) || []).length;

console.log("\ncurved STEP\n");

{
  const s = await stepOf(difference(
    cube([30, 30, 12]),
    translate([15, 15, -1], cylinder({ r: 8, h: 14 })),
  ));
  check("drilled box: true cylindrical surface", count(s, /CYLINDRICAL_SURFACE/g) === 1, String(count(s, /CYLINDRICAL_SURFACE/g)));
  check("drilled box: 6 planes, no triangle soup", count(s, /\bPLANE\(/g) === 6 && count(s, /TRIANGULATED/g) === 0);
  check("compact file (analytic, not faceted)", s.length < 60_000, `${s.length} bytes`);
}
{
  const s = await stepOf(sphere({ r: 10 }));
  check("sphere: SPHERICAL_SURFACE", count(s, /SPHERICAL_SURFACE/g) >= 1);
}
{
  const s = await stepOf(cone({ r1: 8, r2: 3, h: 12 }));
  check("cone: CONICAL_SURFACE", count(s, /CONICAL_SURFACE/g) >= 1);
}
{
  const s = await stepOf(torus({ r: 12, tube: 3 }));
  check("torus: TOROIDAL_SURFACE", count(s, /TOROIDAL_SURFACE/g) >= 1);
}
{
  const s = await stepOf(rotate([0, 0, 30], translate([5, 0, 0],
    union(cube([10, 10, 10]), translate([5, 5, 10], sphere({ r: 4 }))))));
  check("nested transforms + union survive", count(s, /SPHERICAL_SURFACE/g) >= 1 && count(s, /MANIFOLD_SOLID_BREP/g) === 1);
}
{
  const s = await stepOf(linearExtrude({ h: 6 }, polygon([[0, 0], [20, 0], [10, 15]])));
  check("polygon extrude exports", count(s, /MANIFOLD_SOLID_BREP/g) === 1 && count(s, /\bPLANE\(/g) === 5);
}
{
  const s = await stepOf(scale([2, 2, 2], sphere({ r: 5 })));
  check("uniform scale works", count(s, /SPHERICAL_SURFACE/g) >= 1);
}
try {
  await stepOf(scale([1, 2, 1], cylinder({ r: 5, h: 10 })));
  check("non-uniform scale errors clearly", false, "no error");
} catch (e) {
  check("non-uniform scale errors clearly", /non-uniform/.test(e.message), e.message.slice(0, 60));
}
{
  // imported meshes now go THROUGH OCCT (importSTL sews the triangles), so
  // drawings and STEP work on imports too — faceted surfaces, correct shape
  const asciiCube = (s) => {
    const P = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, 6], [s, 0, 6], [s, s, 6], [0, s, 6]];
    const q = (a, b, c, d) => [[a, b, c], [a, c, d]];
    const tris = [...q(0, 3, 2, 1), ...q(4, 5, 6, 7), ...q(0, 1, 5, 4), ...q(2, 3, 7, 6), ...q(0, 4, 7, 3), ...q(1, 2, 6, 5)];
    const lines = ["solid c"];
    for (const t of tris) {
      lines.push("facet normal 0 0 0", "outer loop");
      for (const i of t) lines.push(`vertex ${P[i][0]} ${P[i][1]} ${P[i][2]}`);
      lines.push("endloop", "endfacet");
    }
    lines.push("endsolid c");
    return lines.join("\n");
  };
  registerImport("part.stl", asciiCube(12));
  const step = await stepOf(translate([5, 0, 0], importedMesh("part.stl")));
  check("an imported mesh exports as real STEP now", /ADVANCED_FACE|MANIFOLD_SOLID_BREP/.test(step));
  const back = await stepToStl(step, "back");
  const xs = [...back.matchAll(/vertex\s+(\S+)/g)].map((m) => +m[1]);
  check("...transformed to where the code put it",
    Math.abs(Math.min(...xs) - 5) < 0.2 && Math.abs(Math.max(...xs) - 17) < 0.2,
    `x ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}`);
}
{
  // a knurled part (the goggles' gain dial) must export too — displaced
  // geometry is honestly faceted, sewn back in through OCCT
  const step = await stepOf(union(
    cube([20, 20, 4]),
    translate([10, 10, 4], texture({ pattern: "knurl", depth: 0.5, scale: 2, maxTris: 2000 },
      cylinder({ r: 6, h: 5, $fn: 48 }))),
  ));
  check("texture() rides into curved STEP/blueprints", /ADVANCED_FACE/.test(step) && step.length > 10000,
    `${(step.length / 1024).toFixed(0)}KB`);
}
try {
  // a mesh too dense for hidden-line removal still refuses, with a number
  const big = ["solid big"];
  for (let i = 0; i < 20001; i++) {
    big.push("facet normal 0 0 0", "outer loop",
      `vertex ${i % 100} ${i / 100} 0`, `vertex ${i % 100 + 1} ${i / 100} 0`, `vertex ${i % 100} ${i / 100 + 1} 1`,
      "endloop", "endfacet");
  }
  big.push("endsolid big");
  registerImport("big.stl", big.join("\n"));
  await stepOf(importedMesh("big.stl"));
  check("a too-dense import refuses with guidance", false, "no error");
} catch (e) {
  check("a too-dense import refuses with guidance", /[Dd]ecimate/.test(e.message), e.message.slice(0, 70));
}

// hull() has no analytic form and OCCT has no hull operation, so the exporter
// computes the hull itself and feeds OCCT the triangles. Before this, hull threw
// "unknown node kind" and took SVG blueprint and STEP export down with it.
console.log("\nhull and freeform reach the curved exporter\n");
{
  const shape = await buildCurved(
    hull(cylinder({ r: 10, h: 4 }), translate([40, 0, 0], cylinder({ r: 5, h: 4 }))));
  const [lo, hi] = shape.boundingBox.bounds;
  const near = (a, b) => Math.abs(a - b) < 0.6;
  check("hull exports at all", !!shape);
  check("hull spans both cylinders", near(lo[0], -10) && near(hi[0], 45),
    `x ${lo[0].toFixed(1)}..${hi[0].toFixed(1)}`);
  check("hull keeps its height", near(hi[2] - lo[2], 4), `${(hi[2] - lo[2]).toFixed(2)}`);
}
{
  // a hull inside a boolean, which is where the old failure actually bit
  const shape = await buildCurved(difference(
    hull(cylinder({ r: 12, h: 6 }), translate([35, 0, 0], cylinder({ r: 12, h: 6 }))),
    translate([17, 0, -1], cylinder({ r: 5, h: 10 }))));
  check("hull can be cut by a boolean", !!shape && shape.boundingBox.bounds[1][0] > 40);
}
{
  const shape = await buildCurved(freeform([[0, 0, 0], [20, 0, 0], [0, 20, 0], [0, 0, 10]]));
  const [lo, hi] = shape.boundingBox.bounds;
  check("freeform exports", !!shape);
  check("freeform spans its corners", hi[0] - lo[0] > 19 && hi[2] - lo[2] > 9,
    `${(hi[0] - lo[0]).toFixed(1)} x ${(hi[2] - lo[2]).toFixed(1)}`);
}

// A profile built from arcs repeats a point at every arc junction, because each
// arc starts where the last one ended. The BREP.io kernel ignores the resulting
// zero-length edge; OCCT refuses the wire, and emscripten reported it as a bare
// heap pointer ("SVG export failed: 8867952"). The exporter drops duplicates now.
console.log("\nprofiles with duplicate points still export\n");
{
  // the same shape written twice: once clean, once with every point doubled
  const square = [[0, 0], [20, 0], [20, 20], [0, 20]];
  const doubled = square.flatMap((p) => [p, [...p]]);
  const clean = await buildCurved(linearExtrude({ h: 5 }, polygon(square)));
  const dupes = await buildCurved(linearExtrude({ h: 5 }, polygon(doubled)));
  const size = (s) => {
    const [lo, hi] = s.boundingBox.bounds;
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map((n) => n.toFixed(1)).join("x");
  };
  check("duplicated points do not break the export", size(dupes) === size(clean),
    `${size(dupes)} vs ${size(clean)}`);
}
{
  // a trailing point equal to the first: close() would draw a zero-length segment
  const closed = [[0, 0], [20, 0], [20, 20], [0, 20], [0, 0]];
  const s = await buildCurved(linearExtrude({ h: 5 }, polygon(closed)));
  check("an explicitly closed profile exports", !!s && s.boundingBox.bounds[1][0] > 19);
}
{
  let threw = "";
  try { await buildCurved(linearExtrude({ h: 5 }, polygon([[0, 0], [0, 0], [0, 0]]))); }
  catch (e) { threw = e.message; }
  check("a profile with no area says so in words", /no area/.test(threw), threw.slice(0, 60));
  check("and is a real Error, not a heap pointer", threw.length > 0);
}

// The blueprint carries dimensions on all four views. The isometric ones have to
// run ALONG the projected axes, and that basis was measured out of replicad's
// camera rather than assumed — so if replicad ever changes its projection, these
// angles are what catches it.
console.log("\nblueprint dimensions\n");
{
  const { curvedDrawingSVG } = await import("../viewer/curved.js");
  const svg = await curvedDrawingSVG(cube([60, 40, 25]), { title: "dims" });
  const groups = svg.match(/<g stroke="#8fb8e6" stroke-width="1"[\s\S]*?<\/g>/g) || [];
  check("every view is dimensioned", groups.length === 9, `${groups.length} groups`);

  const values = groups.map((g) => (g.match(/>([\d.]+)<\/text>/) || [])[1]);
  const has = (v, n) => values.filter((x) => x === v).length === n;
  check("60 appears on top, front and isometric", has("60.0", 3), values.join(","));
  check("40 appears on top, right and isometric", has("40.0", 3), values.join(","));
  check("25 appears on front, right and isometric", has("25.0", 3), values.join(","));

  const rots = groups
    .map((g) => (g.match(/rotate\((-?[\d.]+)/) || [])[1])
    .filter(Boolean).map(Number);
  const near = (a, b) => rots.some((r) => Math.abs(r - a) < 1.5) && b;
  check("an isometric dimension runs up-right at +30", near(30, true), rots.join(","));
  check("another runs up-left at -30", near(-30, true), rots.join(","));
  check("and one runs vertically", near(-90, true), rots.join(","));

  // nothing may spill outside the drawn border
  const [, W, H] = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).map(Number);
  const coords = groups.flatMap((g) => [...g.matchAll(/[xy][12]="([\d.-]+)"/g)].map((m) => +m[1]));
  check("no dimension leaves the sheet",
    Math.min(...coords) > 0 && Math.max(...coords) < Math.max(W, H),
    `${Math.min(...coords).toFixed(0)}..${Math.max(...coords).toFixed(0)}`);
}

// ---- STEP IMPORT: OCCT's own reader, round-tripped --------------------------
console.log("\nSTEP import\n");
{
  // a filleted, drilled block: curves everywhere, then read back in
  const model = fillet(2, difference(
    cube([30, 30, 12]),
    translate([15, 15, -1], cylinder({ r: 5, h: 14, $fn: 48 })),
  ));
  const step = await stepOf(model);
  check("R-all-edges emits real toroidal fillets", count(step, /TOROIDAL_SURFACE/) > 0);
  check("...and the drilled hole stays cylindrical", count(step, /CYLINDRICAL_SURFACE/) > 0);

  const stl = await stepToStl(step, "roundtrip");
  const verts = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  check("the STEP reads back through OCCT", verts.length > 300, `${verts.length} verts`);
  const ax = (i) => [Math.min(...verts.map((p) => p[i])), Math.max(...verts.map((p) => p[i]))];
  const [x0, x1] = ax(0), [z0, z1] = ax(2);
  check("...at its true size", Math.abs(x1 - x0 - 30) < 0.2 && Math.abs(z1 - z0 - 12) < 0.2,
    `x ${(x1 - x0).toFixed(2)}, z ${(z1 - z0).toFixed(2)}`);
  let vol = 0;
  for (let i = 0; i < verts.length; i += 3) {
    const [a, b, c] = verts.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  vol = Math.abs(vol);
  // block minus hole minus fillet trim: between "hole only" and "hole + generous fillets"
  check("...with a sane volume", vol > 8600 && vol < 9930, vol.toFixed(0));
}
{
  // garbage in -> a sentence out, not an OCCT hex code
  try {
    await stepToStl("this is not a step file", "junk");
    check("junk STEP fails with a readable error", false, "no error");
  } catch (e) {
    check("junk STEP fails with a readable error", /STEP/i.test(e.message), e.message.slice(0, 80));
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
