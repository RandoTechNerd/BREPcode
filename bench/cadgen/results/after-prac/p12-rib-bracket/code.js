const W = 80, D = 70, H = 90, T = 8;
const ribT = 10, ribTopZ = 74, ribEndY = 59;

const base = cube([W, D, T]);
const upright = cube([W, T + 0.5, H]);   // overlaps the base

// rib side profile in (y, z), both ends run 0.5 into the plates
const ribProfile = polygon([
  [T - 0.5, T - 0.5],
  [ribEndY, T - 0.5],
  [ribEndY, T],
  [T, ribTopZ],
  [T - 0.5, ribTopZ],
]);
const rib = translate([W / 2 - ribT / 2, 0, 0],
  rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: ribT }, ribProfile))));

let part = union(base, upright, rib);

// A: base holes
part = difference(part,
  drill([15, 50, T], [0, 0, 1], { d: 6.6, through: true }),
  drill([65, 50, T], [0, 0, 1], { d: 6.6, through: true }),
);

// B: upright holes
part = difference(part,
  drill([15, 0, 30], [0, -1, 0], { d: 8.5, through: true }),
  drill([65, 0, 30], [0, -1, 0], { d: 8.5, through: true }),
  drill([15, 0, 70], [0, -1, 0], { d: 8.5, through: true }),
  drill([65, 0, 70], [0, -1, 0], { d: 8.5, through: true }),
);

return part;