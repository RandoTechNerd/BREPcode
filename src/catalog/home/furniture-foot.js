// A replacement foot or short leg for a sofa, cabinet, bed or dresser:
// tapered, straight, bun-shaped or square, fixed with a wood screw from the
// floor end (counterbored so the head sits inside) or on a hanger bolt with
// a captive nut. Printed upside down, the face that meets the furniture on
// the bed, so a foot that narrows toward the floor narrows as it rises. The
// bun is a hull of discs, the others plain cones and cylinders.

export default {
  id: "furniture-foot",
  category: "home",
  title: "Furniture foot",
  summary: "a replacement foot or short leg for furniture, on a screw or a hanger bolt.",
  print: "upside down as shown (the furniture face on the bed), no supports. PETG or PLA; 4 walls, 30% infill.",
  names: ["furniture foot", "furniture feet", "furniture leg", "replacement foot", "replacement leg", "table foot",
    "foot for furniture", "short furniture leg", "replacement furniture leg"],
  nouns: ["foot", "feet", "leg"],
  keywords: ["furniture", "sofa", "couch", "cabinet", "bed", "replacement", "dresser", "screw on"],
  fits: ["screw"],
  fromSpec: (s) => ({ holeD: Math.min(10, s.dims.d + 0.5), fixing: s.dims.d >= 6 ? "bolt" : "screw" }),
  specNote: "the hole clears the bolt by half a millimetre",
  primary: "height",
  tips: ["100 mm tall", "on an M8 bolt", "a bun foot", "square"],
  examples: ["I want a furniture foot", "make me a replacement leg 100mm tall",
    "furniture foot for an m8 bolt", "a square furniture foot 60mm across"],
  params: {
    height: { default: 40, min: 8, max: 150, unit: "mm", label: "height", say: ["tall", "high", "height", "long", "lift"], more: ["taller", "higher", "longer"], less: ["shorter", "lower"] },
    topD: { default: 50, min: 15, max: 120, unit: "mm", label: "size where it meets the furniture", say: ["top", "across", "wide", "diameter", "size"], more: ["wider", "bigger"], less: ["narrower", "smaller"] },
    bottomD: { default: 40, min: 10, max: 120, unit: "mm", label: "size at the floor", say: ["bottom", "floor", "base"] },
    shape: { default: "taper", unit: "choice", choices: ["taper", "round", "bun", "square"], label: "shape",
      words: { bun: ["bun", "bun foot", "ball"], square: ["square", "block"], taper: ["taper", "tapered", "cone", "mid century"], round: ["round", "cylinder", "straight"] } },
    fixing: { default: "screw", unit: "choice", choices: ["screw", "bolt", "none"], label: "fixing (screw from below, bolt with a captive nut)",
      words: { bolt: ["bolt", "hanger bolt", "threaded", "nut", "m8", "5/16"], none: ["solid", "no hole", "glue"], screw: ["screw", "wood screw"] } },
    holeD: { default: 5, min: 2, max: 10, unit: "mm", label: "screw or bolt hole", say: ["hole"] },
    headD: { default: 10, min: 0, max: 22, unit: "mm", label: "screw head counterbore (0 = none)", say: ["head", "counterbore"] },
    nutAF: { default: 13, min: 5, max: 19, unit: "mm", label: "captive nut across flats (M8 = 13)", say: ["nut"] },
    padD: { default: 0, min: 0, max: 80, unit: "mm", label: "felt pad recess at the floor (0 = none)", say: ["pad", "felt"] },
  },
  bridgeArea: (v) => v.fixing === "bolt" ? 0.9 * v.nutAF * v.nutAF : 0,
  things: [
    { names: ["sofa leg", "couch leg", "sofa foot", "couch foot", "replacement sofa leg", "replacement couch leg"], title: "Sofa leg",
      params: { height: 100, topD: 50, bottomD: 35, fixing: "bolt", holeD: 8.5 } },
    { names: ["cabinet foot", "cabinet leg", "kitchen cabinet foot", "sideboard foot"], title: "Cabinet foot",
      params: { height: 60, topD: 45, bottomD: 40, shape: "round" } },
    { names: ["bun foot", "bun feet", "round bun foot", "ball foot"], title: "Bun foot", params: { shape: "bun", height: 60, topD: 70, bottomD: 55 } },
    { names: ["tapered leg", "mid century leg", "mid century modern leg", "tapered furniture leg", "tapered sofa leg"], title: "Tapered leg",
      params: { height: 150, topD: 45, bottomD: 25, fixing: "bolt", holeD: 8.5 } },
    { names: ["square furniture foot", "square foot", "square leg", "block foot", "square sofa leg"], title: "Square foot",
      params: { shape: "square", height: 50, topD: 50, bottomD: 45 } },
    { names: ["bed leg", "bed foot", "bed frame foot", "replacement bed leg"], title: "Bed leg",
      params: { height: 80, topD: 60, bottomD: 50, fixing: "bolt", holeD: 8.5, shape: "round" } },
    { names: ["dresser foot", "dresser leg", "chest foot", "bookcase foot"], title: "Dresser foot", params: { height: 35, topD: 55, bottomD: 45 } },
    { names: ["leveling foot", "leveler foot", "furniture leveler", "glide foot"], title: "Leveling foot",
      params: { height: 15, topD: 40, bottomD: 38, fixing: "bolt", holeD: 8.5, shape: "round" } },
    { names: ["speaker foot", "speaker feet", "amp foot", "appliance foot"], title: "Speaker foot",
      params: { height: 20, topD: 35, bottomD: 25, fixing: "none", padD: 0 } },
  ],
  body: `
// z = 0 is the face against the furniture; the floor end is at the top
const rt = topD / 2;
const rb = Math.min(bottomD / 2, rt + height * 0.95);   // never widen faster than 45 degrees
// built from primitives and hulls, not a revolve: a revolve with a bore cut
// down its axis is very slow to boolean
const disc = (r, z) => translate([0, 0, z], cylinder({ r, h: 0.01, $fn: 64 }));
let foot;
if (shape === "square") {
  const slab = (w, z, h) => {
    const r = Math.max(0.5, Math.min(4, w / 4));
    return hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
      translate([sx * (w / 2 - r), sy * (w / 2 - r), z], cylinder({ r, h, $fn: 24 }))));
  };
  foot = hull(slab(2 * rt, 0, 0.01), slab(2 * rb, height - 0.01, 0.01));
} else if (shape === "bun") {
  // bulges out a little above the furniture face, then rounds in to the floor
  const zm = height * 0.4;
  const rm = Math.min(Math.max(rt, rb) * 1.15, rt + 0.6 * zm);
  const rAt = (z) => z <= zm ? rt + (rm - rt) * Math.sin(z / zm * Math.PI / 2) : rb + (rm - rb) * Math.cos((z - zm) / (height - zm) * Math.PI / 2);
  foot = hull(...Array.from({ length: 11 }, (_, i) => disc(rAt(height * i / 10), Math.min(height * i / 10, height - 0.01))));
} else if (shape === "round") {
  foot = cylinder({ r: rt, h: height, $fn: 64 });
} else {
  foot = cylinder({ r1: rt, r2: rb, h: height, $fn: 64 });
}
const cuts = [];
const rFloor = shape === "round" ? rt : rb;
if (padD > 0) cuts.push(translate([0, 0, height - 1.5], cylinder({ r: Math.min(padD / 2, rFloor - 1.5), h: 2, $fn: 48 })));
if (fixing !== "none") {
  cuts.push(translate([0, 0, -1], cylinder({ r: holeD / 2, h: height + 2, $fn: 24 })));
  if (fixing === "screw" && headD > holeD) {
    // the screw goes in from the floor end: its head sits down a counterbore
    const grip = Math.max(4, Math.min(12, height * 0.4));
    cuts.push(translate([0, 0, grip], cylinder({ r: Math.min(headD / 2, rFloor - 1.5), h: height, $fn: 32 })));
  }
  if (fixing === "bolt") {
    // a hex nut pressed into the furniture face takes the hanger bolt
    const af = Math.min(nutAF, 2 * Math.min(rt, rb) - 4) + 0.3;
    const rc = af / Math.sqrt(3);
    const hex = polygon(Array.from({ length: 6 }, (_, i) => [rc * Math.cos(Math.PI * i / 3), rc * Math.sin(Math.PI * i / 3)]));
    cuts.push(translate([0, 0, -1], linearExtrude({ h: Math.min(height * 0.5, af * 0.5) + 1 }, hex)));
  }
}
return cuts.length ? difference(foot, ...cuts) : foot;
`,
};
