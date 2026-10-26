const D = 120, T = 12, bossD = 50, bossH = 6, bore = 30;
const pcdA = 100, dA = 9;
const pcdB = 70, dB = 6.6, cbD = 11, cbDepth = 6.5;

let part = union(
  cylinder({ r: D / 2, h: T }),
  translate([0, 0, T - 0.5], cylinder({ r: bossD / 2, h: bossH + 0.5 })),
);

part = difference(part, translate([0, 0, -1], cylinder({ r: bore / 2, h: T + bossH + 2 })));

for (let i = 0; i < 4; i++) {
  const a = (i * 90) * Math.PI / 180;
  part = difference(part, translate([pcdA / 2 * Math.cos(a), pcdA / 2 * Math.sin(a), -1],
    cylinder({ r: dA / 2, h: T + 2 })));
}

for (let i = 0; i < 6; i++) {
  const a = (30 + i * 60) * Math.PI / 180;
  const x = pcdB / 2 * Math.cos(a), y = pcdB / 2 * Math.sin(a);
  part = difference(part, translate([x, y, -1], cylinder({ r: dB / 2, h: T + 2 })));
  part = difference(part, translate([x, y, T - cbDepth], cylinder({ r: cbD / 2, h: cbDepth + 1 })));
}

return part;
