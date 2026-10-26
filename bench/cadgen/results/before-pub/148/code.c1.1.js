const H = 100, XS = 97, YT = 98, YB = -100, DG = 107.6 * Math.SQRT2;
const RC = 85;
const deg = Math.PI / 180;

const outline = polygon([
  [XS, -(DG - XS)], [XS, DG - XS], [DG - YT, YT], [-(DG - YT), YT],
  [-XS, DG - XS], [-XS, -(DG - XS)], [-(DG + YB), YB], [DG + YB, YB],
]);
let body = linearExtrude({ h: H }, outline);
// side tabs
body = union(body,
  translate([XS - 0.5, -11, 50], cube([4.5, 22, 50])),
  translate([-XS - 4, -11, 50], cube([4.5, 22, 50])));
// tower along +Y at x=0, z=50
const TZ = 50, TTOP = 120, TB = 80;
const yCyl = (x, z, r, y0, y1) =>
  translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: y1 - y0 })));
const lobes = [];
for (let i = 0; i < 6; i++) {
  const a = i * 60 * deg;
  lobes.push(yCyl(40 * Math.cos(a), TZ + 40 * Math.sin(a), 7.5, TB, TTOP));
}
body = union(body, yCyl(0, TZ, 37.5, TB, TTOP), ...lobes);

// main cavity through
body = difference(body, translate([0, 0, -1], cylinder({ r: RC, h: H + 2 })));

// conical web with hub
const web = revolve(360, polygon([
  [25, 30], [42, 30], [RC + 0.5, 45.7], [RC + 0.5, 55], [42, 70], [25, 70],
]));
body = union(body, web);
body = difference(body, translate([0, 0, 54.7], cylinder({ r: 30, h: 16.3 })));
body = difference(body, translate([0, 0, 29], cylinder({ r: 30, h: 17.4 })));

// 7X Ø27.5 web holes on Ø130
const webAngles = [18, -18, -54, -90, -126, -162, 162];
for (const a of webAngles) {
  body = difference(body, translate([65 * Math.cos(a * deg), 65 * Math.sin(a * deg), -1],
    cylinder({ r: 13.75, h: H + 2 })));
}

// 8X Ø10 thru on Ø195
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  body = difference(body, translate([97.5 * Math.cos(a * deg), 97.5 * Math.sin(a * deg), -1],
    cylinder({ r: 5, h: H + 2 })));
}

// tower bore Ø65 into the cavity
body = difference(body, yCyl(0, TZ, 32.5, 60, TTOP + 1));
// 6X Ø7 lobe holes
for (let i = 0; i < 6; i++) {
  const a = i * 60 * deg;
  body = difference(body, yCyl(40 * Math.cos(a), TZ + 40 * Math.sin(a), 3.5, TTOP - 15, TTOP + 1));
}

// diagonal-face features in local frame F: +X outward normal, Y across face (toward tower), Z axial
const xCyl = (y, z, r, x0, x1) =>
  translate([x0, y, z], rotate([0, 90, 0], cylinder({ r, h: x1 - x0 })));
const P = 107.6 / Math.SQRT2;
const place = (tool) => translate([P, P, 0], rotate([0, 0, 45], tool));
const cutters = [
  union(translate([-35, -15, 40], cube([40, 25, 20])),
        xCyl(-2.5, 40, 12.5, -35, 5), xCyl(-2.5, 60, 12.5, -35, 5)),
  xCyl(12.5, 20, 5, -30, 1), xCyl(-12.5, 20, 5, -30, 1),
  xCyl(12.5, 80, 5, -30, 1), xCyl(-12.5, 80, 5, -30, 1),
];
for (const c of cutters) {
  const placed = place(c);
  body = difference(body, placed);
  body = difference(body, mirror([1, 0, 0], placed));
}

// 2X Ø10 tab holes, 11 deep, z=66
body = difference(body, xCyl(0, 66, 5, 101 - 11, 102));
body = difference(body, xCyl(0, 66, 5, -102, -101 + 11));

return body;