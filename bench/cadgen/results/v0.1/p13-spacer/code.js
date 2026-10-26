const OD = 80, ID = 40, H = 25, C = 1.5;
const PCD = 60, holeD = 5.5, cskD = 10;
const radD = 5, radZ = 12.5;

const R = OD / 2;
const body = intersection(
  cylinder({ r: R, h: H }),
  cylinder({ r1: R - C, r2: R - C + H, h: H }),
  cylinder({ r1: R - C + H, r2: R - C, h: H }),
);

let part = difference(body, translate([0, 0, -1], cylinder({ r: ID / 2, h: H + 2 })));

for (let i = 0; i < 3; i++) {
  const a = (90 + i * 120) * Math.PI / 180;
  part = difference(part,
    drill([PCD / 2 * Math.cos(a), PCD / 2 * Math.sin(a), H], [0, 0, 1],
      { d: holeD, through: true, csink: { d: cskD, angle: 90 } }));
}

part = difference(part,
  translate([ID / 2 - 3, 0, radZ], rotate([0, 90, 0], cylinder({ r: radD / 2, h: R - ID / 2 + 5 }))));

return part;
