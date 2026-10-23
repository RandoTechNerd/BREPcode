// A bike tire lever: a thin, lipped tip that slides under the bead and lifts
// it over the rim, and a notch at the other end that hooks a spoke so the
// lever stays put while the next one goes in. The side view is one profile,
// printed lying on its side, so every layer is a whole lever and the bending
// load never pulls layers apart.

export default {
  id: "tire-lever",
  category: "vehicle",
  title: "Tire lever",
  summary: "a bike tire lever with a lipped tip for the bead and a spoke hook at the other end.",
  print: "on its side as shown, no supports. PETG or nylon: PLA snaps. Print two or three.",
  names: ["tire lever", "tyre lever", "bike tire lever", "bike tyre lever", "bicycle tire lever", "tire spoon",
    "tire changing lever", "tire levers"],
  nouns: ["lever", "spoon"],
  keywords: ["bike", "bicycle", "tire", "tyre", "flat", "puncture", "rim", "tube", "repair"],
  tips: ["thicker", "120 mm long", "no spoke hook"],
  examples: ["I want a tire lever", "make me a bike tyre lever 120mm long",
    "a stronger tire lever for mtb tires", "tire spoon for my road bike"],
  params: {
    length: { default: 110, min: 70, max: 180, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 18, min: 10, max: 30, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    thick: { default: 5, min: 3, max: 8, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "stronger", "stiffer"], less: ["thinner"] },
    tipT: { default: 1.6, min: 1, max: 3, unit: "mm", label: "tip thickness", say: ["tip"] },
    hookDrop: { default: 7, min: 0, max: 12, unit: "mm", label: "spoke hook depth (0 = none)", say: ["hook", "spoke"] },
  },
  things: [
    { names: ["mtb tire lever", "mountain bike tire lever", "strong tire lever"], title: "MTB tire lever", params: { thick: 6.5, width: 22, length: 120 } },
    { names: ["road tire lever", "road bike tire lever", "slim tire lever"], title: "Road tire lever", params: { thick: 4.5, width: 16, tipT: 1.3 } },
    { names: ["mini tire lever", "pocket tire lever", "small tire lever"], title: "Mini tire lever", params: { length: 75, hookDrop: 0, width: 15 } },
  ],
  body: `
// side profile: x along the lever from the tip, y through its thickness (bead side up)
const L = length;
const ramp = Math.min(30, L / 3);                // the tip thickens to full over this
// the lip at the very tip, 1.3 mm proud, catches the bead
const tip = [[3, tipT], [2.2, tipT + 1.3], [0, tipT + 1.3]];
const hd = hookDrop;
const bottom = hd > 0
  ? [[0, 0], [L - 18 - hd, 0], [L - 18, -hd], [L - 11, -hd], [L - 11, 1], [L - 7, 1], [L - 7, -hd], [L, -hd]]
  : [[0, 0], [L, 0]];
const outline = [...bottom, [L, thick], [ramp, thick], ...tip];
return translate([-L / 2, 0, 0], linearExtrude({ h: width }, polygon(outline)));
`,
};
