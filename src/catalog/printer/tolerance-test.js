// A print-in-place tolerance test: a plate of holes, each with a pin
// printed standing inside it, and each hole's gap a step looser than the
// last. After printing, push the pins out: the tightest one that moves is
// your printer's clearance. The tight end is the one with the notched
// corner. Pins and plate never touch, so they print as separate parts.

export default {
  id: "tolerance-test",
  category: "printer",
  title: "Tolerance test",
  summary: "a print-in-place plate of pins in holes, each gap a step looser, to find your printer's clearance.",
  print: "flat as shown, no supports. The notched corner is the tightest gap.",
  names: ["tolerance test", "clearance test", "tolerance gauge", "fit test", "print in place tolerance test", "tolerance tester",
    "clearance gauge", "tolerance calibration", "gap test", "hole tolerance test"],
  nouns: ["gauge", "tester"],
  keywords: ["tolerance", "clearance", "calibration", "fit", "printer", "pin", "gap"],
  tips: ["8 steps", "pins 10 mm", "start at 0.05"],
  examples: ["make me a tolerance test", "a clearance test with 8 steps",
    "print in place tolerance test from 0.1 to 0.5", "fit test with 12mm pins"],
  params: {
    pinD: { default: 8, min: 3, max: 20, unit: "mm", label: "pin diameter", say: ["pin", "peg", "diameter"] },
    steps: { default: 5, min: 2, max: 10, unit: "count", label: "how many gaps", say: ["step", "steps", "hole", "pin", "gap"] },
    cMin: { default: 0.1, min: 0.05, max: 0.3, unit: "mm", label: "tightest gap per side", say: ["from", "start", "tightest", "min"] },
    cStep: { default: 0.1, min: 0.05, max: 0.3, unit: "mm", label: "gap added each step", say: ["increment", "each"] },
    plateT: { default: 4, min: 2, max: 10, unit: "mm", label: "plate thickness", say: ["thick", "plate"] },
  },
  things: [
    { names: ["tight tolerance test", "fine clearance test", "precision tolerance test"], title: "Fine tolerance test", params: { cMin: 0.05, cStep: 0.05, steps: 8 } },
    { names: ["loose tolerance test", "coarse clearance test"], title: "Coarse tolerance test", params: { cMin: 0.2, cStep: 0.2, steps: 5 } },
    { names: ["peg fit test", "peg and hole test", "pin fit test"], title: "Peg fit test", params: { pinD: 12, plateT: 6 } },
  ],
  body: `
const gaps = Array.from({ length: steps }, (_, i) => cMin + i * cStep);
const pitch = pinD + 2 * gaps[steps - 1] + 4;
const W = steps * pitch + 4, D = pinD + 2 * gaps[steps - 1] + 8;
const xs = gaps.map((_, i) => -W / 2 + 2 + (i + 0.5) * pitch);
const notch = Math.min(5, D / 3);
const plate = difference(
  translate([-W / 2, -D / 2, 0], cube([W, D, plateT])),
  ...gaps.map((g, i) => translate([xs[i], 0, -1], cylinder({ d: pinD + 2 * g, h: plateT + 2, $fn: 48 }))),
  // the notched corner marks the tight end
  translate([-W / 2, -D / 2, -1], linearExtrude({ h: plateT + 2 }, polygon([[-1, -1], [notch, -1], [-1, notch]]))),
);
const pins = xs.map((x) => translate([x, 0, 0], cylinder({ d: pinD, h: plateT + 3, $fn: 48 })));
return group(plate, ...pins);
`,
};
