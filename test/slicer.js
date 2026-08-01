// The brick-staggered slicer. The claims worth testing are dimensional: a
// slicer that produces beautiful-looking G-code for a part that comes out the
// wrong size is worse than useless, so every check here is a measurement.

import ClipperLib from "clipper-lib";
import {
  sliceTriangles, chainLoops, offsetLoops, wallsForLayer, sliceToGcode,
  normalizeLoops, differenceLoops, intersectLoops, infillLines,
  planLayers, skinFor, crossesLoops, planSupports, parseGcode, PREVIEW_COLOURS,
  fillPattern, INFILL_PATTERNS, fillPlaceholders,
  ePerMm, DEFAULTS, PRINTERS, _setClipper,
} from "../viewer/slicer.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

_setClipper(ClipperLib);

// An axis-aligned box as a triangle soup — exact numbers, nothing to round.
function box(w, d, h, ox = 0, oy = 0, oz = 0) {
  const v = [
    [ox, oy, oz], [ox + w, oy, oz], [ox + w, oy + d, oz], [ox, oy + d, oz],
    [ox, oy, oz + h], [ox + w, oy, oz + h], [ox + w, oy + d, oz + h], [ox, oy + d, oz + h],
  ];
  const f = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return f.map((t) => t.map((i) => v[i]));
}

// A box with a square shaft straight through it. Only the side walls matter to
// a slicer, and building it this way keeps the hole's winding wrong on purpose
// — which is exactly the case normalizeLoops exists to fix.
function boxWithHole(w, h, hw) {
  const c = (w - hw) / 2;
  const tris = [];
  for (const [loop, z0] of [[[[0, 0], [w, 0], [w, w], [0, w]], 0]]) {
    void z0;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i], b = loop[(i + 1) % loop.length];
      tris.push([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h]]);
      tris.push([[a[0], a[1], 0], [b[0], b[1], h], [a[0], a[1], h]]);
    }
  }
  const hole = [[c, c], [c, c + hw], [c + hw, c + hw], [c + hw, c]];
  for (let i = 0; i < hole.length; i++) {
    const a = hole[i], b = hole[(i + 1) % hole.length];
    tris.push([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], h]]);
    tris.push([[a[0], a[1], 0], [b[0], b[1], h], [a[0], a[1], h]]);
  }
  return tris;
}

const perim = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
};
const area = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
const netArea = (loops) => loops.reduce((s, p) => s + area(p), 0);
const runLength = (segs) =>
  segs.reduce((s, p) => {
    for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    return s;
  }, 0);
const sq = [[0, 0], [40, 0], [40, 40], [0, 40]];

console.log("\nslicing\n");
{
  const tris = box(40, 40, 20);
  const segs = sliceTriangles(tris, 10);
  const loops = chainLoops(segs);
  check("a box slices to one loop", loops.length === 1, String(loops.length));
  check("...the right way round the outside", near(perim(loops[0]), 160, 0.01), String(perim(loops[0])));
  check("a plane above the part cuts nothing", chainLoops(sliceTriangles(tris, 25)).length === 0);
  check("a plane below the part cuts nothing", chainLoops(sliceTriangles(tris, -5)).length === 0);
}

console.log("\nholes wind the wrong way, and get fixed\n");
{
  const raw = chainLoops(sliceTriangles(boxWithHole(40, 20, 20), 10));
  check("a box with a shaft slices to two loops", raw.length === 2, String(raw.length));
  const norm = await normalizeLoops(raw);
  check("normalised, the net area is the material only",
    near(netArea(norm), 1600 - 400, 0.5), String(netArea(norm)));
  check("...the outer loop winds positive", norm.some((p) => area(p) > 0));
  check("...and the hole winds negative", norm.some((p) => area(p) < 0));
  const inset = await offsetLoops(norm, -0.2);
  check("inset shrinks the outside and grows the hole inward",
    near(netArea(inset), 39.6 * 39.6 - 20.4 * 20.4, 1), String(netArea(inset)));
}

console.log("\noffsetting\n");
{
  const loops = chainLoops(sliceTriangles(box(40, 40, 20), 10));
  // inset 0.2 on every side: 40 -> 39.6, so the perimeter drops by 8 * 0.2
  const inset = await offsetLoops(loops, -0.2);
  check("inset shrinks by the right amount", near(perim(inset[0]), 158.4, 0.05), String(perim(inset[0])));
  // a 0.4mm-thick wall cannot hold a 0.5mm inset — it has to vanish, not invert
  const thin = chainLoops(sliceTriangles(box(0.4, 40, 20), 10));
  const gone = await offsetLoops(thin, -0.5);
  check("an over-inset thin wall disappears rather than inverting", gone.length === 0, String(gone.length));
}

console.log("\nbooleans\n");
{
  const big = await normalizeLoops([sq]);
  const small = await normalizeLoops([[[10, 10], [30, 10], [30, 30], [10, 30]]]);
  check("difference leaves a frame", near(Math.abs(netArea(await differenceLoops(big, small))), 1200, 0.5));
  check("intersection leaves the small one", near(Math.abs(netArea(await intersectLoops(big, small))), 400, 0.5));
  check("difference with nothing is a no-op", (await differenceLoops(big, [])).length === 1);
  check("intersection with nothing is nothing", (await intersectLoops(big, [])).length === 0);
}

