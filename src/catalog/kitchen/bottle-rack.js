// A row of cradles that bottles or cans lie in, side by side: one scalloped
// side profile extruded along the bottles. It prints lying on that profile
// (every wall vertical while it prints) and stands up to use. Short ones go in
// pairs, one under the necks and one under the bases; a long one is a fridge
// tray that cans lie in end to end. Bottles stack in the valleys of the row
// below.

export default {
  id: "bottle-rack",
  category: "kitchen",
  title: "Wine rack",
  summary: "a row of cradles that wine bottles, water bottles or cans lie in, stackable in the valleys.",
  print: "lying on its side (the scalloped profile on the bed), no supports. Stand it up to use; short ones go in pairs.",
  names: ["wine rack", "wine bottle rack", "bottle rack", "wine holder", "bottle cradle", "wine bottle cradle", "bottle stacker",
    "wine stacker", "countertop wine rack", "cabinet wine rack", "wine bottle stacker", "bottle organizer"],
  nouns: ["rack", "cradle", "stacker", "organizer"],
  keywords: ["wine", "bottle", "bottles", "soda", "cans", "fridge", "cabinet", "stack", "lying"],
  fits: ["round"],
  primary: "itemD",
  fromSpec: (s) => ({ itemD: s.dims.d }),
  specNote: "each cradle allows a couple of millimetres round it",
  tips: ["4 bottles", "200 mm deep", "deeper cradles"],
  examples: ["I want a wine rack", "make me a wine rack for 4 bottles",
    "a soda can rack for the fridge", "water bottle organizer for my cabinet"],
  params: {
    count: { default: 3, min: 1, max: 8, unit: "count", label: "bottles side by side", say: ["bottle", "bottles", "can", "cans", "slot", "row"] },
    itemD: { default: 76, min: 20, max: 120, unit: "mm", label: "bottle diameter", say: ["diameter", "across", "bottle"], more: ["bigger"], less: ["smaller"] },
    gap: { default: 2, min: 0.5, max: 6, unit: "mm", label: "room around each bottle", say: ["gap", "clearance", "room"] },
    cradle: { default: 24, min: 5, max: 50, unit: "mm", label: "cradle depth", say: ["cradle", "dip"], more: ["deeper"], less: ["shallower"] },
    spacing: { default: 6, min: 0, max: 40, unit: "mm", label: "space between bottles", say: ["spacing", "apart", "between"] },
    baseH: { default: 8, min: 3, max: 30, unit: "mm", label: "base under the cradles", say: ["base", "raise", "lift"] },
    depth: { default: 50, min: 10, max: 250, unit: "mm", label: "depth along the bottles", say: ["deep", "depth", "long", "length"], more: ["longer", "deeper"], less: ["shorter"] },
  },
  things: [
    { names: ["wine bottle holder", "single wine bottle holder", "one bottle rack"], title: "Wine bottle holder", spec: "wine-bottle", params: { count: 1, depth: 40 } },
    { names: ["soda can rack", "soda can organizer", "fridge soda rack", "beer can rack", "drink can rack", "soda can holder for fridge"],
      title: "Fridge can rack", spec: "soda-can", params: { count: 3, depth: 240, cradle: 18, spacing: 4, baseH: 5 } },
    { names: ["water bottle organizer", "water bottle rack", "water bottle holder for cabinet", "tumbler organizer", "water bottle stacker"],
      title: "Water bottle organizer", spec: "water-bottle", params: { count: 3, depth: 120, cradle: 22 } },
    { names: ["fridge wine rack", "fridge bottle rack", "refrigerator wine rack"], title: "Fridge wine rack", spec: "wine-bottle", params: { count: 3, depth: 120, baseH: 5 } },
    { names: ["beer bottle rack", "beer bottle holder", "long neck bottle rack"], title: "Beer bottle rack", spec: "beer-bottle", params: { count: 3, depth: 60 } },
    { names: ["rolling pin holder", "rolling pin rest", "rolling pin stand"], title: "Rolling pin rest", spec: "rolling-pin", params: { count: 1, depth: 30, cradle: 16 } },
    { names: ["soup can rack", "canned food rack", "canned goods rack", "tin can rack"], title: "Pantry can rack", spec: "can-303", params: { count: 3, depth: 230, cradle: 20, spacing: 4, baseH: 5 } },
  ],
  body: `
// side profile: x across the row, y up; extruded along the bottles
const R = itemD / 2 + gap;
const dp = Math.min(cradle, R * 0.9);
const hw = Math.sqrt(R * R - (R - dp) * (R - dp));   // half width of each scallop at its rim
const pitch = Math.max(itemD + spacing, 2 * hw + 2);
const W = count * pitch;
const top = baseH + dp;
const arc = (cx, N = 24) => Array.from({ length: N + 1 }, (_, i) => {
  const t = Math.asin(hw / R) * (1 - 2 * i / N);    // from the left rim, through the bottom, to the right rim
  return [cx - R * Math.sin(t), baseH + R - R * Math.cos(t)];
});
const outline = [[W, 0], [W, top]];
for (let i = count - 1; i >= 0; i--) {
  const cx = (i + 0.5) * pitch;
  outline.push(...arc(cx).reverse());
}
outline.push([0, top], [0, 0]);
return translate([-W / 2, -top / 2, 0], linearExtrude({ h: depth }, polygon(outline)));
`,
};
