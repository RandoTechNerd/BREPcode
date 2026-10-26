const CX = 45, CY = 45;
const flangeD = 90, flangeT = 10;
const hubD = 45, H = 40;
const boreD = 25;
const keyW = 8, keyL = 7, keyY = 57.5;
const pcdR = 36, boltD = 6.6;
const pinD = 5, pinDepth = 12, pinZ = 28;

const body = union(
  translate([CX, CY, 0], cylinder({ d: flangeD, h: flangeT })),
  translate([CX, CY, flangeT - 0.5], cylinder({ d: hubD, h: H - flangeT + 0.5 })),
);

let part = difference(body, translate([CX, CY, -1], cylinder({ d: boreD, h: H + 2 })));
part = difference(part, translate([CX - keyW / 2, keyY - keyL / 2, -1], cube([keyW, keyL, H + 2])));

const bolts = [];
for (let i = 0; i < 4; i++) {
  const a = (45 + i * 90) * Math.PI / 180;
  bolts.push(translate([CX + pcdR * Math.cos(a), CY + pcdR * Math.sin(a), -1],
    cylinder({ d: boltD, h: flangeT + 2 })));
}
part = difference(part, ...bolts);

// radial Ø5 x 12 hole from the -Y face of the hub (FRONT view)
part = difference(part,
  translate([CX, CY - hubD / 2 - 1, pinZ], rotate([-90, 0, 0], cylinder({ d: pinD, h: pinDepth + 1 }))));
// radial Ø5 x 12 hole from the +X face of the hub (RIGHT view)
part = difference(part,
  translate([CX + hubD / 2 + 1, CY, pinZ], rotate([0, -90, 0], cylinder({ d: pinD, h: pinDepth + 1 }))));

return part;