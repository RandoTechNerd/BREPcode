const L = 120, W = 80, H = 25, wall = 3, top = 3, Ro = 8, Ri = 5;
const postD = 11, inset = 8, holeD = 3.4, cskD = 7;
const sideD = 16, sideY = 40, sideZ = 12;

const pts = [[inset, inset], [L - inset, inset], [inset, W - inset], [L - inset, W - inset]];

const outer = fillet({ r: Ro, edges: "z" }, cube([L, W, H]));

let cavity = translate([wall, wall, -1],
  fillet({ r: Ri, edges: "z" }, cube([L - 2 * wall, W - 2 * wall, H - top + 1])));
for (const [x, y] of pts) {
  cavity = difference(cavity, translate([x, y, -2], cylinder({ d: postD, h: H + 4 })));
}

let body = difference(outer, cavity);

for (const [x, y] of pts) {
  body = difference(body, drill([x, y, H], [0, 0, 1],
    { d: holeD, through: true, csink: { d: cskD, angle: 90 } }));
}

body = difference(body, drill([L, sideY, sideZ], [1, 0, 0], { d: sideD, depth: wall + 1 }));

return body;