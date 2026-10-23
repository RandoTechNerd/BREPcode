// A stepped block of pockets that stands game cartridges (or memory cards,
// or Joy-Cons) upright with their labels facing you. Each row sits higher
// than the one in front, stadium style, so every label shows. The block is
// one stepped side profile pushed across the width, with the pockets cut
// down into each step: open-topped, so nothing needs support.

export default {
  id: "cartridge-holder",
  category: "gaming",
  title: "Cartridge holder",
  summary: "a stepped block of pockets that stands game cartridges or memory cards upright, labels facing out.",
  print: "upright as shown, no supports.",
  names: ["cartridge holder", "game cartridge holder", "cartridge stand", "game card holder", "cartridge organizer",
    "game cartridge stand", "retro game holder", "cartridge display", "game cartridge organizer"],
  nouns: ["holder", "organizer", "display"],
  keywords: ["cartridge", "cart", "game", "games", "retro", "nintendo", "card"],
  fits: ["cart"],
  fromSpec: (s) => ({ cartW: s.dims.w, cartH: s.dims.h, cartT: s.dims.t }),
  specNote: "each pocket is 0.6 mm bigger than it",
  ask: { unless: ["cartW"], text: "Which games are they? Say “for Game Boy cartridges” or “for SD cards”; I sized these pockets for Switch game cards." },
  tips: ["for Game Boy cartridges", "8 across", "4 rows"],
  examples: ["I want a cartridge holder", "game boy cartridge holder with 4 slots",
    "switch game holder 6 across and 3 rows", "a holder for my sd cards"],
  params: {
    cartW: { default: 21.5, min: 5, max: 140, unit: "mm", label: "cartridge width", say: ["wide", "width"] },
    cartH: { default: 31, min: 10, max: 140, unit: "mm", label: "cartridge height", say: ["tall", "high", "height"] },
    cartT: { default: 3.3, min: 0.8, max: 30, unit: "mm", label: "cartridge thickness", say: ["thick", "thickness"] },
    cols: { default: 6, min: 1, max: 12, unit: "count", label: "pockets across", say: ["across", "slot", "pocket", "column", "game", "cartridge", "card"] },
    rows: { default: 3, min: 1, max: 6, unit: "count", label: "rows", say: ["row", "tier", "step"] },
    sink: { default: 0.45, min: 0.2, max: 0.8, unit: "ratio", label: "how much of each one sits in its pocket", say: ["sink", "deep"] },
    rowGap: { default: 5, min: 2, max: 20, unit: "mm", label: "space between rows", say: ["gap", "spacing"] },
    rowStep: { default: 8, min: 0, max: 30, unit: "mm", label: "each row higher than the last by", say: ["step", "stepped"] },
    wall: { default: 2, min: 1.2, max: 6, unit: "mm", label: "wall between pockets", say: ["wall"] },
  },
  things: [
    { names: ["switch game holder", "switch cartridge holder", "switch game card holder", "switch game organizer", "switch game stand",
      "switch cartridge stand"], title: "Switch game holder", spec: "cart-switch" },
    { names: ["game boy cartridge holder", "game boy game holder", "gameboy cartridge holder", "gameboy cartridge stand", "gbc cartridge holder"],
      title: "Game Boy cartridge holder", spec: "cart-game-boy", params: { cols: 4, rows: 2, rowStep: 15, rowGap: 4 } },
    { names: ["gba cartridge holder", "game boy advance cartridge holder", "gba game holder", "gba cartridge stand"],
      title: "GBA cartridge holder", spec: "cart-gba", params: { cols: 4, rows: 2, rowStep: 10, rowGap: 4 } },
    { names: ["ds game holder", "3ds game holder", "3ds cartridge holder", "ds cartridge holder", "ds card holder", "3ds game card holder"],
      title: "DS / 3DS game holder", spec: "cart-ds", params: { cols: 5, rows: 3 } },
    { names: ["n64 cartridge stand", "n64 game holder", "n64 cartridge holder", "nintendo 64 cartridge holder"], title: "N64 cartridge stand",
      spec: "cart-n64", params: { cols: 2, rows: 2, rowStep: 20, rowGap: 4, sink: 0.3, wall: 3 } },
    { names: ["nes cartridge stand", "nes game holder", "nes cartridge holder"], title: "NES cartridge stand", spec: "cart-nes",
      params: { cols: 1, rows: 4, rowStep: 20, rowGap: 4, sink: 0.25, wall: 3 } },
    { names: ["sd card holder", "sd card organizer", "sd card stand", "memory card holder"], title: "SD card holder", spec: "cart-sd-card",
      params: { cols: 6, rows: 2, rowStep: 6 } },
    { names: ["microsd card holder", "micro sd card holder", "tf card holder", "microsd organizer"], title: "microSD card holder",
      spec: "cart-microsd", params: { cols: 8, rows: 3, rowStep: 4, rowGap: 3, wall: 1.6, sink: 0.5 } },
    { names: ["joy con holder", "joycon holder", "joy con stand", "joy con organizer", "joycon stand"], title: "Joy-Con holder", spec: "cart-joycon",
      params: { cols: 4, rows: 1, sink: 0.3, rowGap: 6, wall: 3 } },
  ],
  body: `
// pockets get 0.3 mm of room each side
const pw = cartW + 0.6, pt = cartT + 0.6;
const depthIn = Math.max(5, cartH * sink);       // how far each one sits in
const flr = Math.max(1.6, wall);
const pitchX = pw + wall, pitchY = pt + rowGap;
const W = cols * pitchX + wall;
const D = rows * pt + (rows + 1) * rowGap;
const yRow = (r) => rowGap + r * pitchY;          // front face of row r's pockets
const zTop = (r) => flr + depthIn + r * rowStep;  // top of row r's step
// stepped side profile: x runs front to back, y runs up; pushed across the width
const prof = [[0, 0], [D, 0], [D, zTop(rows - 1)]];
for (let r = rows - 1; r >= 1; r--) {
  const yb = yRow(r) - rowGap / 2;
  prof.push([yb, zTop(r)], [yb, zTop(r - 1)]);
}
prof.push([0, zTop(0)]);
const block = rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: W }, polygon(prof))));
const pockets = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  pockets.push(translate([wall + c * pitchX, yRow(r), zTop(r) - depthIn], cube([pw, pt, depthIn + 1])));
}
return translate([-W / 2, -D / 2, 0], difference(block, ...pockets));
`,
};
