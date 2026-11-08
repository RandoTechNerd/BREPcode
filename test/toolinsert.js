// Tool insert from a photo (viewer/toolinsert.js): the tool's outline found on
// its own, scaled to its real length, grown by the clearance, and built as a
// block with the pocket cut in, on the exact kernel; and the case round it.
//
//   node test/toolinsert.js

import { detectTool, outlineMm, offsetRing, insertCode, insertSize, caseSize } from "../viewer/toolinsert.js";
import { signedArea } from "../viewer/trace.js";
import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
function volOf(stl) {
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = v.slice(i, i + 3);
    vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return Math.abs(vol);
}
// a photo: white paper, a dark L-shaped "tool" (an Allen key from above), and
// a dark strip down the left edge where the table shows past the paper
function photo(w = 400, h = 300, { table = true, light = false } = {}) {
  const data = new Uint8ClampedArray(w * h * 4);
  const ink = light ? 235 : 30, paper = light ? 25 : 245;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const tool = (x >= 100 && x < 300 && y >= 140 && y < 170) || (x >= 270 && x < 300 && y >= 60 && y < 170);
    const edge = table && x < 20;
    const v = tool ? ink : edge ? 20 : paper;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { width: w, height: h, data };
}

{
  const d = detectTool(photo());
  check("finds the tool on its own", !!d.ring, d.why);
  const xs = d.ring.map((p) => p[0]), ys = d.ring.map((p) => p[1]);
  check("...not the table showing at the photo's edge", Math.min(...xs) > 50, `${Math.min(...xs)}`);
  check("...the whole L (200 x 110 px)", near(Math.max(...xs) - Math.min(...xs), 200, 3) && near(Math.max(...ys) - Math.min(...ys), 110, 3),
    `${Math.max(...xs) - Math.min(...xs)} x ${Math.max(...ys) - Math.min(...ys)}`);
  const mm = outlineMm(d.ring, 100);
  const w = Math.max(...mm.map((p) => p[0])) - Math.min(...mm.map((p) => p[0]));
  check("scaled to its real length (100 mm)", near(w, 100, 0.6), `${w}`);
  check("...counter-clockwise, Y up", signedArea(mm) > 0);
  const grown = offsetRing(mm, 1);
  const gw = Math.max(...grown.map((p) => p[0])) - Math.min(...grown.map((p) => p[0]));
  check("clearance grows it 1 mm a side", near(gw, 102, 0.3), `${gw}`);
  check("...and its area by about perimeter x 1 mm", signedArea(grown) - signedArea(mm) > 250 && signedArea(grown) - signedArea(mm) < 380,
    `${(signedArea(grown) - signedArea(mm)).toFixed(1)}`);

  const size = insertSize(grown, { depth: 15, floor: 3, margin: 10 });
  check("the block is the pocket plus the margin", near(size.width, 122, 0.4) && near(size.height, 18, 1e-9), JSON.stringify(size));
  const src = insertCode(grown, { depth: 15, floor: 3, margin: 10, scoop: false }, { name: "allen key", length: 100 });
  const DSL = Object.fromEntries(Object.entries(dsl).filter(([k, v]) => typeof v === "function" && k !== "compile"));
  const run = (text) => new Function(...Object.keys(DSL), `"use strict";\n${text.replace(/\n(difference\()/, "\nreturn $1")}`)(...Object.values(DSL));
  const r = await build(run(src));
  check("the insert builds exact", r.engine === "exact", r.engine);
  const pocketVol = signedArea(grown) * 15;
  const want = size.width * size.depth * size.height - pocketVol;
  check("...block less the pocket", near(volOf(toSTL(r, "t")), want, want * 0.01), `${volOf(toSTL(r, "t")).toFixed(0)} vs ${want.toFixed(0)}`);
  const scooped = await build(run(insertCode(grown, { depth: 15, floor: 3, margin: 10, scoop: true })));
  check("...and with the finger scoop, a little less", scooped.engine === "exact" && volOf(toSTL(scooped, "t")) < volOf(toSTL(r, "t")) - 100, scooped.engine);

  const c = caseSize(size);
  check("the case fits round it, with room for the lid", c.width >= size.width + 2 && c.depth >= size.depth + 2 && c.height >= size.height + 5, JSON.stringify(c));
}
{
  const d = detectTool(photo(400, 300, { table: false, light: true }));
  check("a light tool on a dark sheet is found too (automatic invert)", !!d.ring && d.invert === true, d.why || "");
}
{
  const blank = photo(200, 150, { table: false });
  for (let i = 0; i < blank.data.length; i += 4) blank.data[i] = blank.data[i + 1] = blank.data[i + 2] = 245;
  const d = detectTool(blank);
  check("a blank photo says so, not a pocket of nothing", !d.ring && /no shape/.test(d.why), d.why);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
