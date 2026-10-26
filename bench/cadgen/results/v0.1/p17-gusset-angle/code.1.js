const W = 90, D = 70, H = 70, T = 12, R = 8;
const base = cube([W, D, T]);
const upright = cube([W, T, H]);
const filletBlock = difference(
  translate([0, T - 0.5, T - 0.5], cube([W, R + 0.5, R + 0.5])),
  translate([-1, T + R, T + R], rotate([0, 90, 0], cylinder({ r: R, h: W + 2 }))),
);
let part = union(base, upright, filletBlock);
part = difference(part, drill([45, 0, 45], [0, -1, 0], { d: 26, through: true }));
part = difference(part, drill([20, 48, T], [0, 0, 1], { d: 9, through: true, cbore: { d: 15, depth: 9 } }));
part = difference(part, drill([70, 48, T], [0, 0, 1], { d: 9, through: true, cbore: { d: 15, depth: 9 } }));
return part;
