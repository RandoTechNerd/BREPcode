const L = 130, W = 40, TB = 14, H = 64;
const pedX0 = 35, pedX1 = 95, R = 10;
const boreX = 65, boreZ = 38, boreD = 32;
const s45 = R * Math.SQRT1_2;

// base plate
const base = cube([L, W, TB]);

// pedestal: XZ profile with R10 top corners, extruded through the 40 depth
const prof = path2d(
  [pedX0, TB - 0.5],
  [pedX1, TB - 0.5],
  [pedX1, H - R],
  arcTo([pedX1 - R + s45, H - R + s45], [pedX1 - R, H]),
  [pedX0 + R, H],
  arcTo([pedX0 + R - s45, H - R + s45], [pedX0, H - R]),
);
const pedestal = translate([0, W, 0], rotate([90, 0, 0], linearExtrude({ h: W }, prof)));

let part = union(base, pedestal);

// A: Ø32 bore through along Y
part = difference(part, drill([boreX, 0, boreZ], [0, -1, 0], { d: boreD, through: true }));

// B: Ø6 x 12 deep from the top
part = difference(part, drill([boreX, W / 2, H], [0, 0, 1], { d: 6, depth: 12 }));

// C: two slots 11 wide, 10 ctr-ctr, through the base
const slot = (cx) => hull({ exact: true },
  translate([cx - 5, W / 2, -1], cylinder({ r: 5.5, h: TB + 2 })),
  translate([cx + 5, W / 2, -1], cylinder({ r: 5.5, h: TB + 2 })),
);
part = difference(part, slot(15));
part = difference(part, slot(115));

return part;