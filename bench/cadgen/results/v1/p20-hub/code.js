const C = 45, FR = 45, FT = 10, HR = 22.5, H = 40;
const boreD = 25, pcdR = 36, boltD = 6.6;
const keyW = 8, keyL = 7, keyY = 57.5;
const pinD = 5, pinDepth = 12, pinZ = 28;

let part = union(
  translate([C, C, 0], cylinder({ r: FR, h: FT })),
  translate([C, C, FT - 0.5], cylinder({ r: HR, h: H - FT + 0.5 })),
);

part = difference(part, drill([C, C, H], [0, 0, 1], { d: boreD, through: true }));
part = difference(part, translate([C - keyW / 2, keyY - keyL / 2, -1], cube([keyW, keyL, H + 2])));

for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, drill([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), FT], [0, 0, 1], { d: boltD, through: true }));
}

part = difference(part, drill([C + HR, C, pinZ], [1, 0, 0], { d: pinD, depth: pinDepth }));
part = difference(part, drill([C, C - HR, pinZ], [0, -1, 0], { d: pinD, depth: pinDepth }));

return part;