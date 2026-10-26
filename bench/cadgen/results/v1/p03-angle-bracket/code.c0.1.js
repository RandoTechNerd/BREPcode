const L = 100, D = 70, H = 80, T = 10;
const gT = 8, gY = 31, gZ = 41, g0 = 8;

const base = cube([L, D, T]);
const upright = cube([L, T, H]);

const gussetProfile = polygon([[g0, g0], [g0 + gY, g0], [g0, g0 + gZ]]);
const gusset = (x) =>
  translate([x, 0, 0],
    rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: gT }, gussetProfile))));

let part = union(base, upright, gusset(10), gusset(82));

const slot = (x) =>
  hull({ exact: true },
    translate([x, 45 - 8, -1], cylinder({ r: 4.5, h: T + 2 })),
    translate([x, 45 + 8, -1], cylinder({ r: 4.5, h: T + 2 })));

part = difference(part, slot(30));
part = difference(part, slot(70));

part = difference(part, drill([30, 0, 55], [0, -1, 0], { d: 6.6, through: true, csink: { d: 13, angle: 90 } }));
part = difference(part, drill([70, 0, 55], [0, -1, 0], { d: 6.6, through: true, csink: { d: 13, angle: 90 } }));

return part;