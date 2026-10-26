const L = 120, W = 80, H = 25, t = 3;
const outer = fillet({ r: 8, edges: "z" }, cube([L, W, H]));
const pocket = translate([t, t, -1], fillet({ r: 5, edges: "z" }, cube([L - 2 * t, W - 2 * t, H - t + 1])));
const pts = [[8, 8], [112, 8], [8, 72], [112, 72]];
let body = difference(outer, pocket);
const posts = pts.map(([x, y]) => translate([x, y, 0], cylinder({ r: 5.5, h: H - t + 0.5 })));
body = union(body, ...posts);
for (const [x, y] of pts) {
  body = difference(body, drill([x, y, H], [0, 0, 1], { d: 3.4, through: true, csink: { d: 7, angle: 90 } }));
}
body = difference(body, translate([L - 10, 40, 12], rotate([0, 90, 0], cylinder({ r: 8, h: 11 }))));
return body;
