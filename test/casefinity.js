// Casefinity: the case, the bins and the case builder's code.
//
// The interface numbers come from the Casefinity spec (casefinity.net), so
// they are measured here, not trusted: a bin's footprint is n*P - 2c, its ribs
// stand b proud, neighbours and the case never overlap. Then the builder's
// pure half: the grid it fits, the code it writes, and that it reads that code
// back to the same layout.

import * as dsl from "../src/dsl.js";
import { build, toSTL } from "../index.js";
import { casefinityFit, casefinityBin, casefinityBinLid, casefinityCase, casefinityCaseLid, casefinitySwingLatch, caseKit, CASEFINITY } from "../src/casefinity.js";
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
  // the tab leans in 1.2 off the front face: flush with it, it sat 0.1 from
  // the case lid's inner wall and jammed the lid. A slab over the front rim,
  // above the lean, meets only the tab, and the tab starts 1.2 in
  const bd = 2 * P - 2 * c;
  const tabOnly = await measure(dsl.intersection(casefinityBin({ x: 2, y: 2, h: 30, tab: true }),
    dsl.translate([-20, -bd / 2 - 1, 31.5], dsl.cube([40, 4, 5]))));
  check("the pull tab stands 1.2 in from the bin's front face", near(tabOnly.y.min, -bd / 2 + 1.2, 0.02) && tabOnly.vol > 20, `${tabOnly.y.min} vs ${-bd / 2 + 1.2}, ${tabOnly.vol.toFixed(1)} mm³`);
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

