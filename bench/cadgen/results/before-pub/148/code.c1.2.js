const H = 100, XS = 97, YT = 98, YB = -100, DG = 107.6 * Math.SQRT2;
const RC = 85;
const deg = Math.PI / 180;

const outline = polygon([
  [XS, -(DG - XS)], [XS, DG - XS], [DG - YT, YT], [-(DG - YT), YT],
  [-XS, DG - XS], [-XS, -(DG - XS)], [-(DG + YB), YB], [DG + YB, YB],
]);
let body = linearExtrude({ h: H }, outline);
// side tabs
body = union(body, translate([XS - 0.5, -11, 50], cube([4, 22, 50])));
body = union(body, translate([-XS - 3.5, -11, 50], cube([4, 22, 50])));

// tower along +Y at x=0, z=50
const TZ = 50, TTOP = 120, TB = 80;
const yCyl = (x, z, r, y0, y1) =>
  translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: y1 - y0 })));
body = union(body, yCyl(0, TZ, 37.5, TB, TTOP));
for (let i = 0; i < 6; i++) {
  const a = i * 60 * deg;
  body = union(body, yCyl(40 * Math.cos(a), TZ + 40 * Math.sin(a), 7.5, TB, TTOP));
}

// front cavity: cylinder r85 z54.5..101 minus a cone (r85 at z55 -> r42 at z70)
const sF = (85 - 42) / 15;
const frontTool = difference(
  translate([0, 0, 54.5], cylinder({ r: RC, h: H + 1 - 54.5 })),
  translate([0, 0, 54.5], cylinder({ r1: 42 + sF * 15.5, r2: 42, h: 15.5 })),
);
body = difference(body, frontTool);

// rear cavity: cylinder r85 z-1..46.2 minus a cone (r42 at z30 -> r85 at z45.7)
const sR = (85 - 42) / 15.7;
const rearTool = difference(
  translate([0, 0, -1], cylinder({ r: RC, h: 47.2 })),
  translate([0, 0, 30], cylinder({ r1: 42, r2: 42 + sR * 16.5, h: 16.5 })),
);
body = difference(body, rearTool);

// hub bore and counterbores
body = difference(body, translate([0, 0, 54.7], cylinder({ r: 30, h: 16.3 })));
body = difference(body, translate([0, 0, 29], cylinder({ r: 30, h: 17.4 })));
body = difference(body, translate([0, 0, -1], cylinder({ r: 25, h: H + 2 })));

// 7X Ø27.5 web holes on Ø130
for (const a of [18, -18, -54, -90, -126, -162, 162]) {
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

// diagonal-face features, local frame: +X outward normal, Y across the face, Z axial
const xCyl = (y, z, r, x0, x1) =>
  translate([x0, y, z], rotate([0, 90, 0], cylinder({ r, h: x1 - x0 })));
// slot: exact hull of upright cylinders, then turned so its axis runs along X
const slotLocal = rotate([0, 90, 0], hull({ exact: true },
  translate([-40, -2.5, -35], cylinder({ r: 12.5, h: 40 })),
  translate([-60, -2.5, -35], cylinder({ r: 12.5, h: 40 })),
));
const P = 107.6 / Math.SQRT2;
const place = (tool) => translate([P, P, 0], rotate([0, 0, 45], tool));
const cutters = [
  slotLocal,
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