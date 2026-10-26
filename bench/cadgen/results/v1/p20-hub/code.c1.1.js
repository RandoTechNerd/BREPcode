const C = 45, flangeD = 90, flangeT = 10, hubD = 45, hubH = 40;
const boreD = 25, keyW = 8, keyL = 7, keyCy = 57.5;
const boltD = 6.6, pcdR = 36, radD = 5, radDepth = 12, radZ = 28;

const body = union(
  translate([C, C, 0], cylinder({ d: flangeD, h: flangeT })),
  translate([C, C, flangeT - 0.5], cylinder({ d: hubD, h: hubH - flangeT + 0.5 })),
);

let part = difference(body, translate([C, C, -1], cylinder({ d: boreD, h: hubH + 2 })));
part = difference(part, translate([C - keyW / 2, keyCy - keyL / 2, -1], cube([keyW, keyL, hubH + 2])));

for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = drill([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), flangeT], [0, 0, 1], { d: boltD, through: true }).cut
    ? part
    : difference(part, translate([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), -1], cylinder({ d: boltD, h: flangeT + 2 })));
}

part = difference(part, translate([C, C - hubD / 2 - 1, radZ], rotate([-90, 0, 0], cylinder({ d: radD, h: radDepth + 1 }))));
part = difference(part, translate([C + hubD / 2 + 1, C, radZ], rotate([0, -90, 0], cylinder({ d: radD, h: radDepth + 1 }))));

return part;