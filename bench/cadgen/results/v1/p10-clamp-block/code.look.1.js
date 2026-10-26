const W = 50, D = 40, H = 60;
const boreD = 25, boreY = 20, boreZ = 30;
const slotW = 3, slotX = 25, slotBottom = 35;
const crossZ = 50, crossD = 5.5, cbD = 10, cbDepth = 6;
const tapD = 5, tapDepth = 12, tapY = 20;

let part = cube([W, D, H]);

// A: Ø25 bore along X, through the full width
part = difference(part,
  translate([-1, boreY, boreZ], rotate([0, 90, 0], cylinder({ r: boreD / 2, h: W + 2 }))));

// C: Ø5.5 THRU with Ø10 x 6 counterbore from the front face
part = drill([slotX, 0, crossZ], [0, -1, 0], { d: crossD, through: true, cbore: { d: cbD, depth: cbDepth } })(part);

// B: 3 mm saw slot from the top down into the bore, full depth in Y
part = difference(part,
  translate([slotX - slotW / 2, -1, slotBottom], cube([slotW, D + 2, H - slotBottom + 1])));

// D: 2X Ø5 holes, 12 deep, into the bottom face
part = difference(part,
  translate([12, tapY, -1], cylinder({ r: tapD / 2, h: tapDepth + 1 })),
  translate([38, tapY, -1], cylinder({ r: tapD / 2, h: tapDepth + 1 })));

return part;