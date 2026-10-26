const W = 100, T = 12, H = 42, R = 10;
const cx = 50, cy = 50, bossD = 76;
const boreD = 40, cbD = 52, cbDepth = 15;
const holeD = 9, hi = 12;

const flange = fillet({ r: R, edges: "z" }, cube([W, W, T]));
const boss = translate([cx, cy, T - 0.5], cylinder({ d: bossD, h: H - T + 0.5 }));

let part = union(flange, boss);
part = difference(part, translate([cx, cy, -1], cylinder({ d: boreD, h: H + 2 })));
part = difference(part, translate([cx, cy, H - cbDepth], cylinder({ d: cbD, h: cbDepth + 1 })));

for (const [x, y] of [[hi, hi], [W - hi, hi], [hi, W - hi], [W - hi, W - hi]]) {
  part = difference(part, translate([x, y, -1], cylinder({ d: holeD, h: T + 2 })));
}
return part;
