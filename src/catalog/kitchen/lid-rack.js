// A rack of upright dividers on a base plate, for anything flat that lives on
// its edge: pot lids, cutting boards, baking sheets, plates, container lids.
// Each divider is a hull of a full-depth foot and a shorter top, so its ends
// lean in as they rise (no overhang) and the top corners are cut back where
// a hand reaches in.

export default {
  id: "lid-rack",
  category: "kitchen",
  title: "Pot lid organizer",
  summary: "upright dividers on a base that stand pot lids, cutting boards, trays or plates on edge.",
  print: "upright as shown, no supports.",
  names: ["pot lid organizer", "lid organizer", "pot lid rack", "lid rack", "pot lid holder", "lid holder", "pot lid stand",
    "pan lid organizer", "cookware lid organizer", "lid divider", "lid stand"],
  nouns: ["organizer", "rack", "stand", "divider"],
  keywords: ["lid", "lids", "pot", "pan", "cabinet", "cupboard", "kitchen", "upright", "edge"],
  tips: ["6 slots", "50 mm apart", "taller dividers"],
  examples: ["I want a pot lid organizer", "make me a lid rack with 6 slots",
    "pot lid holder with slots 50 mm apart", "a lid organizer for my cabinet"],
  params: {
    slots: { default: 5, min: 1, max: 12, unit: "count", label: "slots", say: ["slot", "lid", "board", "space", "section"] },
    slotW: { default: 40, min: 6, max: 90, unit: "mm", label: "gap between dividers", say: ["gap", "apart", "spacing", "slot"], more: ["wider"], less: ["narrower", "tighter"] },
    finH: { default: 120, min: 30, max: 240, unit: "mm", label: "divider height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    depth: { default: 150, min: 40, max: 250, unit: "mm", label: "depth front to back", say: ["deep", "depth", "long"], more: ["deeper", "longer"], less: ["shallower"] },
    finT: { default: 4, min: 2, max: 8, unit: "mm", label: "divider thickness", say: ["thick", "thickness", "divider"], more: ["thicker", "stronger"] },
    baseT: { default: 4, min: 2, max: 10, unit: "mm", label: "base thickness", say: ["base"] },
  },
  things: [
    { names: ["cutting board stand", "cutting board rack", "cutting board holder", "chopping board stand", "chopping board holder", "cutting board organizer"],
      title: "Cutting board stand", params: { slots: 3, slotW: 32, finH: 110, depth: 130, finT: 5 } },
    { names: ["baking sheet rack", "baking sheet organizer", "sheet pan organizer", "baking tray rack", "tray organizer", "cookie sheet organizer"],
      title: "Baking sheet rack", params: { slots: 5, slotW: 26, finH: 160, depth: 200, finT: 4 } },
    { names: ["plate rack", "plate organizer", "dish rack", "upright plate rack", "cabinet plate rack"],
      title: "Plate rack", params: { slots: 7, slotW: 22, finH: 90, depth: 120, finT: 3.5 } },
    { names: ["tupperware lid organizer", "container lid organizer", "food storage lid organizer", "meal prep lid organizer"],
      title: "Container lid organizer", params: { slots: 7, slotW: 16, finH: 90, depth: 130, finT: 3 } },
    { names: ["jar lid organizer", "mason jar lid organizer", "canning lid organizer", "jar lid rack"],
      title: "Jar lid organizer", params: { slots: 8, slotW: 12, finH: 60, depth: 90, finT: 3 } },
    { names: ["pan organizer", "frying pan organizer", "skillet organizer", "pan rack", "pan stand"],
      title: "Pan organizer", params: { slots: 3, slotW: 70, finH: 180, depth: 220, finT: 6, baseT: 5 } },
    { names: ["cookbook organizer", "cook book rack", "recipe book rack"], title: "Cookbook rack", params: { slots: 3, slotW: 45, finH: 150, depth: 160 } },
  ],
  body: `
const W = slots * slotW + (slots + 1) * finT;
const r = Math.max(1, Math.min(8, depth / 4, W / 4));
const base = hull(...[[r, r], [W - r, r], [r, depth - r], [W - r, depth - r]].map(([x, y]) =>
  translate([x - W / 2, y - depth / 2, 0], cylinder({ r, h: baseT, $fn: 32 }))));
// each divider: a full-depth foot and a top 60% as deep, hulled into a trapezoid
const topD = depth * 0.6;
const dividers = Array.from({ length: slots + 1 }, (_, i) => {
  const x = -W / 2 + i * (slotW + finT);
  return hull(
    translate([x, -depth / 2, baseT - 0.01], cube([finT, depth, 1])),
    translate([x, -topD / 2, baseT + finH - 1], cube([finT, topD, 1])),
  );
});
return union(base, ...dividers);
`,
};
