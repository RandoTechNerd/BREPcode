const W = 50, D = 40, H = 60;
const boreD = 25, boreY = 20, boreZ = 30;
const slotW = 3;

let part = cube([W, D, H]);
part = difference(part, translate([-1, boreY, boreZ], rotate([0, 90, 0], cylinder({ r: boreD / 2, h: W + 2 }))));
part = difference(part, translate([W / 2 - slotW / 2, -1, boreZ], cube([slotW, D + 2, H - boreZ + 1])));
part = difference(part, drill([25, 0, 50], [0, -1, 0], { d: 5.5, through: true, cbore: { d: 10, depth: 6 } }));
part = difference(part, drill([12, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));
part = difference(part, drill([38, 20, 0], [0, 0, -1], { d: 5, depth: 12 }));
return part;
