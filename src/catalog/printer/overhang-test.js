// An overhang test: a row of fins on a back wall, each leaning out further
// than the last, from nearly upright to nearly flat. Where the undersides
// start to droop and curl is your printer's overhang limit. The steep fins
// ARE the test, so their underside area is declared as meant (bridgeArea).

export default {
  id: "overhang-test",
  category: "printer",
  title: "Overhang test",
  summary: "a row of fins leaning out at rising angles, to see how steep an overhang your printer manages.",
  print: "as shown, with no supports: the drooping fins are the result.",
  names: ["overhang test", "overhang tester", "overhang calibration", "overhang angle test", "overhang torture test",
    "overhang gauge", "angle overhang test"],
  nouns: ["tester", "gauge"],
  keywords: ["overhang", "angle", "calibration", "test", "printer", "cooling"],
  tips: ["from 20 degrees", "up to 85 degrees", "8 fins"],
  examples: ["make me an overhang test", "overhang test from 30 to 80 degrees",
    "an overhang calibration with 8 fins", "overhang angle test up to 80 degrees"],
  bridgeArea: (v) => {
    const hi = Math.max(v.angleMax, v.angleMin + 5);
    let a = 0;
    for (let i = 0; i < v.steps; i++) if (v.angleMin + (hi - v.angleMin) * i / (v.steps - 1) > 40) a += v.slant * v.finW;
    return 1.1 * a;
  },
  params: {
    angleMin: { default: 30, min: 10, max: 60, unit: "deg", label: "first fin's lean from upright", say: ["from", "start", "first", "starting", "min"] },
    angleMax: { default: 80, min: 40, max: 85, unit: "deg", label: "last fin's lean from upright", say: ["to", "up", "upto", "max", "last"] },
    steps: { default: 6, min: 2, max: 9, unit: "count", label: "how many fins", say: ["fin", "fins", "step", "angle"] },
    slant: { default: 15, min: 8, max: 40, unit: "mm", label: "fin length", say: ["long", "length", "fin"] },
    finW: { default: 8, min: 4, max: 20, unit: "mm", label: "fin width", say: ["wide", "width"] },
  },
  things: [
    { names: ["steep overhang test", "extreme overhang test"], title: "Steep overhang test", params: { angleMin: 50, angleMax: 85, steps: 8 } },
    { names: ["quick overhang test", "small overhang test", "mini overhang test"], title: "Quick overhang test", params: { angleMin: 40, angleMax: 70, steps: 4, slant: 10 } },
  ],
  body: `
const hi = Math.max(angleMax, angleMin + 5);          // the last fin always leans furthest
const angles = Array.from({ length: steps }, (_, i) => angleMin + (hi - angleMin) * i / (steps - 1));
const finT = Math.max(2, finW / 4);
const tallest = slant * Math.cos(angleMin * Math.PI / 180) + finT;
const backT = Math.max(3, finW * 0.4), gap = Math.max(2, finW / 4);
const span = steps * (finW + gap) + gap;
// a fin drawn in (x out from the wall, z up), stood up at y
// rotate([90, 0, 0]) keeps the profile's x, sends its y to z, and the extrusion to -y
const fin = (deg, y) => {
  const a = deg * Math.PI / 180;
  const ox = slant * Math.sin(a), oz = slant * Math.cos(a);
  return translate([0, y + finW, 0], rotate([90, 0, 0], linearExtrude({ h: finW },
    polygon([[-0.01, 0], [ox, oz], [ox, oz + finT], [-0.01, oz + finT]]))));
};
return translate([0, -span / 2, 0], union(
  translate([-backT, 0, 0], cube([backT, span, tallest])),
  ...angles.map((d, i) => fin(d, gap + i * (finW + gap))),
));
`,
};
