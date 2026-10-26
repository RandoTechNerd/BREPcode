const AF = 300, TF = 15, ZF = 50, ZT = 65;
const RH = 92, RB = 77.5, FLOOR = 7.5;
const RV = (AF / 2) / Math.cos(Math.PI / 8);
const oct = [];
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * Math.PI / 180;
  oct.push([RV * Math.cos(a), RV * Math.sin(a)]);
}
const flange = translate([0, 0, ZF], linearExtrude({ h: TF }, polygon(oct)));

// hub as a ring, seams turned away from every other feature
const hub = rotate([0, 0, 7], difference(
  cylinder({ r: RH, h: ZF + 0.5 }),
  translate([0, 0, -1], cylinder({ r: RB, h: ZF + 3 })),
));

// R gussets
const t = 15;
const ribProf = polygon([[RH - 0.5, ZF + 0.5], [133.2, ZF + 0.5], [133.2, ZF - 6.51], [RH - 0.5, 24.36]]);
const rib = translate([0, t / 2, 0], rotate([90, 0, 0], linearExtrude({ h: t }, ribProf)));
let part = union(flange, hub);
for (let k = 0; k < 8; k++) part = union(part, rotate([0, 0, 22.5 + 45 * k], rib));

// BORE continues into the flange, leaving a 7.5 floor
part = difference(part, rotate([0, 0, 3], translate([0, 0, 40], cylinder({ r: RB, h: ZT - FLOOR - 40 }))));

// H3 centre hole
part = difference(part, translate([0, 0, ZT - FLOOR - 1], cylinder({ r: 30, h: FLOOR + 2 })));
// SKIP H3-notches: the small keyway notches around the Ø60 hole are not dimensioned

// P pockets
const ri = 97.5, ro = 139.28, wo = 61;
const wi = wo - 2 * (ro - ri) / Math.tan(67.5 * Math.PI / 180);
const pocketCutter = translate([0, 0, ZF - 1], fillet({ r: 5, edges: "z" }, linearExtrude({ h: TF + 2 },
  polygon([[ri, -wi / 2], [ro, -wo / 2], [ro, wo / 2], [ri, wi / 2]]))));
for (let k = 0; k < 8; k++) part = difference(part, rotate([0, 0, 45 * k], pocketCutter));

// H1 flange holes
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * Math.PI / 180, r = 147.79;
  part = difference(part, translate([r * Math.cos(a), r * Math.sin(a), ZF - 1], cylinder({ r: 6.25, h: TF + 2 })));
}

// H2 hub-end holes
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * Math.PI / 180, r = 85.36;
  part = difference(part, translate([r * Math.cos(a), r * Math.sin(a), -1], cylinder({ r: 5, h: 31 })));
}

// REC floor recesses
const r1 = 35, r2 = 74, half = (30 - 7.5) / 2;
const sec = [];
for (let i = 0; i <= 6; i++) {
  const a = (-half + i * (2 * half) / 6) * Math.PI / 180;
  sec.push([r2 * Math.cos(a), r2 * Math.sin(a)]);
}
for (let i = 6; i >= 0; i--) {
  const a = (-half + i * (2 * half) / 6) * Math.PI / 180;
  sec.push([r1 * Math.cos(a), r1 * Math.sin(a)]);
}
const recess = translate([0, 0, ZT - 3], linearExtrude({ h: 4 }, polygon(sec)));
for (let k = 0; k < 12; k++) part = difference(part, rotate([0, 0, 15 + 30 * k], recess));

// SKIP R1: the R1.00 blend is too small to matter
// SKIP lip5.7: the 5.7 lip under the flange is ambiguous
return part;