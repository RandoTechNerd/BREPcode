// A wall pocket for power-tool battery packs: an open-top box per pack on a
// back plate, sized from the pack's published outside size plus a drop-in
// clearance, with a front notch to grab the pack by. It holds the pack by
// its body, not by the slide rail, so any brand fits once its size is known.
// Printed upright as mounted: floor on the bed, every wall vertical.

export default {
  id: "battery-holder",
  category: "garage",
  title: "Tool battery holder",
  summary: "a wall pocket that holds power-tool battery packs by their body, one pocket per pack.",
  print: "upright as shown, no supports. A drop-in pocket, not a latching rail: it holds the pack, it does not lock it.",
  names: ["tool battery holder", "power tool battery holder", "battery wall mount", "tool battery mount", "drill battery holder",
    "battery pack holder", "power tool battery storage", "tool battery storage", "battery pack storage",
    "dewalt battery holder", "milwaukee battery holder", "ryobi battery holder", "dewalt battery mount", "milwaukee battery mount"],
  nouns: ["holder", "mount", "pocket", "storage"],
  keywords: ["battery", "pack", "dewalt", "milwaukee", "ryobi", "makita", "bosch", "drill", "cordless", "garage"],
  fits: ["battery-pack"],
  fromSpec: (s) => ({ packL: s.dims.l, packW: s.dims.w, packH: s.dims.h }),
  specNote: "each pocket allows a millimetre all round",
  triple: ["packL", "packW", "packH"],
  ask: {
    unless: ["packL"],
    text: "Which battery? I know the Bosch GBA 18V 4.0Ah and the Makita BL1850B; for any other pack give its length, width and height (“118 x 80 x 65”), measured with calipers, because makers rarely publish them. I used 115 x 75 x 60.",
  },
  tips: ["3 batteries", "for a Makita BL1850B", "118 x 80 x 65"],
  examples: ["I want a tool battery holder", "make me a power tool battery holder for 3 packs",
    "battery wall mount for my makita 18v battery", "dewalt battery holder 112 x 78 x 66"],
  params: {
    packL: { default: 115, min: 40, max: 200, unit: "mm", label: "pack length", say: ["long", "length"] },
    packW: { default: 75, min: 30, max: 130, unit: "mm", label: "pack width", say: ["wide", "width"] },
    packH: { default: 60, min: 20, max: 120, unit: "mm", label: "pack height", say: ["tall", "high", "height"] },
    count: { default: 2, min: 1, max: 4, unit: "count", label: "how many packs", say: ["pack", "pocket", "slot", "spot"] },
    cover: { default: 0.6, min: 0.25, max: 1, unit: "ratio", label: "how much of the pack's height the pocket covers", say: ["cover", "deep"] },
    fit: { default: 1, min: 0.3, max: 3, unit: "mm", label: "clearance per side", say: ["fit", "clearance", "loose"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stronger", "sturdier"] },
    above: { default: 22, min: 14, max: 60, unit: "mm", label: "back plate above the pocket (screws)", say: ["above", "plate"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
  },
  things: [
    { names: ["makita battery holder", "makita battery mount", "makita 18v battery holder", "makita battery storage"],
      title: "Makita battery holder", spec: "makita-bl1850b" },
    { names: ["bosch battery holder", "bosch battery mount", "bosch 18v battery holder"], title: "Bosch battery holder", spec: "bosch-gba-18v-4ah" },
    { names: ["triple tool battery holder", "three tool battery holder", "three pack battery holder"], title: "Triple battery holder", params: { count: 3 } },
    { names: ["single tool battery holder", "spare tool battery holder", "spare drill battery holder"], title: "Single battery holder", params: { count: 1 } },
  ],
  body: `
// x along the wall, y out from it, z up
const iL = packL + 2 * fit, iW = packW + 2 * fit;
const deep = Math.max(15, cover * packH);        // pocket depth
const floor = Math.max(2, wall);
const pitch = iL + wall;
const L = count * pitch + wall;
const D = iW + 2 * wall;                         // back wall, pocket, front wall
const H = floor + deep;
const peak = H + above;
const box = union(
  translate([-L / 2, 0, 0], cube([L, D, H])),
  translate([-L / 2, 0, 0], cube([L, wall, peak])),          // back plate rises above the pockets
);
const cuts = [];
for (let i = 0; i < count; i++) {
  const x0 = -L / 2 + wall + i * pitch;
  cuts.push(translate([x0, wall, floor], cube([iL, iW, H])));
  // a notch down the front wall to get fingers on the pack
  const nw = Math.min(iL * 0.5, 60);
  cuts.push(translate([x0 + (iL - nw) / 2, D - wall - 1, floor + Math.min(12, deep / 2)], cube([nw, wall + 2, H])));
}
const k = screwD / 2;
const sx = L / 2 - 12;
for (const x of L > 200 ? [-sx, 0, sx] : [-sx, sx]) {
  cuts.push(translate([x, -1, H + above / 2], rotate([-90, 0, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))));
  cuts.push(translate([x, wall - k + 0.02, H + above / 2], rotate([-90, 0, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))));
}
return translate([0, -D / 2, 0], difference(box, ...cuts));
`,
};
