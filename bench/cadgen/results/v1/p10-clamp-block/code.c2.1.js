const W = 50, D = 40, H = 60;
const boreD = 25, boreY = 20, boreZ = 30;
const slotW = 3, slotBottom = 35;
const crossZ = 50;

let part = cube([W, D, H]);

// A: Ø25 bore along X
part = difference(part, drill([0, boreY, boreZ], [-1, 0, 0], { d: boreD, through: true }));

// B: Ø5.5 through hole along Y, counterbore Ø10 x 6 on the front face
part = difference(part, drill([W / 2, 0, crossZ], [0, -1, 0], { d: 5.5, through: true, cbore: { d: 10, depth: 6 } }));

// C: 3 mm slot from the top down into the bore, full depth
part = difference(part, translate([W / 2 - slotW / 2, -1, slotBottom], cube([slotW, D + 2, H - slotBottom + 1])));

// D: two Ø5 blind holes, 12 deep, from the bottom
part = difference(part, drill([12, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));
part = difference(part, drill([38, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));

return part;