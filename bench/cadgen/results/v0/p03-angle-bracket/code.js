const W = 100, D = 70, H = 80, T = 10, G = 8;

const base = cube([W, D, T]);
const upright = cube([W, T, H]);

const gussetProfile = polygon([[8, 8], [39, 8], [8, 49]]);
const gusset = (x) => translate([x, 0, 0],
  rotate([90, 0, 90], linearExtrude({ h: G }, gussetProfile)));

let body = union(base, upright, gusset(10), gusset(82));

const slot = (x) => hull({ exact: true },
  translate([x, 37, -1], cylinder({ r: 4.5, h: T + 2 })),
  translate([x, 53, -1], cylinder({ r: 4.5, h: T + 2 })));

body = difference(body, slot(30));
body = difference(body, slot(70));

body = difference(body, drill([30, 0, 55], [0, -1, 0], { d: 6.6, through: true, csk: { d: 13, angle: 90 } }));
body = difference(body, drill([70, 0, 55], [0, -1, 0], { d: 6.6, through: true, csk: { d: 13, angle: 90 } }));

return body;