console.log("\nbrick stagger — the whole point\n");
{
  const loops = chainLoops(sliceTriangles(box(40, 40, 20), 10));
  const opt = { ...DEFAULTS, walls: 3, nozzle: 0.4 };
  const even = await wallsForLayer(loops, opt, 0);
  const odd = await wallsForLayer(loops, opt, 1);
  check("three walls on an even layer", even.length === 3, String(even.length));
  check("three walls on an odd layer", odd.length === 3, String(odd.length));

  // THE dimensional claim: the outer wall must not move, or the part's own
  // surface ripples and its measured size changes layer to layer.
  check("the OUTER wall is identical on both layers",
    near(perim(even[0][0]), perim(odd[0][0]), 1e-6),
    `${perim(even[0][0])} vs ${perim(odd[0][0])}`);

  // ...while the inner walls shift by half a bead. Half a nozzle in on every
  // side takes 8 * 0.2 = 1.6mm off the perimeter.
  check("the 2nd wall shifts by half a bead",
    near(perim(even[1][0]) - perim(odd[1][0]), 1.6, 0.05),
    `${perim(even[1][0])} vs ${perim(odd[1][0])}`);
  check("the 3rd wall shifts too",
    near(perim(even[2][0]) - perim(odd[2][0]), 1.6, 0.05),
    `${perim(even[2][0])} vs ${perim(odd[2][0])}`);

  const off = { ...DEFAULTS, walls: 3, stagger: false };
  const a = await wallsForLayer(loops, off, 0), b = await wallsForLayer(loops, off, 1);
  check("stagger:false leaves every wall alone",
    near(perim(a[1][0]), perim(b[1][0]), 1e-6), `${perim(a[1][0])} vs ${perim(b[1][0])}`);
}

console.log("\ninfill lines\n");
{
  const region = await normalizeLoops([sq]);
  // The density claim: a line of width `nozzle` every `spacing` fills
  // nozzle/spacing of the area. At 15% and a 0.4 nozzle that is a 2.667mm
  // pitch, so 1600mm2 of region wants 600mm of strand.
  const sparse = await infillLines(region, 0.4 / 0.15, 45);
  check("15% infill lays down 15% of the area",
    near(runLength(sparse) * 0.4, 0.15 * 1600, 0.15 * 1600 * 0.05),
    `${(runLength(sparse) * 0.4).toFixed(0)}mm2 vs 240mm2`);
  const solid = await infillLines(region, 0.4, 45);
  check("solid fill covers essentially all of it",
    near(runLength(solid) * 0.4, 1600, 1600 * 0.05),
    `${(runLength(solid) * 0.4).toFixed(0)}mm2 vs 1600mm2`);

  check("every strand stays inside the region", sparse.every((s) =>
    s.every(([x, y]) => x >= -0.01 && x <= 40.01 && y >= -0.01 && y <= 40.01)));

  // a hole has to cost fill in proportion to its area, not be printed over
  const holed = await differenceLoops(region,
    await normalizeLoops([[[10, 10], [30, 10], [30, 30], [10, 30]]]));
  const overHole = await infillLines(holed, 0.4 / 0.15, 45);
  check("a hole takes its share of fill out",
    near(runLength(overHole) * 0.4, 0.15 * 1200, 0.15 * 1200 * 0.07),
    `${(runLength(overHole) * 0.4).toFixed(0)}mm2 vs 180mm2`);
  check("...and no strand crosses it", overHole.every((s) =>
    s.every(([x, y]) => x < 10.01 || x > 29.99 || y < 10.01 || y > 29.99)));

  const flat = await infillLines(region, 4, 0);
  check("the angle is honoured",
    flat.length > 3 && flat.every((s) => near(s[0][1], s[s.length - 1][1], 1e-6)),
    `${flat.length} strands`);

  // Strand positions are anchored to the origin rather than to whatever
  // bounding box this particular layer happens to have, so a narrower layer
  // puts its infill on the SAME lines and the strands stack and bond.
  const inner = await normalizeLoops([[[8, 8], [32, 8], [32, 32], [8, 32]]]);
  const ys = (segs) => segs.map((s) => +s[0][1].toFixed(3));
  const wide = ys(flat), narrow = ys(await infillLines(inner, 4, 0));
  check("a smaller layer's strands land on the bigger one's lines",
    narrow.length > 2 && narrow.every((y) => wide.includes(y)), `${narrow} vs ${wide}`);
  check("zero density asks for nothing", (await infillLines(region, Infinity, 45)).length === 0);
}

