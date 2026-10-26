const T = 3, H = 36.9;
const zOf = (yf) => H * (47.8 - yf) / 31.2;

// High tab with Ø6.8 hole
const tab = translate([0, -19.97, H - T], cube([18, 22.97, T]));

// S-wall profile in (x, z)
const pts = [[0, zOf(16.6)], [18, zOf(16.6)], [18, zOf(25.8)], [43, zOf(25.8)]];
for (let i = 1; i <= 8; i++) {
  const a = -Math.PI / 2 + (i / 8) * Math.PI / 2;
  pts.push([43 + 22 * Math.cos(a), zOf(47.8 + 22 * Math.sin(a))]);
}
pts.push([47, zOf(47.8)], [47, zOf(43.8)], [15, zOf(43.8)]);
for (let i = 1; i <= 8; i++) {
  const a = Math.PI / 2 + (i / 8) * Math.PI / 2;
  pts.push([15 + 15 * Math.cos(a), zOf(28.8 + 15 * Math.sin(a))]);
}
const wall = translate([0, T, 0], rotate([90, 0, 0], linearExtrude({ h: T }, polygon(pts))));

// Low flange
const off = 44.93;
const fl = [[47, 47.8], [65, 47.8], [65, 62], [67, 72], [70, 80], [70, 98], [52, 98], [52, 80], [49, 72], [47, 62]]
  .map(([x, y]) => [x, Math.max(0, y - off)]);
const flange = linearExtrude({ h: T }, polygon(fl));

// Upright tab
const upTab = translate([49, 40.07, 0.5], cube([T, 13, 29.7]));

let part = union(tab, wall, flange, upTab);
part = difference(part, drill([9, -11.17, H], [0, 0, 1], { d: 6.8, through: true }));
part = difference(part, drill([61.2, 40.07, T], [0, 0, 1], { d: 7, through: true }));
part = difference(part, drill([54.5, 21.07, T], [0, 0, 1], { d: 7, through: true }));
part = difference(part, drill([52, 46.57, 24.7], [1, 0, 0], { d: 4.5, through: true }));
return part;