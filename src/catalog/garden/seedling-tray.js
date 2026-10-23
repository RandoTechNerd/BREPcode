// A seedling tray: a grid of square cells, each wider at the top so a plug
// of soil slides out, with a drain hole in every cell. One block with every
// cell cut from it; each cell is a four-sided frustum (a cylinder with four
// facets), the cheapest tapered pocket there is.

export default {
  id: "seedling-tray",
  category: "garden",
  title: "Seedling tray",
  summary: "a grid of tapered seed-starting cells with a drain hole in each.",
  print: "upright as shown, no supports. Stand it in a solid tray to water from below.",
  names: ["seedling tray", "seed tray", "seed starter tray", "seed starting tray", "cell tray", "seedling cell tray",
    "propagation tray", "germination tray", "seed cell tray", "plug tray"],
  nouns: ["tray", "cell"],
  keywords: ["seed", "seedling", "seedlings", "sprout", "starter", "germinate", "cells"],
  triple: ["cols", "rows"],
  primary: "cell",
  tips: ["8 x 4 cells", "30 mm square cells", "deeper cells"],
  examples: ["I want a seedling tray", "make me a seed starting tray with 6 x 3 cells",
    "seed tray with 30mm cells", "a plug tray for seedlings"],
  params: {
    cols: { default: 6, min: 1, max: 12, unit: "count", label: "cells across", say: ["across", "column", "wide"] },
    rows: { default: 4, min: 1, max: 8, unit: "count", label: "rows of cells", say: ["row", "deep"] },
    cell: { default: 40, min: 20, max: 70, unit: "mm", label: "cell size (centre to centre)", say: ["pitch", "square"], more: ["bigger"], less: ["smaller"] },
    depth: { default: 50, min: 20, max: 100, unit: "mm", label: "cell depth", say: ["tall", "deep", "depth", "high"], more: ["deeper", "taller"], less: ["shallower"] },
    wall: { default: 1.6, min: 1, max: 3, unit: "mm", label: "wall between cells", say: ["wall"] },
    taper: { default: 4, min: 0, max: 10, unit: "mm", label: "taper per side", say: ["taper"] },
    drainD: { default: 5, min: 0, max: 10, unit: "mm", label: "drain hole in each cell (0 = none)", say: ["drain", "hole"] },
  },
  things: [
    { names: ["plug tray insert", "small cell seed tray", "mini plug tray"], title: "Small-cell seed tray", params: { cols: 9, rows: 6, cell: 26, depth: 40, taper: 3, drainD: 4 } },
    { names: ["6 cell pack", "six cell seedling pack", "cell pack"], title: "6-cell pack", params: { cols: 3, rows: 2, cell: 50, depth: 55 } },
    { names: ["4 cell pack", "four cell seedling pack"], title: "4-cell pack", params: { cols: 2, rows: 2, cell: 55, depth: 60 } },
    { names: ["root trainer", "deep seedling cells", "deep root seed tray"], title: "Root trainer", params: { cols: 5, rows: 3, cell: 40, depth: 100, taper: 2 } },
    { names: ["tomato seedling tray", "pepper seedling tray"], title: "Tomato seedling tray", params: { cols: 4, rows: 3, cell: 55, depth: 65 } },
    { names: ["succulent propagation tray", "cutting tray"], title: "Propagation tray", params: { cols: 8, rows: 5, cell: 30, depth: 30, taper: 2, drainD: 4 } },
  ],
  body: `
const W = cols * cell + wall, D = rows * cell + wall;
const fl = Math.max(1.2, wall);                          // floor under each cell
const top = cell - wall;                                 // a cell's opening
const bot = Math.max(6, top - 2 * taper);                // and its floor
const h = depth - fl + 1;                                // pockets overshoot the top by 1
const atTop = top + (top - bot) / (depth - fl);          // their size at the overshoot
const pockets = [], drainHoles = [];
for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
  const x = -W / 2 + wall / 2 + cell * (i + 0.5), y = -D / 2 + wall / 2 + cell * (j + 0.5);
  pockets.push(translate([x, y, fl], rotate([0, 0, 45], cylinder({ r1: bot / Math.SQRT2, r2: atTop / Math.SQRT2, h, $fn: 4 }))));
  if (drainD > 0) drainHoles.push(translate([x, y, -1], cylinder({ r: Math.min(drainD, bot - 2) / 2, h: fl + 2, $fn: 16 })));
}
// cut the cells first, then the drains: two flat lists are far cheaper than one union of cutters
const tray = difference(translate([-W / 2, -D / 2, 0], cube([W, D, depth])), ...pockets);
return drainHoles.length ? difference(tray, ...drainHoles) : tray;
`,
};
