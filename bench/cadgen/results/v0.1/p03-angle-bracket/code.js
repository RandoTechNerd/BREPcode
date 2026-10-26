const W = 100, D = 70, H = 80, T = 10;
const base = cube([W, D, T]);
const wall = cube([W, T, H]);

// Gusset: right triangle in the (y, z) plane, extruded 8 mm along X
const gProf = polygon([[8, 8], [39, 8], [8, 49]]);
const gusset = (x0) =>
  translate([x0, 0, 0],
    rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: 8 }, gProf))));

let part = union(base, wall, gusset(10), gusset(82));

// Slots through the base: 9 wide, 16 mm centre to centre, running along Y
const slot = (x) => hull({ exact: true },
  translate([x, 37, -1], cylinder({ r: 4.5, h: T + 2 })),
  translate([x, 53, -1], cylinder({ r: 4.5, h: T + 2 })));
part = difference(part, slot(30));
part = difference(part, slot(70));

// Countersunk holes through the wall, entering the front face (y = 0)
part = difference(part, drill([30, 0, 55], [0, -1, 0], { d: 6.6, through: true, csink: { d: 13, angle: 90 } }));
part = difference(part, drill([70, 0, 55], [0, -1, 0], { d: 6.6, through: true, csink: { d: 13, angle: 90 } }));

return part;
