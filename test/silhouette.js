// The outline compare (src/silhouette.js): the model drawn in a drawing's
// view, its filled outline against the view's. The "drawing" here is drawn
// in code: thin dark outlines on white paper with a dimension line, the way
// a scanned sheet looks after the crop.
//
//   node test/silhouette.js

import { build, cube, union, translate } from "../index.js";
import { drawingMask, projectFaces, compareView, overlayRGB } from "../src/silhouette.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const facesOf = async (shape) => (await build(shape, { engine: "split" })).solids.flatMap((s) => s.faces);

// A FRONT view (x right, z up) of an L: a 100 x 10 base and a 20 x 40
// upright at its left end, drawn 3 px per mm with 2 px lines, plus a
// dimension line under it.
const W = 420, H = 220, S = 3, OX = 60, OY = 170;
function drawL() {
  const g = new Uint8Array(W * H).fill(255);
  const line = (x0, y0, x1, y1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) if (x + dx < W && y + dy < H) g[(y + dy) * W + x + dx] = 30;
    }
  };
  const P = (x, z) => [OX + x * S, OY - z * S];
  const pts = [P(0, 0), P(100, 0), P(100, 10), P(20, 10), P(20, 50), P(0, 50), P(0, 0)];
  for (let i = 0; i + 1 < pts.length; i++) line(...pts[i], ...pts[i + 1]);
  line(OX, OY + 25, OX + 100 * S, OY + 25);              // a dimension line
  line(OX, OY + 6, OX, OY + 30); line(OX + 100 * S, OY + 6, OX + 100 * S, OY + 30);
  return g;
}

console.log("\nthe drawing's outline\n");
const gray = drawL();
const d = drawingMask(gray, W, H);
check("the L is found as one filled outline", d && Math.abs(d.box.x1 - d.box.x0 - 100 * S) <= 6 && Math.abs(d.box.y1 - d.box.y0 - 50 * S) <= 6, JSON.stringify(d?.box));
check("the dimension line is not part of it", d && d.box.y1 < OY + 15, JSON.stringify(d?.box));

console.log("\nthe model in the view\n");
const VIEW = { name: "FRONT", right: "+x", up: "+z" };
const L = union(cube([100, 30, 10]), translate([0, 0, 9.5], cube([20, 30, 40.5])));
{
  const c = compareView(gray, W, H, await facesOf(L), VIEW);
  check("the right model overlaps its view closely", c.iou > 0.9, String(c.iou));
  check("...and draws no complaint", c.lines.length === 0, c.lines.join(" | "));
  const o = overlayRGB(gray, W, H, c.mask);
  check("the overlay is one RGB pixel per drawing pixel", o.length === W * H * 3);
}
{
  // the upright stops at 25 instead of 50: a rib that stops short
  const short = union(cube([100, 30, 10]), translate([0, 0, 9.5], cube([20, 30, 15.5])));
  const c = compareView(gray, W, H, await facesOf(short), VIEW);
  check("a short upright is reported as material the model lacks, in mm", c.lines.some((l) => /material the model lacks/.test(l)), c.lines.join(" | "));
}
{
  const tris = projectFaces(await facesOf(L), { right: "+x", up: "+z", cut: { axis: "+y", at: 15 } });
  const ys = tris.flat();
  check("a section keeps only the part beyond its cut", tris.length > 0 && ys.every(([u, v]) => u >= -1e-6 && v >= -1e-6));
  check("a view with no axes is skipped, not guessed", projectFaces([], { right: "+x" }) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
