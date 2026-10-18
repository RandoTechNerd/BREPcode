// A sock aid: a thin, springy sheet that curls into a trough when a sock is
// stretched over it, so a sock can be put on without bending to the foot.
// Slots near the top take two lengths of cord or webbing to pull it up with.
// A flat outline printed thin, in PETG or PP so it flexes.

export default {
  id: "sock-aid",
  category: "access",
  title: "Sock aid",
  summary: "a thin flexible sheet that curls round inside a sock, with slots for pull cords, to put socks on without bending.",
  print: "flat as shown, no supports. Print it in PETG or PP so it bends; thread cord or webbing through the slots.",
  names: ["sock aid", "sock helper", "stocking aid", "sock assist", "compression sock aid", "sock slider", "sock puller",
    "sock aid for seniors", "sock donner"],
  nouns: ["aid", "helper"],
  keywords: ["sock", "socks", "stocking", "dressing", "bend", "hip", "knee"],
  tips: ["wider", "thinner so it bends more", "for compression socks"],
  examples: ["I want a sock aid", "a sock helper for after hip surgery",
    "stocking aid 160mm wide", "make me a compression sock aid"],
  params: {
    topW: { default: 150, min: 90, max: 220, unit: "mm", label: "width at the top", say: ["wide", "width", "top"], more: ["wider"] },
    bottomW: { default: 105, min: 60, max: 180, unit: "mm", label: "width at the toe end", say: ["bottom", "toe"] },
    length: { default: 175, min: 110, max: 240, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    thick: { default: 1.6, min: 0.8, max: 3, unit: "mm", label: "sheet thickness", say: ["thick", "thickness"], more: ["stiffer"], less: ["thinner", "softer"] },
    slotL: { default: 22, min: 10, max: 40, unit: "mm", label: "cord slot length", say: ["slot", "cord", "strap"] },
  },
  things: [
    { names: ["compression stocking aid", "compression sock helper", "support stocking aid"], title: "Compression stocking aid",
      params: { topW: 165, bottomW: 115, length: 190, thick: 2 } },
    { names: ["small sock aid", "kids sock aid", "child sock aid"], title: "Small sock aid", params: { topW: 120, bottomW: 85, length: 140 } },
  ],
  body: `
// flat outline: x across, y from the toe end (y = 0) to the top
const r = Math.min(14, bottomW / 5);
const sheet = hull(...[[-1, 0], [1, 0]].map(([s]) => translate([s * (bottomW / 2 - r), r, 0], cylinder({ r, h: thick, $fn: 24 }))),
  ...[-1, 1].map((s) => translate([s * (topW / 2 - r), length - r, 0], cylinder({ r, h: thick, $fn: 24 }))));
// two cord slots near the top corners, running along the edge
const sw = 5, sy = length - r - slotL - 4;
const slots = [-1, 1].map((s) => hull(...[0, slotL].map((dy) =>
  translate([s * (topW / 2 - r - 6 - (bottomW < topW ? (topW - bottomW) / 2 * (1 - (sy + dy) / length) : 0)), sy + dy, -1], cylinder({ r: sw / 2, h: thick + 2, $fn: 16 })))));
return translate([0, -length / 2, 0], difference(sheet, ...slots));
`,
};
