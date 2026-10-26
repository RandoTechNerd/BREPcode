const W = 100, T = 12, H = 42, R = 10;
const C = 50, bossD = 76;
const boreD = 40, cbD = 52, cbDepth = 15;
const holeD = 9, hIn = 12;

const flange = fillet({ r: R, edges: "z" }, cube([W, W, T]));
const boss = translate([C, C, T - 0.5], cylinder({ d: bossD, h: H - T + 0.5 }));
let part = union(flange, boss);

part = drill([C, C, H], [0, 0, 1], { d: boreD, through: true, cbore: { d: cbD, depth: cbDepth } });
part = difference(union(flange, boss),
  translate([C, C, -1], cylinder({ d: boreD, h: H + 2 })));
part = difference(part, translate([C, C, H - cbDepth], cylinder({ d: cbD, h: cbDepth + 1 })));

for (const [x, y] of [[hIn, hIn], [W - hIn, hIn], [hIn, W - hIn], [W - hIn, W - hIn]]) {
  part = difference(part, translate([x, y, -1], cylinder({ d: holeD, h: T + 2 })));
}
return part;