const D = 120, T = 12, bossD = 50, bossH = 6, bore = 30;
const pcdA = 100, dA = 9;
const pcdC = 70, dC = 6.6, cbD = 11, cbDepth = 6.5;

let part = union(
  cylinder({ d: D, h: T }),
  translate([0, 0, T - 0.5], cylinder({ d: bossD, h: bossH + 0.5 })),
);

part = difference(part, translate([0, 0, -1], cylinder({ d: bore, h: T + bossH + 2 })));

for (let i = 0; i < 4; i++) {
  const a = i * 90 * Math.PI / 180;
  part = difference(part, translate([pcdA / 2 * Math.cos(a), pcdA / 2 * Math.sin(a), -1],
    cylinder({ d: dA, h: T + 2 })));
}

for (let i = 0; i < 6; i++) {
  const a = (30 + i * 60) * Math.PI / 180;
  const x = pcdC / 2 * Math.cos(a), y = pcdC / 2 * Math.sin(a);
  part = drill([x, y, T], [0, 0, 1], { d: dC, through: true, cbore: { d: cbD, depth: cbDepth } })(part);
}

return part;