// A bin, cup, shelf or divided tray for IKEA Skadis pegboard. Printed
// upright, open side up. The tabs on the back go through the 5 x 15 mm
// slots: each is a 4.5 mm wide tab with a 45 degree pointed underside (so it
// prints with no support) that turns UP behind the board, the mirror image
// of IKEA's own hooks, which turn down and would start in mid-air printed
// this way up. A shorter straight tab one Skadis row (40 mm) lower rests in
// the slot below and stops the bin swinging. To hang it, tilt the top toward
// the board, slip the tabs in, and let it drop.

export default {
  id: "skadis-bin",
  category: "wall",
  title: "Skadis bin",
  summary: "a bin, cup, shelf or divided tray that hangs on IKEA Skadis pegboard by its own tabs.",
  print: "upright as shown, no supports. PETG if it will carry tools. Tilt the top toward the board to slip the tabs in, then let it drop onto the slots below.",
  names: ["skadis bin", "skadis box", "skadis container", "skadis basket", "skadis storage bin", "skadis holder",
    "skadis organizer", "skadis storage", "skadis accessory", "ikea pegboard bin", "ikea pegboard shelf", "ikea pegboard cup"],
  nouns: ["bin", "cup", "basket", "tray", "box", "shelf", "container", "holder", "pot"],
  keywords: ["skadis", "ikea", "pegboard", "board", "wall", "desk", "workshop", "craft"],
  fits: ["skadis"],
  fromSpec: () => ({}),
  triple: ["width", "depth", "height"],
  tips: ["a round cup", "100 x 60 x 50", "3 compartments", "a skadis shelf"],
  examples: ["I want a skadis bin", "make me a skadis cup for pens", "a bin for my skadis",
    "a shelf for my skadis board", "skadis bin 100 x 60 x 50 with 3 compartments", "an ikea pegboard shelf"],
  params: {
    width: { default: 80, min: 30, max: 220, unit: "mm", label: "width (or cup diameter)", say: ["wide", "width", "across", "diameter"], more: ["wider"], less: ["narrower"] },
    depth: { default: 50, min: 20, max: 150, unit: "mm", label: "depth out from the board", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    height: { default: 60, min: 12, max: 150, unit: "mm", label: "bin height (a shelf's front lip)", say: ["tall", "high", "height"], more: ["taller"], less: ["lower", "shorter"] },
    backH: { default: 0, min: 0, max: 100, unit: "mm", label: "back plate above the rim", say: ["back", "plate"] },
    wall: { default: 1.8, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "thicker"] },
    floor: { default: 2, min: 1.2, max: 5, unit: "mm", label: "floor thickness", say: ["floor"] },
    cornerR: { default: 6, min: 1, max: 20, unit: "mm", label: "front corner radius", say: ["corner", "round"], role: "round" },
    sections: { default: 1, min: 1, max: 8, unit: "count", label: "compartments across (box only)", say: ["compartment", "section", "divider", "slot"] },
    shape: { default: "box", unit: "choice", choices: ["box", "cup"], label: "shape",
      words: { cup: ["cup", "round", "cylinder", "tube"], box: ["box", "square", "bin", "tray"] } },
  },
  things: [
    { names: ["skadis cup", "skadis pen cup", "skadis pencil cup", "skadis tool cup", "skadis pen holder", "skadis brush cup", "skadis pencil holder"],
      title: "Skadis cup", params: { shape: "cup", width: 60, depth: 60, height: 80 } },
    { names: ["skadis shelf", "skadis tray", "skadis ledge", "skadis board shelf", "shelf for skadis"], title: "Skadis shelf",
      params: { width: 150, depth: 70, height: 18, backH: 45 } },
    { names: ["skadis phone shelf", "skadis phone holder", "skadis phone stand", "skadis phone tray"], title: "Skadis phone shelf",
      params: { width: 90, depth: 30, height: 25, backH: 60 } },
    { names: ["small skadis bin", "skadis parts bin", "mini skadis bin", "skadis small parts bin", "skadis screw bin"], title: "Small Skadis bin",
      params: { width: 55, depth: 40, height: 40, cornerR: 4 } },
    { names: ["large skadis bin", "big skadis bin", "deep skadis bin", "skadis big bin"], title: "Large Skadis bin",
      params: { width: 150, depth: 90, height: 90, wall: 2.2 } },
    { names: ["skadis divided bin", "skadis sorting bin", "skadis bin with compartments", "skadis compartment bin", "skadis sorting tray"],
      title: "Divided Skadis bin", params: { width: 150, depth: 60, height: 50, sections: 3 } },
    { names: ["skadis remote holder", "skadis remote control holder", "skadis controller holder"], title: "Skadis remote holder",
      params: { width: 70, depth: 35, height: 70, sections: 2 } },
  ],
  body: `
// x across, y out from the board (the board's face is y = 0), z up
const tB = 5, tabW = 4.5, tabH = 10;                 // a 5 mm board; a tab through its 5 x 15 mm slot
const upT = 4, rise = 7;                             // the turn-up behind the board
const backT = Math.max(3, wall);
// the plate rises above the rim when a low bin or shelf could not carry the tab itself
const top = Math.max(height + backH, tabH + tabW / 2 + 4);
const zU = top - tabH - 2;                           // the hooking tabs
const zL = zU - 40;                                  // the resting tabs, one Skadis row down
// slots at one height are 40 mm apart; two tabs as far apart as the width allows,
// plus one in the middle when that is a slot too (an even number of 40s between)
const span = Math.floor((width - 2 * wall - tabW - 2) / 40);
const xs = span >= 1 ? [-span * 20, span * 20, ...(span >= 4 && span % 2 === 0 ? [0] : [])] : [0];
// a tab's section: tabW wide, pointed underneath at 45 degrees
const section = (h) => polygon([[-tabW / 2, 0], [0, -tabW / 2], [tabW / 2, 0], [tabW / 2, h], [-tabW / 2, h]]);
// pushed back through the board (-y) from inside the plate
const tab = (x, z, h, len) => translate([x, 0.5, z], rotate([90, 0, 0], linearExtrude({ h: len + 0.5 }, section(h))));
const reach = tB + 0.4 + upT;
const tabs = xs.flatMap((x) => [
  tab(x, zU, tabH, reach),
  translate([x - tabW / 2, -reach, zU], cube([tabW, upT, tabH + rise])),      // turns up behind the board
  ...(zL >= tabW / 2 + 1 ? [tab(x, zL, 6, tB - 0.6)] : []),
]);

let bin;
if (shape === "cup") {
  const R = width / 2;
  const outer = union(
    translate([0, R, 0], cylinder({ r: R, h: height, $fn: 64 })),
    translate([-R, 0, 0], cube([2 * R, backT, top])),
  );
  bin = difference(outer, translate([0, R, floor], cylinder({ r: R - wall, h: top, $fn: 64 })));
} else {
  const rr = Math.max(0.6, Math.min(cornerR, width / 2 - 1, depth / 2 - 1));
  // a flat back against the board, rounded front corners
  const box = (w, d, y0, z0, h, r) => hull(
    translate([-w / 2, y0, z0], cube([w, 0.1, h])),
    translate([-w / 2 + r, y0 + d - r, z0], cylinder({ r, h, $fn: 32 })),
    translate([w / 2 - r, y0 + d - r, z0], cylinder({ r, h, $fn: 32 })),
  );
  const outer = top > height + 0.01
    ? union(box(width, depth, 0, 0, height, rr), translate([-width / 2, 0, 0], cube([width, backT, top])))
    : box(width, depth, 0, 0, height, rr);
  bin = difference(outer, box(width - 2 * wall, depth - backT - wall, backT, floor, top, Math.max(0.5, rr - wall)));
  if (sections > 1) {
    // thin walls from the back plate to the front wall, splitting the width evenly
    const inner = width - 2 * wall, run = depth - backT - wall;
    const divs = Array.from({ length: sections - 1 }, (_, i) =>
      translate([-inner / 2 + inner * (i + 1) / sections - wall / 2, backT - 0.01, floor - 0.01], cube([wall, run + 0.02, height - floor + 0.01])));
    bin = union(bin, ...divs);
  }
}
return union(bin, ...tabs);
`,
};
