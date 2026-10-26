const L = 120, W = 80, H = 25, wall = 3, top = 3;
const Ro = 8, Ri = 5;
const postD = 11, postZ0 = 2, holeD = 3.4, cskD = 7;
const pts = [[8, 8], [112, 8], [8, 72], [112, 72]];

const outer = fillet({ r: Ro, edges: "z" }, cube([L, W, H]));

// cavity tool with the posts (z = 2 .. top) left out of it, so the posts stay as solid material
let cavity = translate([wall, wall, -1],
  fillet({ r: Ri, edges: "z" }, cube([L - 2 * wall, W - 2 * wall, H - top + 1])));
for (const [x, y] of pts) {
  cavity = difference(cavity, translate([x, y, postZ0], cylinder({ d: postD, h: H })));
}

let body = difference(outer, cavity);

for (const [x, y] of pts) {
  body = difference(body,
    drill([x, y, H], [0, 0, 1], { d: holeD, through: true, csink: { d: cskD, angle: 90 } }));
}

body = difference(body, drill([L, 40, 12], [1, 0, 0], { d: 16, depth: wall + 2 }));

return body;