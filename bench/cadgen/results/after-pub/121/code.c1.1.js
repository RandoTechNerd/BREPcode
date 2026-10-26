const AF = 300, T = 15, Z0 = 50, ZT = 65;
const RV = AF / 2 / Math.cos(Math.PI / 8);
const D2R = Math.PI / 180;
const HUB_R = 89.5, BORE_R = 77.5, BORE_TOP = 57.5;
const RIB_T = 12, RIB_OUT = 133.2, RIB_Z = 43.49, RIB_ANG = 25.12;
const BOSS_PCR = 85.36, BOSS_R = 8, HOLE10_R = 5;
const WIN_IN = 97.5, WIN_OUT = 139.28, WIN_HW = 30.5, WIN_R = 5;

// octagonal plate
const oct = [];
for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * D2R;
  oct.push([RV * Math.cos(a), RV * Math.sin(a)]);
}
const plate = translate([0, 0, Z0], linearExtrude({ h: T }, polygon(oct)));
const hub = cylinder({ r: HUB_R, h: Z0 + 0.5 });

const bosses = [], ribs = [];
const zHub = RIB_Z - (RIB_OUT - 87) * Math.tan(RIB_ANG * D2R);
for (let k = 0; k < 8; k++) {
  const ang = 22.5 + 45 * k;
  const a = ang * D2R;
  bosses.push(translate([BOSS_PCR * Math.cos(a), BOSS_PCR * Math.sin(a), 0],
    cylinder({ r: BOSS_R, h: Z0 + 0.5 })));
  ribs.push(rotate([0, 0, ang], translate([0, RIB_T / 2, 0], rotate([90, 0, 0],
    linearExtrude({ h: RIB_T }, polygon([[87, zHub], [RIB_OUT, RIB_Z], [RIB_OUT, Z0 + 0.5], [87, Z0 + 0.5]]))))));
}

const body = union(plate, hub, ...bosses, ...ribs);

// bore (F) and centre hole (C)
let m = difference(body, translate([0, 0, -1], cylinder({ r: BORE_R, h: BORE_TOP + 1 })));
m = difference(m, translate([0, 0, -1], cylinder({ r: 30, h: ZT + 2 })));

// windows (D): inner arc R97.5, outer flat, sides at 67.5 deg, R5 corners
const tan = Math.tan(22.5 * D2R);
let xi = 90;
for (let i = 0; i < 60; i++) {
  const lo = xi;
  const y = WIN_HW - (WIN_OUT - lo) * tan;
  if (lo * lo + y * y >= WIN_IN * WIN_IN) break;
  xi += 0.05;
}
const yi = WIN_HW - (WIN_OUT - xi) * tan;
const winShape = fillet({ r: WIN_R, edges: "z" }, linearExtrude({ h: T + 2 }, path2d(
  [WIN_OUT, -WIN_HW], [WIN_OUT, WIN_HW], [xi, yi],
  arcTo([WIN_IN, 0], [xi, -yi]),
)));
const wins = [];
for (let k = 0; k < 8; k++) wins.push(rotate([0, 0, 45 * k], translate([0, 0, Z0 - 1], winShape)));
m = difference(m, ...wins);

// bolt holes (A) and hub holes (B)
const holes = [];
const bp = [[56.56, 136.54], [136.54, 56.56]];
for (const [x, y] of bp) for (const sx of [-1, 1]) for (const sy of [-1, 1])
  holes.push(translate([sx * x, sy * y, Z0 - 1], cylinder({ r: 6.25, h: T + 2 })));
const hp = [[32.66, 78.86], [78.86, 32.66]];
for (const [x, y] of hp) for (const sx of [-1, 1]) for (const sy of [-1, 1])
  holes.push(translate([sx * x, sy * y, -1], cylinder({ r: HOLE10_R, h: ZT + 2 })));
m = difference(m, ...holes);

// floor pockets (G): 12 wedges on the top face
const P_IN = 33, P_OUT = 68, SPOKE_HW = 1.5, P_D = 4;
const pockets = [];
for (let k = 0; k < 12; k++) {
  const c = 15 + 30 * k;
  const pts = [];
  const span = (r) => 15 - Math.asin(SPOKE_HW / r) / D2R;
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const a = (c - span(P_OUT) + (2 * span(P_OUT) * i) / n) * D2R;
    pts.push([P_OUT * Math.cos(a), P_OUT * Math.sin(a)]);
  }
  for (let i = n; i >= 0; i--) {
    const a = (c - span(P_IN) + (2 * span(P_IN) * i) / n) * D2R;
    pts.push([P_IN * Math.cos(a), P_IN * Math.sin(a)]);
  }
  pockets.push(translate([0, 0, ZT - P_D], linearExtrude({ h: P_D + 1 }, polygon(pts))));
}
m = difference(m, ...pockets);
// SKIP R1: tiny floor-pocket blend
// SKIP notches in Ø60 hole: not dimensioned

return m;