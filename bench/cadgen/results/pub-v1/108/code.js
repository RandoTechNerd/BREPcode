const T = 2, L = 87.6, W = 110;
const SL = 35.6;
const slotCut = (y, w) => union(
  translate([-1, y - w / 2, -1], cube([SL - w / 2 + 1, w, T + 2])),
  translate([SL - w / 2, y, -1], cylinder({ r: w / 2, h: T + 2 })),
);
const wallH = 22, wallY0 = 38.4;
let part = union(
  cube([L, W, T]),
  translate([L - T, wallY0, -wallH + T], cube([T, W - wallY0, wallH])),
  translate([0, 90.7, 0], cube([T, W - 90.7, 14])),
  translate([0, 55.3, 0], cube([T, 78.7 - 55.3, 14])),
  translate([0, 24, 0], cube([T, 39.3 - 24, 14])),
  translate([0, 0, 0], cube([T, 12, 14])),
  translate([5, 0, 0], cube([80, T, 18])),
);
part = difference(part, slotCut(84.7, 10));
part = difference(part, slotCut(47.3, 14));
part = difference(part, slotCut(18, 10));
part = difference(part, drill([L, 87.8, -10.8], [1, 0, 0], { d: 4.8, through: true }));
const sx = L - T - 1, sz = -10.8, sr = 2.4, y1 = 58.2, y2 = 67.4;
const slotTool = union(
  translate([sx, y1, sz - sr], cube([T + 2, y2 - y1, 2 * sr])),
  translate([sx, y1, sz], rotate([0, 90, 0], cylinder({ r: sr, h: T + 2 }))),
  translate([sx, y2, sz], rotate([0, 90, 0], cylinder({ r: sr, h: T + 2 }))),
);
part = difference(part, slotTool);
return part;