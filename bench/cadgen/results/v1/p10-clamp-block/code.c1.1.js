const W = 50, D = 40, H = 60;
const slotW = 3, slotBottom = 35;

let part = cube([W, D, H]);
// Ø25 through bore along X
part = difference(part, drill([0, 20, 30], [-1, 0, 0], { d: 25, through: true }));
// clamp screw: Ø5.5 thru along Y with Ø10 x 6 counterbore from the front face
part = difference(part, drill([25, 0, 50], [0, -1, 0], { d: 5.5, through: true, cbore: { d: 10, depth: 6 } }));
// two Ø5 x 12 blind holes from the bottom face
part = difference(part, drill([12, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));
part = difference(part, drill([38, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));
// 3 mm saw slot from the top down into the bore, full depth
part = difference(part, translate([W / 2 - slotW / 2, -1, slotBottom], cube([slotW, D + 2, H - slotBottom + 1])));
return part;