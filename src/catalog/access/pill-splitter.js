// A pill-splitting guide: a block with a V groove that cradles the tablet
// and a thin slot straight across it that guides a knife or razor through
// the middle. The groove and the slot are both open on top, so it prints
// as it sits.

export default {
  id: "pill-splitter",
  category: "access",
  title: "Pill splitter",
  summary: "a block with a V groove that cradles a tablet and a slot that guides a blade through its middle.",
  print: "upright as shown, no supports. Use a single-edge razor or a thin knife through the slot.",
  names: ["pill splitter", "pill cutter", "tablet splitter", "tablet cutter", "pill cutting guide", "pill splitter tray",
    "pill halver", "pill cutter guide", "tablet cutting guide"],
  nouns: ["splitter", "cutter", "halver"],
  keywords: ["pill", "pills", "tablet", "tablets", "medicine", "half", "split", "cut"],
  tips: ["for big pills", "small pills", "wider slot"],
  examples: ["I want a pill splitter", "a pill cutter for big pills",
    "tablet splitter for 12mm tablets", "make me a pill cutting guide"],
  params: {
    pillD: { default: 9, min: 3, max: 20, unit: "mm", label: "tablet width", say: ["pill", "tablet", "wide", "width", "across"], more: ["bigger"], less: ["smaller"] },
    slotW: { default: 1, min: 0.5, max: 2.5, unit: "mm", label: "blade slot width", say: ["slot", "blade"] },
    length: { default: 60, min: 30, max: 120, unit: "mm", label: "length", say: ["long", "length"] },
    width: { default: 40, min: 20, max: 80, unit: "mm", label: "width", say: ["block"] },
    height: { default: 15, min: 8, max: 30, unit: "mm", label: "height", say: ["tall", "high", "height"] },
  },
  things: [
    { names: ["large pill splitter", "big pill cutter", "pill splitter for large pills"], title: "Large pill splitter",
      params: { pillD: 14, height: 18, width: 50 } },
    { names: ["small pill splitter", "tiny pill cutter", "pill splitter for small pills"], title: "Small pill splitter",
      params: { pillD: 6, height: 12, width: 34 } },
  ],
  body: `
// end profile across the groove: x runs across, y runs up; pushed along the length
const hw = pillD / 2 + 0.8;                      // the groove's half width at the top (45 degree sides)
const H = Math.max(height, hw + 4);
const W = Math.max(width, 2 * hw + 10);
const prof = [[0, 0], [W, 0], [W, H], [W / 2 + hw, H], [W / 2, H - hw], [W / 2 - hw, H], [0, H]];
const block = rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: length }, polygon(prof))));
// the blade slot, straight across the middle and down past the groove's bottom
const bladeSlot = translate([length / 2 - slotW / 2, -1, H - hw - 2], cube([slotW, W + 2, hw + 3]));
return translate([-length / 2, -W / 2, 0], difference(block, bladeSlot));
`,
};