console.log("\ntop and bottom skin\n");
{
  const opt = { ...DEFAULTS, walls: 2, topLayers: 4, bottomLayers: 4 };
  const { layers, nLayers } = await planLayers(box(40, 40, 20), opt);
  check("100 layers planned", nLayers === 100, String(nLayers));

  const skins = [];
  for (const i of [0, 3, 4, 50, 95, 96, 99]) skins.push([i, await skinFor(layers, i, opt)]);
  const solidAt = (i) => Math.abs(netArea(skins.find((s) => s[0] === i)[1].solid));
  const sparseAt = (i) => Math.abs(netArea(skins.find((s) => s[0] === i)[1].sparse));

  check("layer 0 is all solid — it is the bottom", solidAt(0) > 1000 && sparseAt(0) < 1, String(solidAt(0)));
  check("layer 3 is still solid (4 bottom layers)", solidAt(3) > 1000, String(solidAt(3)));
  check("layer 4 is sparse — it is buried", solidAt(4) < 1 && sparseAt(4) > 1000, String(solidAt(4)));
  check("the middle is sparse", solidAt(50) < 1 && sparseAt(50) > 1000, String(solidAt(50)));
  check("layer 95 is still buried", solidAt(95) < 1, String(solidAt(95)));
  check("layer 96 turns solid — the top is 4 away", solidAt(96) > 1000, String(solidAt(96)));
  check("layer 99 is all solid", solidAt(99) > 1000 && sparseAt(99) < 1, String(solidAt(99)));

  // solid + sparse must exactly account for the fill region, or the part has
  // voids nobody asked for
  for (const [i, s] of skins) {
    const tot = Math.abs(netArea(s.solid)) + Math.abs(netArea(s.sparse));
    const want = Math.abs(netArea(layers[i].fill));
    if (!near(tot, want, 1)) { check(`layer ${i} fill fully accounted for`, false, `${tot} vs ${want}`); }
  }
  check("every layer's fill is fully accounted for", true);
}

console.log("\na step makes a top surface partway up\n");
{
  // 40mm base, 10mm tall, with a 20mm tower on top of it: the ledge around
  // the tower is a top surface at z=10 and must go solid, while the material
  // under the tower stays sparse.
  const tris = [...box(40, 40, 10), ...box(20, 20, 10, 10, 10, 10)];
  const opt = { ...DEFAULTS, walls: 2, topLayers: 4, bottomLayers: 4 };
  const { layers } = await planLayers(tris, opt);
  const at = async (i) => skinFor(layers, i, opt);

  const ledge = await at(49);            // the last layer of the base
  const mid = await at(25);              // well inside the base
  check("deep in the base it is sparse", Math.abs(netArea(mid.solid)) < 1,
    String(Math.abs(netArea(mid.solid))));
  // the ledge is 1600 - 400 = 1200mm2 of top surface, less the wall band
  check("the ledge under the step goes solid",
    near(Math.abs(netArea(ledge.solid)), 1200, 200),
    String(Math.abs(netArea(ledge.solid))));
  check("...but the core under the tower stays sparse",
    Math.abs(netArea(ledge.sparse)) > 100, String(Math.abs(netArea(ledge.sparse))));
}

console.log("\nG-code\n");
{
  const tris = box(40, 40, 20);
  const { gcode, stats } = await sliceToGcode(tris,
    { walls: 2, name: "cube", topLayers: 4, bottomLayers: 4, infill: 0.15 });
  const lines = gcode.split("\n");
  check("100 layers of 0.2 over 20mm", stats.layers === 100, String(stats.layers));
  check("every layer produced walls", stats.layersWithWalls === 100, String(stats.layersWithWalls));
  check("half of them are the staggered ones", stats.staggeredLayers === 50, String(stats.staggeredLayers));
  check("two walls per layer", stats.wallsPerLayer === 2, String(stats.wallsPerLayer));

  check("starts with the preamble", /^; cube/.test(lines[0]) && gcode.includes("G21") && gcode.includes("M109"));
  check("ends parked and powered down", gcode.includes("M84") && gcode.includes("M104 S0"));
  check("layer markers are present", (gcode.match(/;LAYER:/g) || []).length === 100);
  check("the outer wall is tagged for the preview", gcode.includes(";TYPE:WALL-OUTER"));
  check("solid skin was emitted", gcode.includes(";TYPE:SOLID") && stats.solidMm > 0);
  check("sparse infill was emitted", gcode.includes(";TYPE:FILL") && stats.infillMm > 0);

  // The outer wall goes down LAST in each layer, so it is extruded against
  // solid material rather than having the inner walls shoved into its back.
  const l10 = lines.slice(lines.indexOf(";LAYER:10"), lines.indexOf(";LAYER:11"));
  check("inner walls print before the outer one",
    l10.indexOf(";TYPE:WALL-INNER") < l10.indexOf(";TYPE:WALL-OUTER"));
  check("...and infill comes after both",
    l10.indexOf(";TYPE:WALL-OUTER") < l10.lastIndexOf(";TYPE:FILL"));

  check("E only ever climbs on a printing move", (() => {
    let lastPrint = -1;
    for (const l of lines) {
      // G92 resets the extruder's idea of where it is — the purge line ends
      // with one, and a drop straight after it is correct rather than a bug
      if (/^G92 E0/.test(l)) { lastPrint = -1; continue; }
      const m = /^G1 X\S+ Y\S+ E([\d.]+)/.exec(l);
      if (!m) continue;
      if (+m[1] < lastPrint) return false;
      lastPrint = +m[1];
    }
    return true;
  })());

  check("the first layer is slower than the rest", (() => {
    const f = (tag) => {
      const s = lines.indexOf(tag), e = lines.findIndex((l, i) => i > s && l.startsWith(";LAYER:"));
      return Math.max(...lines.slice(s, e).flatMap((l) =>
        /^G1 X\S+ Y\S+ E/.test(l) ? [+/F(\d+)/.exec(l)[1]] : []));
    };
    return f(";LAYER:0") < f(";LAYER:10");
  })());

  const perLayer = 158.4 + 155.2;
  void perLayer;
  check("volume adds up to the beads laid down",
    near(stats.filamentMm3, (stats.wallMm + stats.solidMm + stats.infillMm) * 0.2 * 0.4,
      stats.filamentMm3 * 0.01),
    `${stats.filamentMm3} vs ${((stats.wallMm + stats.solidMm + stats.infillMm) * 0.08).toFixed(0)}`);
  check("E per mm is the standard bead/filament ratio",
    near(ePerMm(DEFAULTS), 0.03326, 1e-5), String(ePerMm(DEFAULTS)));
  check("it reports a print time", stats.minutes > 0, String(stats.minutes));
}

