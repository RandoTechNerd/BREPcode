// A Gridfinity baseplate: x by y sockets that the bins' feet drop into.
//
// The socket is the open standard's own profile (see GRID in src/shelf.js):
// four corner cones whose centres sit at +-17 mm at every height, stepped
// 0.7 chamfer, 1.8 straight, 2.15 chamfer, so it opens at the full 42 mm cell
// with an r4 corner. It is drawn here rather than taken from
// gridfinityBase() for two reasons the test found: a 1.2 mm rim round the
// outside keeps the corner sockets from sharing a knife edge with the plate's
// own corner, and the open frame's sockets run out through the bottom face
// instead of stopping exactly on it.
//
// "frame" opens every socket right through, so the drawer bottom is the
// floor and the print is a fraction of the plastic. Magnet holes need a
// thicker plate to sit in, so asking for them thickens it.

export default {
  id: "gridfinity-baseplate",
  category: "storage",
  title: "Gridfinity baseplate",
  summary: "a Gridfinity baseplate of 42 mm sockets for bins to drop into, solid or as a light open frame.",
  print: "flat as shown, no supports. Bigger drawers: print several and butt them together.",
  names: ["gridfinity baseplate", "gridfinity base plate", "gridfinity base", "gridfinity grid", "gridfinity plate",
    "gridfinity frame", "gridfinity drawer insert", "gridfinity drawer base"],
  nouns: ["baseplate", "grid"],
  keywords: ["gridfinity", "drawer", "socket", "modular"],
  triple: ["cellsX", "cellsY"],
  tips: ["4x4", "frame only", "with magnets"],
  examples: ["make me a gridfinity baseplate", "gridfinity baseplate 5x4",
    "a gridfinity frame 3x3 without a floor", "gridfinity base plate with magnets"],
  params: {
    cellsX: { default: 3, min: 1, max: 6, unit: "count", label: "sockets across (42 mm each)", say: ["cell", "socket", "across", "wide"] },
    cellsY: { default: 3, min: 1, max: 6, unit: "count", label: "sockets deep (42 mm each)", say: ["deep", "row"] },
    rim: { default: 1.2, min: 0.8, max: 6, unit: "mm", label: "solid rim round the outside", say: ["rim", "border", "margin"] },
    style: { default: "solid", unit: "choice", choices: ["solid", "frame"], label: "solid floor or open frame",
      words: { frame: ["frame", "bottomless", "no floor", "without a floor", "open frame", "lightweight", "light"], solid: ["solid", "with floor"] } },
    magnets: { default: "no", unit: "choice", choices: ["no", "yes"], label: "magnet holes in each socket",
      words: { no: ["no magnets", "without magnets"], yes: ["magnet", "magnets", "magnetic"] } },
  },
  things: [
    { names: ["gridfinity 2x2 baseplate", "small gridfinity baseplate"], title: "Gridfinity 2x2 baseplate", params: { cellsX: 2, cellsY: 2 } },
    { names: ["gridfinity 4x4 baseplate"], title: "Gridfinity 4x4 baseplate", params: { cellsX: 4, cellsY: 4 } },
    { names: ["gridfinity 5x5 baseplate", "full bed gridfinity baseplate"], title: "Gridfinity 5x5 baseplate", params: { cellsX: 5, cellsY: 5, style: "frame" } },
    { names: ["gridfinity 6x6 baseplate", "256 mm gridfinity baseplate"], title: "Gridfinity 6x6 baseplate", params: { cellsX: 6, cellsY: 6, style: "frame", rim: 0.8 } },
    { names: ["gridfinity magnet baseplate", "magnetic gridfinity baseplate"], title: "Gridfinity magnet baseplate", params: { magnets: "yes" } },
    { names: ["gridfinity skeleton baseplate", "gridfinity lightweight baseplate", "bottomless gridfinity baseplate"], title: "Gridfinity frame baseplate",
      params: { style: "frame", cellsX: 4, cellsY: 3 } },
  ],
  body: `
const frame = style === "frame";
const withMagnets = magnets === "yes" && !frame;
const socketH = 0.7 + 1.8 + 2.15;                    // chamfer, straight, chamfer
const plateH = frame ? socketH : withMagnets ? socketH + 3.2 : socketH + 0.35;
const W = cellsX * 42, D = cellsY * 42;
const quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const plate = hull(...quad.map(([sx, sy]) =>
  translate([sx * (W / 2 - 4), sy * (D / 2 - 4), 0], cylinder({ r: 4 + rim, h: plateH, $fn: 32 }))));
// one socket's stepped profile: corner cones at +-17, radius r1 to r2 over h
const ring = (r1, r2, z, h) => hull(...quad.map(([sx, sy]) => translate([sx * 17, sy * 17, z], cylinder({ r1, r2, h, $fn: 32 }))));
const z0 = plateH - socketH;
const socket = union(
  ...(frame ? [ring(1.15, 1.15, -0.5, 0.51)] : []),   // the frame's opening runs out the bottom
  ring(1.15, 1.85, 0, 0.7),
  ring(1.85, 1.85, 0.69, 1.82),
  ring(1.85, 4.01, 2.5, 2.16),                       // just past the top face
);
const cuts = [];
for (let i = 0; i < cellsX; i++) {
  for (let j = 0; j < cellsY; j++) {
    const x0 = (i - (cellsX - 1) / 2) * 42, y0 = (j - (cellsY - 1) / 2) * 42;
    cuts.push(translate([x0, y0, z0], socket));
    // 6 x 2 mm disc magnets, 13 mm from the cell centre, sunk into the floor
    if (withMagnets) for (const [sx, sy] of quad) cuts.push(translate([x0 + sx * 13, y0 + sy * 13, z0 - 2.4], cylinder({ d: 6.5, h: 2.42, $fn: 24 })));
  }
}
return difference(plate, ...cuts);
`,
};
