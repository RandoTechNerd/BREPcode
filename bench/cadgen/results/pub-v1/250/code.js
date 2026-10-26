const bx = 118.02, by = 100.52;
const bossR = 18 / 2;
const holeR = 12.65 / 2;
const oldTop = -12.44;
const newTop = 19.03;      // top face of the neighbouring Ø13 mounting hole
const L = newTop - oldTop;

const sleeve = difference(
  translate([bx, by, oldTop], cylinder({ r: bossR, h: L, $fn: 96 })),
  translate([bx, by, oldTop - 1], cylinder({ r: holeR, h: L + 2, $fn: 64 })),
);

return union(importedSolid("input.step"), sleeve);