console.log("\nwalls only, as it was before\n");
{
  // With no skin and no infill the old exact arithmetic still has to hold:
  // two walls of a 40mm box at a 0.4 nozzle sit 0.2 and 0.6 in, so 39.6 and
  // 38.8 square = 158.4 + 155.2 per even layer, and on odd layers the inner
  // one moves in by 0.2 -> 154.4.
  const { stats } = await sliceToGcode(box(40, 40, 20),
    { walls: 2, topLayers: 0, bottomLayers: 0, infill: 0 });
  const expected = ((158.4 + 155.2 + 158.4 + 154.4) / 2) * 100 * (0.2 * 0.4);
  check("hollow shell volume is exact",
    near(stats.filamentMm3, expected, expected * 0.02), `${stats.filamentMm3} vs ${expected.toFixed(0)}`);
  check("no solid and no fill", stats.solidMm === 0 && stats.infillMm === 0);
}

console.log("\nretraction\n");
{
  // A box with a shaft through it: the nozzle must cross from the outer wall
  // to the hole's wall on every layer, which is exactly when it has to retract.
  const { gcode, stats } = await sliceToGcode(boxWithHole(40, 4, 20),
    { walls: 2, ...PRINTERS.bambu_x1 });
  check("it retracted on the long travels", stats.retractions > 10, String(stats.retractions));
  const r = (gcode.match(/; retract/g) || []).length, p = (gcode.match(/; prime/g) || []).length;
  check("every retract is matched by a prime", r === p && r === stats.retractions, `${r} vs ${p}`);
  // Under M82 the retract is an absolute E 0.8 below the current one, not a
  // literal -0.8 — so the claim to test is the distance between the pull and
  // the prime that undoes it.
  check("the pull is the printer's 0.8mm, not a guess", (() => {
    const ls = gcode.split("\n");
    const pulls = [];
    for (let i = 0; i < ls.length; i++) {
      const a = /^G1 E([\d.-]+) F\d+ ; retract$/.exec(ls[i]);
      if (!a) continue;
      const b = ls.slice(i + 1, i + 6).find((l) => /; prime$/.test(l));
      if (b) pulls.push(+/E([\d.-]+)/.exec(b)[1] - +a[1]);
    }
    return pulls.length > 10 && pulls.every((d) => near(d, PRINTERS.bambu_x1.retract, 1e-4));
  })(), "expected an 0.8mm pull for a Bambu");
  const bowden = await sliceToGcode(boxWithHole(40, 4, 20), { walls: 2, ...PRINTERS.ender3 });
  check("a Bowden machine pulls far harder than a direct drive", (() => {
    const pull = (t) => {
      const ls = t.split("\n"), i = ls.findIndex((l) => /; retract$/.test(l));
      const a = +/E([\d.-]+)/.exec(ls[i])[1];
      const b = +/E([\d.-]+)/.exec(ls.slice(i + 1, i + 6).find((l) => /; prime$/.test(l)))[1];
      return b - a;
    };
    return near(pull(bowden.gcode), 5, 1e-4) && near(pull(gcode), 0.8, 1e-4);
  })());
  check("it hops the nozzle over the travel", (gcode.match(/G1 Z/g) || []).length > stats.layers);

  const off = await sliceToGcode(boxWithHole(40, 4, 20), { walls: 2, retract: 0 });
  check("retract:0 turns it off entirely",
    off.stats.retractions === 0 && !off.gcode.includes("; retract"));

  // a short hop between two nearby loops is not worth a retract
  const tiny = await sliceToGcode(box(40, 40, 4), { walls: 2, retractMin: 500 });
  check("a hop under the threshold is left alone", tiny.stats.retractions === 0,
    String(tiny.stats.retractions));

  // THE regression. Adjacent infill strands sit one spacing apart — 2.7mm at
  // 15% — and a rule that retracts on distance alone fires on every one of
  // them, thousands of times, for hops that never leave the material.
  const solidCube = await sliceToGcode(box(40, 40, 20), { walls: 3, infill: 0.15, ...PRINTERS.bambu_x1 });
  check("a cube with no holes barely retracts at all",
    solidCube.stats.retractions < solidCube.stats.layers * 2,
    `${solidCube.stats.retractions} over ${solidCube.stats.layers} layers`);
  check("...even though it travels between strands constantly",
    solidCube.stats.travelMoves > 3000, String(solidCube.stats.travelMoves));

  check("crossing a hole still counts as air", (() => {
    const sqr = [[0, 0], [40, 0], [40, 40], [0, 40]];
    return crossesLoops([-5, 20], [45, 20], [sqr]) && !crossesLoops([5, 20], [35, 20], [sqr]);
  })());
}

