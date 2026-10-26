const L = 130, W = 40, T = 14, H = 64;
const px0 = 35, px1 = 95, R = 10;
const cx = 65, bz = 38, boreR = 16;

// a cylinder along +Y from y=y0, length h
const yCyl = (x, z, r, y0, h) =>
  translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h })));

const base = cube([L, W, T]);
const pedestal = union(
  translate([px0, 0, T - 0.5], cube([px1 - px0, W, H - R - T + 0.5])),
  translate([px0 + R, 0, T - 0.5], cube([px1 - px0 - 2 * R, W, H - T + 0.5])),
  yCyl(px0 + R, H - R, R, 0, W),
  yCyl(px1 - R, H - R, R, 0, W),
);

const body = union(base, pedestal);

const slot = (xc) => hull({ exact: true },
  translate([xc - 5, W / 2, -1], cylinder({ r: 5.5, h: T + 2 })),
  translate([xc + 5, W / 2, -1], cylinder({ r: 5.5, h: T + 2 })),
);

let part = difference(body, yCyl(cx, bz, boreR, -1, W + 2));
part = difference(part, slot(15));
part = difference(part, slot(115));
part = difference(part, drill([cx, W / 2, H], [0, 0, 1], { d: 6, depth: 12 }));

return part;