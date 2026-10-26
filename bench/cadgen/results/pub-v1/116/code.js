const H = 65, HT = 75;
const box = (x0, x1, y0, y1, z0, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));
const zcyl = (x, y, z0, z1, r) => translate([x, y, z0], cylinder({ r, h: z1 - z0 }));

// R25 concave blend under the right arm
const blend = difference(
  box(57, 82.5, -6.5, 23.5, 17.5, 43),
  translate([82.5, -7.5, 43], rotate([-90, 0, 0], cylinder({ r: 25, h: 32 }))),
);

let body = union(
  box(-42.5, 57.5, 0, 74.5, 0, H),
  box(-42.5, 37.5, 0, 74.5, 64.5, HT),
  box(-25.5, 40.5, -76.5, 0.5, 0, H),
  box(-16, 31, -76.5, -70, 13, 62),
  box(-102.05, -42, -6.5, 23.5, 0, H),
  zcyl(-102.05, 8.5, 0, H, 15),
  box(49, 57.5, -6.5, 23.5, 0, H),
  box(49, 102.5, -6.5, 23.5, 0, 18),
  zcyl(102.5, 8.5, 0, 18, 15),
  blend,
);

// pockets
body = difference(body, box(-19, 8.5, 38, 66, 65, 80));
body = difference(body, box(14.5, 48, 38, 66, 60, 80));
body = difference(body, box(-12.5, 27.5, -55, -15, 62, 70));
body = difference(body, box(-1.5, 16.5, -44, -26, 53, 70));
body = difference(body, translate([0, 0, 55], linearExtrude({ h: 15 },
  polygon([[-85, 6], [-46, 1], [-46, 19], [-85, 11]]))));

// front bore with counterbore
body = difference(body, drill([7.5, -76.5, 37.5], [0, -1, 0], { d: 40, depth: 55, cbore: { d: 44, depth: 3 } }));

// vertical holes
const vh = [
  [-102.05, 8.5, H, 14, 45],
  [-14, 8.5, HT, 5, 15],
  [0.5, 8.5, HT, 5, 15],
  [11.5, 69.5, HT, 5, 15],
  [-26, 1.5, H, 5, 15],
  [37.5, 14.5, H, 2.5, 7],
];
for (const [x, y, z, d, depth] of vh) body = difference(body, drill([x, y, z], [0, 0, 1], { d, depth }));
body = difference(body, zcyl(102.5, 8.5, -1, 20, 7));
body = difference(body, zcyl(45, 8.5, -1, HT + 1, 7.75));
body = difference(body, zcyl(50, 69.5, -1, H + 1, 3.4));
body = difference(body, zcyl(-30.5, 62.5, -1, HT + 1, 6));
body = difference(body, zcyl(-30.5, 43.5, -1, HT + 1, 6));

// flange tapped holes
const fh = [[-15.5, 59, 6.8], [30.5, 59, 6.8], [-15.5, 16, 8.5], [30.5, 16, 8.5]];
for (const [x, z, d] of fh) body = difference(body, drill([x, -76.5, z], [0, -1, 0], { d, depth: 20 }));

return body;