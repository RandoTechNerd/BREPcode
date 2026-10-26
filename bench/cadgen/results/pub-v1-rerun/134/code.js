const H = 338, headZ = 308, floorZ = 318, floorTop = 326;
const sector = (r1, r2, a0, a1, n = 24) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([r2 * Math.cos(a), r2 * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([r1 * Math.cos(a), r1 * Math.sin(a)]); }
  return polygon(pts);
};
const pol = (r, deg) => [r * Math.cos(deg * Math.PI / 180), r * Math.sin(deg * Math.PI / 180)];

const baseAng = [45, 135, 225, 315];
const headAng = [25, 52, 128, 155, 247.3, 292.7];
const portZ = 318;

let body = cylinder({ r: 98, h: 8 });
for (const a of baseAng) { const [x, y] = pol(105, a); body = union(body, translate([x, y, 0], cylinder({ r: 8, h: 8 }))); }
body = union(body, translate([0, 0, 7.5], cylinder({ r: 78, h: 313 - 7.5 })));
body = union(body, translate([0, 0, headZ], cylinder({ r: 88, h: H - headZ })));
body = union(body, translate([0, 0, headZ], linearExtrude({ h: H - headZ }, sector(75, 138, 52, 128))));
for (const a of headAng) { const [x, y] = pol(95, a); body = union(body, translate([x, y, headZ], cylinder({ r: 8, h: H - headZ }))); }
body = union(body, translate([-26, -130, 304], cube([52, 60.5, 34])));
body = union(body, translate([86, 0, 7.5], cylinder({ r: 11, h: 301 })));
body = union(body, translate([70, 0, portZ], rotate([0, 90, 0], cylinder({ r: 20, h: 50 }))));

body = difference(body, translate([0, 0, -1], cylinder({ r: 67, h: floorZ + 1 })));
body = difference(body, translate([0, 0, floorTop], cylinder({ r: 75, h: H - floorTop + 10 })));
body = difference(body, translate([0, 0, headZ - 1], linearExtrude({ h: H - headZ + 2 }, sector(90, 126, 60, 120))));
for (const c of [30, 150, 270]) {
  body = difference(body, translate([0, 0, floorZ - 1], linearExtrude({ h: 10 }, sector(40, 64, c - 42, c + 42))));
}
body = difference(body, translate([0, 0, floorZ - 1], cylinder({ r: 15, h: 10 })));
for (const [x, y] of [[-58.02, -33.5], [-27.55, -16.82], [0, 31.82], [0, 67], [28.34, -16.36], [58.02, -33.5]]) {
  body = difference(body, translate([x, y, floorZ - 1], cylinder({ r: 2.1, h: 10 })));
}
for (const a of baseAng) {
  const [x, y] = pol(105, a);
  body = difference(body, translate([x, y, -1], cylinder({ r: 3.4, h: 10 })));
}
for (const a of headAng) {
  const [x, y] = pol(95, a);
  body = difference(body, translate([x, y, headZ - 1], cylinder({ r: 3.4, h: H - headZ + 2 })));
}
body = difference(body, translate([0, -131, 321], rotate([-90, 0, 0], cylinder({ r: 14.65, h: 60 }))));
body = difference(body, translate([121, 0, portZ], rotate([0, -90, 0], cylinder({ r: 11, h: 50 }))));

return body;