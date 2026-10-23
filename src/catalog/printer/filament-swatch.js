// A filament swatch card: a tab with a ring hole, then a staircase of
// thicknesses so you can see how a colour looks thick and how much light
// it lets through thin. Every step faces up, so it is a flat, fast print.

export default {
  id: "filament-swatch",
  category: "printer",
  title: "Filament swatch",
  summary: "a sample card with stepped thicknesses and a ring hole, to keep a swatch of every filament.",
  print: "flat as shown, no supports.",
  names: ["filament swatch", "filament sample", "filament color swatch", "filament colour swatch", "swatch card",
    "filament sample card", "color swatch", "colour swatch", "filament swatch card", "material swatch", "filament tag"],
  nouns: ["swatch", "sample"],
  keywords: ["filament", "color", "colour", "sample", "keyring", "printer"],
  tips: ["6 steps", "no hole", "80 mm wide"],
  examples: ["make me a filament swatch", "a filament sample card with 6 steps",
    "color swatch 60 x 30", "filament swatch without a hole"],
  triple: ["width", "height"],
  params: {
    width: { default: 60, min: 30, max: 100, unit: "mm", label: "card width", say: ["wide", "width", "long"] },
    height: { default: 30, min: 15, max: 60, unit: "mm", label: "card height", say: ["tall", "high", "height"] },
    steps: { default: 4, min: 1, max: 8, unit: "count", label: "thickness steps", say: ["step", "steps"] },
    stepT: { default: 0.6, min: 0.2, max: 1.2, unit: "mm", label: "thickness of each step", say: ["thick", "layer"] },
    holeD: { default: 5, min: 0, max: 8, unit: "mm", label: "ring hole (0 = none)", say: ["hole", "ring"] },
  },
  things: [
    { names: ["mini filament swatch", "small filament swatch", "swatch keychain", "filament keychain swatch"], title: "Mini filament swatch",
      params: { width: 40, height: 20, steps: 3 } },
    { names: ["big filament swatch", "large filament swatch", "translucency test card"], title: "Big filament swatch",
      params: { width: 90, height: 40, steps: 6, stepT: 0.4 } },
    { names: ["filament swatch insert", "flat filament swatch", "swatch box insert"], title: "Flat filament swatch",
      params: { steps: 1, stepT: 1.2, holeD: 0 } },
  ],
  body: `
const T = steps * stepT;
const r = Math.min(4, height / 4);
const card = hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (width / 2 - r), sy * (height / 2 - r), 0], cylinder({ r, h: T, $fn: 32 }))));
const tab = Math.max(holeD + 6, width * 0.2);         // the full-thickness tab holding the ring hole
const x0 = -width / 2 + tab, bw = (width - tab) / steps;
const cuts = [];
for (let j = 1; j < steps; j++) {
  cuts.push(translate([x0 + j * bw, -height / 2 - 1, (steps - j) * stepT], cube([width, height + 2, T])));
}
if (holeD > 0) cuts.push(translate([-width / 2 + tab / 2, 0, -1], cylinder({ d: holeD, h: T + 2, $fn: 24 })));
return cuts.length ? difference(card, ...cuts) : card;
`,
};