console.log("\nit has to land on the bed\n");
{
  // Anything built with center:true straddles the origin, i.e. sits off the
  // front-left corner of the plate. Half the G-code would be at negative X.
  const centred = box(40, 40, 20, -20, -20, 0);
  const { gcode } = await sliceToGcode(centred, { walls: 2, ...PRINTERS.bambu_x1 });
  // measure the PART, not the preamble: the purge line deliberately runs up
  // the left edge of the bed and would drag the minimum out to X3
  const partOnly = (t) => t.slice(t.indexOf(";LAYER:0"));
  const xs = [], ys = [];
  for (const m of partOnly(gcode).matchAll(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)/gm)) { xs.push(+m[1]); ys.push(+m[2]); }
  check("every move is on the plate",
    Math.min(...xs) > 0 && Math.max(...xs) < 256 && Math.min(...ys) > 0 && Math.max(...ys) < 256,
    `X ${Math.min(...xs)}..${Math.max(...xs)}`);
  check("...and centred on it",
    near((Math.min(...xs) + Math.max(...xs)) / 2, 128, 0.2) &&
    near((Math.min(...ys) + Math.max(...ys)) / 2, 128, 0.2),
    `${(Math.min(...xs) + Math.max(...xs)) / 2}`);
  check("the part is still 39.6 across after centring",
    near(Math.max(...xs) - Math.min(...xs), 39.6, 0.05),
    String(Math.max(...xs) - Math.min(...xs)));

  const raw = await sliceToGcode(centred, { walls: 2, bedX: 0, bedY: 0 });
  check("bed 0 leaves the coordinates where the model was",
    /G[01] X-\d/.test(raw.gcode));

  const ender = await sliceToGcode(centred, { walls: 2, ...PRINTERS.ender3 });
  check("a different bed centres somewhere else",
    /X90\.\d/.test(ender.gcode) || ender.gcode.includes("X 110"),
    "expected a 220mm bed to centre at 110");
}

console.log("\nsupports\n");
{
  // A T: a 10mm post with a 40mm slab sitting on top of it. The slab hangs
  // 15mm out past the post on every side with nothing under it, which is the
  // textbook case for support.
  const tee = [...box(10, 10, 10, 15, 15, 0), ...box(40, 40, 6, 0, 0, 10)];
  const on = { ...DEFAULTS, walls: 2, supports: true };
  const { layers } = await planLayers(tee, on);
  const sup = await planSupports(layers, on);

  const at = (i) => Math.abs(netArea(sup[i] || []));
  check("something is holding the slab up", at(20) > 500, String(at(20)));
  check("...all the way down to the bed", at(2) > 500, String(at(2)));
  check("the support stops where the slab starts",
    at(60) === 0, String(at(60)));
  // the post occupies the middle, so support has to be the ring around it
  check("it goes round the post, not through it", (() => {
    const a = at(20);
    return a > 1000 && a < 1600 - 100;      // 1600 slab minus the 10x10 post and its gap
  })(), String(at(20)));

  // the gap underneath: the layer directly below the overhang must be clear
  const overhangLayer = 50;                  // the slab starts at z=10 -> layer 50
  check("there is a gap left under the overhang",
    at(overhangLayer - 1) < at(overhangLayer - 3),
    `${at(overhangLayer - 1)} vs ${at(overhangLayer - 3)}`);

  const off = await planSupports(layers, { ...on, supports: false });
  check("supports:false generates none", off.every((s) => !s.length));

  // a plain box overhangs nothing
  const plain = await planLayers(box(40, 40, 20), on);
  const none = await planSupports(plain.layers, on);
  check("a box needs no support at all", none.every((s) => !s.length));

  // a 45 degree taper is self-supporting; a steeper one is not
  const steps = (grow) => {
    const t = [];
    for (let k = 0; k < 40; k++) t.push(...box(10 + k * grow * 2, 40, 0.2, 20 - (10 + k * grow * 2) / 2, 0, k * 0.2));
    return t;
  };
  const gentle = await planSupports((await planLayers(steps(0.2), on)).layers, on);
  const steep = await planSupports((await planLayers(steps(0.9), on)).layers, on);
  check("a 45 degree wall holds itself up", gentle.every((s) => !s.length));
  check("...a much shallower one does not", steep.some((s) => s.length));

  const { gcode, stats } = await sliceToGcode(tee, { walls: 2, supports: true });
  check("support reaches the G-code", gcode.includes(";TYPE:SUPPORT") && stats.supportMm > 0,
    String(stats.supportMm));
  check("it is reported separately from the part",
    stats.supportMm3 > 0 && stats.supportLayers > 20, String(stats.supportLayers));
  const bare = await sliceToGcode(tee, { walls: 2, supports: false });
  check("and it costs nothing when it is off",
    !bare.gcode.includes(";TYPE:SUPPORT") && bare.stats.supportMm === 0);
  check("...which is the default", DEFAULTS.supports === false);
}

