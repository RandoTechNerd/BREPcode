const BF = 314, TF = 300, FT = 35, H = 270, PCD = 120;
const BW = 290, BR = 150, WALL = 10;
const HUB = 65, BORE = 50, HUBTOP = 176;
const ribT = 15;
const FIN_T = 5, FIN_Y = 34, FIN_OUT = 164, FIN_OUTH = 131.8, FIN_TOP = 166.9, FIN_IN = 140;

const flange = (w, z0) => translate([-w / 2, -w / 2, z0], fillet({ r: 30, edges: "z" }, cube([w, w, FT])));
const bodyOuter = intersection(
  translate([-BW / 2, -BW / 2, FT - 0.5], cube([BW, BW, H - 2 * FT + 1])),
  translate([0, 0, FT - 0.5], cylinder({ r: BR, h: H - 2 * FT + 1 })),
);
const bodyInner = intersection(
  translate([-BW / 2 + WALL, -BW / 2 + WALL, FT], cube([BW - 2 * WALL, BW - 2 * WALL, H - 2 * FT + 2])),
  translate([0, 0, FT], cylinder({ r: BR - WALL, h: H - 2 * FT + 2 })),
);
const body = difference(bodyOuter, bodyInner);

const hub = translate([0, 0, FT - 0.5], cylinder({ r: HUB, h: HUBTOP - FT + 0.5 }));
const ribs = [0, 1, 2, 3].map(k =>
  rotate([0, 0, 45 + 90 * k], translate([HUB - 1, -ribT / 2, FT - 0.5], cube([BR - HUB - 3, ribT, H - 2 * FT + 1]))));

// FN: fins on the ±X walls, profile in (x, z), extruded 5 in Y
const finProfile = polygon([
  [FIN_IN, FT - 0.5], [FIN_OUT, FT - 0.5], [FIN_OUT, FIN_OUTH],
  [150, FIN_TOP], [FIN_IN, FIN_TOP],
]);
const fins = [];
for (const y of [-FIN_Y, 0, FIN_Y]) {
  const f = translate([0, y + FIN_T / 2, 0], rotate([90, 0, 0], linearExtrude({ h: FIN_T }, finProfile)));
  fins.push(f, mirror([1, 0, 0], f));
}

let part = union(flange(BF, 0), flange(TF, H - FT), body, hub, ...ribs, ...fins);

// B: central bore, blind with a 35 floor
part = difference(part, translate([0, 0, FT], cylinder({ r: BORE, h: HUBTOP - FT + 1 })));
// OP: opening in the top flange
part = difference(part, intersection(
  translate([-134, -134, H - FT - 1], cube([268, 268, FT + 2])),
  translate([0, 0, H - FT - 1], cylinder({ r: BR, h: FT + 2 })),
));
// H1: Ø30 through the top flange, Ø25 through the bottom flange, coaxial
for (const sx of [1, -1]) for (const sy of [1, -1]) {
  part = difference(part, drill([sx * PCD, sy * PCD, H], [0, 0, 1], { d: 30, depth: FT + 0.5 }));
  part = difference(part, drill([sx * PCD, sy * PCD, 0], [0, 0, -1], { d: 25, depth: FT + 0.5 }));
}
// SKIP kidney slots (32X R5): shape and position not dimensioned well enough to place
// SKIP drafts 4.1° / 10° and the 69° funnel: walls built straight
// SKIP R13 / R60 / 1mm blends
return part;