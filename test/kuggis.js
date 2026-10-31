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
  // how many vertices sit at exactly this height (a feature that ends there)
  const atZ = (zq) => v.filter((p) => Math.abs(p[2] - zq) < 0.02).length;
  const vertsBetween = (z0, z1) => v.filter((p) => p[2] > z0 && p[2] < z1).length;
  let vol = 0;
  for (let i = 0; i + 2 < v.length; i += 3) {
    const [a, b, c] = [v[i], v[i + 1], v[i + 2]];
    vol += (a[0] * (b[1] * c[2] - c[1] * b[2]) - a[1] * (b[0] * c[2] - c[0] * b[2]) + a[2] * (b[0] * c[1] - c[0] * b[1])) / 6;
  }
  return { x: ax(0), y: ax(1), z: ax(2), solids: out.solids.length, engine: out.engine, at, atZ, vertsBetween, vol: Math.abs(vol) };
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
  check("...with the corner re-based per size (12 on the 26x35, 7.5 on the 13x18)", m.corner === 12 && kuggisEstimate(KUGGIS_SIZES[0]).corner === 7.5, `${m.corner} / ${kuggisEstimate(KUGGIS_SIZES[0]).corner}`);
  check("...and a corner rib slot: past the corner, 4 wide, 30 % of the depth", m.lug === 16 && m.lugW === 4 && m.lugH === 44, `${m.lug} ${m.lugW} ${m.lugH}`);
  check("the smallest box's slot is as tall as the published insert's (25 mm)", kuggisEstimate(KUGGIS_SIZES[0]).lugH >= 20 && kuggisEstimate(KUGGIS_SIZES[0]).lugH <= 25, `${kuggisEstimate(KUGGIS_SIZES[0]).lugH}`);
  check("the rib slot is a slider in the code", /const lug = [\d.]+/.test(kitCode({ container: "kuggis", kuggis: defaultKuggis(), regions: [] })));
  check("...and reads back", parseKitCode(kitCode({ container: "kuggis", kuggis: { ...defaultKuggis(), lug: 21.5, lugH: 33 }, regions: [] })).kuggis.lug === 21.5);
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
  // the front-left corner box, 2 x 2 squares. Built UPRIGHT here (flip:
  // false) so the shape reads floor-up; the printing orientation is its own
  // block below
  const corner = await measure(kuggisKit({ ...e, flip: false, layout: [{ at: [0, 0], size: [2, 2], kind: "box" }] }));
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
  // the corner rib slot: it ends at lugH on the outside and a wall higher
  // inside (the cavity's slot is grown by the wall), so those are the only
  // heights with vertices between the floor and the top; the same piece
  // with lug 0 has nothing there, and the same outline everywhere else
  const noSlot = await measure(kuggisKit({ ...e, flip: false, lug: 0, layout: [{ at: [0, 0], size: [2, 2], kind: "box" }] }));
  check("a corner piece has a slot for the box's corner rib, as tall as the rib",
    corner.atZ(e.lugH) >= 4 && corner.atZ(e.lugH + KUGGIS.wall) >= 4 && noSlot.atZ(e.lugH) === 0,
    `${corner.atZ(e.lugH)} / ${corner.atZ(e.lugH + KUGGIS.wall)} vertices at ${e.lugH} / ${e.lugH + KUGGIS.wall}; without: ${noSlot.atZ(e.lugH)}`);
  check("...with a wall around the slot (more plastic, not less)", corner.vol > noSlot.vol + 50 && corner.vol < noSlot.vol + 2000, `${corner.vol.toFixed(0)} vs ${noSlot.vol.toFixed(0)} mm³`);
  // (at the bed the slot's cut through the floor rounding adds vertices
  // between 0 and 0.5 that the plain hull does not have, so compare the top
  // and the bounding box, not the bed band)
  check("...and the same outline at the top and the same bounds", near(corner.at(corner.z.max, 0), noSlot.at(noSlot.z.max, 0), 0.02)
    && near(corner.x.min, noSlot.x.min, 0.02) && near(corner.y.min, noSlot.y.min, 0.02) && near(corner.x.max, noSlot.x.max, 0.02),
    `${corner.x.min}/${noSlot.x.min} ${corner.y.min}/${noSlot.y.min}`);
  check("an inside piece never has one", (await measure(kuggisKit({ ...e, layout: [{ at: [2, 3], size: [2, 2], kind: "box" }] }))).atZ(e.lugH) === 0);
  // the slot's end is a 45 degree ramp, not a flat roof: the outer cutter
  // leaves the piece a sloped face from the slot's end up and out toward
  // the corner, so there are vertices between lugH and lugH + reach, and
  // none of those faces is horizontal (no vertex band thicker than the
  // ramp's own steps)
  const ramp = corner.vertsBetween(e.lugH + 0.5, e.lugH + e.lug - 1);
  check("the slot climbs out at 45 degrees (vertices along the ramp)", ramp >= 2, `${ramp} vertices on the ramp`);

  // PRINTING ORIENTATION: by default the same corner box comes top down
  // (open side on the bed), so its widest outline is at the bed and the
  // floor rounding closes in at the top
  const flipped = await measure(kuggisKit({ ...e, layout: [{ at: [0, 0], size: [2, 2], kind: "box" }] }));
  check("a small corner box prints top down: widest at the bed", flipped.at(0, 0) > flipped.at(flipped.z.max - e.floorRound, 0) + 2, `${flipped.at(0, 0).toFixed(2)} at the bed vs ${flipped.at(flipped.z.max - e.floorRound, 0).toFixed(2)} below the top`);
  check("...rounding in at the top", flipped.at(flipped.z.max, 0) < flipped.at(flipped.z.max - e.floorRound, 0) - 2);
  check("...same height, still on the bed", near(flipped.z.min, 0, 0.01) && near(flipped.z.max, corner.z.max, 0.01));
  check("...and it is the upright piece turned over", near(flipped.at(0, 0), top, 0.05) && near(flipped.at(flipped.z.max, 0), corner.at(0, 0), 0.05), `${flipped.at(0, 0).toFixed(2)} vs ${top.toFixed(2)}`);
  // a big box would have to bridge its whole floor: it stays upright
  const big = await measure(kuggisKit({ ...e, layout: [{ at: [0, 0], size: [5, 5], kind: "box" }] }));
  check("a box wider than the floor can bridge prints upright", big.at(big.z.max, 0) > big.at(0, 0) + 2, `${big.at(0, 0).toFixed(2)} -> ${big.at(big.z.max, 0).toFixed(2)}`);
  check("...unless told to flip", (await measure(kuggisKit({ ...e, flip: true, layout: [{ at: [0, 0], size: [5, 5], kind: "box" }] }))).at(0, 0) > big.at(0, 0) + 2);
  // half squares: a 7.5 pitch doubles the grid, is a const in the code and reads back, and a piece on it builds
  const halfFit = kuggisFit({ ...e, pitch: 7.5 });
  check("half squares double the grid (or one half square more, where it fits)", halfFit.cols >= 2 * f.cols && halfFit.cols <= 2 * f.cols + 1 && halfFit.rows >= 2 * f.rows && halfFit.rows <= 2 * f.rows + 1 && halfFit.pitch === 7.5, `${halfFit.cols} x ${halfFit.rows} vs ${f.cols} x ${f.rows}`);
  check("...are a const in the code that reads back", /const pitch = 7\.5;/.test(kitCode({ container: "kuggis", kuggis: { ...defaultKuggis(), pitch: 7.5 }, regions: [] }))
    && parseKitCode(kitCode({ container: "kuggis", kuggis: { ...defaultKuggis(), pitch: 7.5 }, regions: [] })).kuggis.pitch === 7.5
    && parseKitCode(kitCode({ container: "kuggis", kuggis: defaultKuggis(), regions: [] })).kuggis.pitch == null);
  check("...and a 4 x 4 half-square corner box builds", (await measure(kuggisKit({ ...e, pitch: 7.5, flip: false, layout: [{ at: [0, 0], size: [4, 4], kind: "box" }] }))).solids === 1);
  check("the flip is a const in the code and reads back", /const flip = undefined/.test(kitCode({ container: "kuggis", kuggis: defaultKuggis(), regions: [] }))
    && parseKitCode(kitCode({ container: "kuggis", kuggis: { ...defaultKuggis(), flip: false }, regions: [] })).kuggis.flip === false);

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

