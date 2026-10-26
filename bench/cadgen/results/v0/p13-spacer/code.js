const OD = 80, ID = 40, H = 25, C = 1.5;
const R = OD / 2;
const PCD = 60, holeD = 5.5, cskD = 10;
const radD = 5, radZ = 12.5;

const body = union(
  cylinder({ r1: R - C, r2: R, h: C + 0.5 }),
  translate([0, 0, C], cylinder({ r: R, h: H - 2 * C })),
  translate([0, 0, H - C - 0.5], cylinder({ r1: R, r2: R - C, h: C + 0.5 })),
);

let part = difference(body, translate([0, 0, -1], cylinder({ r: ID / 2, h: H + 2 })));

for (let i = 0; i < 3; i++) {
  const a = (90 + i * 120) * Math.PI / 180;
  part = difference(part,
    drill([PCD / 2 * Math.cos(a), PCD / 2 * Math.sin(a), H], [0, 0, 1],
      { d: holeD, through: true, csk: { d: cskD, angle: 90 } }));
}

part = difference(part, drill([R, 0, radZ], [1, 0, 0], { d: radD, depth: R - ID / 2 + 2 }));

return part;
