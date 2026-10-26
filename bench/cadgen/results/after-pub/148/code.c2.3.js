const D = 100, SX = 96, SZ = 99.4, DG = 102;
const k = DG * Math.SQRT2;
const prof = [[SX, k - SX], [k - SZ, SZ], [-(k - SZ), SZ], [-SX, k - SX], [-SX, -(k - SX)], [-(k - SZ), -SZ], [k - SZ, -SZ], [SX, -(k - SX)]];
const yCyl = (x, z, r, y0, len) => translate([x, y0, z], rotate([-90, 0, 0], cylinder({ r, h: len })));
const BY = 50, BZ0 = 98.9, BZ1 = 118;

// base: octagon prism with a straight Ø170 bore
let shellBody = difference(
  rotate([-90, 0, 0], linearExtrude({ h: D }, polygon(prof))),
  yCyl(0, 0, 85, -1, D + 2),
);
// W: web + hub ring from the B-B half-section, (r, y)
const web = rotate([-90, 0, 0], revolve(360, polygon([
  [25, 45.5], [30, 45.5], [30, 34], [42.15, 34], [85.5, 45],
  [85.5, 57], [42.15, 69.6], [30, 69.6], [30, 54], [25, 54],
])));
let body = union(
  shellBody,
  web,
  translate([95.5, 0, -11], cube([5.6, 45, 22])),
  translate([-101.1, 0, -11], cube([5.6, 45, 22])),
  translate([0, BY, BZ0], cylinder({ r: 37.5, h: BZ1 - BZ0 })),
  ...[0, 60, 120, 180, 240, 300].map(a => translate([39 * Math.cos(a * Math.PI / 180), BY + 39 * Math.sin(a * Math.PI / 180), BZ0], cylinder({ r: 7.5, h: BZ1 - BZ0 }))),
);
// E: boss bore
body = difference(body, translate([0, BY, 80], cylinder({ r: 32.5, h: 40 })));
// H: port down into the hub
body = difference(body, translate([0, BY, 20], cylinder({ r: 13.5, h: 62 })));
// C: 7X Ø27.5 THRU
for (const a of [18, 162, 198, 234, 270, 306, 342]) {
  const t = a * Math.PI / 180;
  body = difference(body, yCyl(65 * Math.cos(t), 65 * Math.sin(t), 13.75, -1, D + 2));
}
// B: 8X Ø10 THRU
for (const a of [30, 60, 120, 150, 210, 240, 300, 330]) {
  const t = a * Math.PI / 180;
  body = difference(body, yCyl(97.5 * Math.cos(t), 97.5 * Math.sin(t), 5, -1, D + 2));
}
// G: 6X Ø7
for (const a of [0, 60, 120, 180, 240, 300]) {
  const t = a * Math.PI / 180;
  body = difference(body, translate([39 * Math.cos(t), BY + 39 * Math.sin(t), BZ1 - 20], cylinder({ r: 3.5, h: 21 })));
}
// L + S: slot and 4 holes on each upper 45° flat
const P = DG / Math.SQRT2, FY = 51;
for (const s of [1, -1]) {
  const slot = hull({ exact: true },
    translate([2.5 * s, -10, -10], cylinder({ r: 12.5, h: 11 })),
    translate([2.5 * s, 10, -10], cylinder({ r: 12.5, h: 11 })),
  );
  body = difference(body, translate([s * P, FY, P], rotate([0, 45 * s, 0], slot)));
  for (const [ax, ay] of [[12.5, 30], [-12.5, 30], [12.5, -30], [-12.5, -30]]) {
    body = difference(body, translate([s * P, FY, P], rotate([0, 45 * s, 0],
      translate([ax, ay, -15], cylinder({ r: 5, h: 16 })))));
  }
}
// T: tab holes
body = difference(body, drill([101.1, 34, 0], [1, 0, 0], { d: 10, depth: 11 }));
body = difference(body, drill([-101.1, 34, 0], [-1, 0, 0], { d: 10, depth: 11 }));
// SKIP R7/R5/R1.5/R2.5/R3 fillets: small blends
// SKIP rib pockets (5, 42.1): shallow web pockets
return body;