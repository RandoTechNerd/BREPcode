const AF = 300, TF = 15, ZF = 50, ZT = 65;
const RH = 92, RB = 77.5, FLOOR = 7.5;
const RV = (AF / 2) / Math.cos(Math.PI / 8);
const oct = [];
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * Math.PI / 180;
  oct.push([RV * Math.cos(a), RV * Math.sin(a)]);
}
const flange = translate([0, 0, ZF], linearExtrude({ h: TF }, polygon(oct)));
const hub = cylinder({ r: RH, h: ZF + 0.5 });

// gussets R
const t = 15;
const ribProf = polygon([[RH - 0.5, ZF + 0.5], [133.2, ZF + 0.5], [133.2, ZF - 6.51], [RH - 0.5, 24.36]]);
const rib = translate([0, t / 2, 0], rotate([90, 0, 0], linearExtrude({ h: t }, ribProf)));
const ribs = [];
for (let k = 0; k < 8; k++) ribs.push(rotate([0, 0, 22.5 + 45 * k], rib));

let part = union(flange, hub, ...ribs);

// BORE (floor 7.5 left at top)
part = difference(part, translate([0, 0, -1], cylinder({ r: RB, h: ZT - FLOOR + 1 })));

// H3 centre hole
part = difference(part, translate([0, 0, ZT - FLOOR - 1], cylinder({ r: 30, h: FLOOR + 2 })));
// SKIP H3-notches: small keyway notches round the Ø60 hole are not dimensioned

// P pockets: trapezoid, inner r 97.5, outer r 139.28, outer width 61, sides at 67.5°
const ri = 97.5, ro = 139.28, wo = 61;
const wi = wo - 2 * (ro - ri) / Math.tan(67.5 * Math.PI / 180);
const pocketCutter = fillet({ r: 5, edges: "z" }, translate([0, 0, ZF - 1], linearExtrude({ h: TF + 2 },
  polygon([[ri, -wi / 2], [ro, -wo / 2], [ro, wo / 2], [ri, wi / 2]]))));
for (let k = 0; k < 8; k++) part = difference(part, rotate([0, 0, 45 * k], pocketCutter));

// H1 flange holes
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * Math.PI / 180, r = 147.79;
  part = difference(part, drill([r * Math.cos(a), r * Math.sin(a), ZT], [0, 0, 1], { d: 12.5, through: true }));
}

// H2 hub-end holes
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * Math.PI / 180, r = 85.36;
  part = difference(part, drill([r * Math.cos(a), r * Math.sin(a), 0], [0, 0, -1], { d: 10, depth: 50 }));
}

// REC floor recesses: 12 sectors, 30° pitch, 7.5° webs, depth 3
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

// SKIP R1: R1.00 blend is too small to matter
// SKIP lip5.7: the 5.7 lip under the flange is ambiguous
return part;