// KUGGIS inserts: the box's inside as numbers, the pieces cut from it, and
// the builder's code for them.
//
// What is worth measuring: a piece against a wall is narrower at the floor
// than at its top (it leans with the wall), its top never reaches past the
// rim less the fit gap, a piece inside the grid is upright, and the code the
// builder writes reads back to the same box and layout.

import { build, toSTL } from "../index.js";
import { KUGGIS, KUGGIS_SIZES, kuggisEstimate, kuggisFit, kuggisKit } from "../src/kuggis.js";
import { kitCode, parseKitCode, defaultKuggis, tally } from "../viewer/casebuilder.js";

let pass = 0, fail = 0;
const T0 = Date.now();
const check = (label, ok, detail = "") => {
  if (process.env.CF_TIME) label = `[${((Date.now() - T0) / 1000).toFixed(1)}s] ${label}`;
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

async function measure(shape) {
  const out = await build(shape);
  const stl = toSTL(out, "s");
  const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => m.slice(1).map(Number));
  const ax = (i) => ({ min: Math.min(...v.map((p) => p[i])), max: Math.max(...v.map((p) => p[i])) });
  // the x or y extent of the vertices within half a millimetre of a height.
  // A mesh has vertices only where faces meet, so ask at heights that have
  // them: the bed, the floor rounding's top, the piece's top.
  const at = (zq, i) => { const s = v.filter((p) => Math.abs(p[2] - zq) <= 0.5); return s.length ? Math.max(...s.map((p) => p[i])) - Math.min(...s.map((p) => p[i])) : NaN; };
  return { x: ax(0), y: ax(1), z: ax(2), solids: out.solids.length, engine: out.engine, at };
}

console.log("\nthe box as numbers\n");
{
  check("five IKEA sizes", KUGGIS_SIZES.length === 5 && KUGGIS_SIZES.every((s) => s.outer.length === 3));
  const e = kuggisEstimate([260, 350, 150]);
  // IKEA quotes the footprint: a real 26x35 is 265 inside 9 mm down and 146.4 deep
  check("the estimate reads IKEA's size as the footprint", e.rimW === 265 && e.rimD === 350 && e.height === 146.4, JSON.stringify(e));
  const m = kuggisEstimate(KUGGIS_SIZES.find((s) => s.id === "26x35x15"));
  check("the measured box sets each axis's taper from floor and rim", near(m.taper, 7.7, 0.1) && near(m.taperD, 6.2, 0.1) && m.rimW === 265 && m.rimD === 350 && m.height === 146.4, JSON.stringify(m));
  const mf = kuggisFit(m);
  check("...and both floors come back out of the fit", near(mf.floor[0], 228, 0.3) && near(mf.floor[1], 320, 0.3), `${mf.floor}`);
  check("...with the 19 mm corner the diagonal gave", m.corner === 19);
  check("a taper alone leans both axes the same", kuggisFit({ rimW: 200, rimD: 300, height: 100, lidIn: 9, taper: 5 }).floor[1] === +(300 - 2 * 91 * Math.tan(5 * Math.PI / 180)).toFixed(1));
  check("an unmeasured size is the plain estimate", kuggisEstimate(KUGGIS_SIZES[0]).taper === KUGGIS.taper);
  const f = kuggisFit(e);
  const shrink = 2 * (e.height - e.lidIn) * Math.tan((e.taper * Math.PI) / 180);
  const shrinkD = 2 * (e.height - e.lidIn) * Math.tan(((e.taperD || e.taper) * Math.PI) / 180);
  check("the floor is the rim less the lean of both walls, per axis", near(f.floor[0], e.rimW - shrink, 0.1) && near(f.floor[1], e.rimD - shrinkD, 0.1), `${f.floor} vs ${e.rimW - shrink} / ${e.rimD - shrinkD}`);
  check("whole modules across the floor, less the fit gap", f.cols === Math.floor((f.floor[0] - 2 * e.clear) / 15) && f.rows === Math.floor((f.floor[1] - 2 * e.clear) / 15), `${f.cols} x ${f.rows}`);
  check("pieces stop under the lid's plug", near(f.pieceHeight, e.height - e.lidIn - KUGGIS.topClear), `${f.pieceHeight}`);
  check("the lid depth is a slider in the code", /const lidIn = /.test(kitCode({ container: "kuggis", kuggis: defaultKuggis(), regions: [] })));
  check("a tub too steep to hold a square says so", !kuggisFit({ rimW: 60, rimD: 60, height: 100, taper: 15 }).fits);
  check("no taper is a straight tub", kuggisFit({ ...e, taper: 0 }).floor[0] === e.rimW);
}

