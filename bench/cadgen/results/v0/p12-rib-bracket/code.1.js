const W = 80, D = 70, H = 90, T = 8;
const ribT = 10, ribTopZ = 74, ribFootY = 59.2;

const vplate = cube([W, T, H]);
const base = cube([W, D, T]);

// The rib profile is drawn in local (a, b) = (Y, Z). It is extruded along local c,
// which the rotation turns into X.
const ribProfile = polygon([
  [T - 0.5, T - 0.5],
  [ribFootY, T - 0.5],
  [ribFootY, T],
  [T, ribTopZ],
  [T - 0.5, ribTopZ],
]);
const rib = translate([(W - ribT) / 2, 0, 0],
  rotate([90, 0, 90], linearExtrude({ h: ribT }, ribProfile)));

let part = union(vplate, base, rib);

// Ø8.5 THRU holes in the vertical plate
for (const x of [15, 65]) {
  for (const z of [30, 70]) {
    part = difference(part,
      translate([x, -1, z], rotate([-90, 0, 0], cylinder({ d: 8.5, h: T + 2 }))));
  }
}

// Ø6.6 THRU holes in the base
for (const x of [15, 65]) {
  part = difference(part, translate([x, 50, -1], cylinder({ d: 6.6, h: T + 2 })));
}

return part;
