const C = 45, FD = 90, FT = 10, HD = 45, H = 40, bore = 25;
const pcdR = 36, boltD = 6.6;

const body = union(
  translate([C, C, 0], cylinder({ r: FD / 2, h: FT })),
  translate([C, C, 0], cylinder({ r: HD / 2, h: H })),
);

// A: bore
let part = difference(body, translate([C, C, -1], cylinder({ r: bore / 2, h: H + 2 })));

// K: keyway pocket 8 x 7, outer edge at y = 57.5, depth 40 (full)
part = difference(part, translate([C - 4, 57.5 - 7, -1], cube([8, 7, H + 2])));

// B: 4x Ø6.6 thru on Ø72 PCD, 45° offset
const bolts = [];
for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  bolts.push(translate([C + pcdR * Math.cos(a), C + pcdR * Math.sin(a), -1], cylinder({ r: boltD / 2, h: FT + 2 })));
}
part = difference(part, ...bolts);

// S1: radial Ø5 x 12 from the front (-Y) face at z = 28
part = difference(part, drill([C, C - HD / 2, 28], [0, -1, 0], { d: 5, depth: 12 }));
// S2: radial Ø5 x 12 from the +X face at z = 28
part = difference(part, drill([C + HD / 2, C, 28], [1, 0, 0], { d: 5, depth: 12 }));

return part;