const L = 130, D = 40, TB = 14;
const PX = 35, PW = 60, PH = 64, R = 10;
const cx = 65, bz = 38;

const yCyl = (x, z, r) => translate([x, -1, z], rotate([-90, 0, 0], cylinder({ r, h: D + 2 })));

const base = cube([L, D, TB]);
const pedestal = union(
  translate([PX, 0, 0], cube([PW, D, PH - R])),
  translate([PX + R, 0, 0], cube([PW - 2 * R, D, PH])),
  translate([PX + R, 0, PH - R], rotate([-90, 0, 0], cylinder({ r: R, h: D }))),
  translate([PX + PW - R, 0, PH - R], rotate([-90, 0, 0], cylinder({ r: R, h: D }))),
);
let body = union(base, pedestal);

body = difference(body, yCyl(cx, bz, 16));
body = difference(body, translate([cx, 20, PH - 12], cylinder({ r: 3, h: 13 })));

const slot = (xc) => hull({ exact: true },
  translate([xc - 5, 20, -1], cylinder({ r: 5.5, h: TB + 2 })),
  translate([xc + 5, 20, -1], cylinder({ r: 5.5, h: TB + 2 })),
);
body = difference(body, slot(15));
body = difference(body, slot(115));

return body;
