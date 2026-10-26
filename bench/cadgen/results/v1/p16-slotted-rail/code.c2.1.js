const L = 200, W = 30, H = 12, C = 1;
const slotW = 6.6, slotCC = 14;
const slotXs = [30, 80, 130, 170];
const holeD = 4.2, holeDepth = 15, holeY = 15, holeZ = 6;

// bar with C1 chamfer on the top edges: exact hull of two flat slabs
let part = hull({ exact: true },
  cube([L, W, H - C]),
  translate([C, C, H - C], cube([L - 2 * C, W - 2 * C, C])),
);

// slots, through
const slot = (cx) => hull({ exact: true },
  translate([cx - slotCC / 2, W / 2, -1], cylinder({ r: slotW / 2, h: H + 2 })),
  translate([cx + slotCC / 2, W / 2, -1], cylinder({ r: slotW / 2, h: H + 2 })),
);
for (const x of slotXs) part = difference(part, slot(x));

// end holes, 15 deep
part = difference(part, drill([0, holeY, holeZ], [-1, 0, 0], { d: holeD, depth: holeDepth }));
part = difference(part, drill([L, holeY, holeZ], [1, 0, 0], { d: holeD, depth: holeDepth }));

return part;