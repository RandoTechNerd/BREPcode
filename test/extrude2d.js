// The 2D subsystem: polygon/linearExtrude in the DSL, square/circle/polygon +
// linear_extrude in OpenSCAD (with 2D transforms and booleans), and JSCAD's
// extrudeLinear. Volumes measured from exported STL as always.

import {
  polygon, linearExtrude, translate, rotate, difference, cube, build, toSTL,
} from "../index.js";
import { fromOpenSCAD } from "../src/openscad.js";
import * as jscad from "../src/jscad.js";
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

console.log("\nDSL polygon + linearExtrude\n");

{
  const r = await build(linearExtrude({ h: 10 }, polygon([[0, 0], [10, 0], [0, 10]])));
  check("triangle prism, z 0..h", near(volumeOf(r), 500, 1) && near(boundsOf(r).z[0], 0, 1e-6),
    `${volumeOf(r).toFixed(1)} ${JSON.stringify(boundsOf(r).z)}`);
}
{
  const r = await build(linearExtrude({ h: 10, center: true }, polygon([[0, 0], [10, 0], [0, 10]])));
  check("center straddles z=0", near(boundsOf(r).z[0], -5, 1e-6), JSON.stringify(boundsOf(r).z));
}
{
  const r = await build(translate([100, 0, 0], rotate([90, 0, 0],
    linearExtrude({ h: 10 }, polygon([[0, 0], [10, 0], [0, 10]])))));
  check("transforms compose via XFORM", near(volumeOf(r), 500, 1) && near(boundsOf(r).x[0], 100, 1e-4),
    JSON.stringify(boundsOf(r)));
}
{
  const r = await build(difference(cube([20, 20, 5]),
    translate([5, 5, -1], linearExtrude({ h: 7 }, polygon([[0, 0], [10, 0], [5, 8]])))));
  check("prism as a boolean cutter", near(volumeOf(r), 2000 - 40 * 5, 2), `${volumeOf(r).toFixed(1)}`);
}

console.log("\nOpenSCAD linear_extrude\n");

await scad("polygon prism", `
  linear_extrude(height=27)
    polygon([[-4.25, 0], [4.25, 0], [9.5, 19], [-9.5, 19]]);`, (r, l) => {
  check(l, near(volumeOf(r), ((8.5 + 19) / 2) * 19 * 27, 5), `${volumeOf(r).toFixed(1)}`);
});

await scad("square (corner) and center", `
  linear_extrude(height=5) square([10, 20]);`, (r, l) => {
  const b = boundsOf(r);
  check(l, near(volumeOf(r), 1000, 1) && near(b.x[0], 0, 1e-6) && near(b.y[1], 20, 1e-6),
    JSON.stringify(b));
});

await scad("circle with $fn", `
  linear_extrude(height=10) circle(r=5, $fn=64);`, (r, l) => {
  check(l, near(volumeOf(r), Math.PI * 25 * 10, 10), `${volumeOf(r).toFixed(1)}`);
});

await scad("2D difference makes a ring", `
  linear_extrude(height=8)
    difference() {
      circle(r=10, $fn=64);
      circle(r=7, $fn=64);
    }`, (r, l) => {
  check(l, near(volumeOf(r), Math.PI * (100 - 49) * 8, 15), `${volumeOf(r).toFixed(1)}`);
});

await scad("2D translate + rotate before extrude", `
  linear_extrude(height=4)
    translate([20, 0]) rotate(45) square([10, 10], center=true);`, (r, l) => {
  const b = boundsOf(r);
  const mid = (b.x[0] + b.x[1]) / 2;
  check(l, near(volumeOf(r), 400, 2) && near(mid, 20, 0.1) && near(b.x[1] - b.x[0], 10 * Math.SQRT2, 0.1),
    JSON.stringify(b));
});

await scad("linear_extrude center=true", `
  linear_extrude(height=10, center=true) square([4, 4], center=true);`, (r, l) => {
  check(l, near(boundsOf(r).z[0], -5, 1e-6), JSON.stringify(boundsOf(r).z));
});

await scad("implicit 2D union inside extrude", `
  linear_extrude(height=3) {
    square([10, 10]);
    translate([10, 0]) square([10, 10]);
  }`, (r, l) => check(l, near(volumeOf(r), 600, 2), `${volumeOf(r).toFixed(1)}`));

for (const [src, wants] of [
  ["linear_extrude(height=5, twist=90) square([2,2]);", "twist"],
  ["linear_extrude(height=5, scale=0.5) square([2,2]);", "scale"],
  // (a bare 2D shape no longer errors — it auto-extrudes; see test/forgiving.js)
  ["union() { circle(5); cube(5); }", "mix"],
  ["polygon([[0,0],[1,0],[1,1]], [[0,1,2],[3,4,5]]);", "paths"],
]) {
  try {
    await build(fromOpenSCAD(src));
    check(`rejects: ${wants}`, false, "no error");
  } catch (e) {
    check(`rejects ${wants} with a clear message`, e.message.toLowerCase().includes(wants), e.message);
  }
}

console.log("\nthe pasted Gemini screwdriver holder\n");
{
  const src = readFileSync(new URL("../examples/screwdriver-holder.scad", import.meta.url), "utf8");
  const t0 = Date.now();
  const r = await build(fromOpenSCAD(src));
  const b = boundsOf(r), v = volumeOf(r);
  check("builds to one solid", r.solids.length === 1, `${r.solids.length}`);
  // analytic bounds: x = ±outer_d/2 = ±9.5; y = ±holder_height/2 = ±12.5;
  // z = cylinder centre 10.7 ± 12.5 → [-1.8, 23.2]
  check("bounds match the OpenSCAD semantics",
    near(b.x[0], -9.5, 0.05) && near(b.y[1], 12.5, 0.05) &&
    near(b.z[0], -1.8, 0.05) && near(b.z[1], 23.2, 0.05),
    JSON.stringify(b));
  check("V-cut, shaft and magnet holes removed material", v > 2000 && v < 6500, `${v.toFixed(0)} mm3`);
  console.log(`        (volume ${v.toFixed(0)} mm3 in ${Date.now() - t0} ms)`);
}

console.log("\nJSCAD 2D + extrudeLinear\n");
{
  const r = await build(jscad.extrudeLinear({ height: 10 }, jscad.circle({ radius: 5, segments: 64 })));
  check("extrudeLinear circle", near(volumeOf(r), Math.PI * 25 * 10, 10), `${volumeOf(r).toFixed(1)}`);
}
{
  const r = await build(jscad.extrudeLinear({ height: 6 },
    jscad.subtract(
      jscad.rectangle({ size: [30, 20] }),
      jscad.circle({ radius: 4, segments: 48 }),
    )));
  check("2D subtract then extrude", near(volumeOf(r), 30 * 20 * 6 - Math.PI * 16 * 6, 12),
    `${volumeOf(r).toFixed(1)}`);
}
{
  // the require-module idiom with extrusions, end to end
  const { prepareJscadModule, requireShim } = jscad;
  const body = prepareJscadModule(`
const { extrudeLinear } = require('@jscad/modeling/src/operations/extrusions')
const { circle } = require('@jscad/modeling/src/primitives')
const main = () => extrudeLinear({ height: 5 }, circle({ radius: 10, segments: 64 }))
module.exports = { main }`);
  const out = new Function("require", `"use strict";\n${body}`)(requireShim);
  const r = await build(out);
  check("require('...extrusions') module works", near(volumeOf(r), Math.PI * 100 * 5, 18),
    `${volumeOf(r).toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
