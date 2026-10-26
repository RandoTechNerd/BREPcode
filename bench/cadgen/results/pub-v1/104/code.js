const FW = 78.6, FD = 67.8, FT = 10, FZ = 84.8;
const BX = 39.3, BR = 17;
const SX = 94.7, ST = 13.2, BZ = 61.5;
const BW = 22, LR = 7.2;

const topFlange = translate([0, -FD / 2, FZ], fillet({ r: 10, edges: "z" }, cube([FW, FD, FT])));

const prof = polygon([[0, 85.3], [95.2, 85.3], [95.2, 21.5], [77.9, 0], [45, 0]]);
const body = translate([0, BW, 0], rotate([90, 0, 0], linearExtrude({ h: 2 * BW }, prof)));

const lugs = [[39.7, -3.2], [-3.2, 43.2], [-26.3, -17.3], [-62.4, -5.8]];
const xCyl = (x, y, z, r, h) => translate([x, y, z], rotate([0, 90, 0], cylinder({ r, h })));

let plate = xCyl(SX, 0, BZ, 37.5, ST);
for (const [hy, hz] of lugs) {
  const L = Math.hypot(hy, hz);
  const ang = Math.atan2(hz, hy) * 180 / Math.PI;
  const arm = translate([SX, 0, BZ], rotate([ang, 0, 0], translate([0, 0, -LR], cube([ST, L, 2 * LR]))));
  plate = union(plate, arm, xCyl(SX, hy, BZ + hz, LR, ST));
}

let part = union(body, topFlange, plate);

part = difference(part, translate([BX, 0, BZ], cylinder({ r: BR, h: 40 })));
part = difference(part, xCyl(BX, 0, BZ, BR, 80));
part = difference(part, translate([BX, 0, BZ], sphere({ r: BR })));

for (const [x, y] of [[BX - 29.4, 25.4], [BX + 29.4, 25.4], [BX - 29.4, -25.4], [BX + 29.4, -25.4]]) {
  part = difference(part, translate([x, y, FZ - 1], cylinder({ r: 4.6, h: FT + 2 })));
}

for (const [hy, hz] of lugs) {
  const z = BZ + hz;
  part = difference(part, xCyl(SX - 30, hy, z, 2.4, ST + 32));
  part = difference(part, translate([SX + ST - 2.1, hy, z], rotate([0, 90, 0], cylinder({ r1: 2.4, r2: 4.6, h: 2.2 }))));
  part = difference(part, xCyl(SX + ST + 0.09, hy, z, 4.6, 1));
}

return part;