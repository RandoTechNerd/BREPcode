const L = 120, W = 90, T = 6, R = 6;
const bossD = 10, bossH = 12, boreD = 3.2;
const pocketL = 40, pocketW = 20, pocketD = 6, pocketR = 4;
const pcx = 60, pcy = 45;
const bossPts = [[20, 15], [100, 15], [20, 75], [100, 75]];

const plate = fillet({ r: R, edges: "z" }, cube([L, W, T]));
const bosses = bossPts.map(([x, y]) =>
  translate([x, y, T - 0.5], cylinder({ d: bossD, h: bossH + 0.5 })));
let part = union(plate, ...bosses);

const pocket = translate([pcx - pocketL / 2, pcy - pocketW / 2, T - pocketD - 1],
  fillet({ r: pocketR, edges: "z" }, cube([pocketL, pocketW, pocketD + 2])));
part = difference(part, pocket);

const bores = bossPts.map(([x, y]) =>
  translate([x, y, -1], cylinder({ d: boreD, h: T + bossH + 2 })));
part = difference(part, ...bores);

return part;
