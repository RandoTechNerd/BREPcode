// Interlocking drawer dividers: flat strips with slots cut halfway down,
// the egg-crate kind. Every strip is the same, so half of them go in slots
// up and half slots down, and they lock into a grid at any spacing you cut
// them for. Printed flat, so each one is a few minutes and dead straight.

export default {
  id: "drawer-divider",
  category: "storage",
  title: "Drawer divider strips",
  summary: "flat slotted strips that lock together into an egg-crate grid inside a drawer.",
  print: "flat as shown, no supports. Turn every other strip over and slot them together.",
  names: ["drawer divider", "drawer dividers", "drawer insert", "interlocking divider", "drawer separator",
    "divider strip", "slotted divider", "egg crate divider", "drawer grid", "adjustable drawer divider",
    "drawer partition"],
  nouns: ["divider", "separator", "partition"],
  keywords: ["drawer", "grid", "slot", "interlocking", "sock", "underwear"],
  tips: ["220 mm long", "4 slots", "60 mm tall"],
  examples: ["make me a drawer divider", "drawer dividers 250 mm long with 4 slots",
    "egg crate divider 60mm tall", "interlocking divider strips for a sock drawer"],
  params: {
    length: { default: 200, min: 40, max: 250, unit: "mm", label: "strip length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    height: { default: 50, min: 15, max: 120, unit: "mm", label: "strip height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter", "lower"] },
    stripT: { default: 2, min: 1.2, max: 4, unit: "mm", label: "strip thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"] },
    slots: { default: 3, min: 0, max: 10, unit: "count", label: "slots per strip", say: ["slot", "section", "compartment"] },
    strips: { default: 2, min: 1, max: 6, unit: "count", label: "strips printed at once", say: ["strip", "piece", "divider"] },
    fit: { default: 0.3, min: 0.1, max: 0.8, unit: "mm", label: "slot clearance per side", say: ["fit", "clearance", "tolerance"] },
  },
  things: [
    { names: ["sock drawer divider", "sock drawer organizer", "underwear drawer divider"], title: "Sock drawer divider",
      params: { length: 240, height: 70, slots: 4, strips: 3 } },
    { names: ["junk drawer divider", "small drawer divider"], title: "Junk drawer divider",
      params: { length: 160, height: 40, slots: 3 } },
    { names: ["shallow drawer divider", "tool drawer divider"], title: "Shallow drawer divider",
      params: { length: 220, height: 25, slots: 5, strips: 4 } },
    { names: ["shipping box divider", "cardboard box divider", "box insert divider", "moving box divider"], title: "Box divider",
      params: { length: 220, height: 90, stripT: 2.4, slots: 2, strips: 2 } },
    { names: ["deep drawer divider", "dresser drawer divider", "clothes drawer divider"], title: "Deep drawer divider",
      params: { length: 250, height: 110, stripT: 2.4, slots: 3 } },
  ],
  body: `
// each strip drawn in x (length) and y (height), lying flat, stripT thick
const slotW = stripT + 2 * fit;
const c = Math.min(3, height / 6);                   // chamfered top corners
const outline = [[0, 0], [length, 0], [length, height - c], [length - c, height], [c, height], [0, height - c]];
const one = linearExtrude({ h: stripT }, polygon(outline));
const cuts = Array.from({ length: slots }, (_, i) => {
  const x = (i + 1) * length / (slots + 1);
  // a slot from the top edge down to just past halfway, with a lead-in
  return linearExtrude({ h: stripT + 2 }, polygon([
    [x - slotW / 2, height / 2 - 0.2], [x + slotW / 2, height / 2 - 0.2], [x + slotW / 2, height - 1.2],
    [x + slotW / 2 + 1, height + 1], [x - slotW / 2 - 1, height + 1], [x - slotW / 2, height - 1.2]]));
}).map((s) => translate([0, 0, -1], s));
const strip = cuts.length ? difference(one, ...cuts) : one;
const gap = Math.max(6, 3 * stripT);
const all = Array.from({ length: strips }, (_, i) => translate([0, i * (height + gap), 0], strip));
return translate([-length / 2, -(strips * (height + gap) - gap) / 2, 0], strips > 1 ? union(...all) : strip);
`,
};
