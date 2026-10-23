// OpenSCAD translator: hull(), offset(), list comprehensions, and the %
// (background) modifier — the features the kailh keycap model needs.

import { fromOpenSCAD, build, toSTL } from "../index.js";
import * as dsl from "../index.js";

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function boundsOf(r) {
  const p = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}
const span = (b, a) => +(b[a][1] - b[a][0]).toFixed(2);

console.log("\nopenscad hull / offset / comprehensions\n");

// offset(r=) rounds outward: square 10x6 + r=2 -> 14x10
{
  const b = boundsOf(await build(fromOpenSCAD("$fn=32; linear_extrude(4) offset(r=2) square([10,6], center=true);")));
  check("offset(r=2) grows a square to 14x10", near(span(b, "x"), 14, 0.2) && near(span(b, "y"), 10, 0.2), JSON.stringify(b));
  check("offset keeps extrude height", near(span(b, "z"), 4, 0.05));
}

// offset(delta=) straight offset: square 10x6 + delta=1 -> 12x8, sharp corners
{
  const b = boundsOf(await build(fromOpenSCAD("linear_extrude(2) offset(delta=1) square([10,6], center=true);")));
  check("offset(delta=1) grows a square to 12x8", near(span(b, "x"), 12, 0.1) && near(span(b, "y"), 8, 0.1), JSON.stringify(b));
}

// hull of two cylinders 20 apart, r=3 -> x ~26, y ~6
{
  const b = boundsOf(await build(fromOpenSCAD("$fn=32; hull() { translate([-10,0,0]) cylinder(r=3,h=5); translate([10,0,0]) cylinder(r=3,h=5); }")));
  check("hull() of two cylinders spans 26 x 6 x 5",
    near(span(b, "x"), 26, 0.3) && near(span(b, "y"), 6, 0.3) && near(span(b, "z"), 5, 0.1), JSON.stringify(b));
}

// hull sloping between two stacked profiles (keycap home-lip pattern)
{
  const b = boundsOf(await build(fromOpenSCAD(
    "$fn=24; hull() { linear_extrude(0.01) square([8,6],center=true); translate([0,0,4]) linear_extrude(0.01) square([8,12],center=true); }")));
  check("hull() lofts a widening slab (y grows to 12 at top)", near(span(b, "y"), 12, 0.3) && near(span(b, "z"), 4, 0.1), JSON.stringify(b));
}

// list comprehension builds a polygon (octagon via [for ...])
{
  const src = "$fn=8; linear_extrude(3) polygon([for (i=[0:7]) let(a=i*45) [10*cos(a), 10*sin(a)]]);";
  const b = boundsOf(await build(fromOpenSCAD(src)));
  check("list comprehension polygon builds (octagon ~20 wide)", near(span(b, "x"), 20, 0.5) && near(span(b, "z"), 3, 0.05), JSON.stringify(b));
}

// concat inside a comprehension polygon
{
  const src = "linear_extrude(2) polygon(concat([[0,0]], [for(i=[1:3]) [i*4, 0]], [[12,6],[0,6]]));";
  const r = await build(fromOpenSCAD(src));
  check("concat + comprehension polygon builds", (toSTL(r, "t").match(/facet/g) || []).length > 0);
}

// % (background) modifier excludes its child from the built geometry
{
  const withGhost = boundsOf(await build(fromOpenSCAD("cube([10,10,4]); %translate([0,0,-20]) cube([10,10,4]);")));
  check("% background child is excluded (z stays 4, not 24)", near(span(withGhost, "z"), 4, 0.1), JSON.stringify(withGhost));
}

// minkowski() with a sphere — the form people actually write, and the whole
// reason it is supported at all. A 20mm cube plus a 3mm ball is 26mm across on
// every axis, and the corners are round rather than cut off.
{
  const b = boundsOf(await build(fromOpenSCAD("minkowski() { cube([20,20,20]); sphere(r=3); }")));
  check("minkowski() with a sphere grows the part by r on every side",
    near(span(b, "x"), 26, 0.05) && near(span(b, "y"), 26, 0.05) && near(span(b, "z"), 26, 0.05),
    JSON.stringify(b));
  check("...and it reaches -3, so it grew both ways rather than moving",
    near(b.x[0], -3, 0.05), JSON.stringify(b.x));
}

// A single child is a no-op rather than an error.
{
  const b = boundsOf(await build(fromOpenSCAD("minkowski() { cube([10,10,10]); }")));
  check("minkowski() with one child is the child", near(span(b, "x"), 10, 0.05), JSON.stringify(b));
}

// Anything other than a sphere is refused by name rather than approximated —
// coming out the wrong SHAPE would be worse than being told no.
{
  let msg = "";
  try { await build(fromOpenSCAD("minkowski() { cube([10,10,10]); cube([2,2,2]); }")); }
  catch (e) { msg = String(e.message); }
  check("minkowski() with a cube says what it does support", /sphere/.test(msg), msg.slice(0, 80));
}

