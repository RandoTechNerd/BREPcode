const C = 45, flangeD = 90, flangeT = 10, hubD = 45, H = 40;
const boreD = 25, boltD = 6.6, pcdR = 36, radialZ = 28;

const body = union(
  translate([C, C, 0], cylinder({ d: flangeD, h: flangeT })),
  translate([C, C, flangeT - 0.5], cylinder({ d: hubD, h: H - flangeT + 0.5 })),
);

// A: bore through
let part = difference(body, translate([C, C, -1], cylinder({ d: boreD, h: H + 2 })));

// K: keyway pocket 8 (x) by 7 (y), centred at y=57.5, full height
part = difference(part, translate([C - 4, 57.5 - 3.5, -1], cube([8, 7, H + 2])));

// B: 4x Ø6.6 thru on the Ø72 PCD, 45° offset
for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, drill([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), flangeT], [0, 0, 1], { d: boltD, through: true }));
}

// R1: radial Ø5 ↧12 from the -Y face of the hub
part = difference(part, drill([C, C - hubD / 2, radialZ], [0, -1, 0], { d: 5, depth: 12 }));
// R2: radial Ø5 ↧12 from the +X face of the hub
part = difference(part, drill([C + hubD / 2, C, radialZ], [1, 0, 0], { d: 5, depth: 12 }));

return part;