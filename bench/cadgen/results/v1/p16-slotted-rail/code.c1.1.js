const L = 200, W = 30, T = 12, C = 1;
const slotW = 6.6, slotCC = 14;
const slotXs = [30, 80, 130, 170];
const slotY = 15;
const holeD = 4.2, holeDepth = 15, holeY = 15, holeZ = 6;

// cross-section in YZ with chamfered top corners, extruded along X
const profYZ = polygon([[0, 0], [W, 0], [W, T - C], [W - C, T], [C, T], [0, T - C]]);
const barX = translate([-1, 0, 0],
  rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: L + 2 }, profYZ))));

// side profile in XZ with chamfered top corners, extruded along Y
const profXZ = polygon([[0, 0], [L, 0], [L, T - C], [L - C, T], [C, T], [0, T - C]]);
const barY = translate([0, W + 1, 0], rotate([90, 0, 0], linearExtrude({ h: W + 2 }, profXZ)));

let part = intersection(barX, barY);

// 4 through slots along X
const slot = (cx) => hull({ exact: true },
  translate([cx - slotCC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
  translate([cx + slotCC / 2, slotY, -1], cylinder({ r: slotW / 2, h: T + 2 })),
);
for (const x of slotXs) part = difference(part, slot(x));

// 2X Ø4.2 x 15 deep blind holes in both end faces (axis along X)
const endHole = (x0) => translate([x0, holeY, holeZ],
  rotate([0, 90, 0], cylinder({ r: holeD / 2, h: holeDepth + 1 })));
part = difference(part, endHole(-1));                 // x = -1 .. 15
part = difference(part, endHole(L - holeDepth));      // x = 185 .. 201

return part;