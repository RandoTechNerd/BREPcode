const L = 120, W = 80, H = 25, t = 3;
const Ro = 8, Ri = 5;
const postD = 11, postBot = 2;
const pts = [[8, 8], [112, 8], [8, 72], [112, 72]];

const outer = fillet({ r: Ro, edges: "z" }, cube([L, W, H]));
const cavity = translate([t, t, -1],
  fillet({ r: Ri, edges: "z" }, cube([L - 2 * t, W - 2 * t, H - t + 1])));
let body = difference(outer, cavity);

const posts = pts.map(([x, y]) =>
  translate([x, y, postBot], cylinder({ d: postD, h: H - t - postBot + 0.5 })));
body = union(body, ...posts);

for (const [x, y] of pts) {
  body = difference(body, drill([x, y, H], [0, 0, 1],
    { d: 3.4, through: true, csk: { d: 7, angle: 90 } }));
}

body = difference(body, drill([L, 40, 12], [1, 0, 0], { d: 16, depth: t + 2 }));

return body;
