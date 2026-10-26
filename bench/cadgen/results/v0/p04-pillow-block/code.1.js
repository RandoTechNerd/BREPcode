const L = 130, D = 40, TB = 14, H = 64;
const UX0 = 35, UX1 = 95, R = 10;
const boreZ = 38, boreD = 32;

// front profile in (x, z), drawn in XY, extruded along +Z, then rotated so the profile's y becomes Z
const profile = path2d(
  [0, 0], [L, 0], [L, TB], [UX1 + R, TB],
  arcTo([UX1, TB + R], { center: [UX1 + R, TB + R] }),
  [UX1, H - R],
  arcTo([UX1 - R, H], { center: [UX1 - R, H - R] }),
  [UX0 + R, H],
  arcTo([UX0, H - R], { center: [UX0 + R, H - R] }),
  [UX0, TB + R],
  arcTo([UX0 - R, TB], { center: [UX0 - R, TB + R] }),
  [0, TB],
);

let body = translate([0, D, 0], rotate([90, 0, 0], linearExtrude({ h: D }, profile)));

// bore
body = difference(body, drill([65, 0, boreZ], [0, -1, 0], { d: boreD, through: true }));
// top blind hole
body = difference(body, drill([65, D / 2, H], [0, 0, 1], { d: 6, depth: 12 }));

// slots
const slot = (cx) => hull({ exact: true },
  translate([cx - 5, D / 2, -1], cylinder({ r: 5.5, h: TB + 2 })),
  translate([cx + 5, D / 2, -1], cylinder({ r: 5.5, h: TB + 2 })),
);
body = difference(body, slot(15));
body = difference(body, slot(115));

return body;
