// A bridging test: posts on a base strip with one flat slab across the
// top, so each gap between posts is a bridge a step longer than the last.
// The bridges are the whole point, so this family declares their area as
// meant (bridgeArea) instead of pretending they are not there.

export default {
  id: "bridge-test",
  category: "printer",
  title: "Bridge test",
  summary: "posts with flat bridges between them, each gap longer than the last, to see how far your printer can bridge.",
  print: "flat as shown. The bridges are the test: no supports.",
  names: ["bridge test", "bridging test", "bridge calibration", "bridging calibration", "bridge tester",
    "bridge torture test", "bridging tower", "bridge span test"],
  nouns: ["tester"],
  keywords: ["bridge", "bridging", "calibration", "test", "printer", "span"],
  tips: ["7 gaps", "start at 20 mm", "taller posts"],
  examples: ["make me a bridge test", "a bridging test from 10 to 50 mm",
    "bridge calibration with 6 gaps", "bridge test starting at 20mm"],
  bridgeArea: (v) => {
    let sum = 0;
    for (let i = 0; i < v.steps; i++) sum += v.spanMin + i * v.spanStep;
    return 1.05 * sum * v.depth;
  },
  params: {
    spanMin: { default: 10, min: 5, max: 40, unit: "mm", label: "shortest bridge", say: ["from", "start", "shortest", "starting"] },
    spanStep: { default: 10, min: 5, max: 30, unit: "mm", label: "each bridge longer by", say: ["step", "increment", "each"] },
    steps: { default: 5, min: 2, max: 8, unit: "count", label: "how many bridges", say: ["gap", "gaps", "bridge", "step"] },
    height: { default: 10, min: 4, max: 30, unit: "mm", label: "post height", say: ["tall", "high", "height"] },
    depth: { default: 10, min: 5, max: 30, unit: "mm", label: "bridge width", say: ["deep", "depth", "wide", "width"] },
    postW: { default: 5, min: 3, max: 10, unit: "mm", label: "post width", say: ["post"] },
    bridgeT: { default: 1.2, min: 0.6, max: 3, unit: "mm", label: "bridge thickness", say: ["thick", "thickness"] },
  },
  things: [
    { names: ["short bridge test", "quick bridge test"], title: "Short bridge test", params: { spanMin: 5, spanStep: 5, steps: 5 } },
    { names: ["long bridge test", "long bridging test", "bridge distance test"], title: "Long bridge test", params: { spanMin: 20, spanStep: 15, steps: 5, depth: 8 } },
  ],
  body: `
const spans = Array.from({ length: steps }, (_, i) => spanMin + i * spanStep);
const L = spans.reduce((a, b) => a + b, 0) + (steps + 1) * postW;
const baseT = Math.min(1.2, height / 3);
const parts = [
  cube([L, depth, baseT]),
  translate([0, 0, height], cube([L, depth, bridgeT])),
];
// post i stands after i posts and the first i spans
const postX = (i) => i * postW + spans.slice(0, i).reduce((a, b) => a + b, 0);
for (let i = 0; i <= steps; i++) {
  parts.push(translate([postX(i), 0, baseT - 0.01], cube([postW, depth, height - baseT + 0.02])));
}
return translate([-L / 2, -depth / 2, 0], union(...parts));
`,
};
