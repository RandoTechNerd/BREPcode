const W = 90, D = 70, H = 70, T = 12, R = 8;

const base = cube([W, D, T]);
const wall = cube([W, T, H]);

// R8 inside-corner fillet: a square strip with the round taken out of it
const filletBlock = difference(
  translate([0, T - 0.5, T - 0.5], cube([W, R + 0.5, R + 0.5])),
  translate([-1, T + R, T + R], rotate([0, 90, 0], cylinder({ r: R, h: W + 2 }))),
);

let part = union(base, wall, filletBlock);

// B: Ø26 through hole in the wall
part = difference(part, translate([45, -1, 45], rotate([-90, 0, 0], cylinder({ r: 13, h: T + 2 }))));

// A: 2X Ø9 thru, counterbore Ø15 x 9 deep from the top of the base
part = difference(part, drill([20, 48, T], [0, 0, 1], { d: 9, through: true, cbore: { d: 15, depth: 9 } }));
part = difference(part, drill([70, 48, T], [0, 0, 1], { d: 9, through: true, cbore: { d: 15, depth: 9 } }));

return part;