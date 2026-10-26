const ringR = 27.5, boreR = 20, ringH = 40;
const armZ0 = 8, armT = 24;
const bossR = 10, holeR = 6.5, bossZ0 = 5.5, bossH = 29;
const pk = 7;
const P1 = [104.1, -18.5], P2 = [123.2, 35.9], P3 = [161.3, 15.5];

const arc = (p1, p2, R, sign, n) => {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1], d = Math.hypot(dx, dy);
  const h = Math.sqrt(R * R - d * d / 4);
  const cx = (p1[0] + p2[0]) / 2 + sign * h * (-dy) / d;
  const cy = (p1[1] + p2[1]) / 2 + sign * h * dx / d;
  const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
  let da = Math.atan2(p2[1] - cy, p2[0] - cx) - a1;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a1 + da * i / n;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
  }
  return pts;
};

const slab = (pts, z0, h) => translate([0, 0, z0], linearExtrude({ h }, polygon(pts)));

const armOutline = [[10, 26], [123.2, 45.9], [130, 40], [113, -15], [104.1, -28.5], [10, -25]];
const curvedOutline = [
  ...arc([123.2, 45.9], [171.3, 15.5], 59.4, -1, 12),
  ...arc([155, 8], [127, 26], 40, 1, 12),
];

const body = union(
  cylinder({ r: ringR, h: ringH }),
  slab(armOutline, armZ0, armT),
  slab(curvedOutline, armZ0, armT),
  translate([P1[0], P1[1], bossZ0], cylinder({ r: bossR, h: bossH })),
  translate([P2[0], P2[1], bossZ0], cylinder({ r: bossR, h: bossH })),
  translate([P3[0], P3[1], bossZ0], cylinder({ r: bossR, h: bossH })),
);

const pockets = [
  [[29, 22], [106, 36], [110, 33], [60, -1], [31, -3]],
  [[55, -20], [87.2, -20], [79.2, -6.1]],
  [[96, -8], [104, 5], [110, 9], [110, -7]],
];

let part = body;
for (const p of pockets) {
  part = difference(part, slab(p, armZ0 + armT - pk, pk + 1));
  part = difference(part, slab(p, armZ0 - 1, pk + 1));
}

part = difference(part, translate([0, 0, -1], cylinder({ r: boreR, h: ringH + 2 })));
for (const p of [P1, P2, P3]) {
  part = difference(part, translate([p[0], p[1], bossZ0 - 1], cylinder({ r: holeR, h: bossH + 2 })));
}
return part;