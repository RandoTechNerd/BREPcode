const L = 200, W = 30, T = 12, C = 1;
const slotW = 6.6, slotCC = 14;
const slotXs = [30, 80, 130, 170];
const holeD = 4.2, holeDepth = 15;

// Cross-section in YZ, chamfered at the top corners, extruded along X
const profYZ = polygon([[0, 0], [W, 0], [W, T - C], [W - C, T], [C, T], [0, T - C]]);
const barX = translate([-5, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: L + 10 }, profYZ))));

// Cross-section in XZ, chamfered at the top corners, extruded along Y
const profXZ = polygon([[0, 0], [L, 0], [L, T - C], [L - C, T], [C, T], [0, T - C]]);
const barY = translate([0, W + 5, 0], rotate([90, 0, 0], linearExtrude({ h: W + 10 }, profXZ)));

let body = intersection(barX, barY);

const slot = (x) => hull({ exact: true },
  translate([x - slotCC / 2, W / 2, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  translate([x + slotCC / 2, W / 2, -1], cylinder({ r: slotW / 2, h: T + 2 })),
);

body = difference(body, ...slotXs.map(slot));
body = difference(body, drill([0, W / 2, T / 2], [-1, 0, 0], { d: holeD, depth: holeDepth }));
body = difference(body, drill([L, W / 2, T / 2], [1, 0, 0], { d: holeD, depth: holeDepth }));

return body;
