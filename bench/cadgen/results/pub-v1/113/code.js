const t = 1, H = 48.6, HW = 24.9, hemL = 4.7, hemR = 2;

const base = linearExtrude({ h: t }, polygon([
  [55, 0], [205, 0], [205, 200], [121.2, 200], [121.2, 125.6], [141.6, 106.2],
  [121.2, 86.9], [121.2, 59.3], [98, 59.3], [98, 40.1], [84, 40.1], [84, 24], [55, 24],
]));

const cutter = union(
  translate([-1, -2, -1], cube([36, 4, 26.5])),
  translate([35, -2, -1], cube([20, 4, 6.5])),
  translate([35, 2, 5.5], rotate([90, 0, 0], cylinder({ r: 20, h: 4 }))),
);
const hemWall = difference(cube([205, t, H]), cutter);

const ring = intersection(
  difference(
    translate([0, -2, H], rotate([0, 90, 0], cylinder({ r: hemR + t, h: 205 }))),
    translate([-1, -2, H], rotate([0, 90, 0], cylinder({ r: hemR, h: 207 }))),
  ),
  translate([0, -6, H], cube([205, 8, 5])),
);
const hemPlate = translate([0, -5, H - hemL], cube([205, t, hemL + 0.5]));

const sideWall = translate([204, 0, 0], cube([t, 200, HW]));

const gusset = (cx) => translate([cx - 2.5, 0, 0],
  rotate([0, 0, 90], rotate([90, 0, 0],
    linearExtrude({ h: 5 }, polygon([[0.5, 0.5], [6, 0.5], [0.5, 6]])))));

let part = union(base, hemWall, ring, hemPlate, sideWall,
  gusset(63.7), gusset(114.95), gusset(168.075));

for (const y of [50, 100, 150]) {
  part = difference(part, drill([205, y, 12.8], [1, 0, 0], { d: 6, through: true }));
}
part = difference(part, drill([141.6, 5, t], [0, 0, 1], { d: 4, through: true }));

return part;