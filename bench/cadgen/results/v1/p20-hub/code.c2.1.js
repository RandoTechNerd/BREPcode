const CX = 45, CY = 45;
const flangeR = 45, flangeT = 10;
const hubR = 22.5, H = 40;
const boreD = 25;
const keyW = 8, keyL = 7, keyCY = 57.5;
const boltD = 6.6, pcdR = 36;
const setD = 5, setZ = 28, setDepth = 12;

let part = union(
  translate([CX, CY, 0], cylinder({ r: flangeR, h: flangeT })),
  translate([CX, CY, flangeT - 0.5], cylinder({ r: hubR, h: H - flangeT + 0.5 })),
);

// A: bore
part = difference(part, translate([CX, CY, -1], cylinder({ d: boreD, h: H + 2 })));

// B: keyway pocket, 8 x 7, centred at y = 57.5, depth 40 (full height)
part = difference(part, translate([CX - keyW / 2, keyCY - keyL / 2, -1], cube([keyW, keyL, H + 2])));

// C: 4x bolt holes on the Ø72 PCD, at 45° offset
for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, drill([CX + pcdR * Math.cos(a), CY + pcdR * Math.sin(a), flangeT], [0, 0, 1], { d: boltD, through: true }));
}

// D: radial hole from the +X face of the hub
part = difference(part, drill([CX + hubR, CY, setZ], [1, 0, 0], { d: setD, depth: setDepth }));

// E: radial hole from the -Y face of the hub
part = difference(part, drill([CX, CY - hubR, setZ], [0, -1, 0], { d: setD, depth: setDepth }));

return part;