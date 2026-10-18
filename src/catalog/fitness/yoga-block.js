// A yoga block, or a wedge. The block is one hull of rounded corners with
// a 45 degree chamfer round the top and bottom edges; the wedge is a ramp
// profile stretched across its width. Both print as they are used, on
// their flat bottom, and want little infill: they are big.

export default {
  id: "yoga-block",
  category: "fitness",
  title: "Yoga block",
  summary: "a rounded, chamfered yoga block, or a wedge for stretching and squats.",
  print: "flat on its bottom as shown, no supports. 5 to 10% gyroid infill and 3 walls keep it light and stiff.",
  names: ["yoga block", "yoga blocks", "exercise block", "stretching block", "yoga prop", "pilates block",
    "workout block", "fitness block"],
  nouns: ["block", "brick", "wedge"],
  keywords: ["yoga", "pilates", "stretch", "stretching", "exercise", "workout", "meditation"],
  triple: ["length", "width", "height"],
  primary: "height",
  tips: ["4 inches tall", "wedge", "15 degrees"],
  examples: ["I want a yoga block", "make me a yoga block 229 x 152 x 76", "a 4 inch yoga block",
    "pilates block 50mm tall"],
  params: {
    length: { default: 229, min: 100, max: 250, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 152, min: 60, max: 200, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    height: { default: 76, min: 20, max: 150, unit: "mm", label: "height (blocks)", say: ["tall", "thick", "high", "height"], more: ["taller", "thicker"], less: ["thinner", "lower"] },
    cornerR: { default: 12, min: 2, max: 40, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    bevel: { default: 4, min: 0, max: 12, unit: "mm", label: "edge chamfer", say: ["chamfer", "bevel", "edge"] },
    shape: { default: "block", unit: "choice", choices: ["block", "wedge"], label: "block or wedge",
      words: { wedge: ["wedge", "slant", "ramp", "incline"], block: ["block", "brick"] } },
    angle: { default: 15, min: 5, max: 30, unit: "deg", label: "wedge slope", say: ["angle", "slope", "degree", "incline"], more: ["steeper"], less: ["flatter"] },
  },
  things: [
    { names: ["yoga brick", "yoga bricks"], title: "Yoga brick", params: { length: 225, width: 145, height: 60 } },
    { names: ["half yoga block", "slim yoga block", "thin yoga block"], title: "Slim yoga block", params: { height: 50 } },
    { names: ["tall yoga block", "big yoga block", "large yoga block"], title: "Tall yoga block", params: { height: 102 } },
    { names: ["yoga wedge", "wrist wedge", "yoga wedge block"], title: "Yoga wedge", params: { shape: "wedge", angle: 12, width: 180 } },
    { names: ["slant board", "calf stretcher", "calf stretch wedge", "slant board for calves"], title: "Slant board", params: { shape: "wedge", angle: 20, length: 250, width: 200 } },
    { names: ["squat wedge", "heel elevator", "squat ramp"], title: "Squat wedge", params: { shape: "wedge", angle: 15, length: 230, width: 120 } },
    { names: ["meditation block", "kneeling block"], title: "Meditation block", params: { length: 200, width: 130, height: 90, cornerR: 20 } },
    { names: ["mini yoga block", "travel yoga block", "kids yoga block"], title: "Mini yoga block", params: { length: 150, width: 100, height: 50, cornerR: 10 } },
  ],
  body: `
if (shape === "wedge") {
  // a ramp profile, from a 4 mm nose up to the back, stretched across the width
  const back = 4 + length * Math.tan(angle * Math.PI / 180);
  return translate([-length / 2, width / 2, 0], rotate([90, 0, 0], linearExtrude({ h: width }, polygon([[0, 0], [length, 0], [length, back], [0, 4]]))));
}
const rr = Math.max(1, Math.min(cornerR, width / 2 - 1, length / 2 - 1));
const c = Math.max(0, Math.min(bevel, height / 3, rr - 0.6));
// the four corner discs of a rounded rectangle, standing from z, h tall
const corners = (w, d, r, z, h) => [[r, r], [w - r, r], [r, d - r], [w - r, d - r]].map(([x, y]) =>
  translate([x - w / 2, y - d / 2, z], cylinder({ r, h, $fn: 32 })));
if (c <= 0) return hull(...corners(length, width, rr, 0, height));
return hull(
  ...corners(length - 2 * c, width - 2 * c, rr - c, 0, 0.5),
  ...corners(length, width, rr, c, height - 2 * c),
  ...corners(length - 2 * c, width - 2 * c, rr - c, height - 0.5, 0.5),
);
`,
};
