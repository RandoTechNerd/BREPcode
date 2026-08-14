// Every worked example in LLM_PROMPT.md must actually build.
// If a doc teaches code that doesn't run, the doc is worse than nothing.

import {
  cube, cylinder, sphere, union, difference, intersection, translate, build, toSTL,
  colorByHeight,
} from "../index.js";
import { readFileSync } from "node:fs";
import { fromOpenSCAD } from "../src/openscad.js";
import * as jscad from "../src/jscad.js";

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

let pass = 0, fail = 0;
async function ok(label, shape, expectVol, tol) {
  try {
    const r = await build(shape);
    const v = volumeOf(r);
    if (expectVol != null && Math.abs(v - expectVol) > tol) {
      fail++; console.log(`  FAIL  ${label} — volume ${v.toFixed(1)}, expected ~${expectVol.toFixed(1)}`);
    } else { pass++; console.log(`  PASS  ${label}  (${v.toFixed(1)} mm3)`); }
  } catch (e) {
    fail++; console.log(`  FAIL  ${label} — ${e.message}`);
  }
}

console.log("\nLLM_PROMPT.md worked examples\n");

// 1. mounting plate
await ok("mounting plate", (() => {
  const W = 60, D = 40, T = 6, boltR = 2.5, inset = 7;
  const hole = (x, y, r) => translate([x, y, -1], cylinder({ r, h: T + 2, $fn: 32 }));
  return difference(
    cube([W, D, T]),
    hole(inset, inset, boltR), hole(W - inset, inset, boltR),
    hole(inset, D - inset, boltR), hole(W - inset, D - inset, boltR),
    hole(W / 2, D / 2, 10),
  );
})(), 60 * 40 * 6 - 4 * Math.PI * 2.5 ** 2 * 6 - Math.PI * 100 * 6, 60);

// 2. open-top box
await ok("open-top box", (() => {
  const W = 40, D = 30, H = 20, t = 3;
  return difference(cube([W, D, H]), translate([t, t, t], cube([W - 2 * t, D - 2 * t, H])));
})(), 40 * 30 * 20 - 34 * 24 * 17, 2);

// 3. washer
await ok("washer", (() => {
  const t = 3;
  return difference(
    cylinder({ r: 10, h: t, $fn: 64 }),
    translate([0, 0, -1], cylinder({ r: 4, h: t + 2, $fn: 48 })),
  );
})(), Math.PI * (100 - 16) * 3, 12);

// 4. pipe flange (the for-loop / spread example)
await ok("pipe flange", (() => {
  const OD = 60, T = 10, bore = 15, bolts = 6, bcR = 23, boltR = 3.3;
  const holes = [];
  for (let i = 0; i < bolts; i++) {
    const a = (i * 360 / bolts) * Math.PI / 180;
    holes.push(translate([bcR * Math.cos(a), bcR * Math.sin(a), -1],
      cylinder({ r: boltR, h: T + 2, $fn: 32 })));
  }
  return difference(
    cylinder({ r: OD / 2, h: T, $fn: 96 }),
    translate([0, 0, -1], cylinder({ r: bore, h: T + 2, $fn: 64 })),
    ...holes,
  );
})(), Math.PI * (900 - 225) * 10 - 6 * Math.PI * 3.3 ** 2 * 10, 220);

// 5. approximations the guide recommends
await ok("rounded plate corner via union", union(
  cube([20, 20, 4]),
  translate([20, 20, 0], cylinder({ r: 5, h: 4, $fn: 48 })),
), null);
await ok("dome via intersection", intersection(
  sphere({ r: 10, $fn: 48 }),
  translate([-10, -10, 0], cube([20, 20, 10])),
), (2 / 3) * Math.PI * 1000, 60);

// 6. the colour example, and the assertion that IS the rule it teaches:
// banding must leave SEPARATE solids. A union would fuse them into one body
// and the model would print a single colour — which is the trap the guide
// spends a paragraph on, so it had better be true.
{
  const wall = 1.6, h = 60, r = 30;
  const body = union(
    difference(cylinder({ r, h, $fn: 96 }),
      translate([0, 0, 2], cylinder({ r: r - wall, h, $fn: 96 }))),
    cylinder({ r, h: 2, $fn: 96 }),
  );
  const banded = await build(colorByHeight({ at: [12], colors: ["#ffffff", "#2b6cb0"] }, body));
  const n = banded?.solids?.length;
  if (n === 2) { pass++; console.log("  PASS  two-colour vase — 2 separate solids"); }
  else { fail++; console.log(`  FAIL  two-colour vase — ${n} solid(s), expected 2`); }
}

// The examples above are transcribed by hand, which is how this file drifted
// from the guide it claims to cover: an example added to LLM_PROMPT.md was
// simply not tested. Counting them cannot drift.
{
  const doc = readFileSync(new URL("../LLM_PROMPT.md", import.meta.url), "utf8");
  const editorForm = [...doc.matchAll(/```js\n([\s\S]*?)```/g)]
    .map((m) => m[1])
    .filter((b) => !b.includes("import ") && !b.includes("require("));
  const COVERED = 6;   // 1 intro, 1 return-form, 3 worked, 1 colour — all built above
  if (editorForm.length === COVERED) {
    pass++; console.log(`  PASS  all ${COVERED} runnable examples in the guide are covered here`);
  } else {
    fail++;
    console.log(`  FAIL  the guide has ${editorForm.length} runnable examples, this file builds ${COVERED}`
      + " — add the new one here (or run scripts/check-llm-prompt.mjs to build them all)");
  }
}

console.log("\nAppendix examples\n");
await ok("OpenSCAD appendix snippet", fromOpenSCAD(`
$fn = 64;
difference() {
  cube([30, 30, 12]);
  translate([15, 15, -1]) cylinder(h = 14, r = 8);
}`), 30 * 30 * 12 - Math.PI * 64 * 12, 40);

await ok("JSCAD appendix snippet", jscad.booleans.subtract(
  jscad.primitives.cuboid({ size: [30, 30, 12] }),
  jscad.primitives.cylinder({ radius: 8, height: 20, segments: 64 }),
), 30 * 30 * 12 - Math.PI * 64 * 12, 40);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
