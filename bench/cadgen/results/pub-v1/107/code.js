const T = 2;
const PX = 66;
const W0 = 30.6, W1 = 102.6, WH = 22.7;
const FY = 13, PY0 = 19.4, PY1 = 116.2, FY1 = 122.6, LEN = 135.6;
const FZ = 4.2;
const FX0 = 9.8, FX1 = 63.7;

const ramp = (ya, yb, za, zb) => {
  const p = polygon([[ya, za], [yb, zb], [yb, zb + T], [ya, za + T]]);
  return translate([FX0, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: FX1 - FX0 }, p))));
};

let body = union(
  translate([0, W0, 0], cube([PX, W1 - W0, T])),
  translate([FX0, PY0 - 0.5, 0], cube([PX - FX0, PY1 - PY0 + 1, T])),
  translate([0, W0, 0], cube([T, W1 - W0, WH])),
  translate([FX0, 0, FZ], cube([FX1 - FX0, FY + 0.5, T])),
  translate([FX0, FY1 - 0.5, FZ], cube([FX1 - FX0, LEN - FY1 + 0.5, T])),
  ramp(FY, PY0 + 0.6, FZ, 0),
  ramp(PY1 - 0.6, FY1, 0, FZ),
  translate([PX - T, 89, -8], cube([T, 11, 8.5])),
  translate([PX - T, 33, -8], cube([T, 12.5, 8.5])),
);

// rounded square cutouts
const sq = (x0, y0) => translate([x0, y0, -1], fillet({ r: 3, edges: "z" }, cube([16, 16, T + 2])));
body = difference(body, sq(28.6, 77.1), sq(28.6, 42.6), sq(49.1, 60.1));

// wall-side relief notch
body = difference(body, translate([-1, 63.1, -1], cube([19.5, 14, T + 2])));

// flange slots and holes
const slot = (y) => translate([0, 0, FZ - 1], hull({ exact: true },
  translate([29.3, y, 0], cylinder({ r: 2.75, h: T + 2 })),
  translate([36.8, y, 0], cylinder({ r: 2.75, h: T + 2 }))));
body = difference(body, slot(5.7), slot(126.4));
body = difference(body,
  translate([54.3, 5.7, FZ - 1], cylinder({ r: 2.75, h: T + 2 })),
  translate([54.3, 126.4, FZ - 1], cylinder({ r: 2.75, h: T + 2 })));

// wall holes
const wh = (y, z, d) => translate([-1, y, z], rotate([0, 90, 0], cylinder({ r: d / 2, h: T + 2 })));
const wallHoles = [];
for (const y of [38.1, 52.1, 81.1, 95.1]) for (const z of [4.7, 18.7]) wallHoles.push(wh(y, z, 2.4));
wallHoles.push(wh(45.1, 11.7, 10), wh(88.1, 11.7, 10));
body = difference(body, ...wallHoles);

return body;