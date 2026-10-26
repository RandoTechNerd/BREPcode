const L = 120, W = 60;
const h1 = 15, h2 = 30, h3 = 45;
const ys = [15, 45];

const body = union(
  cube([L, W, h1]),
  translate([40, 0, h1 - 0.5], cube([80, W, h2 - h1 + 0.5])),
  translate([80, 0, h2 - 0.5], cube([40, W, h3 - h2 + 0.5])),
);

const holes = [];
for (const y of ys) {
  holes.push(drill([20, y, h1], [0, 0, 1], { d: 6.8, depth: 12 }));
  holes.push(drill([60, y, h2], [0, 0, 1], { d: 6.8, depth: 15 }));
  holes.push(drill([100, y, h3], [0, 0, 1], { d: 8, depth: 20 }));
}

let part = body;
for (const h of holes) part = difference(part, h);
return part;