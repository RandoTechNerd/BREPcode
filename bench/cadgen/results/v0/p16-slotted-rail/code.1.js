const L = 200, W = 30, H = 12, C = 1;
const slotW = 6.6, slotCC = 14;
const slotXs = [30, 80, 130, 170];
const holeD = 4.2, holeDepth = 15, holeY = 15, holeZ = 6;

// bar with C1 chamfer on the top edges
const bar = hull({ exact: true },
  cube([L, W, H - C]),
  translate([C, C, H - C - 0.01], cube([L - 2 * C, W - 2 * C, C + 0.01])),
);

const slot = (x) => hull({ exact: true },
  translate([x - slotCC / 2, W / 2, -1], cylinder({ d: slotW, h: H + 2 })),
  translate([x + slotCC / 2, W / 2, -1], cylinder({ d: slotW, h: H + 2 })),
);

let part = bar;
for (const x of slotXs) part = difference(part, slot(x));

part = difference(part,
  drill([0, holeY, holeZ], [-1, 0, 0], { d: holeD, depth: holeDepth }));
part = difference(part,
  drill([L, holeY, holeZ], [1, 0, 0], { d: holeD, depth: holeDepth }));

return part;
