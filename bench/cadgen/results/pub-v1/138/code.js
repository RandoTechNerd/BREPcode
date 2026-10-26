const t = 1, FH = 14.4, yB = 3.9, yT = 70.8;
const box = (x0, y0, z0, x1, y1, z1) => translate([x0, y0, z0], cube([x1 - x0, y1 - y0, z1 - z0]));

let body = union(
  box(0, yB, 0, 120, yT, t),
  box(0, -2.1, 0, 18.5, 77.4, t),
  box(108, -2.1, 0, 120, 77.4, t),
  box(18, yB, 0, 65.1, yB + t, FH),
  box(76, yB, 0, 108.5, yB + t, FH),
  box(18, yT - t, 0, 65.1, yT, FH),
  box(76, yT - t, 0, 108.5, yT, FH),
  box(66.4, yB, -FH, 74.7, yB + t, 0.5),
  box(66.4, yT - t, -FH, 74.7, yT, 0.5),
);

const plateHoles = [
  [6, 0, 3.2], [114, 0, 3.2], [6, 75.4, 3.2], [114, 75.4, 3.2],
  [18, 37.7, 16], [40, 37.7, 16],
  [27.7, 46.7, 5], [27.7, 28.7, 5],
  [100, 20.7, 16],
  [88, 21.1, 6], [112, 17.0, 6], [102.5, 32.7, 6],
  [91, 36.6, 8],
  [5, 17.7, 5], [56, 53.7, 5], [66.5, 37.7, 5], [70.5, 14.7, 5],
];
for (const [x, y, d] of plateHoles) {
  body = difference(body, drill([x, y, t], [0, 0, 1], { d, through: true }));
}

for (const x of [23, 60, 80.9, 103]) {
  body = difference(body, drill([x, yB, 10.4], [0, -1, 0], { d: 3.2, through: true }));
  body = difference(body, drill([x, yT, 10.4], [0, 1, 0], { d: 3.2, through: true }));
}
body = difference(body, drill([70.5, yB, -10.4], [0, -1, 0], { d: 3.2, through: true }));
body = difference(body, drill([70.5, yT, -10.4], [0, 1, 0], { d: 3.2, through: true }));

return body;