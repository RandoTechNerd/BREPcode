// A block of pockets that batteries stand up in. Round cells get round
// pockets; set a thickness and the pocket goes rectangular, which is how a
// 9 V block or a coin cell standing on its edge is held. Every size comes
// from the battery itself (the specs below), so "for AAA" or "for 18650"
// is all it takes; the pockets hold a share of the cell's length and the
// rest stands proud to grab. "12 AA batteries" sets the grid: the count is
// folded into cols x rows (derive) and comes out as 4 x 3.

export default {
  id: "battery-organizer",
  category: "storage",
  title: "Battery organizer",
  summary: "a block of pockets that AA, AAA, 18650, 9 V or coin cell batteries stand up in.",
  print: "upright as shown, no supports.",
  names: ["battery organizer", "battery holder", "battery storage", "battery case", "battery tray",
    "battery rack", "battery caddy", "battery station", "battery dispenser", "battery organiser",
    "battery storage box", "battery holder block"],
  nouns: ["organizer", "organiser", "holder", "tray", "caddy", "rack"],
  keywords: ["battery", "batteries", "cell", "cells", "aa", "aaa", "coin"],
  fits: ["battery"],
  fromSpec: (s) => ({ cellD: s.dims.d, cellT: s.dims.t || 0, cellL: s.dims.len }),
  specNote: "each pocket allows a little room",
  ask: {
    unless: ["cellD"],
    text: "Which batteries is it for? Say “for AAA”, “18650”, “9V” or “CR2032” and I’ll size the pockets; I used AA.",
  },
  tips: ["for AAA", "for 12 batteries", "8 across and 3 rows", "deeper pockets"],
  examples: ["make me a battery organizer", "battery holder for 18650 cells",
    "a battery storage tray for AAA with 10 across", "battery organizer for cr2032 coin cells", "holder for 12 AA batteries"],
  // "12 batteries" (or pockets) becomes the squarest grid that holds them,
  // wider than tall: 12 -> 4 x 3, 10 -> 5 x 2, 7 -> 3 x 3 (two spare)
  derive(v) {
    if (!(v.count > 0)) return null;
    const n = Math.round(v.count), root = Math.ceil(Math.sqrt(n));
    let cols = Math.min(12, root);
    for (let c = root; c <= Math.min(12, root + 3); c++) if (n % c === 0) { cols = c; break; }
    return { cols, rows: Math.min(10, Math.ceil(n / cols)), count: 0 };
  },
  params: {
    // no "battery" or "cell" in a SIZE dial's say list: "18650 cells" and "9V
    // battery" are model names, and a number next to those words is not a
    // size. The count dial may have them: a named cell's digits are its name
    // (skipped) or glued to letters (hidden), so "12 AA batteries" is 12.
    cellD: { default: 14.5, min: 5, max: 35, unit: "mm", label: "battery diameter (or width)", say: ["diameter", "across"] },
    cellT: { default: 0, min: 0, max: 30, unit: "mm", label: "battery thickness for flat cells (0 = round)", say: ["thick", "thickness"] },
    cellL: { default: 50.5, min: 3, max: 72, unit: "mm", label: "battery length", say: ["long", "length"] },
    cols: { default: 6, min: 1, max: 12, unit: "count", label: "pockets across", say: ["across", "column", "slot"] },
    rows: { default: 4, min: 1, max: 10, unit: "count", label: "rows", say: ["row", "rows"] },
    count: { default: 0, min: 0, max: 120, unit: "count", label: "pockets wanted (0 = across x rows; a number sets the grid)", say: ["battery", "batteries", "cell", "cells", "pocket", "pockets"] },
    hold: { default: 0.55, min: 0.3, max: 0.9, unit: "ratio", label: "share of each battery held in the block", say: ["hold", "deep"] },
    fit: { default: 0.5, min: 0.2, max: 1.2, unit: "mm", label: "pocket clearance", say: ["fit", "clearance", "loose"] },
  },
  things: [
    { names: ["aa battery holder", "aa battery organizer", "aa battery storage", "double a battery holder"], title: "AA battery holder", spec: "battery-aa", params: { cols: 6, rows: 4 } },
    { names: ["aaa battery holder", "aaa battery organizer", "aaa battery storage", "triple a battery holder"], title: "AAA battery holder", spec: "battery-aaa", params: { cols: 8, rows: 4 } },
    { names: ["18650 battery holder", "18650 holder", "18650 storage", "18650 organizer", "lithium cell holder"], title: "18650 holder", spec: "battery-18650", params: { cols: 5, rows: 3 } },
    { names: ["21700 battery holder", "21700 holder"], title: "21700 holder", spec: "battery-21700", params: { cols: 5, rows: 3 } },
    { names: ["coin cell holder", "cr2032 holder", "button cell holder", "coin battery holder", "watch battery holder", "cr2032 organizer"],
      title: "Coin cell holder", spec: "battery-cr2032", params: { cols: 6, rows: 3, hold: 0.6 } },
    { names: ["9v battery holder", "9 volt battery holder", "9v battery organizer"], title: "9V battery holder", spec: "battery-9v", params: { cols: 4, rows: 2, hold: 0.5 } },
    { names: ["c battery holder", "c cell holder"], title: "C battery holder", spec: "battery-c", params: { cols: 4, rows: 2 } },
    { names: ["d size battery holder", "d cell battery holder", "mono battery holder"], title: "D battery holder", spec: "battery-d", params: { cols: 3, rows: 2 } },
    { names: ["cr123a holder", "cr123 battery holder", "16340 holder", "camera battery holder"], title: "CR123A holder", spec: "battery-cr123a", params: { cols: 5, rows: 2 } },
    { names: ["lr44 holder", "ag13 holder", "button battery organizer"], title: "LR44 holder", spec: "battery-lr44", params: { cols: 8, rows: 3, hold: 0.6 } },
  ],
  body: `
const rib = Math.max(1.6, cellD * 0.12);            // plastic between pockets
const flat = cellT > 0;
const pw = cellD + fit, pt = (flat ? cellT : cellD) + fit;
const px = pw + rib, py = pt + rib;                 // pocket pitch across and along
const depth = Math.max(3, Math.min(cellL * hold, cellL - 2));
const floor = Math.max(1.6, rib);
// the chat folds a count into cols x rows before the code is written; this
// is for the slider, when someone turns the count up by hand
const nX = count > 0 ? Math.min(12, Math.ceil(Math.sqrt(count))) : cols;
const nY = count > 0 ? Math.min(10, Math.ceil(count / nX)) : rows;
const W = nX * px + rib, D = nY * py + rib, H = depth + floor;
const r = Math.min(4, W / 2 - 0.5, D / 2 - 0.5);
const block = hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (W / 2 - r), sy * (D / 2 - r), 0], cylinder({ r, h: H, $fn: 24 }))));
const pockets = [];
for (let i = 0; i < nX; i++) {
  for (let j = 0; j < nY; j++) {
    const x = -W / 2 + rib + px * i + pw / 2, y = -D / 2 + rib + py * j + pt / 2;
    pockets.push(flat
      ? translate([x - pw / 2, y - pt / 2, floor], cube([pw, pt, depth + 1]))
      : translate([x, y, floor], cylinder({ d: pw, h: depth + 1, $fn: 28 })));
  }
}
return difference(block, ...pockets);
`,
};
