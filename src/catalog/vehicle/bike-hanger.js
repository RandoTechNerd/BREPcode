// A wall hanger for a bike: a plate, a long arm braced by a solid gusset, and
// at the arm's end either a saddle the top tube rests in (the bike hangs
// level, side-on to the wall) or an upturned hook the front wheel's rim hangs
// on (the bike hangs nose-up). One side profile, printed lying on its side,
// so every layer runs the length of the arm and nothing needs support.

export default {
  id: "bike-hanger",
  category: "vehicle",
  title: "Bike wall hanger",
  summary: "a braced wall arm that hangs a bike by its top tube, or nose-up by the front wheel.",
  print: "on its side as shown, no supports. PETG or nylon, 6+ walls, 40% infill. Not load-rated: hang the bike by hand and watch it before you walk away, and screw into studs.",
  names: ["bike hanger", "bike wall hook", "bike wall mount", "bicycle hanger", "bicycle wall mount", "bike storage hook",
    "bike wall hanger", "bike rack for wall", "bicycle wall hook", "bike hook"],
  nouns: ["hanger", "hook", "mount", "rack"],
  keywords: ["bike", "bicycle", "garage", "wall", "cycling", "scooter"],
  tips: ["vertical, by the wheel", "200 mm reach", "60 mm saddle"],
  examples: ["I want a bike wall mount", "make me a bike hanger with 200mm reach",
    "vertical bike hook for the garage", "a wall hanger for my scooter"],
  params: {
    style: { default: "tube", unit: "choice", choices: ["tube", "wheel"], label: "hang by the top tube, or nose-up by the wheel",
      words: { wheel: ["wheel", "vertical", "vertically", "nose up", "by the wheel", "rim"], tube: ["top tube", "horizontal", "horizontally", "level"] } },
    reach: { default: 180, min: 40, max: 230, unit: "mm", label: "reach out from the wall", say: ["reach", "out", "deep", "long"], more: ["longer", "deeper"], less: ["shorter"] },
    tubeD: { default: 50, min: 20, max: 80, unit: "mm", label: "saddle size (at least the top tube)", say: ["tube", "saddle", "frame"] },
    tipH: { default: 35, min: 10, max: 80, unit: "mm", label: "wheel hook tip height", say: ["tip", "lip"] },
    armT: { default: 18, min: 8, max: 30, unit: "mm", label: "arm thickness", say: ["thick"], more: ["stronger", "thicker", "sturdier"] },
    width: { default: 40, min: 12, max: 80, unit: "mm", label: "hanger width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    drop: { default: 70, min: 20, max: 160, unit: "mm", label: "plate below the arm (gusset height)", say: ["drop", "below", "gusset"] },
    above: { default: 35, min: 20, max: 80, unit: "mm", label: "plate above the arm (screws)", say: ["above", "plate"] },
    wall: { default: 8, min: 5, max: 16, unit: "mm", label: "wall plate thickness", say: ["wall"] },
    screwD: { default: 5, min: 3, max: 7, unit: "mm", label: "screw hole diameter", say: ["screw"] },
  },
  things: [
    { names: ["vertical bike hook", "bike wheel hook", "vertical bike hanger", "bike rim hook", "vertical bike mount"], title: "Vertical bike hook",
      params: { style: "wheel", reach: 60, tipH: 45, width: 18, armT: 16, drop: 50 } },
    { names: ["top tube hanger", "horizontal bike hanger", "top tube hook", "bike top tube mount"], title: "Top tube hanger", params: { style: "tube" } },
    { names: ["kids bike hanger", "kids bike hook", "balance bike hanger"], title: "Kids bike hanger", params: { reach: 120, tubeD: 40 } },
    { names: ["scooter hanger", "scooter wall hook", "kick scooter hanger", "scooter wall mount"], title: "Scooter hanger", params: { reach: 90, tubeD: 40 } },
    { names: ["road bike hanger", "road bike wall mount"], title: "Road bike hanger", params: { reach: 200, tubeD: 40 } },
    { names: ["mountain bike hanger", "mtb hanger", "mtb wall mount", "mountain bike wall mount"], title: "Mountain bike hanger",
      params: { reach: 220, tubeD: 65, armT: 20, width: 45 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it
const armTop = drop + armT;
const g = Math.min(drop, reach * 0.7);            // the gusset under the arm
const x1 = wall + reach;
const pts = [[0, 0], [wall, 0], [wall, drop - g], [wall + g, drop], [x1, drop]];
const lift = style === "wheel" ? 0 : (tubeD / 2 + 1) * 0.9;   // saddle sides rise this far above the arm
if (style === "wheel") {
  // an upturned tip the rim hangs behind
  const tipT = Math.max(8, armT * 0.7);
  pts.push([x1, armTop + tipH], [x1 - tipT, armTop + tipH], [x1 - tipT, armTop]);
} else {
  // a saddle block at the end; the trough is cut below
  const R = tubeD / 2 + 1;
  const s0 = Math.max(wall + 10, x1 - 2 * R - 12);
  pts.push([x1, armTop + lift], [s0, armTop + lift], [s0, armTop]);
}
const above0 = Math.max(armTop, armTop + lift - 0.01);
pts.push([wall, armTop], [wall, above0 + above], [0, above0 + above]);
const piece = linearExtrude({ h: width }, polygon(pts));
const cuts = [];
if (style !== "wheel") {
  const R = tubeD / 2 + 1;
  const s0 = Math.max(wall + 10, x1 - 2 * R - 12);
  cuts.push(translate([(s0 + x1) / 2, drop + armT * 0.5 + R, -1], cylinder({ r: R, h: width + 2, $fn: 72 })));
}
// countersunk screw holes: two above the arm, one below the gusset if there is room
const k = screwD / 2;
const zs = width < 30 ? [width / 2] : [width * 0.28, width * 0.72];
const ys = [above0 + above / 2, ...(drop - g > 2 * screwD + 10 ? [(drop - g) / 2] : [])];
for (const y of ys) for (const z of zs) {
  cuts.push(translate([-1, y, z], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))));
  cuts.push(translate([wall - k + 0.02, y, z], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))));
}
return difference(piece, ...cuts);
`,
};
