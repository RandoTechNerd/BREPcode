const FB = 314, FT = 300, TF = 35, H = 270, TOPZ = 235;
const draftTop = 285, R = 30;
const boltX = 120;
const cav = 250, floorZ = 35, webTop = 176;
const hubR = 65, boreR = 50, webT = 15;

const flange = (w, z, t) =>
  translate([-w / 2, -w / 2, z], fillet({ r: R, edges: "z" }, cube([w, w, t])));

const frustum = hull({ exact: true },
  translate([-FB / 2, -FB / 2, 0], cube([FB, FB, 1])),
  translate([-draftTop / 2, -draftTop / 2, TOPZ - 1], cube([draftTop, draftTop, 1])),
);

const bulge = intersection(
  cylinder({ r: 164, h: 120 }),
  translate([-170, -60, -1], cube([340, 120, 122])),
);

let body = union(
  flange(FB, 0, TF),
  frustum,
  flange(FT, TOPZ - 0.5, TF + 0.5),
  bulge,
);

// inner cavity: open at the top, with solid corner columns, a hub and diagonal webs left standing
let cavity = translate([-cav / 2, -cav / 2, floorZ], cube([cav, cav, H]));
for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
  cavity = difference(cavity,
    translate([sx * boltX, sy * boltX, 0], cylinder({ r: 60, h: H + 10 })));
}
cavity = difference(cavity, cylinder({ r: hubR, h: webTop }));
for (const a of [45, 135]) {
  cavity = difference(cavity,
    rotate([0, 0, a], translate([-180, -webT / 2, 0], cube([360, webT, webTop]))));
}
body = difference(body, cavity);

// central bore, with a 35 floor left at the bottom
body = difference(body, translate([0, 0, floorZ], cylinder({ r: boreR, h: H })));

// bolt holes: Ø30 down to the bottom flange, Ø25 through the flange
for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
  body = difference(body, translate([sx * boltX, sy * boltX, floorZ], cylinder({ r: 15, h: H })));
  body = difference(body, translate([sx * boltX, sy * boltX, -1], cylinder({ r: 12.5, h: TF + 2 })));
}

return body;