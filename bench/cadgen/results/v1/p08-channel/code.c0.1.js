const L = 140, W = 60, H = 45, t = 6;
const baseHoleD = 8.5, wallHoleD = 6.6, wallHoleZ = 28;

const body = union(
  cube([L, W, t]),
  cube([L, t, H]),
  translate([0, W - t, 0], cube([L, t, H])),
);

let part = body;
for (const x of [25, 70, 115]) {
  part = difference(part, translate([x, 30, -1], cylinder({ d: baseHoleD, h: t + 2 })));
}
for (const x of [35, 105]) {
  part = difference(part,
    translate([x, -1, wallHoleZ], rotate([-90, 0, 0], cylinder({ d: wallHoleD, h: t + 2 }))));
}
return part;