const W = 50, D = 40, H = 60;
const boreD = 25, boreY = 20, boreZ = 30;
const slotW = 3, slotX = 25, slotBottom = 35;
const crossZ = 50;

let part = cube([W, D, H]);

// A: Ø25 bore along X, through the full width
part = difference(part, translate([-1, boreY, boreZ], rotate([0, 90, 0], cylinder({ r: boreD / 2, h: W + 2 }))));

// C: Ø5.5 through hole along Y, Ø10 counterbore 6 deep from the front face
part = drill([slotX, 0, crossZ], [0, -1, 0], { d: 5.5, through: true, cbore: { d: 10, depth: 6 } });

// B: 3 mm saw slot from the top down into the bore, full depth in Y
part = difference(part, translate([slotX - slotW / 2, -1, slotBottom], cube([slotW, D + 2, H - slotBottom + 1])));

// D: 2X Ø5 holes, 12 deep, into the bottom face
part = drill([12, 20, 0], [0, 0, -1], { d: 5, depth: 12 });
part = drill([38, 20, 0], [0, 0, -1], { d: 5, depth: 12 });

return part;