console.log("\nthe lid closes: rounded tongue, clear corners, optional gasket\n");
{
  const overlap = async (a, b) => {
    const [va, vb, vu] = await Promise.all([measure(a), measure(b), measure(dsl.union(a, b))]);
    return va.vol + vb.vol - vu.vol;
  };
  const size = { width: 53, depth: 38, height: 35 };
  const body = casefinityCase(size), lid = casefinityCaseLid(size);
  // 53 x 38 outside: body 17 tall, corners R = 5.94, the skirt 1.6 thick
  // radially at a corner (groove radius R - 1.6, concentric). A 0.3 mm rod
  // along the corner diagonal, from 1 outside the lid to 3 in, from 0.8
  // above the parting line (over the lead-in flare) to 1.1 above the groove
  // ceiling, meets 1.6 x 0.3 x 1.4 of skirt plus 3 x 0.3 x 1.1 of the wall
  // above: about 1.66 mm³. The square groove left only the wall: 0.99.
  // (Measured as an intersection, which stays exact because the rod always
  // meets the wall; volume differences are too noisy at a rounded corner.)
  const R = 5.94, cx = 53 / 2 - R, cy = 38 / 2 - R;
  const rod = dsl.translate([cx + R / Math.SQRT2, cy + R / Math.SQRT2, 0],
    dsl.rotate([0, 0, 45], dsl.translate([-3, -0.15, 17.8], dsl.cube([4, 0.3, 2.5]))));
  const skirt = (await measure(dsl.intersection(lid, rod))).vol;
  check("the lid skirt has a wall at the corners", skirt > 1.45 && skirt < 1.9, `${skirt.toFixed(3)} mm³ (1.66 expected, 0.99 without a skirt)`);
  // volumes of ~15 000 mm³ parts differ by about 1 mm³ between tessellations,
  // so "no overlap" is < 2 here; a real clash (the old hinge arms) read 7
  const closed = await overlap(body, lid);
  check("closed lid and body do not intersect", closed < 2, `${closed.toFixed(2)} mm³`);
  const bm = await measure(body), lm = await measure(lid);
  check("body and lid build exact", /Exact/i.test(bm.engine) && /Exact/i.test(lm.engine), `${bm.engine} / ${lm.engine}`);
  check("the hinge stands 5.8 proud of the back wall", near(bm.y.max, 38 / 2 + 0.4 + 5.4, 0.05), `${bm.y.max}`);
  // the gasket is opt-in: off adds nothing (the knuckle ring, 2.7 above the
  // parting line, is the body's top), on adds a crest and clears its trench
  const gBody = casefinityCase({ ...size, gasket: true }), gLid = casefinityCaseLid({ ...size, gasket: true });
  const gbm = await measure(gBody);
  check("gasket off by default: no crest", near(bm.z.max, 17 + 2.7, 0.01), `${bm.z.max}`);
  check("gasket on: the crest stands 0.8 above the tongue", near(gbm.z.max, 17 + 2 + 0.8, 0.01), `${gbm.z.max}`);
  const gClosed = await overlap(gBody, gLid);
  check("gasket crest sits in its trench without touching", gClosed < 2, `${gClosed.toFixed(2)} mm³`);
  const mixed = await overlap(gBody, lid);
  check("a gasket body under a plain lid collides (the pair must match)", mixed > 5, `${mixed.toFixed(2)} mm³`);
  // the lid stands 0.3 a side off the tongue now (0.2 printed tight)
  check("lidFit is 0.3 a side", near(lm.z.min, 17 - 11, 0.01) && near(lm.y.min, -(38 / 2 + 0.3 + 1.6), 0.01), `${lm.y.min}`);
  // the hook clasp: the wedge stands 0.9 proud, the blade 1.6 thick on a 0.3
  // gap, the bar under its window 2.4 tall on 4 mm legs; closed, no contact
  check("hook clasp: the wedge stands 0.9 proud of the front", near(bm.y.min, -(38 / 2 + 0.9), 0.01), `${bm.y.min}`);
  const bar = await measure(dsl.intersection(lid, dsl.translate([-12, -38 / 2 - 3, 17 - 11 - 0.5], dsl.cube([24, 3, 2.9]))));
  check("hook clasp: a 2.4 bar, 1.6 thick, across the blade", bar.vol > 60 && bar.vol < 78, `${bar.vol.toFixed(1)} mm³ (76.8 before its chamfers; the old 1.3 x 1.6 bar was 41.6)`);
  // the round clasp: a solid blade with a round lip under a round bead on the
  // body. Closed they do not touch; the bead stands 0.7 proud, the blade on a
  // 0.7 gap, and the lip's crown comes 0.1 short of the wall
  const rBody = casefinityCase({ ...size, latch: "round" }), rLid = casefinityCaseLid({ ...size, latch: "round" });
  const [rbm, rlm] = await Promise.all([measure(rBody), measure(rLid)]);
  check("round clasp: body and lid build exact", /Exact/i.test(rbm.engine) && /Exact/i.test(rlm.engine), `${rbm.engine} / ${rlm.engine}`);
  check("round clasp: the bead stands 0.7 proud of the front", near(rbm.y.min, -(38 / 2 + 0.7), 0.01), `${rbm.y.min}`);
  check("round clasp: the blade stands on a 0.7 gap", near(rlm.y.min, -(38 / 2 + 0.7 + 1.6), 0.01), `${rlm.y.min}`);
  const lipSlab = await measure(dsl.intersection(rLid, dsl.translate([-12, -38 / 2 - 0.7, 17 - 11 - 0.5], dsl.cube([24, 2, 2.9]))));
  check("round clasp: the lip stops 0.1 short of the body wall", near(lipSlab.y.max, -38 / 2 - 0.1, 0.02), `${lipSlab.y.max}`);
  const rClosed = await overlap(rBody, rLid);
  check("round clasp: closed lid and body do not intersect", rClosed < 2, `${rClosed.toFixed(2)} mm³`);
  const solidBlade = await measure(dsl.intersection(rLid, dsl.translate([-12, -38 / 2 - 3, 17 - 11 + 3], dsl.cube([24, 3, 5]))));
  check("round clasp: the blade has no window", near(solidBlade.vol, 20 * 1.6 * 5, 2), `${solidBlade.vol.toFixed(1)} mm³ (160 solid; 32 with the hook's window)`);
}

