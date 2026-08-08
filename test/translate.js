// Verifies the OpenSCAD and JSCAD translators produce geometrically correct
// solids — volume is measured from the exported STL, not trusted from the tree.

import { build, toSTL } from "../index.js";
import { fromOpenSCAD, looksLikeOpenSCAD } from "../src/openscad.js";
import * as jscad from "../src/jscad.js";

function tris(result) {
  const stl = toSTL(result, "t");
  const n = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  const out = [];
  for (let i = 0; i < n.length; i += 3) out.push(n.slice(i, i + 3));
  return out;
}
function volumeOf(r) {
  let v = 0;
  for (const [a, b, c] of tris(r)) {
    v += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(v);
}
function boundsOf(r) {
  const p = tris(r).flat();
  const ax = (i) => [Math.min(...p.map((q) => q[i])), Math.max(...p.map((q) => q[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}
const facetsOf = (r) => (toSTL(r, "t").match(/facet/g) || []).length;

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

async function scad(label, source, assert) {
  try {
    const r = await build(fromOpenSCAD(source));
    assert(r, label);
  } catch (e) {
    fail++; console.log(`  FAIL  ${label} — threw: ${e.message}`);
  }
}

console.log("\nOpenSCAD translation\n");

await scad("cube(10) -> 1000mm3", "cube(10);", (r, l) =>
  check(l, near(volumeOf(r), 1000, 1), `got ${volumeOf(r).toFixed(1)}`));

await scad("cube([10,20,30], center=true) centred", "cube([10,20,30], center=true);", (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.x[0], -5, 1e-6) && near(b.y[0], -10, 1e-6) && near(b.z[1], 15, 1e-6), JSON.stringify(b));
});

await scad("named args: cube(size=[2,3,4])", "cube(size=[2,3,4]);", (r, l) =>
  check(l, near(volumeOf(r), 24, 0.1), `got ${volumeOf(r).toFixed(2)}`));

await scad("sphere(r=10,$fn=64)", "sphere(r=10, $fn=64);", (r, l) => {
  const v = volumeOf(r);
  check(l, near(v, (4 / 3) * Math.PI * 1000, 90), `got ${v.toFixed(0)}`);
});

await scad("sphere(d=20) diameter form", "sphere(d=20, $fn=64);", (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.x[0], -10, 0.1) && near(b.x[1], 10, 0.1), JSON.stringify(b.x));
});

await scad("cylinder(h,r) is Z-up from 0", "cylinder(h=20, r=5, $fn=64);", (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.z[0], 0, 1e-6) && near(b.z[1], 20, 1e-6) && near(b.x[0], -5, 0.05), JSON.stringify(b));
});

await scad("cylinder(center=true)", "cylinder(h=10, r=4, center=true, $fn=48);", (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.z[0], -5, 1e-6) && near(b.z[1], 5, 1e-6), JSON.stringify(b.z));
});

await scad("cylinder r1/r2 cone", "cylinder(h=10, r1=5, r2=0, $fn=64);", (r, l) => {
  const v = volumeOf(r);
  check(l, near(v, (1 / 3) * Math.PI * 25 * 10, 8), `got ${v.toFixed(1)}`);
});

await scad("difference block syntax", `
  difference() {
    cube([20,20,20]);
    translate([10,10,-1]) cylinder(h=22, r=5, $fn=64);
  }`, (r, l) => {
  const v = volumeOf(r);
  check(l, near(v, 8000 - Math.PI * 25 * 20, 25), `got ${v.toFixed(1)}`);
});

await scad("union block", `
  union() {
    cube([10,10,10]);
    translate([10,0,0]) cube([10,10,10]);
  }`, (r, l) => check(l, near(volumeOf(r), 2000, 2), `got ${volumeOf(r).toFixed(1)}`));

await scad("intersection block", `
  intersection() {
    cube([10,10,10]);
    translate([5,5,5]) cube([10,10,10]);
  }`, (r, l) => check(l, near(volumeOf(r), 125, 1), `got ${volumeOf(r).toFixed(2)}`));