console.log("\nthe preview reads back what was written\n");
{
  const tee = [...box(10, 10, 10, 15, 15, 0), ...box(40, 40, 6, 0, 0, 10)];
  const { gcode, stats } = await sliceToGcode(tee,
    { walls: 2, supports: true, name: "tee", ...PRINTERS.bambu_x1 });
  const { layers, bounds } = parseGcode(gcode);

  check("every layer came back", layers.length === stats.layers, String(layers.length));
  check("the layer numbers are in order", layers.every((L, i) => L.i === i));
  check("each layer knows its height", layers[10].z > 0 && layers[10].z < layers[40].z,
    `${layers[10].z} vs ${layers[40].z}`);

  const kinds = new Set(layers.flatMap((L) => L.runs.map((r) => r.type)));
  check("it distinguishes the kinds of extrusion",
    ["WALL-OUTER", "WALL-INNER", "SOLID", "FILL", "SUPPORT"].every((k) => kinds.has(k)),
    [...kinds].join(","));
  check("every kind has a colour to draw it in",
    [...kinds].every((k) => PREVIEW_COLOURS[k]), [...kinds].join(","));

  // The claim that makes the preview worth having: what it draws is the same
  // material the printer will actually lay down, to the millimetre.
  const drawn = layers.reduce((s, L) => s + L.runs.reduce((t, r) => {
    for (let i = 1; i < r.pts.length; i++) {
      t += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
    }
    return t;
  }, 0), 0);
  const emitted = stats.wallMm + stats.solidMm + stats.infillMm + stats.supportMm;
  check("the length it draws is the length that gets printed",
    near(drawn, emitted, emitted * 0.001), `${drawn.toFixed(1)} vs ${emitted.toFixed(1)}`);

  check("travels are not drawn as extrusions", layers.every((L) =>
    L.runs.every((r) => r.pts.length >= 2)));
  check("it reports bounds to draw inside",
    bounds && bounds.maxX > bounds.minX && near(bounds.maxX - bounds.minX, 39.6, 0.1),
    JSON.stringify(bounds));
  check("a retract does not start a phantom run", !layers.some((L) =>
    L.runs.some((r) => r.pts.some(([px, py]) => !Number.isFinite(px) || !Number.isFinite(py)))));

  // support is what people actually open a preview to check
  const supLayers = layers.filter((L) => L.runs.some((r) => r.type === "SUPPORT"));
  check("support shows up on the layers it was planned for",
    supLayers.length === stats.supportLayers, `${supLayers.length} vs ${stats.supportLayers}`);
  // the tee is 16mm tall, so 80 layers: the slab's own body is the last 30
  check("...and stops once the slab is reached",
    !layers[70].runs.some((r) => r.type === "SUPPORT"));

  check("an empty file parses to nothing rather than throwing",
    parseGcode("").layers.length === 0 && parseGcode("").bounds === null);
}

console.log("\ninfill patterns\n");
{
  const region = await normalizeLoops([sq]);
  const nozzle = 0.4, area = 1600;
  // Whatever the pattern, the density asked for is the density laid down —
  // that is the one promise a pattern picker has to keep, or "25% infill"
  // means something different depending on which one you chose.
  for (const pat of Object.keys(INFILL_PATTERNS)) {
    const got = [];
    for (const d of [0.1, 0.15, 0.25, 0.4]) {
      // A gyroid's cross-section is a different length at every height, so
      // its density is only meaningful averaged over a period — the others
      // are the same on every layer and one sample says it all.
      const zs = pat === "gyroid" ? [0, 1.1, 2.2, 3.3, 4.4, 5.5, 6.6, 7.7] : [5];
      let sum = 0;
      for (const z of zs) sum += runLength(await fillPattern(region, nozzle / d, pat, 0, z));
      got.push([d, ((sum / zs.length) * nozzle) / area]);
    }
    check(`${pat} lays down the density it was asked for`,
      got.every(([d, g]) => near(g, d, d * 0.08)),
      got.map(([d, g]) => `${(d * 100).toFixed(0)}->${(g * 100).toFixed(1)}`).join(" "));
  }

  // ...and none of them may wander outside the region
  for (const pat of Object.keys(INFILL_PATTERNS)) {
    const runs = await fillPattern(region, nozzle / 0.15, pat, 0, 5);
    check(`${pat} stays inside the region`, runs.every((r) =>
      r.every(([x, y]) => x >= -0.02 && x <= 40.02 && y >= -0.02 && y <= 40.02)));
  }

  const ang = (runs) => {
    const a = [];
    for (const r of runs) {
      for (let i = 1; i < r.length; i++) {
        const d = Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
        if (d > 1) a.push(((Math.atan2(r[i][1] - r[i - 1][1], r[i][0] - r[i - 1][0]) * 180 / Math.PI) + 360) % 180);
      }
    }
    return a;
  };
  // "back and forth" means exactly that: the same direction on every layer,
  // so the strands stack instead of crossing
  const a0 = ang(await fillPattern(region, 2.67, "aligned", 0, 5));
  const a1 = ang(await fillPattern(region, 2.67, "aligned", 1, 5.2));
  check("aligned runs the same way on both layers",
    a0.every((v) => near(v, 0, 0.5) || near(v, 180, 0.5))
    && a1.every((v) => near(v, 0, 0.5) || near(v, 180, 0.5)));
  // rectilinear is the opposite: it must cross
  const r0 = ang(await fillPattern(region, 2.67, "rectilinear", 0, 5));
  const r1 = ang(await fillPattern(region, 2.67, "rectilinear", 1, 5.2));
  check("rectilinear turns 90 degrees each layer",
    near(r0[0], 45, 1) && near(r1[0], 135, 1), `${r0[0]} then ${r1[0]}`);
  const gridAng = ang(await fillPattern(region, 2.67, "grid", 0, 5));
  check("grid puts both diagonals on one layer",
    gridAng.some((v) => near(v, 45, 1)) && gridAng.some((v) => near(v, 135, 1)));

  // The gyroid's whole point is that it is different on every layer and
  // curved rather than straight — if it came out as straight lines at one
  // angle it would just be an expensive rectilinear.
  const g5 = await fillPattern(region, 2.67, "gyroid", 0, 5);
  const g6 = await fillPattern(region, 2.67, "gyroid", 1, 6.4);
  // A gyroid is walked in short chords, so measure the direction over a
  // window of points rather than per segment — and what makes it a curve is
  // that the direction keeps CHANGING along a single run.
  const bend = (runs) => {
    const turns = [];
    for (const r of runs) {
      for (let i = 6; i < r.length; i += 3) {
        const a1 = Math.atan2(r[i - 3][1] - r[i - 6][1], r[i - 3][0] - r[i - 6][0]);
        const a2 = Math.atan2(r[i][1] - r[i - 3][1], r[i][0] - r[i - 3][0]);
        turns.push(Math.abs(((a2 - a1) * 180) / Math.PI));
      }
    }
    return turns;
  };
  const turns = bend(g5);
  check("gyroid curves rather than running straight",
    turns.length > 50 && turns.filter((t) => t > 2).length > turns.length * 0.5,
    `${turns.filter((t) => t > 2).length} of ${turns.length} chords bend`);
  check("gyroid changes with height",
    Math.abs(runLength(g5) - runLength(g6)) > 0.01
    || JSON.stringify(g5[0]) !== JSON.stringify(g6[0]));
  check("gyroid is one continuous sweep, not a pile of fragments",
    g5.length < 40 && g5.some((r) => r.length > 10), `${g5.length} runs`);
  check("concentric closes its rings", (await fillPattern(region, 2.67, "concentric", 0, 5))
    .every((r) => near(Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]), 0, 1e-6)));

  // and each has to survive a hole without printing over it
  const holed = await differenceLoops(region,
    await normalizeLoops([[[14, 14], [26, 14], [26, 26], [14, 26]]]));
  for (const pat of Object.keys(INFILL_PATTERNS)) {
    const runs = await fillPattern(holed, nozzle / 0.15, pat, 0, 5);
    const inside = runs.some((r) => r.some(([x, y]) => x > 14.5 && x < 25.5 && y > 14.5 && y < 25.5));
    if (inside) check(`${pat} avoids a hole`, false);
  }
  check("every pattern avoids a hole", true);
}

