const C = 60, R = 60, T = 12, BR = 25, BH = 6;
let part = union(
  translate([C, C, 0], cylinder({ r: R, h: T })),
  translate([C, C, T - 0.5], cylinder({ r: BR, h: BH + 0.5 }))
);
part = difference(part, translate([C, C, -1], cylinder({ r: 15, h: T + BH + 2 })));
for (let i = 0; i < 4; i++) {
  const a = i * 90 * Math.PI / 180;
  part = difference(part, translate([C + 50 * Math.cos(a), C + 50 * Math.sin(a), -1], cylinder({ d: 9, h: T + 2 })));
}
for (let i = 0; i < 6; i++) {
  const a = (30 + i * 60) * Math.PI / 180;
  const x = C + 35 * Math.cos(a), y = C + 35 * Math.sin(a);
  part = difference(part, translate([x, y, -1], cylinder({ d: 6.6, h: T + 2 })));
  part = difference(part, translate([x, y, T - 6.5], cylinder({ d: 11, h: 7.5 })));
}
return part;
