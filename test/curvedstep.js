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

import { buildCurved, _setReplicad } from "../viewer/curved.js";
import {
  cube, cylinder, cone, sphere, torus, polygon, linearExtrude,
  difference, union, translate, rotate, scale, importedMesh, registerImport,
  hull, freeform,
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
try {
  registerImport("m.stl", "solid m\nendsolid m\n");
  await stepOf(importedMesh("m.stl"));
  check("mesh import errors clearly", false, "no error");
} catch (e) {
  check("mesh import errors clearly", /triangles/.test(e.message), e.message.slice(0, 60));
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