console.log("\npainted support regions\n");
{
  const tee = [...box(10, 10, 10, 15, 15, 0), ...box(40, 40, 6, 0, 0, 10)];
  const on = { ...DEFAULTS, walls: 2, supports: true };
  const { layers } = await planLayers(tee, on);
  const plain = await planSupports(layers, on);
  const at = (s, i) => Math.abs(netArea(s[i] || []));

  // block out the left half — nothing may be supported there any more
  const blocked = await planSupports(layers, { ...on, supportBlock: [[-5, -5, 20, 45]] });
  check("blocking a region removes support from it",
    blocked.every((s) => s.every((p) => p.every(([x]) => x >= 19.9))),
    "found support inside the blocked half");
  check("...and leaves the rest alone", at(blocked, 20) > 0 && at(blocked, 20) < at(plain, 20),
    `${at(blocked, 20)} vs ${at(plain, 20)}`);

  // A 45 degree taper holds itself up, so the angle rule generates nothing
  // anywhere on it — which makes it the honest test of forcing.
  const taper = [];
  for (let k = 0; k < 40; k++) taper.push(...box(10 + k * 0.4, 40, 0.2, 20 - (10 + k * 0.4) / 2, 0, k * 0.2));
  const tl = (await planLayers(taper, on)).layers;
  const none = await planSupports(tl, on);
  check("the taper needs no support of its own", none.every((s) => !s.length));

  // it grows outward as it rises, so just outside its footprint there IS
  // model overhead — exactly where a forced column can stand
  const forced = await planSupports(tl, { ...on, supportForce: [[0, 0, 40, 40]] });
  check("forcing a region puts support where the angle would not",
    forced.some((s) => s.length), "no forced support appeared");
  check("...and it still keeps clear of the model", (() => {
    for (let i = 0; i < forced.length; i++) {
      if (!forced[i]?.length || !tl[i]) continue;
      const w = 10 + i * 0.4;                    // the taper's width at this layer
      const inside = forced[i].some((p) => p.some(([x]) =>
        x > 20 - w / 2 + 0.5 && x < 20 + w / 2 - 0.5));
      if (inside) return false;
    }
    return true;
  })());

  // blocked beats forced, because "never here" is the one you reach for when
  // support has landed somewhere you cannot get a tool into to remove it
  const both = await planSupports(tl,
    { ...on, supportForce: [[0, 0, 40, 40]], supportBlock: [[-5, -5, 45, 45]] });
  check("blocked wins over forced", both.every((s) => !s.length));
}

