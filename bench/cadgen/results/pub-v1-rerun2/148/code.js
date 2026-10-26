const L = 100, HW = 94, HH = 97, DF = 107.6;
const k = DF * Math.SQRT2;
const oct = polygon([
  [HW, -(k - HW)], [HW, k - HW], [k - HH, HH], [-(k - HH), HH],
  [-HW, k - HW], [-HW, -(k - HW)], [-(k - HH), -HH], [k - HH, -HH],
]);
const BZ = 50, bossBase = 89.5, bossTop = 117.5;
const alongY = (s) => rotate([-90, 0, 0], s);
const alongX = (s) => rotate([0, 90, 0], s);
const lobeAngles = [0, 60, 120, 180, 240, 300];
const rad = (a) => a * Math.PI / 180;

// outer body
let body = linearExtrude({ h: L }, oct);
body = union(body, translate([0, bossBase, BZ], alongY(cylinder({ r: 37.5, h: bossTop - bossBase }))));
for (const a of lobeAngles) {
  body = union(body, translate([37.5 * Math.cos(rad(a)), bossBase, BZ + 37.5 * Math.sin(rad(a))],
    alongY(cylinder({ r: 7.5, h: bossTop - bossBase }))));
}

// cavities, with the conical web added back as solid cones
body = difference(body, translate([0, 0, 55], cylinder({ r: 85, h: L - 55 + 1 })));
body = difference(body, translate([0, 0, -1], cylinder({ r: 85, h: 47 })));
body = union(body, translate([0, 0, 55], cylinder({ r1: 85.5, r2: 42.15, h: 11 })));
body = union(body, translate([0, 0, 30], cylinder({ r1: 42, r2: 85.5, h: 16 })));

// hub bore and recesses
body = difference(body, translate([0, 0, -1], cylinder({ r: 25, h: L + 2 })));
body = difference(body, translate([0, 0, 54], cylinder({ r: 30, h: 13 })));
body = difference(body, translate([0, 0, 29], cylinder({ r: 30, h: 17.6 })));

// flange bolt holes
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  body = difference(body, translate([97.5 * Math.cos(rad(a)), 97.5 * Math.sin(rad(a)), -1], cylinder({ r: 5, h: L + 2 })));
}
// web holes
for (const a of [270, 234, 198, 162, 306, 342, 18]) {
  body = difference(body, translate([65 * Math.cos(rad(a)), 65 * Math.sin(rad(a)), -1], cylinder({ r: 13.75, h: L + 2 })));
}

// top boss: pocket, centre hole, lobe holes
body = difference(body, translate([0, 88, BZ], alongY(cylinder({ r: 32.5, h: bossTop - 88 + 1 }))));
body = difference(body, translate([0, 20, BZ], alongY(cylinder({ r: 13.5, h: 69 }))));
for (const a of lobeAngles) {
  body = difference(body, translate([37.5 * Math.cos(rad(a)), 89, BZ + 37.5 * Math.sin(rad(a))],
    alongY(cylinder({ r: 3.5, h: 30 }))));
}

// side faces: 4 holes and a slot each, kept in the side wall
for (const s of [1, -1]) {
  const x0 = s > 0 ? 69 : -96;
  for (const y of [12.5, -12.5]) for (const z of [BZ - 30, BZ + 30]) {
    body = difference(body, translate([x0, y, z], alongX(cylinder({ r: 5, h: 27 }))));
  }
  const sx = s > 0 ? 84 : -96;
  const slot = union(
    translate([sx, 2.5, BZ - 10], alongX(cylinder({ r: 12.5, h: 12 }))),
    translate([sx, 2.5, BZ + 10], alongX(cylinder({ r: 12.5, h: 12 }))),
    translate([sx, -10, BZ - 10], cube([12, 25, 20])),
  );
  body = difference(body, slot);
}

return body;