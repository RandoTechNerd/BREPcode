const L = 84, D = 20, TB = 10, H = 60;
const UX0 = 21, UX1 = 63, R = 6;
const boreZ = 35, boreD = 20;
const clampZ = 52;

// Cylinder along +Y spanning y -1..21
const ycyl = (x, z, r) => translate([x, -1, z], rotate([-90, 0, 0], cylinder({ r, h: D + 2 })));
// Cylinder along +Y spanning y 0..20 (solid piece)
const ycylS = (x, z, r) => translate([x, 0, z], rotate([-90, 0, 0], cylinder({ r, h: D })));

const base = cube([L, D, TB]);

const upright = union(
  translate([UX0, 0, TB - 0.5], cube([UX1 - UX0, D, H - R - TB + 0.5])),
  translate([UX0 + R, 0, TB - 0.5], cube([UX1 - UX0 - 2 * R, D, H - TB + 0.5])),
  ycylS(UX0 + R, H - R, R),
  ycylS(UX1 - R, H - R, R),
);

const filletL = difference(
  translate([UX0 - R, 0, TB - 0.5], cube([R + 0.5, D, R + 0.5])),
  ycyl(UX0 - R, TB + R, R),
);
const filletR = difference(
  translate([UX1 - 0.5, 0, TB - 0.5], cube([R + 0.5, D, R + 0.5])),
  ycyl(UX1 + R, TB + R, R),
);

let part = union(base, upright, filletL, filletR);

// Mounting holes
part = difference(part,
  translate([10, 10, -1], cylinder({ r: 3.3, h: TB + 2 })),
  translate([74, 10, -1], cylinder({ r: 3.3, h: TB + 2 })),
);

// Shaft bore
part = difference(part, ycyl(42, boreZ, boreD / 2));

// Clamp screw hole with counterbore on +X face
part = difference(part,
  drill([UX1, D / 2, clampZ], [1, 0, 0], { d: 5.5, through: true, cbore: { d: 9.5, depth: 6 } }));

// Split slot from top into bore
part = difference(part, translate([41, -1, boreZ], cube([2, D + 2, H - boreZ + 1])));

return part;
