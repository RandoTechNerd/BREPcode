// Casefinity: the case, the bins and the case builder's code.
//
// The interface numbers come from the Casefinity spec (casefinity.net), so
// they are measured here, not trusted: a bin's footprint is n*P - 2c, its ribs
// stand b proud, neighbours and the case never overlap. Then the builder's
// pure half: the grid it fits, the code it writes, and that it reads that code
// back to the same layout.

import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";
import { casefinityFit, casefinityBin, casefinityBinLid, casefinityCase, casefinityCaseLid, caseKit, CASEFINITY } from "../src/casefinity.js";
import { isCaseUrl, kitCode, parseKitCode, paintRegion, tally, PRESETS } from "../viewer/casebuilder.js";

let pass = 0, fail = 0;
const T0 = Date.now();
const check = (label, ok, detail = "") => {
  if (process.env.CF_TIME) label = `[${((Date.now() - T0) / 1000).toFixed(1)}s] ${label}`;
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol;

async function measure(shape) {
  const out = await build(shape);
  const stl = toSTL(out, "s");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  const ax = (i) => ({ min: Math.min(...v.map((p) => p[i])), max: Math.max(...v.map((p) => p[i])) });
  let vol = 0;
  for (let i = 0; i < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return { x: ax(0), y: ax(1), z: ax(2), vol: Math.abs(vol), solids: out.solids.length, engine: out.engine };
}

console.log("\nfit: whole modules, walls take the rest\n");
{
  const f = casefinityFit(200, 140, 70);
  check("200 x 140 outside holds 12 x 8 modules", f.cols === 12 && f.rows === 8, `${f.cols} x ${f.rows}`);
  check("the grid is exactly N*P", f.inner[0] === 180 && f.inner[1] === 120);
  check("walls absorb the leftover", near(f.wallX, 10) && near(f.wallY, 10), `${f.wallX} / ${f.wallY}`);
  const g = casefinityFit(180, 120, 50, { inside: true });
  check("inside 180 x 120 is the same 12 x 8", g.cols === 12 && g.rows === 8, `${g.cols} x ${g.rows}`);
  check("inside height is the body's depth", near(g.inner[2], 50), `${g.inner[2]}`);
  check("too small holds nothing", !casefinityFit(20, 20, 30).fits);
}

console.log("\na bin is n*P - 2c, ribs b proud on -X and +Y\n");
{
  const P = CASEFINITY.pitch, c = CASEFINITY.clear, b = CASEFINITY.bump;
  const m = await measure(casefinityBin({ x: 2, y: 3, h: 30 }));
  check("one solid, exact kernel", m.solids === 1 && /Exact/i.test(m.engine), `${m.solids} / ${m.engine}`);
  check("+X face at F/2 (sockets there, nothing proud)", near(m.x.max, (2 * P - 2 * c) / 2));
  check("-X ribs stand b proud", near(m.x.min, -(2 * P - 2 * c) / 2 - b));
  check("-Y face at F/2", near(m.y.min, -(3 * P - 2 * c) / 2));
  check("+Y ribs stand b proud", near(m.y.max, (3 * P - 2 * c) / 2 + b));
  check("30 tall, on the bed", near(m.z.min, 0) && near(m.z.max, 30));
  const tabbed = await measure(casefinityBin({ x: 2, y: 2, h: 30, tab: true }));
  check("the pull tab stands 5 above the rim", near(tabbed.z.max, 35));
  const frame = await measure(casefinityBin({ x: 2, y: 2, h: 30, bottom: false }));
  const box = await measure(casefinityBin({ x: 2, y: 2, h: 30 }));
  check("a frame has no floor (less plastic than the box)", frame.vol < box.vol - 300, `${frame.vol.toFixed(0)} vs ${box.vol.toFixed(0)}`);
  const walls = await measure(casefinityBin({ x: 2, y: 2, h: 30, bottom: false, divide: true }));
  check("divide adds walls on the module lines", walls.vol > frame.vol + 300);
  const lid = await measure(casefinityBinLid({ x: 2, y: 2 }));
  check("the lid matches the footprint", near(lid.x.max - lid.x.min, 2 * P - 2 * c) && near(lid.y.max - lid.y.min, 2 * P - 2 * c));
}

console.log("\nneighbours and the case never overlap\n");
{
  const P = CASEFINITY.pitch;
  const at = (cx, cy, w, h) => dsl.translate([cx * P, cy * P, 0], casefinityBin({ x: w, y: h, h: 20 }));
  // Overlap by volume: A + B - union(A, B). An EMPTY intersection is refused
  // by the exact kernel and falls back to the JS one for minutes, so the
  // union (which stays exact) is the cheap way to ask the same question.
  const overlap = async (a, b) => {
    const [va, vb, vu] = await Promise.all([measure(a), measure(b), measure(dsl.union(a, b))]);
    return va.vol + vb.vol - vu.vol;
  };
  const ox = await overlap(at(1, 0.5, 2, 1), at(2.5, 0.5, 1, 1));
  check("side by side in X: rib into socket, no overlap", ox < 1, `${ox.toFixed(2)} mm³`);
  const oy = await overlap(at(1, 0.5, 2, 1), at(1, 2, 2, 2));
  check("front to back in Y: no overlap", oy < 1, `${oy.toFixed(2)} mm³`);
  const f = casefinityFit(120, 90, 50);
  const Lin = f.cols * P, Win = f.rows * P;
  const corner = (c0, r0) => dsl.translate([-Lin / 2 + (c0 + 0.5) * P, -Win / 2 + (r0 + 0.5) * P, 2.01], casefinityBin({ x: 1, y: 1, h: f.binHeight }));
  const binsIn = dsl.union(corner(0, 0), corner(f.cols - 1, 0), corner(0, f.rows - 1), corner(f.cols - 1, f.rows - 1));
  const oc = await overlap(casefinityCase({ width: 120, depth: 90, height: 50 }), binsIn);
  check("bins in all four corners sit clear of the case walls", oc < 1, `${oc.toFixed(2)} mm³`);
}

console.log("\nthe case and its lid build exact\n");
{
  const body = await measure(casefinityCase({ width: 160, depth: 110, height: 60 }));
  check("body: one exact solid", body.solids === 1 && /Exact/i.test(body.engine), `${body.solids} / ${body.engine}`);
  check("body is 160 wide", near(body.x.max - body.x.min, 160, 0.05));
  const lid = await measure(casefinityCaseLid({ width: 160, depth: 110, height: 60, print: true }));
  check("lid prints top-down on the bed", near(lid.z.min, 0) && lid.solids === 1);
  const t0 = Date.now();
  const kit = await measure(caseKit({ width: 160, depth: 110, height: 60, layout: [
    { at: [0, 0], size: [2, 2], kind: "box", split: true },
    { at: [2, 0], size: [2, 2], kind: "lidbox" },
    { at: [4, 0], size: [3, 3], kind: "frame", split: true },
  ] }));
  check("a kit is every part, separate", kit.solids === 2 + 4 + 2 + 1, `${kit.solids} solids`);
  check("everything stands on the bed", near(kit.z.min, 0));
  check("a small kit builds in under 15 s", Date.now() - t0 < 15000, `${Date.now() - t0} ms`);
  let threw = "";
  try { caseKit({ width: 160, depth: 110, height: 60, includeCase: false, layout: [] }); } catch (e) { threw = e.message; }
  check("nothing to print says so", /nothing to print/.test(threw), threw);
}

console.log("\nthe builder: routes, painting, the code it writes\n");
{
  check("/case, ?case=1 and #case open it", isCaseUrl({ pathname: "/case" }) && isCaseUrl({ search: "?case=1" }) && isCaseUrl({ hash: "#case" }));
  check("/m/case is a model, not the builder", !isCaseUrl({ pathname: "/m/case" }));
  check("?case=10 is not ?case=1", !isCaseUrl({ search: "?case=10" }));

  let L = [{ c: 0, r: 0, w: 4, h: 4, kind: "box", split: false }];
  L = paintRegion(L, { c: 3, r: 3, w: 2, h: 2 }, "lidbox", true);
  check("painting over a piece replaces it", L.length === 1 && L[0].kind === "lidbox" && L[0].split);
  L = paintRegion(L, { c: 4, r: 4, w: 1, h: 1 }, "erase");
  check("erase removes what it touches", L.length === 0);

  const t = tally([{ c: 0, r: 0, w: 2, h: 2, kind: "lidbox", split: true }, { c: 2, r: 0, w: 2, h: 1, kind: "frame", split: true }], 6, 4, true);
  check("tally counts split boxes, their lids, frames and the case", t.lidbox === 4 && t.lids === 4 && t.frame === 1 && t.pieces === 11 && t.empty === 18,
    JSON.stringify(t));

  for (const p of PRESETS) {
    const regs = p.make(12, 8);
    const covered = regs.reduce((n, g) => n + g.w * g.h, 0);
    const inside = regs.every((g) => g.c >= 0 && g.r >= 0 && g.c + g.w <= 12 && g.r + g.h <= 8);
    const noOverlap = regs.every((a, i) => regs.every((b, j) => i === j
      || !(a.c < b.c + b.w && b.c < a.c + a.w && a.r < b.r + b.h && b.r < a.r + a.h)));
    check(`preset "${p.label}" fits the grid without overlaps`, inside && noOverlap && (p.id === "clear" || covered === 96), `${covered} covered`);
  }

  const state = { width: 200, depth: 140, height: 70, inside: false, includeCase: false,
    regions: [{ c: 0, r: 0, w: 3, h: 8, kind: "box", split: false }, { c: 3, r: 0, w: 9, h: 8, kind: "frame", split: true }, { c: 30, r: 0, w: 2, h: 2, kind: "box" }] };
  const code = kitCode(state);
  check("the code credits Casefinity and the Unemployed Architect", /Chris Agocs/.test(code) && /Unemployed Architect/.test(code));
  check("width, depth and height are slider constants", /const width = 200;\s*\/\/ \[60:600\]/.test(code) && /const height = 70;/.test(code));
  check("pieces outside the grid are left out of the code", !/at: \[30, 0\]/.test(code));
  const back = parseKitCode(code);
  check("the code reads back to the same layout", back && back.regions.length === 2 && back.includeCase === false
    && back.regions[1].kind === "frame" && back.regions[1].split === true && back.width === 200, JSON.stringify(back));
  check("non-builder code is not mistaken for it", parseKitCode("return cube(10);") === null);

  // the written code runs through the real vocabulary, the way the editor runs it
  const body = code.replace(/^\s*\/\/.*$/gm, "");
  const shape = Function(...Object.keys(dsl), body)(...Object.values(dsl));
  const m = await measure(shape);
  check("the builder's code builds: 2 pieces, no case", m.solids === 2, `${m.solids}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
// the kernel holds the event loop open after the last build
process.exit(fail ? 1 : 0);
