const T = 15, HUB_R = 106, HUB_TOP = 29.5, PAD = 3;
const OUT_R = 135, LOBE_R = 30, BC_R = 115, BOLT_D = 11;
const LONG_A = 161.2, SHORT_A = 226.2;
const rad = (a) => a * Math.PI / 180;
const pol = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];

const boltAngles = [120.8, 68.4, 18.1, 335.4, 266.2, 197.9];

const tab = (a, L, W) =>
  rotate([0, 0, a], translate([0, -W / 2, 0], fillet({ r: 10, edges: "z" }, cube([L, W, T]))));

const lobes = boltAngles.map((a) => {
  const [x, y] = pol(BC_R, a);
  return translate([x, y, 0], cylinder({ r: LOBE_R, h: T }));
});

let part = union(
  cylinder({ r: OUT_R, h: T }),
  ...lobes,
  tab(LONG_A, 220, 55),
  tab(SHORT_A, 160, 50),
  translate([0, 0, T - 0.5], cylinder({ r: HUB_R, h: HUB_TOP - T + 0.5 })),
  translate([0, 0, -PAD], cylinder({ r: HUB_R, h: PAD + 0.5 })),
);

// bore through
part = difference(part, translate([0, 0, -PAD - 1], cylinder({ r: 60, h: HUB_TOP + PAD + 2 })));
// counterbore from the bottom face
part = difference(part, translate([0, 0, -PAD - 1], cylinder({ r: 75, h: 6.5 + 1 })));
// R5 internal groove
part = difference(part, translate([0, 0, T], torus({ r: 60, tube: 5 })));

// bottom pockets in the tabs, 3.5 deep
const pocket = (a, r0, r1, W, rr) =>
  rotate([0, 0, a], translate([r0, -W / 2, -1], fillet({ r: rr, edges: "z" }, cube([r1 - r0, W, 3.5 + 1]))));
part = difference(part, pocket(LONG_A, 112, 212, 39, 6));
part = difference(part, pocket(SHORT_A, 110, 150, 39, 4));

// slot in the long tab
part = difference(part, rotate([0, 0, LONG_A], hull({ exact: true },
  translate([128, 0, -1], cylinder({ r: 3, h: T + 2 })),
  translate([166, 0, -1], cylinder({ r: 3, h: T + 2 })),
)));

// bolt holes
for (const a of boltAngles) {
  const [x, y] = pol(BC_R, a);
  part = difference(part, translate([x, y, -PAD - 1], cylinder({ r: BOLT_D / 2, h: HUB_TOP + PAD + 2 })));
}

// pin hole on Ø175.3
{
  const [x, y] = pol(87.65, 244.1);
  part = difference(part, translate([x, y, -PAD - 1], cylinder({ r: 1.5, h: HUB_TOP + PAD + 2 })));
}

// SKIP Ø250 flats: approximated by the R135 outline
// SKIP chamfers 2.5x45 / 1x45 / 1.6x45, R3 TYP, 1MM FILLET: small edge breaks
return part;