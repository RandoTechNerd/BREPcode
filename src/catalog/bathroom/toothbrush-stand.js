// A countertop toothbrush block: a rounded, slightly tapered block with a
// row (or two) of round holes the handles stand in, and an optional bigger
// hole for the toothpaste tube standing on its cap. The holes stop at a
// floor, and a small drain hole runs from each one down through it, so water
// runs out instead of pooling. Everything is vertical, so it prints upright
// with no supports.

export default {
  id: "toothbrush-stand",
  category: "bathroom",
  title: "Toothbrush stand",
  summary: "a countertop block with holes the toothbrushes stand in, a drain under each hole and an optional toothpaste hole.",
  print: "upright as shown, no supports. PETG copes with a wet sink better than PLA.",
  names: ["toothbrush stand", "toothbrush holder", "countertop toothbrush holder", "toothbrush block", "family toothbrush stand",
    "toothbrush organizer", "toothbrush holder stand", "bathroom toothbrush stand", "toothbrush caddy"],
  nouns: ["stand", "holder", "block"],
  keywords: ["toothbrush", "toothbrushes", "bathroom", "sink", "countertop", "brush"],
  fits: ["toothbrush"],
  fromSpec: (s) => ({ holeD: Math.round((s.dims.d + 3) * 2) / 2 }),
  specNote: "each hole is 3 mm wider than that",
  primary: "holeD",
  tips: ["6 holes", "2 rows", "with a toothpaste hole", "20 mm holes"],
  examples: ["I want a toothbrush stand", "make me a toothbrush stand with 4 holes",
    "a countertop toothbrush holder for 6 toothbrushes in 2 rows", "toothbrush block with a toothpaste hole"],
  params: {
    holes: { default: 4, min: 1, max: 12, unit: "count", label: "toothbrush holes", say: ["hole", "toothbrush", "brush", "slot", "person", "people"] },
    rows: { default: 1, min: 1, max: 3, unit: "count", label: "rows of holes", say: ["row"] },
    holeD: { default: 17, min: 8, max: 40, unit: "mm", label: "hole diameter", say: ["hole", "diameter", "across"], more: ["bigger", "wider"], less: ["smaller", "narrower"] },
    spacing: { default: 7, min: 3, max: 25, unit: "mm", label: "plastic between holes", say: ["spacing", "apart", "gap"] },
    height: { default: 55, min: 20, max: 140, unit: "mm", label: "block height", say: ["tall", "high", "height", "deep"], more: ["taller", "deeper"], less: ["shorter", "lower"] },
    floor: { default: 3, min: 1.6, max: 10, unit: "mm", label: "floor under the holes", say: ["floor", "bottom"] },
    drain: { default: 4, min: 0, max: 10, unit: "mm", label: "drain hole under each hole (0 = none)", say: ["drain"] },
    pasteD: { default: 0, min: 0, max: 60, unit: "mm", label: "toothpaste tube hole (0 = none)", say: ["toothpaste", "paste", "tube"] },
  },
  things: [
    { names: ["electric toothbrush stand", "electric toothbrush holder", "oral b stand", "sonicare stand", "electric toothbrush block"],
      title: "Electric toothbrush stand", spec: "bath-electric-toothbrush", params: { holes: 2, holeD: 34, height: 45, spacing: 8, drain: 6 } },
    { names: ["toothbrush head holder", "oral b head holder", "sonicare head holder", "brush head holder", "toothbrush head stand", "replacement head holder"],
      title: "Toothbrush head holder", spec: "bath-toothbrush-head", params: { holes: 6, rows: 2, holeD: 13.5, height: 26, spacing: 5, floor: 2.4, drain: 3 } },
    { names: ["razor stand", "razor block", "razor holder stand", "safety razor stand"],
      title: "Razor stand", params: { holes: 2, holeD: 15, height: 60, spacing: 8 } },
    { names: ["kids toothbrush stand", "kids toothbrush holder", "child toothbrush stand"],
      title: "Kids toothbrush stand", params: { holes: 3, holeD: 16, height: 40, spacing: 8 } },
    { names: ["toothbrush and toothpaste stand", "toothbrush and toothpaste holder", "toothbrush toothpaste stand", "toothpaste and toothbrush holder"],
      title: "Toothbrush and toothpaste stand", params: { holes: 4, pasteD: 40, height: 60 } },
    { names: ["couples toothbrush stand", "two toothbrush stand", "double toothbrush stand"],
      title: "Two-toothbrush stand", params: { holes: 2, holeD: 17, height: 50, spacing: 10 } },
    { names: ["large family toothbrush stand", "six toothbrush stand", "toothbrush stand for 6"],
      title: "Family toothbrush stand", params: { holes: 6, rows: 2, height: 60 } },
  ],
  body: `
// the sides lean in toward the top and the top edge is chamfered, so the
// margin round the holes is set at the bottom and is \`spacing\` at the top
const lean = Math.min(1.5, height / 25), ch = Math.min(1.5, height / 12);
const edge = Math.max(4, spacing) + lean + ch;

// the holes: rows of round holes, short rows centred, and a toothpaste hole at the end
const cols = Math.ceil(holes / Math.min(rows, holes));
const nRows = Math.ceil(holes / cols);
const pitch = holeD + spacing;
const r0 = holeD / 2, pr = pasteD / 2;
const rowSpan = (cols - 1) * pitch + holeD;
const colSpan = (nRows - 1) * pitch + holeD;
const W = rowSpan + 2 * edge + (pasteD > 0 ? pasteD + spacing : 0);
// deep enough to stand steady, and to take the toothpaste hole
const D = Math.max(colSpan + 2 * edge, 0.55 * height, pasteD + 2 * edge);
const x0 = -W / 2 + edge + r0;
const spots = Array.from({ length: holes }, (_, i) => {
  const r = Math.floor(i / cols), c = i % cols;
  const inRow = Math.min(cols, holes - r * cols);
  return [x0 + (c + (cols - inRow) / 2) * pitch, (r - (nRows - 1) / 2) * pitch];
});

// the corners are rounded concentric with the corner holes, so the wall is even all round
const rL = edge + r0, rR = pasteD > 0 ? edge + pr : rL;
const corner = (R, sx, sy) => [
  translate([sx * (W / 2 - R), sy * (D / 2 - R), 0], cylinder({ r1: R, r2: R - lean, h: height - ch, $fn: 48 })),
  translate([sx * (W / 2 - R), sy * (D / 2 - R), height - ch], cylinder({ r1: R - lean, r2: R - lean - ch, h: ch, $fn: 48 })),
];
const block = hull(...corner(rL, -1, -1), ...corner(rL, -1, 1), ...corner(rR, 1, -1), ...corner(rR, 1, 1));

const cuts = [];
const floorZ = Math.min(floor, height - 6);
const bore = (x, y, r) => {
  cuts.push(translate([x, y, floorZ], cylinder({ r, h: height, $fn: 40 })));
  // a little lead-in chamfer round the mouth
  cuts.push(translate([x, y, height - 1.2], cylinder({ r1: r, r2: r + 1.2, h: 1.21, $fn: 40 })));
  if (drain > 0) cuts.push(translate([x, y, -1], cylinder({ r: Math.min(drain / 2, r - 1.5), h: floorZ + 1.5, $fn: 20 })));
};
for (const [x, y] of spots) bore(x, y, holeD / 2);
if (pasteD > 0) bore(W / 2 - edge - pr, 0, pr);
return difference(block, ...cuts);
`,
};
