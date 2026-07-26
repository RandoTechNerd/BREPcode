// OpenSCAD library-ecosystem support: include/use handling, BOSL2/MCAD shims
// (with honest warnings), let/assert, and a complex organic model end-to-end.

import { build, toSTL } from "../index.js";
import { fromOpenSCAD, getWarnings } from "../src/openscad.js";
import { readFileSync } from "node:fs";

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
function boundsOf(r) {
  const p = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
async function scad(label, source, assert) {
  try { assert(await build(fromOpenSCAD(source)), label); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — threw: ${e.message}`); }
}

console.log("\nBOSL2 shims\n");

await scad("up() + cuboid() (centred)", `
  include <BOSL2/std.scad>
  up(20) cuboid([20, 20, 10]);`, (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.z[0], 15, 1e-6) && near(b.z[1], 25, 1e-6) && near(b.x[0], -10, 1e-6), JSON.stringify(b));
});

await scad("cyl(l, d) centred both ways", `
  include <BOSL2/std.scad>
  $fn = 64;
  cyl(l=20, d=10);`, (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.z[0], -10, 1e-6) && near(b.z[1], 10, 1e-6), JSON.stringify(b.z));
  check("cyl volume", near(volumeOf(r), Math.PI * 25 * 20, 12), `got ${volumeOf(r).toFixed(1)}`);
});

await scad("xcyl lies along X", `
  include <BOSL2/std.scad>
  xcyl(l=30, r=3, $fn=32);`, (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.x[1] - b.x[0], 30, 0.1) && (b.z[1] - b.z[0]) < 7, JSON.stringify(b));
});

await scad("tube(od, id)", `
  include <BOSL2/std.scad>
  $fn = 64;
  tube(h=10, od=20, id=16);`, (r, l) => {
  check(l, near(volumeOf(r), Math.PI * (100 - 64) * 10, 10), `got ${volumeOf(r).toFixed(1)}`);
});

await scad("torus(r_maj, r_min)", `
  include <BOSL2/std.scad>
  torus(r_maj=10, r_min=2, $fn=48);`, (r, l) => {
  // V = 2 pi^2 R r^2
  check(l, near(volumeOf(r), 2 * Math.PI ** 2 * 10 * 4, 60), `got ${volumeOf(r).toFixed(1)}`);
});

await scad("directional aliases compose", `
  include <BOSL2/std.scad>
  right(30) back(10) zrot(45) cuboid([10, 2, 2]);`, (r, l) => {
  const b = boundsOf(r);
  check(l, near((b.x[0] + b.x[1]) / 2, 30, 0.2) && near((b.y[0] + b.y[1]) / 2, 10, 0.2), JSON.stringify(b));
});

{
  // cuboid rounding is real now (hull of corner spheres) — a rounded box has
  // far more facets than a plain 12-triangle cube, and keeps its footprint.
  const shape = fromOpenSCAD(`
    include <BOSL2/std.scad>
    cuboid([10, 10, 10], rounding=2);`);
  const r = await build(shape);
  const nf = (toSTL(r, "t").match(/facet/g) || []).length;
  const b = boundsOf(r);
  check("cuboid rounding actually rounds (not a plain cube)",
    nf > 40 && near(b.x[1] - b.x[0], 10, 0.2) && near(b.z[1] - b.z[0], 10, 0.2), `${nf} facets ${JSON.stringify(b)}`);
}

{
  const shape = fromOpenSCAD(`
    include <BOSL2/std.scad>
    cuboid([20, 20, 4]) attach(TOP) cyl(l=8, d=6);`);
  const r = await build(shape);
  check("attach() warns about missing solver",
    getWarnings().some((w) => w.includes("attach")), JSON.stringify(getWarnings()));
  // cuboid = 1600; the attached cyl must actually contribute (≈ +113 outside it)
  check("attach() child geometry is included", volumeOf(r) > 1650, `${volumeOf(r).toFixed(1)}`);
}

console.log("\nMCAD shims\n");

await scad("polyhole is a cylinder", `
  use <MCAD/polyholes.scad>
  polyhole(h=10, d=6);`, (r, l) => {
  check(l, near(volumeOf(r), Math.PI * 9 * 10, 30), `got ${volumeOf(r).toFixed(1)}`);
});

{
  const shape = fromOpenSCAD(`
    use <MCAD/boxes.scad>
    roundedBox([20, 30, 10], 3, true);`);
  const r = await build(shape);
  check("roundedBox builds centred", near(volumeOf(r), 6000, 5), `got ${volumeOf(r).toFixed(1)}`);
  check("roundedBox warns about square corners",
    getWarnings().some((w) => w.includes("square")), JSON.stringify(getWarnings()));
}

console.log("\nunknown libraries\n");

{
  const shape = fromOpenSCAD(`
    include <NopSCADlib/lib.scad>
    cube([10, 10, 10]);`);
  await build(shape);
  check("unbundled include warns but the script continues",
    getWarnings().some((w) => w.includes("NopSCADlib")), JSON.stringify(getWarnings()));
}

{
  // Forgiving: an unbundled library call is skipped with a warning (not a hard
  // error), so the rest of the model still builds.
  const shape = fromOpenSCAD(`
    include <threadlib/threadlib.scad>
    thread("M12x1.75", turns=5);
    cube([10, 10, 10]);`);
  await build(shape);
  check("unbundled call is skipped with a warning, script still builds",
    getWarnings().some((w) => /thread/.test(w)), JSON.stringify(getWarnings()));
}

console.log("\nlet / assert\n");

await scad("let() statement", `
  let (a = 10, b = a + 5) cube([a, b, 2]);`, (r, l) =>
  check(l, near(volumeOf(r), 10 * 15 * 2, 1), `got ${volumeOf(r).toFixed(1)}`));

await scad("let() expression", `
  w = let (k = 3) k * 4;
  cube([w, 5, 1]);`, (r, l) =>
  check(l, near(volumeOf(r), 60, 0.5), `got ${volumeOf(r).toFixed(1)}`));

await scad("assert(true) passes through", `
  assert(1 < 2);
  cube(5);`, (r, l) => check(l, near(volumeOf(r), 125, 0.5), `got ${volumeOf(r).toFixed(1)}`));

try {
  fromOpenSCAD("assert(1 > 2, \"impossible\"); cube(5);");
  check("assert(false) throws its message", false, "no error");
} catch (e) {
  check("assert(false) throws its message", e.message.includes("impossible"), e.message);
}

console.log("\ncomplex organic model (elephant)\n");

{
  const src = readFileSync(new URL("../examples/elephant.scad", import.meta.url), "utf8");
  const t0 = Date.now();
  const r = await build(fromOpenSCAD(src));
  const b = boundsOf(r), v = volumeOf(r);
  check("elephant builds to a single solid", r.solids.length === 1, `${r.solids.length} solids`);
  check("elephant is elephant-sized", b.z[0] >= -1 && b.z[1] > 55 && (b.x[1] - b.x[0]) > 30,
    JSON.stringify(b));
  check("elephant has real volume", v > 30000 && v < 120000, `${v.toFixed(0)} mm3`);
  console.log(`        (volume ${v.toFixed(0)} mm3, built in ${Date.now() - t0} ms)`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