console.log("\nsupport thresholds\n");
{
  // a staircase climbing 0.6mm sideways per 0.2mm layer — 71.6 degrees off
  // vertical, so a 45 or 60 degree threshold must catch it and an 80 must not
  const steps = [];
  for (let k = 0; k < 40; k++) steps.push(...box(10 + k * 1.2, 40, 0.2, 0, 0, k * 0.2));
  const mk = async (a) => {
    const o = { ...DEFAULTS, walls: 2, supports: true, supportAngle: a };
    return planSupports((await planLayers(steps, o)).layers, o);
  };
  const any = (s) => s.some((x) => x.length);
  check("a 30 degree threshold supports it", any(await mk(30)));
  check("45 supports it too", any(await mk(45)));
  check("60 still does", any(await mk(60)));
  check("80 lets it go — that is a steeper wall than the part has", !any(await mk(80)));

  // density has to reach the G-code, not just the options object
  const tee = [...box(10, 10, 10, 15, 15, 0), ...box(40, 40, 6, 0, 0, 10)];
  const light = await sliceToGcode(tee, { walls: 2, supports: true, supportDensity: 0.08 });
  const heavy = await sliceToGcode(tee, { walls: 2, supports: true, supportDensity: 0.3 });
  check("denser support uses more filament",
    heavy.stats.supportMm > light.stats.supportMm * 2.5,
    `${light.stats.supportMm} vs ${heavy.stats.supportMm}`);
  const far = await sliceToGcode(tee, { walls: 2, supports: true, supportZ: 4 });
  check("a bigger z gap leaves more air under the overhang",
    far.stats.supportMm < light.stats.supportMm * 1.6 && far.stats.supportLayers < 49,
    String(far.stats.supportLayers));
}

console.log("\nstagger can be turned off\n");
{
  const off = await sliceToGcode(box(40, 40, 20), { walls: 3, stagger: false, infill: 0 });
  check("no layers are reported staggered", off.stats.staggeredLayers === 0);
  check("the header says so", off.gcode.includes("stagger off"));
  const on = await sliceToGcode(box(40, 40, 20), { walls: 3, stagger: true, infill: 0 });
  check("staggering costs filament the straight stack does not",
    on.stats.filamentMm3 !== off.stats.filamentMm3);
}

console.log("\ncustom start / end / layer G-code\n");
{
  const opt = {
    walls: 2, infill: 0, topLayers: 0, bottomLayers: 0, name: "custom",
    startGcode: "; MY START\nM104 S{temp}\nG28\nM117 {name}",
    endGcode: "; MY END\nM104 S0\nM117 done",
    layerGcode: "M117 layer {layernum} at {z}",
  };
  const { gcode } = await sliceToGcode(box(20, 20, 2), opt);
  const lines = gcode.split("\n");
  check("the custom start replaces the built-in one",
    gcode.includes("; MY START") && !gcode.includes("M190"));
  check("the custom end replaces the built-in one",
    gcode.includes("; MY END") && !gcode.includes("M84"));
  check("placeholders are filled in", gcode.includes("M104 S210") && gcode.includes("M117 custom"));
  check("an unknown placeholder is left alone rather than blanked",
    fillPlaceholders("a {nope} b", { x: 1 }) === "a {nope} b");
  check("layer G-code runs on every layer",
    (gcode.match(/M117 layer /g) || []).length === 10,
    String((gcode.match(/M117 layer /g) || []).length));
  check("...right after the Z move, not before it", (() => {
    const i = lines.indexOf(";LAYER:3");
    return /^G1 Z/.test(lines[i + 1]) && /^M117 layer 4/.test(lines[i + 2]);
  })(), lines.slice(lines.indexOf(";LAYER:3"), lines.indexOf(";LAYER:3") + 3).join(" | "));
  check("layer numbers and heights are real",
    gcode.includes("M117 layer 4 at 0.800"), "expected layer 4 at z 0.800");

  const plain = await sliceToGcode(box(20, 20, 2), { walls: 2, infill: 0 });
  check("leaving them blank keeps the built-in preamble",
    plain.gcode.includes("M109") && plain.gcode.includes("M84"));
  check("...which includes a prime line", plain.gcode.includes("purge line"));
}

console.log("\nprinters\n");
{
  check("there is a real spread of machines", Object.keys(PRINTERS).length >= 12,
    String(Object.keys(PRINTERS).length));
  check("every one has a bed, a retract and a label", Object.values(PRINTERS).every((p) =>
    p.label && p.bedX > 0 && p.bedY > 0 && p.retract >= 0 && p.retractSpeed > 0));
  // a non-square bed is the case that catches centring bugs
  check("a non-square bed centres on both axes separately", (() => {
    const p = PRINTERS.prusa_mk4;
    return p.bedX !== p.bedY;
  })());
  const { gcode } = await sliceToGcode(box(40, 40, 4, -20, -20, 0),
    { walls: 2, ...PRINTERS.prusa_mk4 });
  const xs = [], ys = [];
  for (const m of gcode.slice(gcode.indexOf(";LAYER:0"))
    .matchAll(/^G[01] X(-?[\d.]+) Y(-?[\d.]+)/gm)) { xs.push(+m[1]); ys.push(+m[2]); }
  check("...and lands the part in the middle of it",
    near((Math.min(...xs) + Math.max(...xs)) / 2, 125, 0.2)
    && near((Math.min(...ys) + Math.max(...ys)) / 2, 105, 0.2),
    `${(Math.min(...xs) + Math.max(...xs)) / 2}, ${(Math.min(...ys) + Math.max(...ys)) / 2}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
