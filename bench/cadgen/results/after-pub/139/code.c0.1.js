const BF = 314, TF = 300, FT = 35, H = 270, PCD = 120;
const BW = 290, BR = 150, WALL = 10;
const HUB = 65, BORE = 50, HUBTOP = 176;
const ribT = 15;

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

const bulges = intersection(
  cylinder({ r: 164, h: 131.8 }),
  translate([-164, -60, 0], cube([328, 120, 131.8])),
);
const fins = [];
for (const sy of [1, -1]) for (const x of [-25, 0, 25])
  fins.push(translate([x - 2.5, sy > 0 ? BW / 2 - 1 : -BW / 2 - 13, FT - 0.5], cube([5, 14, 166.9 - FT + 0.5])));

let part = union(flange(BF, 0), flange(TF, H - FT), body, hub, ...ribs, bulges, ...fins);

// central bore, blind with a 35 floor
part = difference(part, translate([0, 0, FT], cylinder({ r: BORE, h: HUBTOP - FT + 1 })));
// top flange opening
part = difference(part, intersection(
  translate([-134, -134, H - FT - 1], cube([268, 268, FT + 2])),
  translate([0, 0, H - FT - 1], cylinder({ r: BR, h: FT + 2 })),
));
for (const sx of [1, -1]) for (const sy of [1, -1]) {
  part = difference(part, drill([sx * PCD, sy * PCD, H], [0, 0, 1], { d: 30, depth: FT + 0.5 }));
  part = difference(part, drill([sx * PCD, sy * PCD, 0], [0, 0, -1], { d: 25, depth: FT + 0.5 }));
}
// SKIP kidney slots (32X R5): shape and position not dimensioned well enough to place
// SKIP drafts 4.1° / 10° and the 69° funnel: walls built straight
// SKIP R50/R13/R60/1mm blends
return part;