const L = 120, W = 80, H = 25, wall = 3, top = 3, Ro = 8, Ri = 5;
const postD = 11, inset = 8, holeD = 3.4, cskD = 7;
const sideD = 16, sideY = 40, sideZ = 12;

const outer = fillet({ r: Ro, edges: "z" }, cube([L, W, H]));
const cavity = translate([wall, wall, -1],
  fillet({ r: Ri, edges: "z" }, cube([L - 2 * wall, W - 2 * wall, H - top + 1])));

const pts = [[inset, inset], [L - inset, inset], [inset, W - inset], [L - inset, W - inset]];

let body = difference(outer, cavity);
body = union(body, ...pts.map(([x, y]) =>
  translate([x, y, 0], cylinder({ d: postD, h: H - top + 0.5 }))));

for (const [x, y] of pts) {
  body = difference(body, drill([x, y, H], [0, 0, 1],
    { d: holeD, through: true, csink: { d: cskD, angle: 90 } }));
}

body = difference(body, drill([L, sideY, sideZ], [1, 0, 0], { d: sideD, depth: wall + 1 }));

return body;