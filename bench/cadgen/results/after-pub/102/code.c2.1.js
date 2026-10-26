const Z0 = 3, T = 15, TOP = 29.5;
const D2R = Math.PI / 180;
const holeAng = [59.7, 67, 16.3, -25.9, -94.8, 197.4];
const BC = 115;
const tabA = 159.2, tab2A = 226;
const pol = (r, a, z) => [r * Math.cos(a * D2R), r * Math.sin(a * D2R), z];

const tab = (a, L, w) =>
  rotate([0, 0, a], translate([0, -w / 2, Z0], fillet({ r: 10, edges: "z" }, cube([L, w, T]))));

const lobes = holeAng.map(a => translate(pol(105, a, Z0), cylinder({ r: 30, h: T })));

let body = union(
  translate([0, 0, Z0], cylinder({ r: 125, h: T })),
  ...lobes,
  tab(tabA, 220, 55),
  tab(tab2A, 160, 55),
  cylinder({ r: 106, h: Z0 + 0.5 }),
  translate([0, 0, Z0 + T - 0.5], cylinder({ r: 100, h: TOP - (Z0 + T) + 0.5 })),
);

// B: bore
body = difference(body, translate([0, 0, -1], cylinder({ r: 60, h: TOP + 2 })));
// C: counterbore
body = difference(body, translate([0, 0, TOP - 3], cylinder({ r: 75, h: 4 })));
// G: O-ring groove
body = difference(body, translate([0, 0, 10], torus({ r: 60, tube: 5 })));

// H: bolt holes
for (const a of holeAng) {
  body = difference(body, drill(pol(BC, a, Z0 + T), [0, 0, 1], { d: 13, through: true }));
}

// P1: tab pocket on bottom
const pocket = (a, r0, r1, w, depth, rr) =>
  rotate([0, 0, a], translate([r0, -w / 2, -1],
    fillet({ r: rr, edges: "z" }, cube([r1 - r0, w, Z0 + depth + 1]))));
body = difference(body, pocket(tabA, 110, 212, 39, 3.5, 6));
// P2: second tab pocket
body = difference(body, pocket(tab2A, 108, 150, 39, 6, 4));

// S: through slot in tab
body = difference(body, rotate([0, 0, tabA],
  hull({ exact: true },
    translate([133, 0, -1], cylinder({ r: 3, h: TOP })),
    translate([166, 0, -1], cylinder({ r: 3, h: TOP })))));

// D: dimple on ring top
body = difference(body, drill(pol(88, 242.9, TOP), [0, 0, 1], { d: 3, depth: 3 }));

// SKIP 1MM-FILLET: small edge blends
// SKIP chamfers 2.5x45/1x45/1.6x45: small
return body;