const L = 120, W = 90, T = 6, R = 6;
const bossD = 10, bossH = 12, boreD = 3.2;
const pts = [[20, 15], [100, 15], [20, 75], [100, 75]];
const pL = 40, pW = 20, pR = 4, pCx = 60, pCy = 45;

const plate = fillet({ r: R, edges: "z" }, cube([L, W, T]));
const bosses = pts.map(([x, y]) => translate([x, y, T - 0.5], cylinder({ d: bossD, h: bossH + 0.5 })));
let body = union(plate, ...bosses);

const pocket = translate([pCx - pL / 2, pCy - pW / 2, -1],
  fillet({ r: pR, edges: "z" }, cube([pL, pW, T + 2])));
body = difference(body, pocket);

const bores = pts.map(([x, y]) => translate([x, y, -1], cylinder({ d: boreD, h: T + bossH + 2 })));
return difference(body, ...bores);
