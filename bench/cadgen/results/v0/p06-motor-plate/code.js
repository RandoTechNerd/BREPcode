const W = 70, D = 70, T = 6;
const cornerHoles = [[6, 6], [64, 6], [6, 64], [64, 64]];
const motorHoles = [[19.5, 19.5], [50.5, 19.5], [19.5, 50.5], [50.5, 50.5]];

let part = cube([W, D, T]);

part = difference(part, translate([35, 35, -1], cylinder({ r: 22.5 / 2, h: T + 2 })));

for (const [x, y] of cornerHoles) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 5.5, through: true }));
}

for (const [x, y] of motorHoles) {
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 3.4, through: true, cbore: { d: 6.5, depth: 3.5 } }));
}

return part;
