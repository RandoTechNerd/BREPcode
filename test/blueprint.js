// The SVG blueprint has to fit on its own sheet.
//
// It used not to. The sheet was sized from the three orthographic views, and
// then three things were drawn wherever they happened to fall:
//
//   * the ISOMETRIC'S DIMENSIONS, which run along the projected axes and so
//     point in six different directions depending on the part — a 240x4 disc
//     put one 35 units past the right edge;
//   * a VERTICAL DIMENSION beside a view near an edge;
//   * the TITLE BLOCK, a fixed 360 wide, which on a narrow sheet started at
//     x = -58 and hung off the page entirely (a 10x200 rod did this).
//
// A drawing that runs off its own border is worse than an ugly one: it is
// wrong in the one way a drawing must never be, and it prints clipped.
//
// So the generator now reports the extent of everything it drew, in
// data-ink="x0 y0 x1 y1", and the sheet is sized from that. These tests read
// that attribute back and check the page really does contain the drawing —
// across the aspect ratios that used to break it.

import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { _setReplicad, curvedDrawingSVG, buildCurved } from "../viewer/curved.js";
import { fromOpenSCAD } from "../src/openscad.js";
import { cube, cylinder, sphere, torus, difference, translate, union } from "../src/dsl.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// Same shim curvedstep.js uses: node cannot import the dual-format emscripten
// loader, so it is rewritten to CJS in the temp dir and injected.
const loaderSrc = readFileSync("node_modules/replicad-opencascadejs/src/replicad_single.js", "utf8")
  .replace(/export default Module;\s*$/, "module.exports = Module;");
const loaderPath = join(tmpdir(), "brepcode-replicad-bp.cjs");
writeFileSync(loaderPath, loaderSrc);
const require = createRequire(import.meta.url);
const initOC = require(loaderPath);
const replicad = await import("replicad");
replicad.setOC(await initOC({
  locateFile: () => "node_modules/replicad-opencascadejs/src/replicad_single.wasm",
}));
_setReplicad(replicad);

const sheetOf = (svg) => {
  const vb = /viewBox="([^"]+)"/.exec(svg)[1].split(/\s+/).map(Number);
  const ink = /data-ink="([^"]+)"/.exec(svg)?.[1].split(/\s+/).map(Number);
  return { w: vb[2], h: vb[3], ink };
};

// The shapes whose proportions used to break the layout.
const CASES = [
  ["a plain cube", cube([40, 40, 40]), [40, 40, 40]],
  ["a tall thin rod", cylinder({ r: 5, h: 200, $fn: 32 }), [10, 10, 200]],
  ["a wide flat plate", cube([300, 20, 3]), [300, 20, 3]],
  ["a big flat disc", cylinder({ r: 120, h: 4, $fn: 48 }), [240, 240, 4]],
  ["a tiny part", cube([2, 2, 2]), [2, 2, 2]],
  ["a long needle", cylinder({ r: 1.5, h: 120, $fn: 24 }), [3, 3, 120]],
  ["a drilled bracket",
    difference(cube([60, 40, 12]), translate([30, 20, -1], cylinder({ r: 5, h: 20, $fn: 32 }))),
    [60, 40, 12]],
];

console.log("\nthe drawing fits inside its own page\n");
for (const [name, shape, size] of CASES) {
  const svg = await curvedDrawingSVG(shape, { size, title: name });
  const s = sheetOf(svg);
  check(`${name}: the sheet declares where its ink is`, Array.isArray(s.ink) && s.ink.length === 4,
    JSON.stringify(s.ink));
  if (!s.ink) continue;
  const [x0, y0, x1, y1] = s.ink;
  check(`${name}: nothing off the left or top`, x0 >= 0 && y0 >= 0, `ink starts ${x0}, ${y0}`);
  check(`${name}: nothing off the right`, x1 <= s.w, `${x1} vs sheet ${s.w}`);
  check(`${name}: nothing off the bottom`, y1 <= s.h, `${y1} vs sheet ${s.h}`);
  // ...and it is not fitting by being padded into uselessness
  const fillW = (x1 - x0) / s.w;
  check(`${name}: the page is sized to the drawing, not vastly bigger`,
    fillW > 0.35, `drawing fills ${(fillW * 100).toFixed(0)}% of the width`);
}

