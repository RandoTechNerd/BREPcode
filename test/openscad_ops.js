// OpenSCAD translator: hull(), offset(), list comprehensions, and the %
// (background) modifier — the features the kailh keycap model needs.

import { fromOpenSCAD, build, toSTL } from "../index.js";

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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
