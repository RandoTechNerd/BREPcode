const W = 120, D = 90, T = 6, R = 6;
const bossD = 10, bossH = 12, holeD = 3.2;
const pocketL = 40, pocketW = 20, pocketR = 4, pocketCx = 60, pocketCy = 45;
const bosses = [[20, 15], [100, 15], [20, 75], [100, 75]];

const plate = fillet({ r: R, edges: "z" }, cube([W, D, T]));
const bossSolids = bosses.map(([x, y]) =>
  translate([x, y, T - 0.5], cylinder({ d: bossD, h: bossH + 0.5 })));
let part = union(plate, ...bossSolids);

const pocketTool = translate(
  [pocketCx - pocketL / 2, pocketCy - pocketW / 2, -1],
  fillet({ r: pocketR, edges: "z" }, cube([pocketL, pocketW, T + 2])),
);
part = difference(part, pocketTool);

const holes = bosses.map(([x, y]) =>
  translate([x, y, -1], cylinder({ d: holeD, h: T + bossH + 2 })));
return difference(part, ...holes);