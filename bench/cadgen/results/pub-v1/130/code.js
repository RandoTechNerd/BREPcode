const T = 5;
const H = 150;

const arc = (cx, cy, r, a0, a1, n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
};
const slab = (pts) => linearExtrude({ h: T }, polygon(pts));
const flipY = (pts) => pts.map(([x, y]) => [x, H - y]).reverse();

// ---- base plate ----
const core = slab([[29.5, 25], [138.5, 25], [138.5, 125], [29.5, 125]]);

const a1 = Math.atan2(134.8 - 130.6, 77.4 - 47.3) * 180 / Math.PI;
const a2 = Math.atan2(129.9 - 134.8, 118.8 - 88.6) * 180 / Math.PI;
const topBand = [
  [29.5, 120],
  ...arc(34.5, 145, 5, 180, 90, 8),
  ...arc(47.3, 130.6, 19.4, 90, a1, 16),
  ...arc(77.4, 134.8, 11.1, 180 + a1, 270, 10),
  ...arc(88.6, 134.8, 11.1, 270, 360 + a2, 10),
  ...arc(118.8, 129.9, 20.1, 180 + a2, 0, 24),
  [138.9, 120],
];
const botBand = flipY(topBand);

let plate = union(core, slab(topBand), slab(botBand));
plate = difference(plate, translate([138.5, -10, -1], cube([20, 170, T + 2])));

// ---- side walls (profile in XZ) ----
const notch = arc(13, 54.7, 7.7, 0, -180, 12);
const wallProfile = [
  [29.5, 4], [138.4, 4], [138.4, 15], [133, 22], [129.5, 24.8], [108.9, 24.8],
  [21.8, 64], [20.7, 63],
  ...notch,
  [1, 57], [0, 56], [0, 49], [1.5, 47.5],
  [11, 41.5], [14.5, 38.5], [16, 36],
  [29.5, 5],
];
const wall = (y0) =>
  translate([0, y0 + T, 0], rotate([90, 0, 0], linearExtrude({ h: T }, polygon(wallProfile))));

let part = union(plate, wall(33), wall(112));

// ---- central window ----
part = difference(part, translate([45.4, 48.9, -1],
  fillet({ r: 6.5, edges: "z" }, cube([119 - 45.4, 101.1 - 48.9, T + 2]))));

// ---- holes ----
const hole = (x, y, d) => translate([x, y, -1], cylinder({ r: d / 2, h: T + 2 }));
part = difference(part, hole(40.2, 131.2, 6.3));
part = difference(part, hole(40.2, 18.7, 6.3));
part = difference(part, hole(118.8, 131.2, 5));
part = difference(part, hole(118.8, 18.7, 5));

return part;