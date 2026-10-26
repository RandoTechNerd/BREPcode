const L = 120, W = 60;
const H1 = 15, H2 = 30, H3 = 45;
const body = union(
  cube([40.5, W, H1]),
  translate([40, 0, 0], cube([40.5, W, H2])),
  translate([80, 0, 0], cube([40, W, H3])),
);
const ys = [15, 45];
let part = body;
for (const y of ys) {
  part = difference(part,
    drill([20, y, H1], [0, 0, 1], { d: 6.8, depth: 12 }),
    drill([60, y, H2], [0, 0, 1], { d: 6.8, depth: 15 }),
    drill([100, y, H3], [0, 0, 1], { d: 8, depth: 20 }),
  );
}
return part;
