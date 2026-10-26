const W = 80, D = 70, H = 90, T = 8;
const ribT = 10, ribX = (W - ribT) / 2;
const ribTop = 74, ribToe = 59;

const base = cube([W, D, T]);
const wall = cube([W, T, H]);

// rib profile in (y, z), pushed 0.5 mm into the wall and base so the union overlaps
const ribProfile = polygon([
  [T - 0.5, T - 0.5],
  [ribToe, T - 0.5],
  [T - 0.5, ribTop],
]);
const rib = translate([ribX, 0, 0],
  rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: ribT }, ribProfile))));

let part = union(base, wall, rib);

// base holes
for (const x of [15, 65]) {
  part = difference(part, drill([x, 50, T], [0, 0, 1], { d: 6.6, through: true }));
}
// wall holes
for (const x of [15, 65]) {
  for (const z of [30, 70]) {
    part = difference(part, drill([x, 0, z], [0, -1, 0], { d: 8.5, through: true }));
  }
}

return part;