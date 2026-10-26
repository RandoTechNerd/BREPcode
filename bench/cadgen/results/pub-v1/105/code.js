const R = 50, L = 50, F = 43.5;
const lobeX = 16, lobeR = 19.5, uR = 7.5, uY = -20;
const pocketR = 23, pocketTip = 33;
const pocketDepth = 5;
const portZ = L / 2;

// body: Ø100 round body with flats at y = ±43.5
const body = intersection(
  cylinder({ r: R, h: L }),
  translate([-R - 1, -F, -1], cube([2 * R + 2, 2 * F, L + 2])),
);

// figure-8 bore, through along Z
const bore = translate([0, 0, -1], union(
  translate([-lobeX, 0, 0], cylinder({ r: lobeR, h: L + 2 })),
  translate([lobeX, 0, 0], cylinder({ r: lobeR, h: L + 2 })),
  translate([-uR, uY, 0], cube([2 * uR, -uY + 0.5, L + 2])),
  translate([0, uY, 0], cylinder({ r: uR, h: L + 2 })),
));

// face-pocket outline: convex hull of R23 circles about the lobes plus the top and bottom tips
const pts = [[0, pocketTip], [0, -pocketTip]];
for (let i = 0; i < 72; i++) {
  const a = i * 2 * Math.PI / 72;
  pts.push([lobeX + pocketR * Math.cos(a), pocketR * Math.sin(a)]);
  pts.push([-lobeX + pocketR * Math.cos(a), pocketR * Math.sin(a)]);
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
const lower = [], upper = [];
for (const p of pts) {
  while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
  lower.push(p);
}
for (let i = pts.length - 1; i >= 0; i--) {
  const p = pts[i];
  while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
  upper.push(p);
}
const pocketProfile = polygon(lower.slice(0, -1).concat(upper.slice(0, -1)));
const pocketFront = translate([0, 0, L - pocketDepth], linearExtrude({ h: pocketDepth + 1 }, pocketProfile));
const pocketBack = translate([0, 0, -1], linearExtrude({ h: pocketDepth + 1 }, pocketProfile));

// axial through-holes
const axial = (x, y, d) => translate([x, y, -1], cylinder({ r: d / 2, h: L + 2 }));

// cylinder along +Y from y0 to y1 at x = 0, z = portZ
const yCyl = (d, y0, y1) => translate([0, y0, portZ], rotate([-90, 0, 0], cylinder({ r: d / 2, h: y1 - y0 })));

let part = difference(body, bore);
part = difference(part, pocketFront);
part = difference(part, pocketBack);
for (const [x, y] of [[-25.74, 30.94], [25.74, 30.94], [-25.74, -30.94], [25.74, -30.94]]) {
  part = difference(part, axial(x, y, 12));
}
part = difference(part, axial(-44.5, 0, 6), axial(44.5, 0, 6));

// ports: Ø15 through along Y, Ø20 x 12 from each flat, Ø30 x 2 spot faces
part = difference(part, yCyl(15, -F - 1, F + 1));
part = difference(part, yCyl(20, F - 12, F + 1));
part = difference(part, yCyl(20, -F - 1, -F + 12));
part = difference(part, yCyl(30, F - 2, F + 1));
part = difference(part, yCyl(30, -F - 1, -F + 2));

return part;