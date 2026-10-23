// A spoon rest: a shallow teardrop dish for the bowl of the spoon, with a
// channel in the rim at the narrow end where the handle lies. The dish is a
// hull of two cylinders tapering out as they rise (walls lean out 30 degrees,
// well inside what prints without support), hollowed by the same hull a wall
// thinner and a floor higher.

export default {
  id: "spoon-rest",
  category: "kitchen",
  title: "Spoon rest",
  summary: "a shallow teardrop dish by the stove for a stirring spoon, ladle or used tea bag, with a notch for the handle.",
  print: "upright as shown, no supports. PETG or ABS by the stove: PLA softens near a hot pan.",
  names: ["spoon rest", "spoon holder", "stove spoon rest", "utensil rest", "spatula rest", "cooking spoon rest",
    "spoon rest for stove", "ladle rest"],
  nouns: ["rest"],
  keywords: ["spoon", "ladle", "spatula", "stove", "stovetop", "cooking", "kitchen", "counter"],
  tips: ["ladle rest", "longer", "deeper"],
  examples: ["I want a spoon rest", "make me a spoon rest 150mm long",
    "a ladle rest for the stove", "tea bag rest"],
  params: {
    length: { default: 120, min: 50, max: 240, unit: "mm", label: "length", say: ["long", "length"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    bowlW: { default: 70, min: 30, max: 140, unit: "mm", label: "width of the round end", say: ["wide", "width", "across"], more: ["wider"], less: ["narrower"] },
    neckW: { default: 34, min: 16, max: 90, unit: "mm", label: "width of the narrow end", say: ["neck", "narrow"] },
    depth: { default: 14, min: 5, max: 40, unit: "mm", label: "dish depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["thicker", "sturdier"] },
    floorT: { default: 2.4, min: 1.6, max: 6, unit: "mm", label: "floor thickness", say: ["floor", "bottom"] },
    notchW: { default: 16, min: 0, max: 40, unit: "mm", label: "handle notch width (0 = none)", say: ["notch", "handle", "channel"] },
  },
  things: [
    { names: ["tea bag rest", "tea bag holder dish", "used tea bag holder", "tea bag dish", "tea bag caddy", "tea bag tray"],
      title: "Tea bag rest", params: { length: 80, bowlW: 60, neckW: 30, depth: 9, notchW: 8 } },
    { names: ["ladle rest", "big spoon rest", "large spoon rest", "ladle holder for stove"], title: "Ladle rest", params: { length: 170, bowlW: 100, neckW: 40, depth: 18, notchW: 20 } },
    { names: ["chopstick rest", "chopstick holder rest", "small utensil rest"], title: "Chopstick rest", params: { length: 55, bowlW: 30, neckW: 24, depth: 6, wall: 2, floorT: 2, notchW: 8 } },
    { names: ["double spoon rest", "two spoon rest", "wide spoon rest"], title: "Double spoon rest", params: { length: 140, bowlW: 130, neckW: 80, depth: 14, notchW: 36 } },
    { names: ["coffee scoop rest", "scoop rest", "tea spoon rest", "teaspoon rest"], title: "Teaspoon rest", params: { length: 90, bowlW: 45, neckW: 22, depth: 8, notchW: 10 } },
    { names: ["brush rest", "basting brush rest", "pastry brush rest"], title: "Basting brush rest", params: { length: 130, bowlW: 55, neckW: 36, depth: 12, notchW: 18 } },
  ],
  body: `
// a teardrop footprint: a round end at -x, a narrower round end at +x, walls leaning out as they rise
const lean = Math.tan(30 * Math.PI / 180);
const rB = bowlW / 2, rN = Math.min(neckW, bowlW) / 2;
const H = floorT + depth;
const xB = -length / 2 + rB, xN = length / 2 - rN;    // the rim reaches the full length
const span = Math.max(1, xN - xB);
const drop = (grow, z0, h) => hull(
  translate([xB, 0, z0], cylinder({ r1: Math.max(1, rB - H * lean + grow), r2: Math.max(1, rB - H * lean + grow + h * lean), h, $fn: 56 })),
  translate([xB + span, 0, z0], cylinder({ r1: Math.max(1, rN - H * lean + grow), r2: Math.max(1, rN - H * lean + grow + h * lean), h, $fn: 40 })),
);
let dish = difference(drop(0, 0, H), drop(-wall, floorT, H));
// the channel the handle lies in, through the rim at the narrow end
if (notchW > 0) {
  const nw = Math.min(notchW, 2 * rN - 2 * wall);
  const nd = Math.min(depth * 0.6, depth - 1);
  dish = difference(dish, translate([xB + span, -nw / 2, H - nd], cube([rN + H, nw, nd + 1])));
}
return dish;
`,
};
