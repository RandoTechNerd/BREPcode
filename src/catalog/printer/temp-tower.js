// A temperature tower: a stack of identical blocks, one per temperature
// (or retraction) setting, changed by the slicer as the layers climb. Each
// block has a window bridged across the top and a 45 degree overhang on one
// side, and a shallow V groove marks where one block ends. The window
// bridges are meant, so their area is declared (bridgeArea).

export default {
  id: "temp-tower",
  category: "printer",
  title: "Temperature tower",
  summary: "a stack of test blocks, one per temperature setting, each with a bridge and an overhang to judge.",
  print: "upright as shown, no supports. Set a temperature change at each block in the slicer.",
  names: ["temperature tower", "temp tower", "temperature calibration tower", "temperature test tower", "heat tower",
    "temperature calibration", "temp calibration tower", "temperature test"],
  nouns: ["tower"],
  keywords: ["temperature", "temp", "calibration", "test", "printer", "filament"],
  bridgeArea: (v) => {
    const w = Math.max(0, Math.min(v.winW, v.width - 8));
    return w > 0 ? 1.05 * v.segments * w * v.depth : 0;
  },
  tips: ["9 blocks", "taller blocks", "40 mm wide"],
  examples: ["make me a temperature tower", "a temp tower with 9 blocks",
    "temperature calibration tower for petg", "temperature tower 40mm wide"],
  params: {
    segments: { default: 7, min: 3, max: 12, unit: "count", label: "blocks (one per setting)", say: ["block", "blocks", "segment", "step", "level", "temperature"] },
    segH: { default: 10, min: 6, max: 20, unit: "mm", label: "block height", say: ["block", "segment", "tall", "high"] },
    width: { default: 30, min: 15, max: 60, unit: "mm", label: "tower width", say: ["wide", "width"] },
    depth: { default: 10, min: 6, max: 25, unit: "mm", label: "tower depth", say: ["deep", "depth"] },
    winW: { default: 12, min: 0, max: 30, unit: "mm", label: "bridge window width (0 = none)", say: ["window", "bridge"] },
  },
  things: [
    { names: ["pla temperature tower", "pla temp tower"], title: "PLA temperature tower", params: { segments: 7 } },
    { names: ["petg temperature tower", "petg temp tower"], title: "PETG temperature tower", params: { segments: 7 } },
    { names: ["abs temperature tower", "asa temperature tower", "abs temp tower"], title: "ABS temperature tower", params: { segments: 6 } },
    { names: ["retraction tower", "retraction test tower", "retraction calibration tower"], title: "Retraction tower", params: { segments: 6, winW: 16 } },
    { names: ["tpu temperature tower", "tpu temp tower"], title: "TPU temperature tower", params: { segments: 5, segH: 12, depth: 14 } },
  ],
  body: `
const baseT = Math.min(1.2, segH / 5);
const ww = Math.max(0, Math.min(winW, width - 8));
const c = Math.min(segH - 3, 5);                     // the 45 degree overhang on the left
const groove = Math.min(0.6, depth / 10);
const blocks = [translate([-width / 2 - 5, -depth / 2 - 3, 0], cube([width + 10, depth + 6, baseT]))];
const cuts = [];
// rotate([90, 0, 0]) keeps the profile's x, sends its y to z, and the extrusion to -y
const across = (pts) => translate([0, depth / 2 + 1, 0], rotate([90, 0, 0], linearExtrude({ h: depth + 2 }, polygon(pts))));
for (let i = 0; i < segments; i++) {
  const z = baseT + i * segH;
  blocks.push(translate([-width / 2, -depth / 2, z - 0.01], cube([width, depth, segH + 0.02])));
  if (ww > 0) cuts.push(translate([-ww / 2 + 2, -depth / 2 - 1, z + 2], cube([ww, depth + 2, segH - 4])));
  // a wedge out of the bottom-left corner: the block above it overhangs at 45 degrees
  cuts.push(across([[-width / 2 - 1, z - 0.01], [-width / 2 + c, z - 0.01], [-width / 2 - 1, z + c + 1]]));
  // a V groove round the front and back where the next block starts
  if (i > 0) {
    for (const s of [-1, 1]) {
      cuts.push(translate([-width / 2 - 1, s * depth / 2, z], rotate([45, 0, 0], translate([0, -groove / 2, -groove / 2], cube([width + 2, groove, groove])))));
    }
  }
}
return difference(union(...blocks), ...cuts);
`,
};
