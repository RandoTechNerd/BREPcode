const L = 130, W = 40, TB = 14;
const PX0 = 35, PX1 = 95, PH = 64, R = 10;
const boreX = 65, boreZ = 38, boreD = 32;

const base = cube([L, W, TB]);

const profile = path2d(
  [PX0, TB - 0.5],
  [PX1, TB - 0.5],
  [PX1, PH - R],
  arcTo([PX1 - R, PH], { center: [PX1 - R, PH - R] }),
  [PX0 + R, PH],
  arcTo([PX0, PH - R], { center: [PX0 + R, PH - R] }),
);
const pedestal = translate([0, W, 0], rotate([90, 0, 0], linearExtrude({ h: W }, profile)));

const body = union(base, pedestal);

const bore = translate([boreX, -1, boreZ], rotate([-90, 0, 0], cylinder({ d: boreD, h: W + 2 })));

const slot = (cx) => hull({ exact: true },
  translate([cx - 5, 20, -1], cylinder({ d: 11, h: TB + 2 })),
  translate([cx + 5, 20, -1], cylinder({ d: 11, h: TB + 2 })),
);

let part = difference(body, bore);
part = difference(part, slot(15));
part = difference(part, slot(115));
part = difference(part, drill([65, 20, PH], [0, 0, 1], { d: 6, depth: 12 }));
return part;