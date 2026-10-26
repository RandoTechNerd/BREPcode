const cx = 0, cy = 13;
const rIn = 40, rBoss = 44, rTip = 61.45;
const zTop = 15, zLow = -1.31;
const T = 5 + 10;

const profile = polygon([
  [rIn, zTop + 1],
  [rTip, zTop + 1],
  [rTip, zTop],
  [rBoss, zLow],
  [rIn, zLow],
]);
const ribBase = rotate([90, 0, 0], linearExtrude({ h: T, center: true }, profile));
const rib = (a) => translate([cx, cy, 0], rotate([0, 0, a], ribBase));

return union(
  importedSolid("input.step"),
  rib(90),
  rib(210),
  rib(330),
);