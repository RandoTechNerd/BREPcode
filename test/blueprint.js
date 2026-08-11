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

import { _setReplicad, curvedDrawingSVG } from "../viewer/curved.js";
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