console.log("\na piece against the wall leans with it; one inside stands upright\n");
{
  const e = kuggisEstimate([180, 260, 80]);
  const f = kuggisFit(e);
  const t = Math.tan((e.taper * Math.PI) / 180);
  // the front-left corner box, 2 x 2 squares
  const corner = await measure(kuggisKit({ ...e, layout: [{ at: [0, 0], size: [2, 2], kind: "box" }] }));
  check("one solid", corner.solids === 1, `${corner.solids}`);
  check("its height is the piece height", near(corner.z.max - corner.z.min, f.pieceHeight, 0.05), `${corner.z.max - corner.z.min}`);
  const low = corner.at(e.floorRound, 0), top = corner.at(corner.z.max, 0);
  const lean = (corner.z.max - e.floorRound) * t;
  check("wider at the top than above the floor rounding, by the wall's lean",
    top > low && near(top - low, lean, 0.6), `${low.toFixed(2)} -> ${top.toFixed(2)}, lean ${lean.toFixed(2)}`);
  check("it rounds in toward the floor", corner.at(0, 0) < low - 2, `${corner.at(0, 0).toFixed(2)} vs ${low.toFixed(2)}`);
  // the same box's width at the top: two squares, plus the margin out to the wall at that height, less the fit gap
  const margin = (f.floor[0] - f.cols * 15) / 2;
  const expectTop = 30 - KUGGIS.between / 2 + margin + corner.z.max * t - e.clear;
  check("its top reaches the wall less the fit gap", near(top, expectTop, 0.6), `${top.toFixed(2)} vs ${expectTop.toFixed(2)}`);

  // a box in the middle of the grid: upright and plain
  const mid = await measure(kuggisKit({ ...e, layout: [{ at: [2, 3], size: [2, 2], kind: "box" }] }));
  check("an inside piece is two squares less the gap between neighbours", near(mid.x.max - mid.x.min, 30 - KUGGIS.between, 0.02), `${mid.x.max - mid.x.min}`);
  check("...and the same at every height", near(mid.at(0, 0), mid.at(mid.z.max, 0), 0.02), `${mid.at(0, 0)} / ${mid.at(mid.z.max, 0)}`);

  // separators along the back, split: one piece, walls inside
  const frame = await measure(kuggisKit({ ...e, layout: [{ at: [0, f.rows - 2], size: [f.cols, 2], kind: "frame", split: true }] }));
  check("a frame is one solid", frame.solids === 1, `${frame.solids}`);
  check("a frame has no floor: it starts on the bed and is open underneath", near(frame.z.min, 0, 0.01));
  check("a lidded region prints as a box here", (await measure(kuggisKit({ ...e, layout: [{ at: [0, 0], size: [1, 1], kind: "lidbox" }] }))).solids === 1);
}

console.log("\nthe builder's code\n");
{
  const s = { container: "kuggis", kuggis: defaultKuggis("18x26x15"), regions: [{ c: 0, r: 0, w: 2, h: 2, kind: "lidbox" }, { c: 2, r: 0, w: 3, h: 3, kind: "frame", split: true }] };
  const code = kitCode(s);
  check("it calls kuggisKit, not caseKit", /return kuggisKit\(/.test(code) && !/caseKit\(/.test(code));
  check("the box's inside is sliders", /const rimW = [\d.]+;\s+\/\/ \[/.test(code) && /const taper = /.test(code) && /const taperD = /.test(code) && /const clear = /.test(code));
  check("it says the numbers are estimates to measure over", /estimate/i.test(code) && /Measure your box/.test(code));
  const back = parseKitCode(code);
  check("it reads back as the KUGGIS container", back?.container === "kuggis");
  check("...to the same size", back?.kuggis?.size === "18x26x15" && back.kuggis.rimW === s.kuggis.rimW && back.kuggis.lidIn === s.kuggis.lidIn, JSON.stringify(back?.kuggis));
  check("...and the same layout, lids dropped", back?.regions.length === 2 && back.regions[0].kind === "box" && back.regions[1].split === true);
  const typed = parseKitCode(code.replace(/const rimW = [\d.]+/, "const rimW = 170.5"));
  check("a measured number reads back as custom", typed?.kuggis?.size === "custom" && typed.kuggis.rimW === 170.5);
  check("a case model still parses as a case", parseKitCode(kitCode({ regions: [] }))?.container === "case");
  // the builder turns lidded regions into boxes when the container becomes a
  // KUGGIS and hides the brush, so its tally never sees a lid there
  const t = tally(back.regions, 10, 15, false, false);
  check("the tally counts pieces only, no case, no lids", t.pieces === 2 && t.lids === 0, `${t.pieces}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
