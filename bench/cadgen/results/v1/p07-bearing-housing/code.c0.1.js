const W = 100, T = 12, H = 42, R = 10;
const bossD = 76, boreD = 40, cbD = 52, cbDepth = 15;
const holeD = 9, inset = 12;
const cx = W / 2, cy = W / 2;

const flange = fillet({ r: R, edges: "z" }, cube([W, W, T]));
const boss = translate([cx, cy, T - 0.5], cylinder({ r: bossD / 2, h: H - T + 0.5 }));
let part = union(flange, boss);

part = difference(part, translate([cx, cy, -1], cylinder({ r: boreD / 2, h: H + 2 })));
part = difference(part, translate([cx, cy, H - cbDepth], cylinder({ r: cbD / 2, h: cbDepth + 1 })));

const holes = [[inset, inset], [W - inset, inset], [inset, W - inset], [W - inset, W - inset]]
  .map(([x, y]) => translate([x, y, -1], cylinder({ r: holeD / 2, h: T + 2 })));
part = difference(part, ...holes);

return part;