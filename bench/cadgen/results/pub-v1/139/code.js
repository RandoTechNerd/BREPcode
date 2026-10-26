const FB = 314, TB = 35, H = 270, TF = 300, TT = 35;
const BODY = 290, CAV = 240, P = 120;
const sq = (w, z0, h, r) => translate([-w / 2, -w / 2, z0], fillet({ r, edges: "z" }, cube([w, w, h])));

const outer = union(
  sq(FB, 0, TB, 30),
  cylinder({ r: 164, h: 131.8 }),
  sq(BODY, TB - 0.5, 235.5 - TB + 0.5, 30),
  sq(TF, H - TT, TT, 30),
);

let part = difference(outer, union(
  sq(CAV, TB, H - TB + 1, 30),
  translate([0, 0, TB], cylinder({ r: 154, h: 131.8 - TB })),
));

for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
  part = difference(part, translate([sx * P, sy * P, TB], cylinder({ r: 22, h: H - TT - TB })));
}

const ribs = [];
for (let i = 0; i < 4; i++) {
  ribs.push(rotate([0, 0, 45 + 90 * i], translate([60, -7.5, TB - 0.5], cube([80, 15, 176 - TB + 0.5]))));
}
part = union(part, cylinder({ r: 65, h: 176 }), ...ribs);

part = difference(part, translate([0, 0, TB], cylinder({ r: 50, h: H })));

for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
  part = difference(part, translate([sx * P, sy * P, H - TT - 1], cylinder({ r: 15, h: TT + 2 })));
  part = difference(part, translate([sx * P, sy * P, -1], cylinder({ r: 12.5, h: TB + 2 })));
}

return part;