console.log("\nthe Casefinity lock: ribs and sockets between pieces, nothing against the wall\n");
{
  const e = kuggisEstimate([180, 260, 80]);
  const P = 15, b = 1.5, cl = 0.15;
  // a 2 x 2 box in the middle of the grid, locked
  const mid = await measure(kuggisKit({ ...e, lock: true, layout: [{ at: [2, 3], size: [2, 2], kind: "box" }] }));
  const w = 2 * P - 2 * cl;
  check("a locked inside piece is n*P - 2c across its faces, plus a rib on -X",
    near(mid.x.max - mid.x.min, w + b, 0.05), `${(mid.x.max - mid.x.min).toFixed(2)} vs ${w + b}`);
  check("...and a rib on +Y", near(mid.y.max - mid.y.min, w + b, 0.05), `${(mid.y.max - mid.y.min).toFixed(2)}`);
  check("one solid still", mid.solids === 1);
  // the same piece smooth, for comparison
  const plain = await measure(kuggisKit({ ...e, lock: false, layout: [{ at: [2, 3], size: [2, 2], kind: "box" }] }));
  check("smooth is narrower: no ribs, 0.3 between", near(plain.x.max - plain.x.min, 2 * P - 0.3, 0.05), `${(plain.x.max - plain.x.min).toFixed(2)}`);
  // the front-left corner piece: its wall faces stay the liner's slope
  const corner = await measure(kuggisKit({ ...e, lock: true, layout: [{ at: [0, 0], size: [2, 2], kind: "box" }] }));
  const cornerPlain = await measure(kuggisKit({ ...e, lock: false, layout: [{ at: [0, 0], size: [2, 2], kind: "box" }] }));
  // front-left: the wall faces (-X, -Y) stay the liner, the +X face takes
  // sockets (cut in, no wider), the +Y face a rib (b proud)
  check("a corner piece is as wide as its smooth twin: nothing on the wall face, sockets cut in",
    near(corner.at(corner.z.max, 0), cornerPlain.at(cornerPlain.z.max, 0), 0.05),
    `${corner.at(corner.z.max, 0).toFixed(2)} vs ${cornerPlain.at(cornerPlain.z.max, 0).toFixed(2)}`);
  check("...and a rib deep on its back face", near(corner.at(corner.z.max, 1), cornerPlain.at(cornerPlain.z.max, 1) + b, 0.05),
    `${corner.at(corner.z.max, 1).toFixed(2)} vs ${cornerPlain.at(cornerPlain.z.max, 1).toFixed(2)}`);
  check("a locked frame builds", (await measure(kuggisKit({ ...e, lock: true, layout: [{ at: [2, 2], size: [3, 3], kind: "frame", split: true }] }))).solids === 1);
}

console.log("\nthe builder's code\n");
{
  const s = { container: "kuggis", kuggis: { ...defaultKuggis("18x26x15"), lock: true }, regions: [{ c: 0, r: 0, w: 2, h: 2, kind: "lidbox" }, { c: 2, r: 0, w: 3, h: 3, kind: "frame", split: true }] };
  const code = kitCode(s);
  check("the lock style is a flag in the code", /const lock = true;/.test(code) && /lock, flip, pitch, layout: pieces/.test(code));
  check("it calls kuggisKit, not caseKit", /return kuggisKit\(/.test(code) && !/caseKit\(/.test(code));
  check("the box's inside is sliders", /const rimW = [\d.]+;\s+\/\/ \[/.test(code) && /const taper = /.test(code) && /const taperD = /.test(code) && /const clear = /.test(code));
  check("it says the numbers are estimates to measure over", /estimate/i.test(code) && /Measure your box/.test(code));
  const back = parseKitCode(code);
  check("it reads back as the KUGGIS container", back?.container === "kuggis");
  check("...locked", back?.kuggis?.lock === true && parseKitCode(kitCode({ container: "kuggis", kuggis: defaultKuggis(), regions: [] }))?.kuggis?.lock === false);
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
