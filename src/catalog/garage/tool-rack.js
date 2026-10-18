// A wall rack for hand tools: a shelf with a row of round holes (screwdrivers,
// nut drivers, upside-down glue bottles) or open-front slots (pliers,
// wrenches, chisels, clamps, a drill by its grip). One side profile, a back
// plate with a wedge under the shelf, extruded along the wall. The wedge
// slopes a little steeper than 45 degrees, so it prints upright as mounted
// with no support, and it is also the brace that takes the weight.

export default {
  id: "tool-rack",
  category: "garage",
  title: "Tool rack",
  summary: "a wall shelf with a row of holes or open slots that hangs screwdrivers, pliers, wrenches or a drill.",
  print: "upright as shown (back plate on the bed edge, wedge under the shelf), no supports. PETG for heavy tools.",
  names: ["tool rack", "hand tool rack", "wall tool rack", "garage tool rack", "workshop tool rack",
    "tool wall rack", "tool hanging rack", "tool shelf rack"],
  nouns: ["rack", "organizer", "holder", "shelf"],
  keywords: ["garage", "workshop", "workbench", "tool", "wall", "shed"],
  tips: ["8 holes", "slots instead of holes", "12 mm holes", "40 mm deep"],
  examples: ["I want a tool rack for the garage", "make me a screwdriver rack with 10 holes",
    "a plier rack with slots", "wall tool rack 6 slots 40mm deep"],
  params: {
    count: { default: 8, min: 1, max: 20, unit: "count", label: "how many tools", say: ["hole", "slot", "tool", "screwdriver", "plier", "wrench", "spot"] },
    form: { default: "round", unit: "choice", choices: ["round", "slot"], label: "round holes or open-front slots",
      words: { slot: ["slot", "slots", "slotted", "open front", "open slots"], round: ["round holes", "holes", "round"] } },
    holeD: { default: 10, min: 3, max: 60, unit: "mm", label: "hole or slot width", say: ["hole", "slot", "shaft", "opening"], more: ["bigger"], less: ["smaller"] },
    pitch: { default: 28, min: 8, max: 140, unit: "mm", label: "spacing between tools", say: ["spacing", "apart", "pitch", "gap"], more: ["roomier"], less: ["tighter"] },
    depth: { default: 30, min: 12, max: 130, unit: "mm", label: "shelf depth out from the wall", say: ["deep", "depth", "out"], more: ["deeper"], less: ["shallower"] },
    shelfT: { default: 6, min: 3, max: 20, unit: "mm", label: "shelf front thickness", say: ["thick"] },
    above: { default: 18, min: 12, max: 60, unit: "mm", label: "back plate above the shelf (for screws)", say: ["plate", "above"] },
    wall: { default: 5, min: 3, max: 10, unit: "mm", label: "back plate thickness", say: ["wall", "back"], more: ["stronger", "sturdier"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
  },
  things: [
    { names: ["screwdriver rack", "screwdriver holder", "screwdriver organizer", "screwdriver wall rack", "screwdriver hanger"],
      title: "Screwdriver rack", params: { form: "round", holeD: 10, pitch: 30, count: 8 } },
    { names: ["nut driver rack", "nut driver holder", "hex driver rack"], title: "Nut driver rack", params: { form: "round", holeD: 13, pitch: 30, count: 8 } },
    { names: ["file rack", "metal file rack", "rasp holder", "rasp rack"], title: "File rack", params: { form: "round", holeD: 12, pitch: 34, count: 6 } },
    { names: ["plier rack", "plier holder", "pliers rack", "pliers holder", "plier organizer", "plier hanger"],
      title: "Plier rack", params: { form: "slot", holeD: 14, pitch: 36, count: 6, depth: 40 } },
    { names: ["wrench rack", "wrench holder", "wrench organizer", "spanner rack", "spanner holder", "wrench hanger"],
      title: "Wrench rack", params: { form: "slot", holeD: 10, pitch: 28, count: 10, depth: 32 } },
    { names: ["chisel rack", "chisel holder", "chisel storage"], title: "Chisel rack", params: { form: "slot", holeD: 8, pitch: 36, count: 6, depth: 50 } },
    { names: ["hammer holder", "hammer rack", "hammer hanger", "mallet holder"], title: "Hammer holder", params: { form: "slot", holeD: 34, pitch: 70, count: 3, depth: 60, shelfT: 8 } },
    { names: ["drill holder", "drill rack", "cordless drill holder", "drill wall mount", "drill hanger", "power drill holder"],
      title: "Drill holder", params: { form: "slot", holeD: 56, pitch: 120, count: 2, depth: 90, shelfT: 10, wall: 6, above: 22 } },
    { names: ["impact driver holder", "impact driver rack"], title: "Impact driver holder", params: { form: "slot", holeD: 50, pitch: 105, count: 2, depth: 80, shelfT: 10, wall: 6 } },
    { names: ["clamp rack", "clamp holder", "bar clamp rack", "f clamp holder", "clamp organizer"], title: "Clamp rack",
      params: { form: "slot", holeD: 12, pitch: 45, count: 6, depth: 60, shelfT: 8 } },
    { names: ["pry bar holder", "crowbar holder"], title: "Pry bar holder", params: { form: "slot", holeD: 18, pitch: 40, count: 4, depth: 40 } },
    { names: ["glue bottle holder", "glue bottle rack", "upside down glue holder"], title: "Glue bottle holder",
      params: { form: "round", holeD: 24, pitch: 62, count: 3, depth: 34 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; extruded along the wall
const D = Math.max(depth, holeD + 6);           // room for the hole with plastic all round
const step = Math.max(pitch, holeD + 4);
const top = shelfT + D * 1.15;                  // shelf top; the wedge rises 1.15 per 1 out, steeper than 45 degrees
const peak = top + above;                       // top of the back plate
const L = Math.max(40, count * step);
const outline = [[0, 0], [wall, 0], [wall + D, D * 1.15], [wall + D, top], [wall, top], [wall, peak], [0, peak]];
const bar = translate([0, L / 2, 0], rotate([90, 0, 0], linearExtrude({ h: L }, polygon(outline))));

const ys = Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
const r = holeD / 2;
const cuts = ys.map((y) => form === "slot"
  // open to the front, round at the back
  ? hull(
      translate([wall + 3 + r, y, -1], cylinder({ r, h: top + 2, $fn: 40 })),
      translate([wall + D + 1, y - r, -1], cube([0.01, holeD, top + 2])))
  : translate([wall + D / 2, y, -1], cylinder({ r, h: top + 2, $fn: 40 })));

// countersunk screw holes through the plate above the shelf
const k = screwD / 2;
const sy = L / 2 - 10;
const screwYs = L > 220 ? [-sy, 0, sy] : [-sy, sy];
for (const y of screwYs) {
  cuts.push(translate([-1, y, top + above / 2], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))));
  cuts.push(translate([wall - k + 0.02, y, top + above / 2], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))));
}
return translate([-(wall + D) / 2, 0, 0], difference(bar, ...cuts));
`,
};
