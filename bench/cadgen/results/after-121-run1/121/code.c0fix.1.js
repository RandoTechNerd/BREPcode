const AF = 300, T = 15, HUB_H = 50, Z0 = HUB_H, ZT = HUB_H + T;
const BORE_R = 77.5, HUB_R = 87.5;
const deg = Math.PI / 180;
const Rv = (AF / 2) / Math.cos(22.5 * deg);

// flange plate: regular octagon, flats normal to X and Y
const octPts = [];
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * deg;
  octPts.push([Rv * Math.cos(a), Rv * Math.sin(a)]);
}
const plate = translate([0, 0, Z0], linearExtrude({ h: T }, polygon(octPts)));

// hub tube, run 0.5 mm into the plate
const hub = cylinder({ r: HUB_R, h: HUB_H + 0.5 });

// bosses on the hub rim at the Ø10 hole positions
const hubHoleR = Math.hypot(32.66, 78.86);
const bosses = [];
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * deg;
  bosses.push(translate([hubHoleR * Math.cos(a), hubHoleR * Math.sin(a), 0], cylinder({ r: 9, h: HUB_H + 0.5 })));
}

// F: gussets. At r 133.2 the underside is z 43.49 (21.51 below the face),
// then it slopes 25.12° down toward the hub; inner end runs into the hub/boss.
const GT = 15.08, rTip = 266.43 / 2, zTip = ZT - 21.51, slope = Math.tan(25.12 * deg);
const rIn0 = 86;
const zIn0 = zTip - (rTip - rIn0) * slope;
const ribProfile = polygon([[rIn0, zIn0], [rTip, zTip], [rTip, Z0 + 0.5], [rIn0, Z0 + 0.5]]);
const rib = translate([0, GT / 2, 0], rotate([90, 0, 0], linearExtrude({ h: GT }, ribProfile)));
const ribs = [];
for (let k = 0; k < 8; k++) ribs.push(rotate([0, 0, 22.5 + 45 * k], rib));

let body = union(plate, hub, ...bosses, ...ribs);

// D: Ø155 bore
body = difference(body, translate([0, 0, -1], cylinder({ r: BORE_R, h: HUB_H + 1 })));
// B: Ø60 centre hole
body = difference(body, translate([0, 0, Z0 - 1], cylinder({ r: 30, h: T + 2 })));

// A: 8 x Ø12.5 plate holes
const plateHoles = [[136.54, 56.56], [56.56, 136.54], [-56.56, 136.54], [-136.54, 56.56],
                    [-136.54, -56.56], [-56.56, -136.54], [56.56, -136.54], [136.54, -56.56]];
body = difference(body, ...plateHoles.map(([x, y]) =>
  translate([x, y, Z0 - 1], cylinder({ r: 6.25, h: T + 2 }))));

// C: 8 x Ø10 hub holes
const hubHoles = [[78.86, 32.66], [32.66, 78.86], [-32.66, 78.86], [-78.86, 32.66],
                  [-78.86, -32.66], [-32.66, -78.86], [32.66, -78.86], [78.86, -32.66]];
body = difference(body, ...hubHoles.map(([x, y]) =>
  translate([x, y, -1], cylinder({ r: 5, h: 21 }))));

// E: 8 trapezoid windows (DETAIL D), R5 TYP corners
const rIn = 97.5, rOut = 139.28, wOut = 61;
const wIn = wOut - 2 * (rOut - rIn) / Math.tan(67.5 * deg);
const win = fillet({ r: 5, edges: "z" }, translate([0, 0, Z0 - 1], linearExtrude({ h: T + 2 }, polygon([
  [rIn, -wIn / 2], [rOut, -wOut / 2], [rOut, wOut / 2], [rIn, wIn / 2],
]))));
for (let k = 0; k < 8; k++) body = difference(body, rotate([0, 0, 45 * k], win));

// G: 12 spoke pockets in the outer plate face, 7.5 deep, centred at 15°+30k
const r1 = 36, r2 = 74, half = 15 * deg, off = 2.5 / Math.cos(half);
const pk = translate([0, 0, ZT - 7.5], linearExtrude({ h: 8.5 }, polygon([
  [r1, -(r1 * Math.tan(half) - off)], [r2, -(r2 * Math.tan(half) - off)],
  [r2, r2 * Math.tan(half) - off], [r1, r1 * Math.tan(half) - off],
])));
for (let k = 0; k < 12; k++) body = difference(body, rotate([0, 0, 15 + 30 * k], pk));

// SKIP R1.00: small blend in SECTION C-C, not worth the build cost
// SKIP key notches: notches on the Ø60 hole are not dimensioned
return body;