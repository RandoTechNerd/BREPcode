// A wall peg that holds saw blades, grinder discs or tape rolls by their
// centre hole. The peg leans up a few degrees from the wall so what hangs on
// it slides back, not off. Printed with the wall plate flat on the bed and
// the peg standing up, so the peg is a column: no overhang anywhere. A big
// peg (for tape cores) is hollowed so it is not a solid slug of plastic.

export default {
  id: "blade-peg",
  category: "garage",
  title: "Saw blade hanger",
  summary: "a wall peg that holds saw blades, grinder discs or tape rolls by their centre hole.",
  print: "wall plate flat on the bed, peg up, no supports. The peg is a little under the bore so blades slide on easily.",
  names: ["saw blade hanger", "saw blade holder", "saw blade storage", "blade hanger", "circular saw blade holder",
    "blade storage peg", "saw blade wall mount", "blade peg"],
  nouns: ["peg", "hanger", "holder"],
  keywords: ["blade", "saw", "arbor", "disc", "wheel", "tape", "roll", "garage", "wall"],
  fits: ["arbor", "core"],
  fromSpec: (s) => ({ pegD: Math.round((s.dims.d - 0.6) * 100) / 100 }),
  tips: ["for 1 inch arbors", "60 mm long", "steeper angle"],
  examples: ["I want a saw blade hanger", "make me a holder for my 10 inch saw blade",
    "grinder disc holder", "duct tape holder for the wall"],
  params: {
    pegD: { default: 15.3, min: 6, max: 100, unit: "mm", label: "peg diameter (a little under the hole)", say: ["peg", "arbor", "bore", "hole", "core"] },
    length: { default: 40, min: 10, max: 120, unit: "mm", label: "peg length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    angle: { default: 12, min: 0, max: 30, unit: "deg", label: "upward lean of the peg", say: ["angle", "lean", "tilt", "degree"], more: ["steeper"], less: ["flatter"] },
    plateW: { default: 50, min: 30, max: 160, unit: "mm", label: "wall plate width", say: ["wide", "width", "plate"] },
    plateH: { default: 80, min: 40, max: 200, unit: "mm", label: "wall plate height", say: ["tall", "high", "height"] },
    plateT: { default: 5, min: 3, max: 10, unit: "mm", label: "wall plate thickness", say: ["thick", "thickness"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
  },
  things: [
    { names: ["table saw blade storage", "table saw blade holder", "10 inch blade holder"], title: "Table saw blade storage",
      spec: "arbor-5-8", params: { length: 60 } },
    { names: ["miter saw blade hanger", "miter saw blade holder", "12 inch blade holder"], title: "Miter saw blade hanger",
      spec: "arbor-1in", params: { length: 50, plateW: 60 } },
    { names: ["metric saw blade holder", "30mm arbor blade holder"], title: "30 mm bore blade holder", spec: "arbor-30mm", params: { length: 50 } },
    { names: ["grinder disc holder", "cutoff wheel holder", "grinding disc storage", "flap disc holder", "grinding wheel holder", "grinder disc storage"],
      title: "Grinder disc holder", spec: "arbor-7-8", params: { length: 50 } },
    { names: ["duct tape holder", "duct tape hanger", "painters tape holder", "tape roll hanger", "packing tape holder", "garage tape holder"],
      title: "Tape roll holder", spec: "core-3in", params: { length: 55, angle: 6, plateW: 90, plateH: 110 } },
  ],
  body: `
const r = pegD / 2;
const pw = Math.max(plateW, pegD + 12);
const a = angle * Math.PI / 180;
const drift = length * Math.sin(a);              // how far the tip leans up the wall
const ph = Math.max(plateH, pegD + 36 + drift);  // room for a screw above and below the peg
const rc = Math.min(8, pw / 4);
const plate = hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (pw / 2 - rc), sy * (ph / 2 - rc), 0], cylinder({ r: rc, h: plateT, $fn: 32 }))));
// the peg: a foot on the plate hulled to the leaning column, so it rises
// smoothly with no step to overhang
const lift = r * Math.sin(a) + 0.5;
const leaning = (rr, h, z0) => translate([0, -drift / 2, plateT + lift + z0], rotate([-angle, 0, 0], cylinder({ r: rr, h, $fn: 64 })));
const peg = hull(translate([0, -drift / 2, plateT - 0.5], cylinder({ r, h: 0.6, $fn: 64 })), leaning(r, length, 0));
const cuts = [];
if (pegD > 30) cuts.push(leaning(r - 3, length + 1, 4));        // hollow a big peg from its tip
const k = screwD / 2;
for (const y of [ph / 2 - 9, -(ph / 2 - 9)]) {
  cuts.push(translate([0, y, -1], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 })));
  cuts.push(translate([0, y, plateT - k + 0.02], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 })));
}
return difference(union(plate, peg), ...cuts);
`,
};
