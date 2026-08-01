// The brick-staggered slicer. The claims worth testing are dimensional: a
// slicer that produces beautiful-looking G-code for a part that comes out the
// wrong size is worse than useless, so every check here is a measurement.

import ClipperLib from "clipper-lib";
import {
  sliceTriangles, chainLoops, offsetLoops, wallsForLayer, sliceToGcode,
  ePerMm, DEFAULTS, _setClipper,
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

const perim = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
};

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

console.log("\nG-code\n");
{
  const tris = box(40, 40, 20);
  const { gcode, stats } = await sliceToGcode(tris, { walls: 2, name: "cube" });
  const lines = gcode.split("\n");
  check("100 layers of 0.2 over 20mm", stats.layers === 100, String(stats.layers));
  check("every layer produced walls", stats.layersWithWalls === 100, String(stats.layersWithWalls));
  check("half of them are the staggered ones", stats.staggeredLayers === 50, String(stats.staggeredLayers));
  check("two walls per layer", stats.wallsPerLayer === 2, String(stats.wallsPerLayer));

  check("starts with the preamble", /^; cube/.test(lines[0]) && gcode.includes("G21") && gcode.includes("M109"));
  check("ends parked and powered down", gcode.includes("M84") && gcode.includes("M104 S0"));
  check("layer markers are present", (gcode.match(/;LAYER:/g) || []).length === 100);
  check("E only ever climbs", (() => {
    let last = -1;
    for (const m of gcode.matchAll(/ E([\d.]+)/g)) {
      const e = +m[1];
      if (e < last) return false;
      last = e;
    }
    return true;
  })());

  // The volume claim, end to end. Two walls of a 40mm box at 0.4 nozzle sit at
  // 0.2 and 0.6 in, so 39.6 and 38.8 square: 158.4 + 155.2 = 313.6mm per layer
  // (the stagger moves the inner wall but the OUTER stays put, and on odd
  // layers the inner one moves in by 0.2 -> 154.4). Averaged over 100 layers,
  // then multiplied by a 0.2 x 0.4 bead.
  const perLayerEven = 158.4 + 155.2, perLayerOdd = 158.4 + 154.4;
  const expected = ((perLayerEven + perLayerOdd) / 2) * 100 * (0.2 * 0.4);
  check("filament volume matches the beads laid down",
    near(stats.filamentMm3, expected, expected * 0.02),
    `${stats.filamentMm3} vs ${expected.toFixed(0)}`);
  check("E per mm is the standard bead/filament ratio",
    near(ePerMm(DEFAULTS), 0.03326, 1e-5), String(ePerMm(DEFAULTS)));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
