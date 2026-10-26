const W = 80, D = 70, H = 90, T = 8, ribT = 10;
const ribTop = 74, ribEnd = 59;

const base = cube([W, D, T]);
const upright = cube([W, T, H]);

// Rib profile drawn in (y, z), extruded along +Z, then turned so the extrusion runs along X.
// The profile runs 0.5 mm into both plates so the union overlaps.
const ribProfile = polygon([
  [T - 0.5, T - 0.5],
  [ribEnd, T - 0.5],
  [T - 0.5, ribTop],
]);
const rib = translate([(W - ribT) / 2, 0, 0],
  rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: ribT }, ribProfile))));

let part = union(base, upright, rib);

// 4X Ø8.5 THRU in the upright
for (const [x, z] of [[15, 30], [65, 30], [15, 70], [65, 70]]) {
  part = difference(part, drill([x, 0, z], [0, -1, 0], { d: 8.5, through: true }));
}
// 2X Ø6.6 THRU in the base
for (const x of [15, 65]) {
  part = difference(part, drill([x, 50, T], [0, 0, 1], { d: 6.6, through: true }));
}
return part;
