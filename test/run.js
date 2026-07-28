// Semantic tests: verify the DSL produces geometrically correct solids.
// Volume is computed independently from the exported STL (signed tetrahedron sum),
// so it validates the kernel output rather than trusting our own bookkeeping.

import {
  cube, cylinder, sphere, union, difference, intersection, group,
  translate, rotate, build, toSTL,
} from "../index.js";

function meshOf(result) {
  const stl = toSTL(result, "t");
  const nums = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)]
    .map((m) => [+m[1], +m[2], +m[3]]);
  const tris = [];
  for (let i = 0; i < nums.length; i += 3) tris.push(nums.slice(i, i + 3));
  return tris;
}

function volumeOf(result) {
  let v = 0;
  for (const [a, b, c] of meshOf(result)) {
    v += (
      a[0] * (b[1] * c[2] - b[2] * c[1]) -
      a[1] * (b[0] * c[2] - b[2] * c[0]) +
      a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6;
  }
  return Math.abs(v);
}

function boundsOf(result) {
  const pts = meshOf(result).flat();
  const ax = (i) => [Math.min(...pts.map((p) => p[i])), Math.max(...pts.map((p) => p[i]))];
  return { x: ax(0), y: ax(1), z: ax(2) };
}

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

async function test(label, shape, assertFn) {
  try {
    const r = await build(shape);
    assertFn(r, label);
  } catch (e) {
    fail++;
    console.log(`  FAIL  ${label} — threw: ${e.message}`);
  }
}

console.log("\nBrepScript geometry tests\n");

// --- primitive conventions ---------------------------------------------
await test("cube([10,20,30]) sits corner-at-origin", cube([10, 20, 30]), (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.x[0], 0, 1e-6) && near(b.x[1], 10, 1e-6) &&
           near(b.y[1], 20, 1e-6) && near(b.z[1], 30, 1e-6), JSON.stringify(b));
  check("cube volume = 6000", near(volumeOf(r), 6000, 1), `got ${volumeOf(r).toFixed(2)}`);
});

await test("cylinder is Z-up, base at z=0, centred in XY",
  cylinder({ r: 5, h: 20, $fn: 64 }), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.z[0], 0, 1e-6) && near(b.z[1], 20, 1e-6) &&
             near(b.x[0], -5, 0.05) && near(b.x[1], 5, 0.05) &&
             near(b.y[0], -5, 0.05) && near(b.y[1], 5, 0.05), JSON.stringify(b));
    // pi*r^2*h = 1570.8, slightly under for a faceted cylinder
    const v = volumeOf(r);
    check("cylinder volume ~ pi r^2 h", near(v, Math.PI * 25 * 20, 15), `got ${v.toFixed(1)}`);
  });

await test("cylinder({center:true}) straddles z=0",
  cylinder({ r: 4, h: 10, center: true }), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.z[0], -5, 1e-6) && near(b.z[1], 5, 1e-6), JSON.stringify(b.z));
  });

await test("sphere is centred at origin", sphere({ r: 6, $fn: 48 }), (r, l) => {
  const b = boundsOf(r);
  check(l, near(b.x[0], -6, 0.1) && near(b.z[1], 6, 0.1), JSON.stringify(b));
});

// --- transforms ---------------------------------------------------------
await test("translate moves the solid",
  translate([5, 10, 15], cube([2, 2, 2])), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.x[0], 5, 1e-6) && near(b.y[0], 10, 1e-6) && near(b.z[0], 15, 1e-6),
      JSON.stringify(b));
  });

await test("nested translate composes",
  translate([10, 0, 0], translate([0, 7, 0], cube([1, 1, 1]))), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.x[0], 10, 1e-6) && near(b.y[0], 7, 1e-6), JSON.stringify(b));
  });

await test("rotate 90deg about X maps +Y extent onto -Z",
  rotate([90, 0, 0], cube([2, 10, 2])), (r, l) => {
    const b = boundsOf(r);
    // the 10-long Y edge should now span 10 in Z
    check(l, near(b.z[1] - b.z[0], 10, 1e-5) && near(b.y[1] - b.y[0], 2, 1e-5),
      JSON.stringify(b));
  });

