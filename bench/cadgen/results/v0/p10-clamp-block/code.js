const W = 50, D = 40, H = 60;
const boreD = 25, boreY = 20, boreZ = 30;
const slotW = 3, slotBottom = 35;

let part = cube([W, D, H]);

// Ø25 bore through along X
part = difference(part,
  translate([-1, boreY, boreZ], rotate([0, 90, 0], cylinder({ d: boreD, h: W + 2 }))));

// clamp screw: Ø5.5 thru along Y, cbore Ø10 x 6 from the front face
part = difference(part,
  drill([25, 0, 50], [0, -1, 0], { d: 5.5, through: true, cbore: { d: 10, depth: 6 } }));

// 2X Ø5 x 12 deep from the bottom
part = difference(part, drill([12, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));
part = difference(part, drill([38, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));

// saw slot 3 wide, from the top down into the bore
part = difference(part,
  translate([W / 2 - slotW / 2, -1, slotBottom], cube([slotW, D + 2, H - slotBottom + 1])));

return part;
