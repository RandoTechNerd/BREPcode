const T = 15, H = 50;
const C = [94.5, 100.79];
const RO = 45, RI = 40;
const SLOPE = 44.76, TIPZ = 10;
const ext = (pts, h) => linearExtrude({ h }, polygon(pts));
const rad = (a) => a * Math.PI / 180;
const pol = (r, a) => [C[0] + r * Math.cos(rad(a)), C[1] + r * Math.sin(rad(a))];
const lp = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];

const plateOutline = [
  [0, 0], [89, 0], [108, 18], [124, 40], [135, 65], [139, 100], [94.5, 140],
  [40, 150], [30, 128], [20, 100], [12, 78], [3, 70], [2, 40],
];

const spoke = (d, R) => {
  const s0 = R - (H - TIPZ) / Math.tan(rad(SLOPE));
  const blank = ext([lp(40, -22), lp(R, -6), lp(R, 6), lp(40, 22)], H);
  const cutter = translate([s0, 0, H],
    rotate([0, SLOPE, 0], translate([0, -100, 0], cube([200, 200, 200]))));
  return translate([C[0], C[1], 0], rotate([0, 0, d], difference(blank, cutter)));
};
const spokeWin = (d) => translate([0, 0, -1],
  ext([pol(56, d - 11), pol(88, d - 2.5), pol(88, d + 2.5), pol(56, d + 11)], H + 2));

let part = union(
  ext(plateOutline, T),
  translate([C[0], C[1], 0], cylinder({ r: RO, h: H })),
  spoke(112, 102),
  spoke(66, 101.6),
  translate([28.8, 140.86, 0], cylinder({ r: 7.5, h: T })),
  translate([8.88, 69.67, 0], cylinder({ r: 7.62, h: T })),
);

part = difference(part, translate([C[0], C[1], -1], cylinder({ r: RI, h: H + 2 })));
part = difference(part, spokeWin(112));
part = difference(part, spokeWin(66));
part = difference(part, translate([0, 0, -1], ext([[27, 25], [66, 25], [50, 58]], T + 2)));
part = difference(part, translate([18.75, -1, -1], cube([36.35, 12.18, T + 2])));
part = difference(part, drill([28.8, 140.86, T], [0, 0, 1], { d: 10, through: true }));
part = difference(part, drill([8.88, 69.67, T], [0, 0, 1], { d: 10, through: true }));
part = difference(part, drill([11.88, 6.88, T], [0, 0, 1], { d: 6, through: true }));
part = difference(part, drill([61.98, 6.88, T], [0, 0, 1], { d: 6, through: true }));

return part;