const W = 80, D = 70, H = 90, T = 8;
const ribT = 10, ribX = W / 2 - ribT / 2;
const ribFootY = 59, ribTopZ = 74;

const base = cube([W, D, T]);
const upright = cube([W, T, H]);
const ribProfile = polygon([
  [T - 0.5, T - 0.5],
  [ribFootY, T - 0.5],
  [ribFootY, T],
  [T, ribTopZ],
  [T - 0.5, ribTopZ],
]);
const rib = translate([ribX, 0, 0],
  rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: ribT }, ribProfile))));

let part = union(base, upright, rib);

for (const [x, z] of [[15, 30], [65, 30], [15, 70], [65, 70]]) {
  part = difference(part, drill([x, 0, z], [0, -1, 0], { d: 8.5, through: true }));
}
for (const x of [15, 65]) {
  part = difference(part, drill([x, 50, T], [0, 0, 1], { d: 6.6, through: true }));
}

return part;