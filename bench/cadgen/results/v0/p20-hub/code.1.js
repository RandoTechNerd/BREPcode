const FD = 90, FT = 10, HD = 45, H = 40, BORE = 25;
const PCD = 72, BOLT = 6.6;
const KW = 8, KL = 7, KC = 12.5;
const RH = 5, RDEPTH = 12, RZ = 28;

let part = union(
  cylinder({ d: FD, h: FT }),
  cylinder({ d: HD, h: H }),
);

part = difference(part, translate([0, 0, -1], cylinder({ d: BORE, h: H + 2 })));
part = difference(part, translate([-KW / 2, KC - KL / 2, -1], cube([KW, KL, H + 2])));

for (let i = 0; i < 4; i++) {
  const a = (45 + 90 * i) * Math.PI / 180;
  part = difference(part, translate([PCD / 2 * Math.cos(a), PCD / 2 * Math.sin(a), -1],
    cylinder({ d: BOLT, h: FT + 2 })));
}

part = difference(part, drill([0, -HD / 2, RZ], [0, -1, 0], { d: RH, depth: RDEPTH }));
part = difference(part, drill([HD / 2, 0, RZ], [1, 0, 0], { d: RH, depth: RDEPTH }));

return part;
