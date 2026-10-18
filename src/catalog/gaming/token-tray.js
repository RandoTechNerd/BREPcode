// A board-game tray: a grid of compartments for tokens, coins and bits,
// each with a curved scoop at its front so you can slide a finger under the
// last piece. Each compartment is a scooped side profile pushed across its
// width and cut down into a rounded block, so every surface inside faces up.

export default {
  id: "token-tray",
  category: "gaming",
  title: "Token tray",
  summary: "a board-game tray of compartments with scooped fronts, for tokens, coins and bits.",
  print: "upright as shown, no supports.",
  names: ["token tray", "board game tray", "board game organizer", "token organizer", "component tray", "game piece tray",
    "board game insert", "bits tray", "game token tray", "scoop tray"],
  nouns: ["tray", "organizer", "insert"],
  keywords: ["token", "tokens", "board", "game", "pieces", "bits", "scoop", "compartment"],
  triple: ["width", "depth", "height"],
  tips: ["4 compartments", "2 rows", "150 x 100 x 25"],
  examples: ["I want a token tray", "board game organizer with 4 compartments and 2 rows",
    "token tray 160 x 90 x 25", "a dice tray"],
  params: {
    width: { default: 150, min: 40, max: 250, unit: "mm", label: "width", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower"] },
    depth: { default: 100, min: 30, max: 250, unit: "mm", label: "depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    height: { default: 25, min: 8, max: 60, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower"] },
    cols: { default: 3, min: 1, max: 8, unit: "count", label: "compartments across", say: ["compartment", "section", "column", "slot", "across"] },
    rows: { default: 2, min: 1, max: 6, unit: "count", label: "rows", say: ["row"] },
    wall: { default: 1.6, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 1.6, min: 1, max: 4, unit: "mm", label: "floor thickness", say: ["floor"] },
    scoop: { default: 12, min: 0, max: 30, unit: "mm", label: "scoop radius at the front (0 = square)", say: ["scoop", "curve"] },
    cornerR: { default: 4, min: 0.5, max: 15, unit: "mm", label: "outer corner radius (limited by the wall)", say: ["corner", "round"] },
  },
  things: [
    { names: ["dice tray", "dice rolling tray", "dnd dice tray", "dice rolling box", "rolling tray for dice"], title: "Dice tray",
      params: { width: 180, depth: 130, height: 28, cols: 1, rows: 1, wall: 3, floor: 2, scoop: 18, cornerR: 12 } },
    { names: ["board game card tray", "card tray for board games", "card draw tray", "discard tray"], title: "Card tray",
      params: { width: 80, depth: 105, height: 30, cols: 1, rows: 1, wall: 2, scoop: 10 } },
    { names: ["meeple tray", "meeple organizer", "worker tray"], title: "Meeple tray", params: { width: 160, depth: 50, height: 22, cols: 4, rows: 1 } },
    { names: ["resource tray", "resource organizer", "board game resource tray"], title: "Resource tray",
      params: { width: 180, depth: 110, height: 25, cols: 3, rows: 2 } },
    { names: ["coin tray", "game coin tray", "money tray for board games", "play money tray"], title: "Coin tray",
      params: { width: 170, depth: 60, height: 20, cols: 4, rows: 1, scoop: 15 } },
  ],
  body: `
// a rounded rectangle w x d, h tall, from the origin corner
const rounded = (w, d, h, r) => hull(...[[r, r], [w - r, r], [r, d - r], [w - r, d - r]].map(([x, y]) =>
  translate([x, y, 0], cylinder({ r, h, $fn: 32 }))));
// the corners can only be as round as keeps 0.8 mm of wall outside the square compartments
const rr = Math.max(0.5, Math.min(cornerR, width / 2 - 1, depth / 2 - 1, (Math.SQRT2 * wall - 0.8) / (Math.SQRT2 - 1)));
const cw = (width - (cols + 1) * wall) / cols, cd = (depth - (rows + 1) * wall) / rows;
const s = Math.max(0, Math.min(scoop, cd * 0.6, height - floor - 1));
// one compartment's side profile: x runs front to back, y runs up; a quarter-round scoop at the front
const scoopArc = Array.from({ length: 13 }, (_, i) => {
  const a = Math.PI + (Math.PI / 2) * i / 12;
  return [s + s * Math.cos(a), floor + s + s * Math.sin(a)];
});
const prof = s > 0.5
  ? [[0, height + 1], ...scoopArc, [cd, floor], [cd, height + 1]]
  : [[0, floor], [cd, floor], [cd, height + 1], [0, height + 1]];
const cells = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  cells.push(translate([wall + c * (cw + wall), wall + r * (cd + wall), 0],
    rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: cw }, polygon(prof))))));
}
return translate([-width / 2, -depth / 2, 0], difference(rounded(width, depth, height, rr), ...cells));
`,
};
