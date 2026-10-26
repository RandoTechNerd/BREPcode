const L = 84, D = 20, TB = 10;
const UX0 = 21, UX1 = 63, UH = 60, R = 6;
const yCyl = (x, z, r) => translate([x, -1, z], rotate([-90, 0, 0], cylinder({ r, h: D + 2 })));
const yRound = (x, z, r) => translate([x, 0, z], rotate([-90, 0, 0], cylinder({ r, h: D })));

const base = cube([L, D, TB]);
const upright = union(
  translate([UX0, 0, TB - 0.5], cube([UX1 - UX0, D, UH - R - TB + 0.5])),
  translate([UX0 + R, 0, UH - R - 0.5], cube([UX1 - UX0 - 2 * R, D, R + 0.5])),
  yRound(UX0 + R, UH - R, R),
  yRound(UX1 - R, UH - R, R),
);

let part = union(base, upright);
part = difference(part, translate([10, 10, -1], cylinder({ r: 3.3, h: TB + 2 })));
part = difference(part, translate([74, 10, -1], cylinder({ r: 3.3, h: TB + 2 })));
part = difference(part, yCyl(42, 35, 10));
part = difference(part, translate([41, -1, 35], cube([2, D + 2, UH - 35 + 1])));
part = difference(part, drill([UX1, 10, 52], [1, 0, 0], { d: 5.5, through: true, cbore: { d: 9.5, depth: 6 } }));
return part;