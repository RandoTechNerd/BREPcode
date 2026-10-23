// A Gridfinity bin: x by y cells of 42 mm, u units of 7 mm tall, with the
// stacking lip and optional compartments. The geometry is the shelf's
// gridfinityBin(), which follows the open standard and is measured in
// test/shelf.js; this family adds the words people use and the magnet
// pockets under each foot (6 x 2 mm discs, 13 mm from the cell centre).

export default {
  id: "gridfinity-bin",
  category: "storage",
  title: "Gridfinity bin",
  summary: "a Gridfinity storage bin sized in 42 mm cells and 7 mm units, with the stacking lip and optional compartments.",
  print: "upright as shown, no supports. Magnet pockets, if you add them, are small bridges.",
  names: ["gridfinity bin", "gridfinity box", "gridfinity container", "gridfinity storage bin", "gridfinity cup",
    "gridfinity drawer bin", "gridfinity organizer", "gridfinity tray"],
  nouns: ["bin", "cup", "container"],
  keywords: ["gridfinity", "drawer", "grid", "modular", "cell"],
  triple: ["cellsX", "cellsY", "units"],
  tips: ["2x3", "6 units tall", "3 compartments", "with magnets"],
  examples: ["make me a gridfinity bin", "gridfinity bin 2x3 with 3 compartments",
    "a 1x1 gridfinity container 6u", "gridfinity box with magnets"],
  bridgeArea: (v) => v.magnets === "yes" ? v.cellsX * v.cellsY * 4 * 36 : 0,
  params: {
    cellsX: { default: 2, min: 1, max: 6, unit: "count", label: "cells across (42 mm each)", say: ["cell", "across", "wide"] },
    cellsY: { default: 1, min: 1, max: 6, unit: "count", label: "cells deep (42 mm each)", say: ["deep", "row"] },
    units: { default: 3, min: 2, max: 12, unit: "count", label: "height in 7 mm units", say: ["u", "unit", "units", "tall", "high"] },
    compX: { default: 1, min: 1, max: 6, unit: "count", label: "compartments across", say: ["compartment", "section", "divider", "slot"] },
    compY: { default: 1, min: 1, max: 6, unit: "count", label: "compartments deep" },
    wall: { default: 1.2, min: 0.8, max: 2.4, unit: "mm", label: "wall thickness", say: ["wall"] },
    lip: { default: "yes", unit: "choice", choices: ["no", "yes"], label: "stacking lip",
      words: { no: ["no lip", "without lip", "without a lip", "lipless", "no stacking lip"], yes: ["stacking lip", "with lip"] } },
    magnets: { default: "no", unit: "choice", choices: ["no", "yes"], label: "magnet pockets under the feet",
      words: { no: ["no magnets", "without magnets"], yes: ["magnet", "magnets", "magnetic"] } },
  },
  things: [
    { names: ["gridfinity 1x1 bin", "1x1 gridfinity bin", "small gridfinity bin"], title: "Gridfinity 1x1 bin", params: { cellsX: 1, cellsY: 1 } },
    { names: ["gridfinity 2x2 bin", "2x2 gridfinity bin"], title: "Gridfinity 2x2 bin", params: { cellsX: 2, cellsY: 2 } },
    { names: ["gridfinity 3x2 bin", "large gridfinity bin", "big gridfinity bin"], title: "Gridfinity 3x2 bin", params: { cellsX: 3, cellsY: 2, units: 6 } },
    { names: ["gridfinity divided bin", "gridfinity compartment bin", "gridfinity sorting bin"], title: "Gridfinity divided bin",
      params: { cellsX: 3, cellsY: 1, compX: 3 } },
    { names: ["gridfinity screw bin", "gridfinity parts bin", "gridfinity small parts bin"], title: "Gridfinity small parts bin",
      params: { cellsX: 2, cellsY: 2, compX: 2, compY: 2 } },
    { names: ["gridfinity tall bin", "tall gridfinity bin", "gridfinity pen bin"], title: "Gridfinity tall bin", params: { cellsX: 1, cellsY: 1, units: 9 } },
    { names: ["gridfinity shallow bin", "shallow gridfinity bin", "gridfinity tray bin"], title: "Gridfinity shallow bin", params: { cellsX: 2, cellsY: 2, units: 2 } },
    { names: ["gridfinity magnet bin", "magnetic gridfinity bin"], title: "Gridfinity magnet bin", params: { magnets: "yes" } },
  ],
  body: `
const bin = gridfinityBin({ x: cellsX, y: cellsY, u: units, divX: compX, divY: compY, wall, lip: lip === "yes" });
if (magnets !== "yes") return bin;
// 6 x 2 mm disc magnets: a 6.5 mm pocket 2.4 deep, four per foot
const pockets = [];
for (let i = 0; i < cellsX; i++) {
  for (let j = 0; j < cellsY; j++) {
    const x0 = (i - (cellsX - 1) / 2) * 42, y0 = (j - (cellsY - 1) / 2) * 42;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pockets.push(translate([x0 + sx * 13, y0 + sy * 13, -0.01], cylinder({ d: 6.5, h: 2.41, $fn: 24 })));
    }
  }
}
return difference(bin, ...pockets);
`,
};
