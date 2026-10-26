const L = 84, W = 20, BT = 10;
const UX0 = 21, UX1 = 63, H = 60, R = 6;
const boreX = 42, boreZ = 35, boreD = 20;
const slotW = 2, slotZ0 = boreZ + boreD / 2, slotZ1 = H;

// a cylinder lying along +Y from y=y0, centred on (x, z)
const cylY = (x, z, r, y0, len) =>
  translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: len })));

const base = cube([L, W, BT]);
const upright = union(
  translate([UX0, 0, 0], cube([UX1 - UX0, W, H - R])),
  translate([UX0 + R, 0, BT], cube([UX1 - UX0 - 2 * R, W, H - BT])),
  cylY(UX0 + R, H - R, R, 0, W),
  cylY(UX1 - R, H - R, R, 0, W),
);

let part = union(base, upright);

// mounting holes
part = difference(part,
  drill([10, 10, BT], [0, 0, 1], { d: 6.6, through: true }),
  drill([L - 10, 10, BT], [0, 0, 1], { d: 6.6, through: true }),
);

// shaft bore
part = difference(part, cylY(boreX, boreZ, boreD / 2, -1, W + 2));

// clamp slot: 2 wide, through the depth (Y), round-ended cutter from the bore top to the top face
const slot = union(
  cylY(boreX, slotZ0, slotW / 2, -1, W + 2),
  translate([boreX - slotW / 2, -1, slotZ0], cube([slotW, W + 2, slotZ1 - slotZ0])),
  cylY(boreX, slotZ1, slotW / 2, -1, W + 2),
);
part = difference(part, slot);

// clamp screw: counterbored from the right face, through both halves
part = difference(part,
  drill([UX1, W / 2, 52], [1, 0, 0], { d: 5.5, through: true, cbore: { d: 9.5, depth: 6 } }));

return part;