console.log("\nminkowski() is the word people arrive with\n");
{
  // The operation existed and the word did not, so "round every edge" answered
  // with "minkowski is not defined" — true, useless, and pointing at nothing.
  // Both spellings people actually write are accepted.
  const grow = dsl.roundedGrow(3, dsl.cube([20, 20, 20]));
  const short = dsl.minkowski(3, dsl.cube([20, 20, 20]));
  check("minkowski(3, part) is roundedGrow(3, part)",
    short.kind === grow.kind && short.amount === grow.amount,
    JSON.stringify({ kind: short.kind, amount: short.amount }));

  // What someone hand-translating OpenSCAD types. A box and a ball is the
  // exact twin (the box grown by r, filleted all round); a part with no exact
  // twin is still roundedGrow by the ball's radius.
  const openscadStyle = dsl.minkowski(dsl.cube([20, 20, 20]), dsl.sphere({ r: 3 }));
  check("minkowski(box, sphere({r})) is the exact filleted box",
    openscadStyle.kind === "edgeop" && openscadStyle.code === "F" && openscadStyle.amount === 3,
    JSON.stringify({ kind: openscadStyle.kind, amount: openscadStyle.amount }));
  const lumpy = dsl.minkowski(dsl.union(dsl.cube([20, 20, 20]), dsl.sphere({ r: 12 })), dsl.sphere({ r: 3 }));
  check("minkowski(part, sphere({r})) reads the radius off the ball",
    lumpy.kind === "roundify" && lumpy.amount === 3,
    JSON.stringify({ kind: lumpy.kind, amount: lumpy.amount }));

  // Rolling one part around another shape is a different, much larger
  // operation. Guessing a radius from a cube would silently build the wrong
  // part, so it says what it does support instead.
  let msg = "";
  try { dsl.minkowski(dsl.cube([10, 10, 10]), dsl.cube([2, 2, 2])); } catch (e) { msg = e.message; }
  check("a second shape that is not a sphere is refused", /sphere|ball/i.test(msg), msg.slice(0, 80));
  check("...and the message names what to use instead",
    /roundedGrow|hull/.test(msg), msg.slice(0, 120));

  let bare = "";
  try { dsl.minkowski(3); } catch (e) { bare = e.message; }
  check("a radius with no shape is refused", /needs a shape/.test(bare), bare.slice(0, 80));
}


// rotate([x, y, z]) turns about X, then Y, then Z (fixed axes): Rz*Ry*Rx. The
// DSL's own order is the reverse, and pasted files once came out turned wrong.
{
  const bbox = async (src) => {
    const v = [...toSTL(await build(fromOpenSCAD(src)), "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    return [0, 1, 2].map((k) => [Math.min(...v.map((p) => p[k])), Math.max(...v.map((p) => p[k]))]);
  };
  const near = (a, b) => a.every((r, k) => Math.abs(r[0] - b[k][0]) < 0.02 && Math.abs(r[1] - b[k][1]) < 0.02);
  const got = await bbox("rotate([90,0,90]) cube([10,20,30]);");
  check("rotate([90,0,90]) cube([10,20,30]) lands where OpenSCAD puts it",
    near(got, [[0, 30], [0, 10], [0, 20]]), JSON.stringify(got));
  // three angles, none a right angle, against OpenSCAD's matrix worked by hand
  const d = Math.PI / 180, [x, y, z] = [30 * d, 45 * d, 60 * d];
  const Rx = [[1, 0, 0], [0, Math.cos(x), -Math.sin(x)], [0, Math.sin(x), Math.cos(x)]];
  const Ry = [[Math.cos(y), 0, Math.sin(y)], [0, 1, 0], [-Math.sin(y), 0, Math.cos(y)]];
  const Rz = [[Math.cos(z), -Math.sin(z), 0], [Math.sin(z), Math.cos(z), 0], [0, 0, 1]];
  const mul = (A, B) => A.map((row, i) => B[0].map((_, j) => row.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));
  const M = mul(Rz, mul(Ry, Rx));
  const pts = [];
  for (const a of [0, 10]) for (const b of [0, 20]) for (const c of [0, 30]) pts.push(M.map((r) => r[0] * a + r[1] * b + r[2] * c));
  const want = [0, 1, 2].map((k) => [Math.min(...pts.map((p) => p[k])), Math.max(...pts.map((p) => p[k]))]);
  const got3 = await bbox("rotate([30,45,60]) cube([10,20,30]);");
  check("rotate([30,45,60]) matches OpenSCAD's Rz*Ry*Rx", near(got3, want), JSON.stringify(got3));
}

// rotate_extrude of a 2D difference is a hollow lathe, not a solid one
{
  const r = await build(fromOpenSCAD("rotate_extrude($fn=64) difference(){ square([10,20]); square([8,30]); }"));
  const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  const tube = Math.PI * (10 * 10 - 8 * 8) * 20;
  check("rotate_extrude of a difference comes out hollow", Math.abs(vol - tube) / tube < 0.02,
    `${vol.toFixed(0)} mm3, a tube is ${tube.toFixed(0)}, solid would be ${(Math.PI * 100 * 20).toFixed(0)}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