console.log("\nthe title block always has room\n");
{
  // 360 wide plus its margins. A sheet narrower than that cannot hold it, and
  // used to let it hang off the left edge rather than growing.
  for (const [name, shape, size] of [
    ["tiny part", cube([2, 2, 2]), [2, 2, 2]],
    ["needle", cylinder({ r: 1.5, h: 120, $fn: 24 }), [3, 3, 120]],
  ]) {
    const s = sheetOf(await curvedDrawingSVG(shape, { size }));
    check(`${name}: the sheet is at least as wide as the title block`,
      s.w >= 360 + 60, `${s.w}`);
  }
}

console.log("\nthe outline is actually there\n");
{
  // The whole point of the drawing. A sheet with a border, a title block and
  // no part on it would pass every layout test above.
  for (const [name, shape, size] of CASES.slice(0, 4)) {
    const svg = await curvedDrawingSVG(shape, { size });
    const paths = (svg.match(/<path/g) || []).length;
    check(`${name}: has projected edges`, paths >= 4, `${paths} paths`);
  }
  // Hidden edges are the other half of an engineering drawing: a drilled hole
  // that shows no dashed line in the side view is a drawing of the wrong part.
  const drilled = await curvedDrawingSVG(
    difference(cube([60, 40, 12]), translate([30, 20, -1], cylinder({ r: 5, h: 20, $fn: 32 }))),
    { size: [60, 40, 12] });
  check("a drilled part draws hidden edges dashed", /stroke-dasharray/.test(drilled));
}

console.log("\n...on models with real detail, not just primitives\n");
{
  // The layout cases above are all one or two features. A drawing is hardest
  // exactly where it is most useful: a bolt circle whose eight bores each add
  // hidden edges in three views, and a ring of tangent spheres. Hidden-line
  // removal is superlinear, and the merge that took a disc from 23,756 paths
  // to 26 has to keep holding at this size or the file stops being openable.
  const bolts = union(...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return translate([40 * Math.cos(a), 40 * Math.sin(a), -1], cylinder({ r: 3, h: 20, $fn: 24 }));
  }));
  const flange = difference(
    union(cylinder({ r: 55, h: 10, $fn: 64 }),
      translate([0, 0, 10], cylinder({ r: 22, h: 14, $fn: 48 }))),
    bolts,
    translate([0, 0, -1], cylinder({ r: 12, h: 40, $fn: 48 })),
    translate([-60, -4, 4], cube([120, 8, 4])),
  );
  const ring = union(...Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return translate([30 * Math.cos(a), 30 * Math.sin(a), 0], sphere({ r: 6, $fn: 24 }));
  }));

  for (const [name, shape, size] of [
    ["an 8-bolt flanged boss", flange, [110, 110, 24]],
    ["a ring of twelve spheres", ring, [72, 72, 12]],
  ]) {
    const svg = await curvedDrawingSVG(shape, { size, title: name });
    const s = sheetOf(svg);
    const paths = (svg.match(/<path/g) || []).length;
    check(`${name}: still fits its sheet`,
      s.ink && s.ink[0] >= 0 && s.ink[1] >= 0 && s.ink[2] <= s.w + 0.5 && s.ink[3] <= s.h + 0.5,
      `ink ${s.ink?.map((n) => n.toFixed(0)).join(",")} vs ${s.w | 0}x${s.h | 0}`);
    check(`${name}: the outline is there`, paths >= 4, `${paths} paths`);
    // 26 for the flange when this was written. A few hundred means the merge
    // stopped working; tens of thousands means it is gone.
    check(`${name}: the paths are still merged`, paths < 400, `${paths} paths`);
    check(`${name}: hidden detail is dashed`, /stroke-dasharray/.test(svg));
    check(`${name}: the file is a sane size`, svg.length < 400 * 1024,
      `${(svg.length / 1024).toFixed(0)}KB`);
  }
}