await scad("implicit union of top-level statements", `
  cube([10,10,10]);
  translate([20,0,0]) cube([10,10,10]);`, (r, l) => {
  check(l, near(volumeOf(r), 2000, 2), `got ${volumeOf(r).toFixed(1)}`);
});

await scad("transform without braces chains", "translate([5,0,0]) rotate([0,0,90]) cube([10,2,2]);",
  (r, l) => {
    const b = boundsOf(r);
    // rotated 90 about Z: the 10-long X edge now runs along Y
    check(l, near(b.y[1] - b.y[0], 10, 1e-5), JSON.stringify(b));
  });

await scad("variables and arithmetic", `
  w = 20; h = w / 2 + 5;
  cube([w, w, h]);`, (r, l) =>
  check(l, near(volumeOf(r), 20 * 20 * 15, 2), `got ${volumeOf(r).toFixed(1)}`));

await scad("for loop makes 4 holes", `
  difference() {
    cube([40,40,5]);
    for (x = [10, 30]) for (y = [10, 30])
      translate([x, y, -1]) cylinder(h=7, r=2, $fn=32);
  }`, (r, l) => {
  const v = volumeOf(r);
  check(l, near(v, 40 * 40 * 5 - 4 * Math.PI * 4 * 5, 12), `got ${v.toFixed(1)}`);
});

await scad("for with range [0:2]", `
  for (i = [0:2]) translate([i*10, 0, 0]) cube([5,5,5]);`, (r, l) =>
  check(l, near(volumeOf(r), 3 * 125, 2), `got ${volumeOf(r).toFixed(1)}`));

await scad("for with stepped range [0:5:10]", `
  for (i = [0:5:10]) translate([i*4, 0, 0]) cube([4,4,4]);`, (r, l) =>
  check(l, near(volumeOf(r), 3 * 64, 2), `got ${volumeOf(r).toFixed(1)}`));

await scad("module definition and call", `
  module post(d, h) { cylinder(h=h, r=d/2, $fn=48); }
  post(6, 20);`, (r, l) => {
  const v = volumeOf(r);
  check(l, near(v, Math.PI * 9 * 20, 6), `got ${v.toFixed(1)}`);
});

await scad("module used before definition", `
  slab();
  module slab() { cube([10,10,2]); }`, (r, l) =>
  check(l, near(volumeOf(r), 200, 1), `got ${volumeOf(r).toFixed(1)}`));

await scad("module with children()", `
  module shifted() { translate([10,0,0]) children(); }
  shifted() cube([5,5,5]);`, (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.x[0], 10, 1e-6) && near(b.x[1], 15, 1e-6), JSON.stringify(b.x));
});

await scad("if / else", `
  big = true;
  if (big) cube([10,10,10]); else cube([2,2,2]);`, (r, l) =>
  check(l, near(volumeOf(r), 1000, 1), `got ${volumeOf(r).toFixed(1)}`));

await scad("user function", `
  function area(w, d) = w * d;
  cube([area(2,3), 5, 1]);`, (r, l) =>
  check(l, near(volumeOf(r), 6 * 5 * 1, 0.5), `got ${volumeOf(r).toFixed(2)}`));

await scad("$fn as a global", `
  $fn = 64;
  cylinder(h=10, r=5);`, (r, l) => {
  const v = volumeOf(r);
  check(l, near(v, Math.PI * 25 * 10, 8), `got ${v.toFixed(1)}`);
});

await scad("comments are ignored", `
  // line comment
  /* block
     comment */
  cube(4);`, (r, l) => check(l, near(volumeOf(r), 64, 0.5), `got ${volumeOf(r).toFixed(2)}`));

await scad("modifier * disables a subtree", `
  cube([10,10,10]);
  *cube([100,100,100]);`, (r, l) =>
  check(l, near(volumeOf(r), 1000, 1), `got ${volumeOf(r).toFixed(1)}`));

