const W = 100, T = 12, H = 42, R = 10;
const cx = 50, cy = 50;
const bossD = 76, boreD = 40, cbD = 52, cbDepth = 15;
const holeD = 9, hp = [12, 88];

const flange = fillet({ r: R, edges: "z" }, cube([W, W, T]));
const boss = translate([cx, cy, T - 0.5], cylinder({ r: bossD / 2, h: H - T + 0.5 }));
let part = union(flange, boss);

part = difference(part, translate([cx, cy, -1], cylinder({ r: boreD / 2, h: H + 2 })));
part = difference(part, translate([cx, cy, H - cbDepth], cylinder({ r: cbD / 2, h: cbDepth + 1 })));

for (const x of hp) for (const y of hp) {
  part = difference(part, translate([x, y, -1], cylinder({ r: holeD / 2, h: T + 2 })));
}
return part;