await test("rotate then translate composes in the right order",
  translate([100, 0, 0], rotate([90, 0, 0], cube([2, 10, 2]))), (r, l) => {
    const b = boundsOf(r);
    check(l, near(b.x[0], 100, 1e-5) && near(b.z[1] - b.z[0], 10, 1e-5), JSON.stringify(b));
  });

// --- booleans -----------------------------------------------------------
await test("difference removes material",
  difference(cube([20, 20, 20]), translate([10, 10, -1], cylinder({ r: 5, h: 22, $fn: 64 }))),
  (r, l) => {
    const v = volumeOf(r);
    const expected = 8000 - Math.PI * 25 * 20; // 8000 - 1570.8
    check(l, near(v, expected, 25), `got ${v.toFixed(1)}, expected ~${expected.toFixed(1)}`);
    const b = boundsOf(r);
    check("difference keeps outer bounds", near(b.x[1], 20, 1e-6) && near(b.z[1], 20, 1e-6),
      JSON.stringify(b));
  });

await test("union of two disjoint-ish cubes merges volume",
  union(cube([10, 10, 10]), translate([10, 0, 0], cube([10, 10, 10]))), (r, l) => {
    check(l, near(volumeOf(r), 2000, 2), `got ${volumeOf(r).toFixed(2)}`);
    check("union yields one solid", r.solids.length === 1, `got ${r.solids.length}`);
  });

await test("intersection keeps only the overlap",
  intersection(cube([10, 10, 10]), translate([5, 5, 5], cube([10, 10, 10]))), (r, l) => {
    check(l, near(volumeOf(r), 125, 1), `got ${volumeOf(r).toFixed(2)}`);
  });

await test("multi-arg difference subtracts every tool",
  difference(
    cube([30, 10, 10]),
    translate([5, 5, -1], cylinder({ r: 2, h: 12, $fn: 48 })),
    translate([25, 5, -1], cylinder({ r: 2, h: 12, $fn: 48 })),
  ), (r, l) => {
    const v = volumeOf(r);
    const expected = 3000 - 2 * Math.PI * 4 * 10;
    check(l, near(v, expected, 12), `got ${v.toFixed(1)}, expected ~${expected.toFixed(1)}`);
  });

await test("nested boolean: difference inside a union",
  union(
    difference(cube([10, 10, 10]), translate([5, 5, -1], cylinder({ r: 2, h: 12, $fn: 48 }))),
    translate([10, 0, 0], cube([10, 10, 10])),
  ), (r, l) => {
    const v = volumeOf(r);
    const expected = 2000 - Math.PI * 4 * 10;
    check(l, near(v, expected, 12), `got ${v.toFixed(1)}, expected ~${expected.toFixed(1)}`);
  });

// --- booleans distribute over a group --------------------------------------
//
// A group is several separate solids, and the old op() handed the boolean only
// the LAST member — so drilling an imported multi-part Benchy subtracted from
// one slice and left the drill sitting on deck as its own solid, which then
// exported as a fifth colour.
{
  const g = group(cube([20, 20, 10]), translate([30, 0, 0], cube([20, 20, 10])));
  const cut = translate([10, 10, -1], cylinder({ r: 4, h: 14, $fn: 24 }));
  const r = await build(difference(g, cut));
  check("difference over a group keeps every member (and eats the cutter)",
    r.solids.length === 2, `${r.solids.length} solids`);
  const tris = r.solids.map((s) => (s.toSTL("x", 6).match(/facet normal/g) || []).length).sort((a, b) => a - b);
  check("...the member it touches gains the hole", tris[1] > 12, `${tris[1]} tris`);
  check("...the member it misses is untouched", tris[0] === 12, `${tris[0]} tris`);
  const u = await build(union(g, translate([60, 0, 0], cube([5, 5, 5]))));
  check("union over a group adds a member instead of welding the assembly",
    u.solids.length === 3, `${u.solids.length} solids`);
}


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
