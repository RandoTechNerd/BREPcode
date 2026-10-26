const T = 1, BX = 98, BY = 97, FH = 15;
const base = cube([BX, BY, T]);
const front = cube([100, T, FH]);
const rear = translate([0, BY - T, 0], cube([100, T, FH]));
const pocketWall = translate([12.5, 7.5, -6], difference(
  cube([25, 25, 6.5]),
  translate([1, 1, -1], cube([23, 23, 9])),
));
const hem1 = translate([99.5, 4, -1], rotate([-90, 0, 0], difference(
  cylinder({ r: 2, h: 21 }),
  translate([0, 0, -1], cylinder({ r: 1, h: 23 })),
)));
const hem2 = translate([99.5, 70, -1], rotate([-90, 0, 0], difference(
  cylinder({ r: 2, h: 25 }),
  translate([0, 0, -1], cylinder({ r: 1, h: 27 })),
)));
let p = union(base, front, rear, pocketWall, hem1, hem2);

// flange holes
for (const x of [10, 30, 50, 70, 90]) {
  p = difference(p, drill([x, 0, 8], [0, -1, 0], { d: 4, through: true }));
  p = difference(p, drill([x, BY, 8], [0, 1, 0], { d: 4, through: true }));
}
// round holes
p = difference(p, drill([10, 45.5, T], [0, 0, 1], { d: 10, through: true }));
p = difference(p, drill([90, 45.5, T], [0, 0, 1], { d: 10, through: true }));
p = difference(p, drill([50, 45.5, T], [0, 0, 1], { d: 20, through: true }));

const slot = (x, y0, y1, w) => translate([0, 0, -2], hull({ exact: true },
  translate([x, y0, 0], cylinder({ r: w / 2, h: T + 4 })),
  translate([x, y1, 0], cylinder({ r: w / 2, h: T + 4 })),
));
for (const x of [63.3, 73.3, 83.3]) p = difference(p, slot(x, 8.8, 33.3, 5));
for (let i = 0; i < 5; i++) p = difference(p, slot(17.5 + 15 * i, 62, 82, 4.1));

// pocket cutout
p = difference(p, translate([14, 9, -8], fillet({ r: 2, edges: "z" }, cube([22, 22, 10]))));
return p;