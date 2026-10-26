const W = 32, D = 29.5, H = 12.75;
const px = 13, py = 11.75;
const floorZ = H - 10;
const pinD = 2.75, pinH = 6;
const boreBottom = 1.5;

const block = fillet({ r: 1, edges: "z" }, translate([-W / 2, -D / 2, 0], cube([W, D, H])));
const pins = [[px, py], [-px, -py]].map(([x, y]) =>
  translate([x, y, H - 0.5], cylinder({ d: pinD, h: pinH + 0.5 })));
let part = union(block, ...pins);

const PW = 22, PD = 19;
const pocket = translate([0, 0, floorZ],
  fillet({ r: 2, edges: "z" }, translate([-PW / 2, -PD / 2, 0], cube([PW, PD, H]))));
part = difference(part, pocket);

part = difference(part, translate([0, 0, boreBottom], cylinder({ d: 12, h: H })));

part = difference(part,
  drill([-px, py, H], [0, 0, 1], { d: 4.2, through: true }),
  drill([px, -py, H], [0, 0, 1], { d: 4.2, through: true }));

const slot = (x) => hull({ exact: true },
  translate([x, -1.5, -1], cylinder({ r: 2.1, h: H + 2 })),
  translate([x, 1.5, -1], cylinder({ r: 2.1, h: H + 2 })));
part = difference(part, slot(-px));
part = difference(part, slot(px));

return part;