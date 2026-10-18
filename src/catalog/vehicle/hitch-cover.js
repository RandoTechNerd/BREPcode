// A trailer-hitch receiver cover: a hollow square plug that pushes into the
// receiver tube, split on two sides so it springs, behind a rounded cap that
// covers the opening. Printed cap down, so the plug is four straight walls
// and the outside face is the smooth one that touched the bed.

export default {
  id: "hitch-cover",
  category: "vehicle",
  title: "Hitch cover",
  summary: "a push-in cover for a trailer-hitch receiver: a sprung square plug behind a rounded cap.",
  print: "cap down as shown, no supports. PETG or ASA outdoors.",
  names: ["hitch cover", "receiver hitch cover", "trailer hitch cover", "hitch plug", "tow hitch cover", "hitch receiver plug",
    "receiver cover", "hitch receiver cover"],
  nouns: ["cover", "plug", "cap"],
  keywords: ["hitch", "receiver", "trailer", "tow", "truck", "towing"],
  fits: ["hitch"],
  fromSpec: (s) => ({ size: s.dims.d }),
  tips: ["for a 1-1/4 inch receiver", "longer plug", "bigger cap"],
  examples: ["I want a hitch cover", "make me a trailer hitch cover for a 2 inch receiver",
    "hitch plug for a 1 1/4 inch receiver", "receiver hitch cover with a bigger cap"],
  params: {
    size: { default: 50.8, min: 25, max: 70, unit: "mm", label: "receiver opening (inside)", say: ["receiver", "opening", "hitch"] },
    fit: { default: 0.3, min: -0.4, max: 1, unit: "mm", label: "clearance per side (negative = snug; the splits spring)", say: ["fit", "clearance", "snug", "loose"] },
    plugL: { default: 45, min: 20, max: 90, unit: "mm", label: "plug length into the receiver", say: ["long", "deep"], more: ["longer", "deeper"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "plug wall", say: ["wall"] },
    lip: { default: 8, min: 3, max: 25, unit: "mm", label: "cap reach past the opening", say: ["lip", "rim"], more: ["bigger"] },
    capT: { default: 6, min: 3, max: 15, unit: "mm", label: "cap thickness", say: ["thick"] },
  },
  things: [
    { names: ["2 inch hitch cover", "2 inch receiver cover", "class 3 hitch cover"], title: "2 inch hitch cover", spec: "hitch-2" },
    { names: ["1 1/4 hitch cover", "1.25 inch hitch cover", "small hitch cover", "class 2 hitch cover"], title: "1-1/4 inch hitch cover", spec: "hitch-1-25" },
    { names: ["2 1/2 hitch cover", "2.5 inch hitch cover", "class 5 hitch cover"], title: "2-1/2 inch hitch cover", spec: "hitch-2-5" },
  ],
  body: `
const s = size - 2 * fit;                        // the plug's outside
const C = size + 2 * lip;                        // the cap
const rc = Math.min(8, C / 6);
const cap = hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (C / 2 - rc), sy * (C / 2 - rc), 0], cylinder({ r: rc, h: capT, $fn: 32 }))));
const plug = difference(
  translate([-s / 2, -s / 2, capT - 0.01], cube([s, s, plugL + 0.01])),
  translate([-s / 2 + wall, -s / 2 + wall, capT + 2], cube([s - 2 * wall, s - 2 * wall, plugL])),
  // a slit down two opposite sides so the walls spring
  ...[-1, 1].map((sy) => translate([-0.8, sy > 0 ? s / 2 - wall - 1 : -s / 2 - 1, capT + plugL * 0.35], cube([1.6, wall + 2, plugL]))),
);
// a chamfer at the plug's tip finds the receiver
const tip = Math.min(2, wall * 0.6);
const lead = difference(
  translate([-s / 2 - 1, -s / 2 - 1, capT + plugL - tip], cube([s + 2, s + 2, tip + 1])),
  hull(translate([-s / 2, -s / 2, capT + plugL - tip - 0.01], cube([s, s, 0.01])),
    translate([-s / 2 + tip, -s / 2 + tip, capT + plugL], cube([s - 2 * tip, s - 2 * tip, 0.01]))),
);
return difference(union(cap, plug), lead);
`,
};