await scad("rotate axis-angle form", "rotate(a=90, v=[0,0,1]) cube([10,2,2]);", (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.y[1] - b.y[0], 10, 1e-4), JSON.stringify(b));
});

// --- hull is supported now; minkowski degrades gracefully ----------------
// (linear_extrude/square/circle/polygon are supported too — see test/extrude2d.js)
{
  const r = await build(fromOpenSCAD("hull() { translate([-5,0,0]) sphere(2); translate([5,0,0]) sphere(2); }"));
  check("hull() builds a convex solid", facetsOf(r) > 0, String(facetsOf(r)));
}
try {
  // minkowski isn't truly supported — it renders an approximation, not an error
  const r = await build(fromOpenSCAD("minkowski() { cube([10,10,10]); sphere(2); }"));
  check("minkowski() degrades to a solid instead of failing", facetsOf(r) > 0);
} catch (e) {
  check("minkowski() degrades to a solid instead of failing", false, e.message);
}

// ---- color() — asserted on the tree, where the tag lives -----------------
{
  const t = fromOpenSCAD('color("red") cube(10);');
  check('color("red") tags the shape', t.color === "#ff0000", String(t.color));
}
{
  const t = fromOpenSCAD("color([0, 1, 0]) cube(10);");
  check("color([0,1,0]) takes 0–1 floats", t.color === "#00ff00", String(t.color));
}
{
  const t = fromOpenSCAD('color("#ff880044") cube(10);');
  check("hex-with-alpha keeps rgb, drops alpha", t.color === "#ff8800", String(t.color));
}
{
  const t = fromOpenSCAD('color("SkyBlue") cube(10);');
  check("names are case-insensitive", t.color === "#87ceeb", String(t.color));
}
{
  const t = fromOpenSCAD('color("nonsensecolour") cube(10);');
  check("an unknown name keeps the shape uncoloured", t.color === undefined && t.code === "P.CU",
    JSON.stringify({ color: t.color, code: t.code }));
}
{
  const t = fromOpenSCAD('union() { color("red") cube(5); color("blue") translate([9,0,0]) cube(5); }');
  const r = await build(t);
  check("two coloured parts still build", facetsOf(r) > 0);
}
{
  // top-level siblings in different colours stay a GROUP so each part keeps
  // its colour into the 3MF — explicit union() still welds (test above)
  const t = fromOpenSCAD('color("red") cube(5); color("blue") translate([9,0,0]) cube(5);');
  check("multicolour top level stays separate parts", t.kind === "group"
    && t.children?.length === 2, JSON.stringify({ kind: t.kind, n: t.children?.length }));
  const cols = (t.children || []).map((c) => c.color).sort();
  check("...and both colours survive", cols.join() === "#0000ff,#ff0000", cols.join());
}
{
  // same colour twice = no reason to keep them apart — plain union as always
  const t = fromOpenSCAD('color("red") cube(5); color("red") translate([9,0,0]) cube(5);');
  check("same-colour top level still unions", t.kind !== "group", String(t.kind));
}

// a bare 2D shape now auto-extrudes instead of erroring
{
  const r = await build(fromOpenSCAD("circle(5);"));
  const b = boundsOf(r);
  check("bare 2D shape auto-extrudes to a thin solid", (b.z[1] - b.z[0]) > 0 && (b.z[1] - b.z[0]) < 2, JSON.stringify(b));
}

check("looksLikeOpenSCAD detects .scad", looksLikeOpenSCAD("difference() { cube(1); }"));
check("looksLikeOpenSCAD ignores BrepScript", !looksLikeOpenSCAD("difference(cube([1,1,1]), sphere({r:1}))"));

// ------------------------------------------------------------------- JSCAD
console.log("\nJSCAD translation\n");

async function js(label, shape, assert) {
  try { assert(await build(shape), label); }
  catch (e) { fail++; console.log(`  FAIL  ${label} — threw: ${e.message}`); }
}

