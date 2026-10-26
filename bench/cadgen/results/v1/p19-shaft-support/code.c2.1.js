const L = 84, W = 20, BT = 10;
const UX0 = 21, UX1 = 63, H = 60, R = 6;
const boreX = 42, boreZ = 35, boreD = 20;
const clampZ = 52;

const base = cube([L, W, BT]);

const profile = path2d(
  [UX0, 0], [UX1, 0], [UX1, H - R],
  arcTo([UX1 - R, H], { center: [UX1 - R, H - R] }),
  [UX0 + R, H],
  arcTo([UX0, H - R], { center: [UX0 + R, H - R] }),
);
// (px, py, extrude) -> (x = px, y = W - extrude, z = py)
const upright = translate([0, W, 0], rotate([90, 0, 0], linearExtrude({ h: W }, profile)));

let part = union(base, upright);

// A: 2X Ø6.6 thru base holes
part = difference(part,
  translate([10, 10, -1], cylinder({ d: 6.6, h: BT + 2 })),
  translate([74, 10, -1], cylinder({ d: 6.6, h: BT + 2 })),
);

// B: Ø20 bore along Y
part = difference(part,
  translate([boreX, -1, boreZ], rotate([-90, 0, 0], cylinder({ d: boreD, h: W + 2 }))));

// C: 2 wide slot from bore to top
part = difference(part, translate([boreX - 1, -1, boreZ], cube([2, W + 2, H - boreZ + 1])));

// D: Ø5.5 thru clamp hole along X, cbore Ø9.5 x 6 from right face
part = difference(part,
  translate([UX0 - 1, W / 2, clampZ], rotate([0, 90, 0], cylinder({ d: 5.5, h: UX1 - UX0 + 2 }))));
part = difference(part,
  translate([UX1 - 6, W / 2, clampZ], rotate([0, 90, 0], cylinder({ d: 9.5, h: 7 }))));

return part;