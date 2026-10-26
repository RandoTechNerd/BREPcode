const L = 200, W = 30, T = 12, C = 1;
const slotW = 6.6, slotCC = 14, slotY = 15;
const slotXs = [30, 80, 130, 170];
const holeD = 4.2, holeDepth = 15, holeY = 15, holeZ = 6;

let part = hull({ exact: true },
  cube([L, W, T - C]),
  translate([C, C, T - C], cube([L - 2 * C, W - 2 * C, C])),
);

for (const x of slotXs) {
  part = difference(part, hull({ exact: true },
    translate([x - slotCC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
    translate([x + slotCC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  ));
}

part = drill(part, [0, holeY, holeZ], [-1, 0, 0], { d: holeD, depth: holeDepth });
part = drill(part, [L, holeY, holeZ], [1, 0, 0], { d: holeD, depth: holeDepth });
return part;