await js("cuboid is centred on the origin",
  jscad.cuboid({ size: [10, 20, 30] }), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.x[0], -5, 1e-6) && near(b.y[1], 10, 1e-6) && near(b.z[0], -15, 1e-6), JSON.stringify(b));
  });

await js("cuboid honours center",
  jscad.cuboid({ size: [2, 2, 2], center: [10, 0, 0] }), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.x[0], 9, 1e-6) && near(b.x[1], 11, 1e-6), JSON.stringify(b.x));
  });

await js("cylinder straddles the origin",
  jscad.cylinder({ radius: 5, height: 20, segments: 64 }), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.z[0], -10, 1e-6) && near(b.z[1], 10, 1e-6), JSON.stringify(b.z));
  });

await js("subtract removes material",
  jscad.subtract(
    jscad.cuboid({ size: [20, 20, 20] }),
    jscad.cylinder({ radius: 5, height: 30, segments: 64 }),
  ), (r, l) => {
    const v = volumeOf(r);
    check(l, near(v, 8000 - Math.PI * 25 * 20, 25), `got ${v.toFixed(1)}`);
  });

await js("rotate takes radians",
  jscad.rotate([0, 0, Math.PI / 2], jscad.cuboid({ size: [10, 2, 2] })), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.y[1] - b.y[0], 10, 1e-4), JSON.stringify(b));
  });

await js("namespaced form works",
  jscad.booleans.union(
    jscad.primitives.cuboid({ size: [10, 10, 10] }),
    jscad.transforms.translateX(10, jscad.primitives.cuboid({ size: [10, 10, 10] })),
  ), (r, l) => check(l, near(volumeOf(r), 2000, 2), `got ${volumeOf(r).toFixed(1)}`));

console.log("\nhull and minkowski exist in BOTH languages, so the name cannot decide\n");
{
  // The bug this pins down: `minkowski(3, cube([20,20,20]))` is ordinary
  // BREPcode, but the detector listed "minkowski" as an OpenSCAD-only word and
  // handed the whole file to the translator, which answered "that OpenSCAD
  // produced no solids" about code that was never OpenSCAD. hull() had the same
  // fault and escaped it only by luck — the usual way to write one includes an
  // options object, and an earlier rule bails on those.
  const brepcode = [
    ["minkowski with a radius", "minkowski(3, cube([20, 20, 20]))"],
    ["minkowski with a ball", "minkowski(cube([20,20,20]), sphere({ r: 3 }))"],
    ["hull with an options object", "hull(translate([-12,0,0], cylinder({r:4,h:8})), translate([12,0,0], cylinder({r:4,h:8})))"],
    ["hull with none — the case that used to slip through", "hull(cube([1,1,1]), sphere({r:2}))"],
    ["roundedGrow", "roundedGrow(3, cube([20, 20, 20]))"],
  ];
  for (const [label, src] of brepcode) {
    check(`BREPcode is not mistaken for OpenSCAD: ${label}`, looksLikeOpenSCAD(src) === false, src.slice(0, 60));
  }

  // ...and the real thing is still recognised, by the shape of the call rather
  // than by the name: OpenSCAD writes these with no arguments and a block.
  const openscad = [
    ["minkowski() { … }", "minkowski() { cube([20,20,20]); sphere(r=3); }"],
    ["hull() { … }", "hull() { cube([1,1,1]); sphere(r=2); }"],
    ["polyhedron(points=…, faces=…);", "polyhedron(points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]], faces=[[0,1,2]]);"],
    ["a plain cube statement", "cube([10,10,10]);"],
    ["difference with a block", "difference() { cube([10,10,10]); translate([0,0,-1]) cylinder(h=12, r=3); }"],
  ];
  for (const [label, src] of openscad) {
    check(`still detected as OpenSCAD: ${label}`, looksLikeOpenSCAD(src) === true, src.slice(0, 60));
  }
}


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
