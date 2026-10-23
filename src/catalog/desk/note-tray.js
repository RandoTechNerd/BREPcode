// An open holder for a stack of something flat: business cards standing on
// edge, a sticky-note pad, index cards, pens. Its side profile slopes from a
// low front to a taller back, a finger notch in the front wall lets you take
// the top one, and the corners are rounded by trimming the profile with a
// hull of four corner posts. Prints upright, open side up.

export default {
  id: "note-tray",
  category: "desk",
  title: "Business card holder",
  summary: "an open holder for business cards, sticky notes or index cards, low at the front with a finger notch.",
  print: "upright as shown, no supports.",
  names: ["business card holder", "business card stand", "business card display", "card holder for desk",
    "desk card holder", "card display holder", "business card tray"],
  nouns: ["holder", "tray", "stand", "dispenser"],
  keywords: ["card", "cards", "note", "notes", "sticky", "desk", "office", "pad"],
  fits: ["card", "paper"],
  fromSpec(s) {
    if (s.kind === "card") return { itemW: s.dims.w + 3, backH: Math.round(s.dims.h * 0.65) };
    return { itemW: s.dims.w + 2, itemD: s.dims.h + 2 };
  },
  tips: ["for sticky notes", "40 mm deep", "taller back", "no notch"],
  examples: ["I want a business card holder", "sticky note holder for 3x3 post it notes",
    "make me an index card holder", "a pen tray for my desk"],
  params: {
    itemW: { default: 92, min: 30, max: 220, unit: "mm", label: "inside width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    itemD: { default: 30, min: 10, max: 200, unit: "mm", label: "inside depth front to back", say: ["deep", "depth", "stack"], more: ["deeper"], less: ["shallower"] },
    frontH: { default: 18, min: 5, max: 80, unit: "mm", label: "front wall height", say: ["front"] },
    backH: { default: 35, min: 5, max: 120, unit: "mm", label: "back wall height", say: ["back", "tall", "high", "height"], more: ["taller", "higher"], less: ["lower", "shorter"] },
    wall: { default: 2.4, min: 1.6, max: 6, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2.5, min: 1.6, max: 6, unit: "mm", label: "floor thickness", say: ["floor"] },
    notchW: { default: 28, min: 0, max: 80, unit: "mm", label: "finger notch width (0 = none)", say: ["notch", "finger"] },
    cornerR: { default: 4, min: 0.5, max: 15, unit: "mm", label: "corner radius", say: ["corner", "round"] },
  },
  things: [
    { names: ["sticky note holder", "post it holder", "post it note holder", "sticky note tray", "post it tray", "post it note dispenser"],
      title: "Sticky note holder", spec: "paper-post-it-3x3", params: { frontH: 14, backH: 22, notchW: 30 } },
    { names: ["memo pad holder", "notepad holder", "note pad holder", "memo holder", "note cube holder"], title: "Memo pad holder", spec: "paper-memo-pad",
      params: { frontH: 16, backH: 30, notchW: 34 } },
    { names: ["index card holder", "3x5 card holder", "index card tray", "flash card holder", "flashcard holder"], title: "Index card holder",
      spec: "paper-index-card", params: { frontH: 15, backH: 25, notchW: 40 } },
    { names: ["4x6 index card holder", "4x6 card tray"], title: "4 x 6 index card holder", spec: "paper-index-card-4x6", params: { frontH: 15, backH: 25, notchW: 40 } },
    { names: ["pen tray", "pencil tray", "desk pen tray", "pen rest tray"], title: "Pen tray",
      params: { itemW: 190, itemD: 55, frontH: 14, backH: 14, notchW: 0, cornerR: 10 } },
    { names: ["receipt holder", "receipt organizer", "coupon holder"], title: "Receipt holder",
      params: { itemW: 85, itemD: 35, frontH: 20, backH: 60 } },
    { names: ["european business card holder", "eu business card holder"], title: "Business card holder (EU cards)", spec: "card-business-eu" },
    { names: ["large sticky note holder", "3x5 sticky note holder", "big post it holder"], title: "Large sticky note holder", spec: "paper-post-it-3x5",
      params: { frontH: 14, backH: 22, notchW: 36 } },
  ],
  body: `
const W = itemW + 2 * wall, D = itemD + 2 * wall, H = Math.max(frontH, backH);
const r = Math.max(0.5, Math.min(cornerR, W / 2 - 0.5, D / 2 - 0.5));
// a rounded rectangle w x d, h tall, from (x, y, z)
const rounded = (x, y, z, w, d, h, rr) => hull(...[[rr, rr], [w - rr, rr], [rr, d - rr], [w - rr, d - rr]].map(([cx, cy]) =>
  translate([x + cx, y + cy, z], cylinder({ r: rr, h, $fn: 32 }))));
// side profile (x front to back, y up) pushed across the width
const side = translate([-1, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0],
  linearExtrude({ h: W + 2 }, polygon([[0, 0], [D, 0], [D, backH], [0, frontH]])))));
const outer = intersection(rounded(0, 0, 0, W, D, H + 1, r), side);
const cuts = [rounded(wall, wall, floor, itemW, itemD, H + 2, Math.max(0.4, r - wall))];
const nw = Math.min(notchW, itemW - 4);
if (nw > 0) {
  const zb = Math.max(floor + 1.5, frontH * 0.3) + nw / 2;
  cuts.push(translate([W / 2 - nw / 2, -1, zb], cube([nw, wall + 2, H + 2])));
  cuts.push(translate([W / 2, wall + 1, zb], rotate([90, 0, 0], cylinder({ r: nw / 2, h: wall + 2, $fn: 40 }))));
}
return translate([-W / 2, -D / 2, 0], difference(outer, ...cuts));
`,
};
