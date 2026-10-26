const T = 10;
const hx = 12.5, hy = 15.3;
const cx = 48.9, cy = 59.5, cR = 37.4;
const pd = 4;

const outer = linearExtrude({ h: T }, polygon([
  [12.5, 2.8], [60, 12], [80, 16.5], [90, 20], [96, 25], [99, 31], [100, 38],
  [100, 139.2], [5.7, 139.2], [5.7, 92], [3, 72], [0.5, 55], [0, 15.3]
]));
let body = union(outer, translate([hx, hy, 0], cylinder({ r: 12.5, h: T })));

const pocketCut = union(
  translate([cx, cy, -1], cylinder({ r: cR, h: T + 2 })),
  translate([22.1, cy, -1], cube([86.3 - 22.1, 100, T + 2])),
  translate([cx, 52.4, -1], cube([86.3 - cx, 100, T + 2])),
  translate([cx, cy - cR, -1], cube([56 - cx, 52.4 - (cy - cR) + 0.5, T + 2])),
  translate([56, 52.4, -1], cylinder({ r: 30.3, h: T + 2 }))
);
body = difference(body, pocketCut);

// hub: Ø15 through, Ø19 x 2 counterbore on both faces
body = difference(body, drill([hx, hy, T], [0, 0, 1], { d: 15, through: true, cbore: { d: 19, depth: 2 } }));
body = difference(body, translate([hx, hy, -1], cylinder({ r: 9.5, h: 3 })));

// through slot on the left arm
const sx = 13.9, sy0 = hy + 75.6 + 4.5, sy1 = hy + 97.1 - 4.5;
const slot = union(
  translate([sx, sy0, -1], cylinder({ r: 4.5, h: T + 2 })),
  translate([sx, sy1, -1], cylinder({ r: 4.5, h: T + 2 })),
  translate([sx - 4.5, sy0, -1], cube([9, sy1 - sy0, T + 2]))
);
body = difference(body, slot);

// pockets on both faces
const poly = (pts, z) => translate([0, 0, z], linearExtrude({ h: pd + 1 }, polygon(pts)));
const trap = [[3.5, hy + 36.5], [8.5, hy + 38.5], [8.5, hy + 48.6], [3.0, hy + 50.6]];
const tri1 = [[4.5, hy + 12.5], [18, hy + 11.7], [5.5, hy + 33.4]];
const tri2 = [[24.5, hy + 4.9], [35, hy + 8.3], [27, hy + 15.8]];

for (const z of [T - pd, -1]) {
  body = difference(body, poly(trap, z));
  body = difference(body, poly(tri1, z));
  body = difference(body, poly(tri2, z));
}

return body;