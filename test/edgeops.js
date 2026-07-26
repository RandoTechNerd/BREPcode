// Fillet / chamfer / revolve — the kernel edge-rounding and lathe features
// surfaced through the DSL.

import {
  cube, cylinder, sphere, polygon, fillet, chamfer, revolve,
  difference, union, translate, build, toSTL,
} from "../index.js";

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function facetsOf(r) { return (toSTL(r, "t").match(/facet normal/g) || []).length; }
function volumeOf(r) {
  const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
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

console.log("\nfillet / chamfer\n");
{
  const plain = facetsOf(await build(cube([20, 20, 20])));
  const rounded = facetsOf(await build(fillet(3, cube([20, 20, 20]))));
  check("fillet(3, cube) rounds every edge", rounded > plain + 50, `${plain} -> ${rounded}`);
  // rounding removes material from the corners, so volume drops a little
  const filVol = volumeOf(await build(fillet(3, cube([20, 20, 20]))));
  check("filleted cube volume < plain cube", filVol < 8000 && filVol > 7000, filVol.toFixed(0));
  const filB = boundsOf(await build(fillet(3, cube([20, 20, 20]))));
  check("filleted cube keeps its 20mm footprint",
    near(filB.x[1] - filB.x[0], 20, 0.2) && near(filB.z[1] - filB.z[0], 20, 0.2), JSON.stringify(filB));
}
{
  const rounded = facetsOf(await build(chamfer(3, cube([20, 20, 20]))));
  check("chamfer(3, cube) bevels every edge", rounded > 12 + 12, String(rounded));
}
{
  // number shorthand and options object agree
  const a = volumeOf(await build(fillet(2, cube([16, 16, 16]))));
  const b = volumeOf(await build(fillet({ r: 2 }, cube([16, 16, 16]))));
  check("fillet number vs {r:} match", near(a, b, 1), `${a.toFixed(0)} vs ${b.toFixed(0)}`);
}
{
  // fillet only the top face's edges → fewer facets than all-edge fillet
  const top = facetsOf(await build(fillet({ r: 3, faces: "top" }, cube([20, 20, 20]))));
  const all = facetsOf(await build(fillet({ r: 3 }, cube([20, 20, 20]))));
  check("fillet faces:'top' rounds a subset", top > 12 && top < all, `top ${top} < all ${all}`);
}
{
  // fillet composes with booleans (target identity preserved): the hole should
  // remove ~one cylinder's worth of volume from the filleted block
  const blockVol = volumeOf(await build(fillet(3, cube([30, 30, 14]))));
  const cutVol = volumeOf(await build(difference(fillet(3, cube([30, 30, 14])), translate([15, 15, -1], cylinder({ r: 6, h: 16 })))));
  check("filleted solid still cuts with difference()", near(blockVol - cutVol, Math.PI * 36 * 14, 300),
    `removed ${(blockVol - cutVol).toFixed(0)}, expected ${(Math.PI * 36 * 14).toFixed(0)}`);
}
try {
  await build(fillet(0, cube([10, 10, 10])));
  check("fillet(0) errors", false, "no error");
} catch (e) { check("fillet(0) errors", /positive radius/.test(e.message), e.message.slice(0, 40)); }

console.log("\nrevolve (lathe)\n");
{
  // a rectangle profile touching x=0 -> a cylinder of revolution
  const r = await build(revolve(360, polygon([[0, 0], [6, 0], [6, 12], [0, 12]])));
  check("revolve rectangle -> cylinder volume", near(volumeOf(r), Math.PI * 36 * 12, 200), volumeOf(r).toFixed(0));
  const b = boundsOf(r);
  check("revolve stands up on Z (0..12)", near(b.z[0], 0, 0.3) && near(b.z[1], 12, 0.3), JSON.stringify(b.z));
  check("revolve radius 6 (x: -6..6)", near(b.x[0], -6, 0.3) && near(b.x[1], 6, 0.3), JSON.stringify(b.x));
}
{
  // partial angle
  const full = volumeOf(await build(revolve(360, polygon([[0, 0], [5, 0], [5, 10], [0, 10]]))));
  const half = volumeOf(await build(revolve(180, polygon([[0, 0], [5, 0], [5, 10], [0, 10]]))));
  check("revolve 180 is ~half of 360", near(half, full / 2, full * 0.08), `${half.toFixed(0)} vs ${(full / 2).toFixed(0)}`);
}
{
  // a vase-ish silhouette lofts to a valid solid, positioned by translate
  const r = await build(translate([10, 10, 0], revolve(360, polygon([[0, 0], [8, 0], [8, 4], [3, 10], [0, 10]]))));
  check("vase profile revolves + translates", volumeOf(r) > 100 && near(boundsOf(r).x[0], 10 - 8, 0.4), JSON.stringify(boundsOf(r).x));
}
try {
  await build(revolve(360, polygon([[2, 0], [6, 0], [6, 10], [2, 10]])));
  check("profile off the axis errors", false, "no error");
} catch (e) { check("profile off the axis errors", /x = 0 axis/.test(e.message), e.message.slice(0, 40)); }

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
