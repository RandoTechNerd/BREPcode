// Forgiveness: imperfect / pasted / library-heavy code should still build where
// it reasonably can, warning rather than hard-failing. Also covers the OpenSCAD
// features the real-world test samples needed (PI, BOSL2 rounding, prismoid).

import { build, toSTL } from "../index.js";
import { fromOpenSCAD, getWarnings } from "../src/openscad.js";
import { fromPython } from "../src/py123d.js";
import { autoFix } from "../viewer/assist.js";

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
const facets = (r) => (toSTL(r, "t").match(/facet/g) || []).length;

console.log("\nforgiving translation\n");

// autoFix: strip paste junk + decode HTML entities
{
  const { code, notes } = autoFix('x = a &amp;&amp; b;\ninclude &lt;lib&gt;');
  check("autoFix decodes HTML entities", /&&/.test(code) && /</.test(code) && />/.test(code), code);
  check("autoFix reports what it did", notes.some((n) => /entit/i.test(n)));
}

// unknown function passes its first numeric arg through (missing-include helper)
{
  const r = await build(fromOpenSCAD("h = layer_fit(6); cube([10, 10, h]);"));
  check("unknown fn(x) passes x through -> height 6", near(span(boundsOf(r), "z"), 6, 0.1));
}

// unknown variable -> undef with a warning (unused one is harmless)
{
  const r = await build(fromOpenSCAD("UNUSED = 3 * MISSING_CONST + 1; cube([8, 8, 8]);"));
  check("unknown var doesn't kill the build", near(span(boundsOf(r), "x"), 8, 0.1));
  check("unknown var warns", getWarnings().some((w) => /MISSING_CONST/.test(w)));
}

// unknown module -> skipped, siblings still render
{
  const r = await build(fromOpenSCAD("some_unknown_lib_thing(); cube([12, 12, 12]);"));
  check("unknown module skipped, sibling builds", near(span(boundsOf(r), "x"), 12, 0.1));
}

// minkowski soft-fails to an approximate solid rather than erroring
{
  const r = await build(fromOpenSCAD("minkowski(){ cube([10,10,10]); sphere(2); }"));
  check("minkowski still produces a solid", facets(r) > 0);
}

// a 2D-only design auto-extrudes
{
  const r = await build(fromOpenSCAD("circle(d=20, $fn=48);"));
  check("bare 2D circle auto-extrudes to a thin solid", near(span(boundsOf(r), "z"), 1, 0.05) && near(span(boundsOf(r), "x"), 20, 0.5));
}

// PI is defined
{
  const r = await build(fromOpenSCAD("cube([PI*2, 4, 1]);"));
  check("PI built-in constant works", near(span(boundsOf(r), "x"), Math.PI * 2, 0.05));
}

// BOSL2: rounded cuboid (via hull), prismoid (via hull), xcopies
{
  const r = await build(fromOpenSCAD("include <BOSL2/std.scad>\ncuboid([40,30,20], rounding=5);"));
  const b = boundsOf(r);
  check("BOSL2 cuboid rounding builds at size", near(span(b, "x"), 40, 0.3) && near(span(b, "z"), 20, 0.3), JSON.stringify(b));
}
{
  const r = await build(fromOpenSCAD("include <BOSL2/std.scad>\nprismoid([40,40],[20,20],h=30);"));
  const b = boundsOf(r);
  check("BOSL2 prismoid builds a frustum", near(span(b, "x"), 40, 0.5) && near(span(b, "z"), 30, 0.3), JSON.stringify(b));
}
{
  const r = await build(fromOpenSCAD("include <BOSL2/std.scad>\nxcopies(20, n=3) cube(4, center=true);"));
  check("BOSL2 xcopies repeats along x", near(span(boundsOf(r), "x"), 44, 0.5), JSON.stringify(boundsOf(r)));
}

// build123d tuple unpacking
{
  const { shape } = fromPython("from build123d import *\nl, w, t = 40, 30, 10\npart = Box(l, w, t)");
  const r = await build(shape);
  const b = boundsOf(r);
  check("build123d tuple unpack l,w,t = 40,30,10", near(span(b, "x"), 40, 0.3) && near(span(b, "z"), 10, 0.3), JSON.stringify(b));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
