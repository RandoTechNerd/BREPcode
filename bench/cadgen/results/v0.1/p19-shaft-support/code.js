const L = 84, W = 20, TB = 10;
const UX0 = 21, UX1 = 63, H = 60, R = 6;

const base = cube([L, W, TB]);
const prof = path2d(
  [UX0, TB - 0.5], [UX1, TB - 0.5], [UX1, H - R],
  arcTo([UX1 - R, H], { center: [UX1 - R, H - R] }),
  [UX0 + R, H],
  arcTo([UX0, H - R], { center: [UX0 + R, H - R] }),
);
const upright = translate([0, W, 0], rotate([90, 0, 0], linearExtrude({ h: W }, prof)));

let part = union(base, upright);
part = difference(part, drill([10, 10, TB], [0, 0, 1], { d: 6.6, through: true }));
part = difference(part, drill([74, 10, TB], [0, 0, 1], { d: 6.6, through: true }));
part = difference(part, drill([42, W, 35], [0, 1, 0], { d: 20, through: true }));
part = difference(part, translate([41, -1, 40], cube([2, W + 2, 25])));
part = difference(part, drill([UX1, 10, 52], [1, 0, 0], { d: 5.5, through: true, cbore: { d: 9.5, depth: 6 } }));
return part;