console.log("\nthe Koch Box: ribbed walls, a swing latch on a pin\n");
{
  const overlap = async (a, b) => {
    const [va, vb, vu] = await Promise.all([measure(a), measure(b), measure(dsl.union(a, b))]);
    return va.vol + vb.vol - vu.vol;
  };
  const size = { width: 53, depth: 38, height: 35, style: "koch" };
  const body = casefinityCase(size), lid = casefinityCaseLid(size), latch = casefinitySwingLatch(size);
  const [bm, lm, tm] = await Promise.all([measure(body), measure(lid), measure(latch)]);
  check("Koch body, lid and latch build exact", [bm, lm, tm].every((m) => /Exact/i.test(m.engine)), `${bm.engine} / ${lm.engine} / ${tm.engine}`);
  check("ribs stand 3 proud of the sides", near(bm.x.max, 53 / 2 + 3, 0.01) && near(lm.x.max, 53 / 2 + 3, 0.01), `${bm.x.max} / ${lm.x.max}`);
  check("the latch pad is flush with the front ribs", near(bm.y.min, -(38 / 2 + 3), 0.01), `${bm.y.min}`);
  check("the hinge still stands 5.8 proud of the back", near(bm.y.max, 38 / 2 + 0.4 + 5.4, 0.05), `${bm.y.max}`);
  check("the lid's lugs reach 8 out", near(lm.y.min, -(38 / 2 + 8), 0.02), `${lm.y.min}`);
  // the latch hangs from 8 above the parting line (17) to its lip 6.9 below,
  // its boss 8.2 out from the wall and its lip reaching back to 1.0 out
  check("the latch spans boss to lip", near(tm.z.max, 17 + 11, 0.01) && near(tm.z.min, 17 - 6.9, 0.01), `${tm.z.min}..${tm.z.max}`);
  check("the latch reaches 8.2 out and its lip 1.0 off the wall", near(tm.y.min, -(19 + 8.2), 0.01) && near(tm.y.max, -(19 + 1.0), 0.01), `${tm.y.min}..${tm.y.max}`);
  const [bl, bt, lt] = await Promise.all([overlap(body, lid), overlap(body, latch), overlap(lid, latch)]);
  check("closed: body and lid do not touch", bl < 2, `${bl.toFixed(2)} mm³`);
  check("closed: the latch sits in its pocket without touching the body", bt < 2, `${bt.toFixed(2)} mm³`);
  check("closed: the latch swings clear of the lid's lugs", lt < 2, `${lt.toFixed(2)} mm³`);
  // the lip really is inside the pocket: a slab through the pocket meets lip material
  const inPocket = await measure(dsl.intersection(latch, dsl.translate([-10, -19 - 3.2, 17 - 7], dsl.cube([20, 2.2, 4]))));
  check("the lip fills the pocket 0.1 a side", near(inPocket.vol, 8 * 2.2 * 3.8 - 2.9, 1.5), `${inPocket.vol.toFixed(1)} mm³ (66.9 less two 0.6 lead-in chamfers = 64.0)`);
  const pm = await measure(casefinitySwingLatch({ ...size, print: true }));
  check("the latch prints on its side, 8 tall", near(pm.z.min, 0) && near(pm.z.max, 8, 0.01), `${pm.z.min}..${pm.z.max}`);
  const kit = await measure(caseKit({ ...size, layout: [{ at: [0, 0], size: [3, 2], kind: "frame", split: true }] }));
  check("a Koch kit is body, lid, latch and the frame", kit.solids === 4 && near(kit.z.min, 0), `${kit.solids} solids`);
  const small = await measure(casefinityCase({ width: 38, depth: 23, height: 32, style: "koch" }));
  check("the smallest case takes the Koch ribs (pulled inboard of its corners)", /Exact/i.test(small.engine) && near(small.x.max, 19 + 3, 0.01), `${small.engine} ${small.x.max}`);
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
  check("the gasket is off unless asked for", /const gasket = false;/.test(code) && back.gasket === false);
  const gCode = kitCode({ ...state, gasket: true });
  check("the hook clasp and a 0.3 fit are the defaults", /const latch = "hook";/.test(code) && /const lidFit = 0.3;/.test(code) && back.latch === "hook" && back.lidFit === 0.3);
  const rCode = kitCode({ ...state, latch: "round", lidFit: 0.4 });
  check("latch and lidFit are written and read back", /const latch = "round";/.test(rCode) && /const lidFit = 0.4;/.test(rCode)
    && parseKitCode(rCode).latch === "round" && parseKitCode(rCode).lidFit === 0.4);
  check("smooth walls are the default", /const style = "smooth";/.test(code) && back.style === "smooth" && !/Luca Koch/.test(code));
  const kCode = kitCode({ ...state, style: "koch" });
  check("the Koch Box is written, credited and read back", /const style = "koch";/.test(kCode) && /Luca Koch/.test(kCode) && /printables\.com\/model\/1517296/.test(kCode)
    && parseKitCode(kCode).style === "koch" && /style, latch, lidFit, layout/.test(kCode));
  check("a Koch kit counts its latch", tally([{ c: 0, r: 0, w: 1, h: 1, kind: "box" }], 2, 1, true, true).pieces === 4);
  check("gasket: true is written and read back", /const gasket = true;/.test(gCode) && /gasket, style, latch, lidFit, layout/.test(gCode) && parseKitCode(gCode).gasket === true);

  // the written code runs through the real vocabulary, the way the editor runs it
  const body = code.replace(/^\s*\/\/.*$/gm, "");
  const shape = Function(...Object.keys(dsl), body)(...Object.values(dsl));
  const m = await measure(shape);
  check("the builder's code builds: 2 pieces, no case", m.solids === 2, `${m.solids}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
// the kernel holds the event loop open after the last build
process.exit(fail ? 1 : 0);