console.log("\na partial-arc torus draws, with real arcs\n");
{
  // "SVG export failed: curved STEP doesn't support partial-arc torus yet."
  //
  // It was refused rather than approximated, which was the honest choice at the
  // time — but it was never hard. replicad's revolve() takes an angle, so the
  // sweep is a partial revolve and the surfaces stay exact. A model built
  // ENTIRELY from partial tori (the hoop that found this) could not be drawn at
  // all, and that is most of what a lathe is for.
  const seg = fromOpenSCAD(`
    difference() {
      union() {
        rotate_extrude(angle = 90, $fn = 64) translate([50,0,0]) circle(r = 5, $fn = 32);
        rotate([0,0,90]) rotate_extrude(angle = 15, $fn = 32)
          translate([50,0,0]) circle(r = 2, $fn = 24);
      }
      rotate_extrude(angle = 16, $fn = 32) translate([50,0,0]) circle(r = 2.25, $fn = 24);
    }`);
  let svg = null, threw = "";
  try { svg = await curvedDrawingSVG(seg, { size: [110, 55, 10], title: "hoop segment" }); }
  catch (e) { threw = e.message; }
  check("the hoop segment draws at all", !!svg, threw);
  if (svg) {
    const s = sheetOf(svg);
    check("...inside its own sheet",
      s.ink && s.ink[0] >= 0 && s.ink[1] >= 0 && s.ink[2] <= s.w + 0.5 && s.ink[3] <= s.h + 0.5,
      `ink ${s.ink?.map((n) => n.toFixed(0)).join(",")} vs ${s.w | 0}x${s.h | 0}`);
    // The point of going through the curved path rather than the mesh: an arc
    // command, not two hundred straight segments pretending to be a curve.
    check("...with true arcs rather than a faceted approximation",
      /[\s,]A[\s\d-]/.test(svg), "no elliptical-arc commands in the path data");
    check("...and the socket cut into it shows as hidden detail",
      /stroke-dasharray/.test(svg));
  }

  // The sweep has to start and run the same way the KERNEL's does, or the
  // drawing is of a different part than the one on screen and nothing about it
  // would look wrong. 90 degrees belongs in the +X +Y quadrant.
  const quarter = await buildCurved(torus({ r: 50, tube: 5, arc: 90, $fn: 32 }));
  const qb = quarter.boundingBox.bounds;
  check("a quarter torus sits in the +x +y quadrant, as the kernel builds it",
    qb[0][0] > -0.01 && qb[0][1] > -0.01,
    `starts at x ${qb[0][0].toFixed(1)}, y ${qb[0][1].toFixed(1)}`);
  const half = await buildCurved(torus({ r: 50, tube: 5, arc: 180, $fn: 32 }));
  check("...and a half torus is the +y half, so it sweeps anticlockwise",
    half.boundingBox.bounds[0][1] > -0.01 && half.boundingBox.bounds[0][0] < -1,
    JSON.stringify(half.boundingBox.bounds));

  // The full torus is still a full torus — the angle argument is only passed
  // when there IS one, so the common case takes the path it always did.
  const full = await buildCurved(torus({ r: 50, tube: 5, $fn: 32 }));
  check("a full torus is unchanged", full.boundingBox.bounds[0][0] < -1
    && full.boundingBox.bounds[0][1] < -1, JSON.stringify(full.boundingBox.bounds));
}

console.log("\nthe dimensions say the part's real size\n");
{
  // The one thing on a drawing that must never be wrong.
  const svg = await curvedDrawingSVG(cube([60, 40, 25]), { size: [60, 40, 25] });
  for (const n of ["60.0", "40.0", "25.0"]) {
    check(`${n} appears on the sheet`, svg.includes(`>${n}<`));
  }
  check("...and the sheet says its units", /Units: mm/.test(svg));
  check("...and which projection it is", /Third-angle/.test(svg));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
