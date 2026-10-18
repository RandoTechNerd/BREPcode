// A bench block of holes that stand bits up by their shanks: hex driver bits,
// a drill index graduated hole by hole, router bits, hex keys. Rows can step
// up toward the back like a stadium, so the back row is never hidden behind
// the front one. Every hole is a straight vertical bore, so nothing overhangs.

export default {
  id: "bit-index",
  category: "garage",
  title: "Bit holder block",
  summary: "a bench block of holes that stands bits up by their shanks, hex or round, even or graduated in size.",
  print: "upright as shown, no supports. The holes are sized with the clearance below; print one row first if the fit matters.",
  names: ["bit holder block", "bit organizer", "driver bit holder", "hex bit holder", "screwdriver bit holder",
    "bit storage block", "bit index", "hex bit organizer", "bit stand", "impact bit holder"],
  nouns: ["block", "index", "organizer", "stand", "holder"],
  keywords: ["bit", "drill", "router", "hex", "shank", "workbench", "garage"],
  tips: ["3 rows", "round holes", "stepped rows", "12 per row"],
  examples: ["I want a hex bit holder", "make me a drill bit index from 1 to 10 mm",
    "router bit holder for 1/4 inch shanks", "bit organizer with 3 rows of 12"],
  params: {
    form: { default: "hex", unit: "choice", choices: ["hex", "round"], label: "hole shape",
      words: { round: ["round", "round holes", "drill bit", "drill bits", "router", "shank"], hex: ["hex", "hexagon", "hex bit", "hex bits"] } },
    holeD: { default: 6.35, min: 1, max: 30, unit: "mm", label: "first hole size (across the flats for hex)", say: ["hole", "size", "from", "diameter"], more: ["bigger"], less: ["smaller"] },
    stepD: { default: 0, min: 0, max: 3, unit: "mm", label: "each hole bigger than the last by (0 = all the same)", say: ["step", "increment", "by"] },
    count: { default: 10, min: 1, max: 30, unit: "count", label: "holes per row", say: ["hole", "bit", "per", "column"] },
    rows: { default: 2, min: 1, max: 6, unit: "count", label: "rows", say: ["row"] },
    fit: { default: 0.2, min: 0, max: 1, unit: "mm", label: "clearance per side", say: ["fit", "clearance", "tolerance", "loose"] },
    gap: { default: 4, min: 1.5, max: 40, unit: "mm", label: "plastic between holes", say: ["gap", "spacing", "apart"], more: ["roomier"], less: ["tighter"] },
    depth: { default: 12, min: 3, max: 60, unit: "mm", label: "hole depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    floor: { default: 2, min: 1, max: 10, unit: "mm", label: "floor under the holes", say: ["floor", "base"] },
    rise: { default: 0, min: 0, max: 30, unit: "mm", label: "each row higher than the one in front (stadium)", say: ["rise", "stepped", "stadium", "tier"] },
  },
  things: [
    { names: ["drill bit index", "drill bit holder", "drill bit organizer", "drill bit stand", "drill index", "drill bit storage", "metric drill index"],
      title: "Drill bit index", params: { form: "round", holeD: 1, stepD: 0.5, count: 19, rows: 1, fit: 0.15, gap: 3, depth: 20, floor: 3 } },
    { names: ["imperial drill index", "fractional drill index", "inch drill bit index"], title: "Fractional drill index",
      params: { form: "round", holeD: 1.59, stepD: 0.4, count: 15, rows: 2, fit: 0.15, gap: 3, depth: 20, floor: 3, rise: 8 } },
    { names: ["router bit holder", "router bit organizer", "router bit storage", "router bit stand"], title: "Router bit holder",
      params: { form: "round", holeD: 6.35, count: 5, rows: 3, fit: 0.25, gap: 28, depth: 25, floor: 3, rise: 10 } },
    { names: ["half inch router bit holder", "1/2 router bit holder", "1/2 inch router bit holder"], title: "1/2 inch router bit holder",
      params: { form: "round", holeD: 12.7, count: 4, rows: 3, fit: 0.25, gap: 30, depth: 30, floor: 3, rise: 12 } },
    { names: ["hex key holder", "allen key holder", "allen wrench holder", "hex key stand", "allen key stand"], title: "Hex key stand",
      params: { form: "hex", holeD: 2, stepD: 1, count: 9, rows: 1, fit: 0.2, gap: 5, depth: 25, floor: 3 } },
    { names: ["end mill holder", "end mill stand", "cnc bit holder"], title: "End mill holder",
      params: { form: "round", holeD: 3, stepD: 1, count: 10, rows: 1, fit: 0.2, gap: 8, depth: 18, floor: 3 } },
    { names: ["dremel bit holder", "rotary tool bit holder", "dremel accessory holder"], title: "Rotary tool bit holder",
      params: { form: "round", holeD: 3.2, count: 10, rows: 3, fit: 0.15, gap: 6, depth: 10, rise: 5 } },
    { names: ["screwdriver stand", "screwdriver block", "bench screwdriver holder"], title: "Screwdriver stand",
      params: { form: "round", holeD: 8, count: 6, rows: 2, fit: 0.6, gap: 22, depth: 40, floor: 3, rise: 15 } },
    { names: ["impact socket bit holder", "bit holder for drill case"], title: "Compact bit holder",
      params: { form: "hex", count: 8, rows: 1, gap: 3, depth: 10 } },
  ],
  body: `
// hole i (counting along each row, then on to the next row) is holeD + i * stepD
const total = count * rows;
const sizeOf = (i) => holeD + i * stepD + 2 * fit;           // the bore across its flats
const hex = form === "hex";
const across = (s) => hex ? s / Math.cos(Math.PI / 6) : s;   // across the corners
const edge = Math.max(3, gap);                               // plastic past the outer holes
const rowsList = Array.from({ length: rows }, (_, r) => Array.from({ length: count }, (_, c) => r * count + c).filter((i) => i < total));
// x of each hole along its row: each pair of neighbours is gap apart, edge to edge
const placed = rowsList.map((ids) => {
  let x = edge;
  return ids.map((i, k) => {
    const w = across(sizeOf(i));
    if (k) x += across(sizeOf(ids[k - 1])) / 2 + gap + w / 2; else x += w / 2;
    return { i, x, w };
  });
});
const width = Math.max(...placed.map((row) => row[row.length - 1].x + row[row.length - 1].w / 2 + edge));
const rowDepth = placed.map((row) => Math.max(...row.map((h) => h.w)) + gap);
const ys = [];
let y = edge - gap / 2;
for (const d of rowDepth) { ys.push(y + d / 2); y += d; }
const deep = y + edge - gap / 2;
// one block per row, each a little taller than the one in front
const blocks = rowDepth.map((d, r) => translate([0, ys[r] - d / 2 - (r === 0 ? edge - gap / 2 : 0), 0],
  cube([width, d + (r === 0 ? edge - gap / 2 : 0) + (r === rows - 1 ? edge - gap / 2 : 0.01), floor + depth + r * rise])));
// a row of smaller holes is centred rather than bunched at one end
const shift = placed.map((row) => (width - (row[row.length - 1].x + row[row.length - 1].w / 2 + edge)) / 2);
const holes = placed.flatMap((row, r) => row.map((h) => translate([h.x + shift[r], ys[r], floor + r * rise],
  rotate([0, 0, 30], cylinder({ r: across(sizeOf(h.i)) / 2, h: depth + 1, $fn: hex ? 6 : 32 })))));
return translate([-width / 2, -deep / 2, 0], difference(union(...blocks), ...holes));
`,
};
