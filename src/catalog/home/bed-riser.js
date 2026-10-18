// A riser that lifts a bed, sofa or table leg: a wide tapered block with a cup
// in the top the leg stands in. Printed the way it is used, base down: the
// sides lean in as they rise, and the cup opens upward. Solid on purpose (the
// slicer's infill makes it light); a hollow underside would need a bridge the
// size of the base.

export default {
  id: "bed-riser",
  category: "home",
  title: "Bed riser",
  summary: "a tapered riser with a cup on top that lifts a bed, sofa or table leg.",
  print: "base down as shown, no supports. PETG or PLA, 4 walls, 20% infill; print four.",
  names: ["bed riser", "bed risers", "bed leg riser", "bed frame riser", "bed raiser", "bed lift", "bed lifter"],
  nouns: ["riser", "lifter", "raiser"],
  keywords: ["bed", "furniture", "lift", "raise", "leg", "couch", "sofa", "table", "taller"],
  fits: ["leg"],
  fromSpec: (s) => ({ cupW: s.dims.d + 4, shape: s.dims.sq ? "square" : "round" }),
  specNote: "the cup is 4 mm bigger than the leg",
  primary: "height",
  tips: ["100 mm lift", "round", "for a 60 mm leg"],
  examples: ["I want a bed riser", "make me bed risers 100mm tall",
    "a furniture riser for a 50mm leg", "round sofa riser 75mm"],
  params: {
    height: { default: 75, min: 20, max: 150, unit: "mm", label: "how much it lifts (with the cup)", say: ["lift", "raise", "tall", "high", "height"], more: ["taller", "higher"], less: ["lower", "shorter"] },
    baseW: { default: 110, min: 50, max: 200, unit: "mm", label: "base size", say: ["base", "bottom", "footprint"] },
    topW: { default: 85, min: 40, max: 180, unit: "mm", label: "top size", say: ["top"] },
    cupW: { default: 65, min: 20, max: 150, unit: "mm", label: "cup size (the leg goes in)", say: ["cup", "leg", "socket", "across", "wide"] },
    cupDepth: { default: 20, min: 5, max: 60, unit: "mm", label: "cup depth", say: ["deep", "depth"] },
    shape: { default: "square", unit: "choice", choices: ["square", "round"], label: "shape",
      words: { round: ["round", "circular", "cylinder"], square: ["square", "block"] } },
  },
  things: [
    { names: ["furniture riser", "furniture lifter", "furniture riser block"], title: "Furniture riser", params: { height: 60 } },
    { names: ["sofa riser", "couch riser", "sofa lifter", "couch lifter"], title: "Sofa riser", params: { height: 50, cupW: 60, cupDepth: 15 } },
    { names: ["table riser", "table leg riser", "table lifter", "table leg extender"], title: "Table riser",
      params: { height: 80, baseW: 80, topW: 65, cupW: 45, cupDepth: 25 } },
    { names: ["round bed riser", "round furniture riser", "cylinder bed riser"], title: "Round bed riser", params: { shape: "round" } },
    { names: ["chair riser", "chair lifter", "chair leg riser"], title: "Chair riser",
      params: { height: 50, baseW: 60, topW: 50, cupW: 36, cupDepth: 20, shape: "round" } },
    { names: ["tall bed riser", "high bed riser", "extra tall bed riser"], title: "Tall bed riser",
      params: { height: 140, baseW: 130, topW: 95, cupDepth: 30 } },
    { names: ["dresser riser", "cabinet leg riser", "bookcase riser"], title: "Cabinet riser", params: { height: 40, cupW: 55, cupDepth: 12 } },
  ],
  body: `
const tw = Math.min(topW, baseW);
const cw = Math.min(cupW, tw - 10);
const cd = Math.min(cupDepth, height - 5);
let block, cup;
if (shape === "round") {
  // the cup is part of the turned outline: no boolean down the axis
  return revolve(360, polygon([[0, 0], [baseW / 2, 0], [tw / 2, height], [cw / 2, height], [cw / 2, height - cd], [0, height - cd]]));
} else {
  // a rounded square w across, from z0 to z0 + h
  const slab = (w, z0, h, r) => hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
    translate([sx * (w / 2 - r), sy * (w / 2 - r), z0], cylinder({ r, h, $fn: 24 }))));
  block = hull(slab(baseW, 0, 0.01, 8), slab(tw, height - 0.01, 0.01, 6));
  cup = slab(cw, height - cd, cd + 1, 3);
}
return difference(block, cup);
`,
};
