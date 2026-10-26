const T = 15, RING_TOP = 29.5, PAD = 3;
const R_PLATE = 135, R_BC = 115, R_LOBE = 30, R_RING = 106;
const A_LONG = 160.8, A_SHORT = 225.8, TAB_W = 55;
const holeAngles = [17.7, 68, 120.4, 197.5, 265.8, 335];
const rad = (a) => a * Math.PI / 180;
const P = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];

// tab from r=100 out to rEnd, end corners R10 (filleted before the union)
const tab = (a, rEnd) => rotate([0, 0, a],
  translate([100, -TAB_W / 2, 0], fillet({ r: 10, edges: "z" }, cube([rEnd - 100, TAB_W, T]))));

const lobes = holeAngles.map((a) => {
  const [x, y] = P(R_BC, a);
  return translate([x, y, 0], cylinder({ r: R_LOBE, h: T }));
});

let part = union(
  cylinder({ r: R_PLATE, h: T }),
  ...lobes,
  tab(A_LONG, 220),
  tab(A_SHORT, 160),
  translate([0, 0, T - 0.5], cylinder({ r: R_RING, h: RING_TOP - T + 0.5 })),
  translate([0, 0, -PAD], cylinder({ r: 100, h: PAD + 0.5 })),
);

// central bore and counterbores
part = difference(part, translate([0, 0, -PAD - 1], cylinder({ r: 60, h: RING_TOP + PAD + 2 })));
part = difference(part, translate([0, 0, RING_TOP - 6], cylinder({ r: 75, h: 7 })));
part = difference(part, translate([0, 0, -PAD - 1], cylinder({ r: 66, h: 6.5 + 1 })));
// R5 groove in the bore
part = difference(part, translate([0, 0, 12], torus({ r: 60, tube: 5 })));

// bolt holes
for (const a of holeAngles) {
  const [x, y] = P(R_BC, a);
  part = difference(part, drill([x, y, T], [0, 0, 1], { d: 10, through: true }));
}

// pin hole on the ring top
{
  const [x, y] = P(87.65, 243.7);
  part = difference(part, drill([x, y, RING_TOP], [0, 0, 1], { d: 4, depth: 8 }));
}

// bottom pockets in the tabs, 3.5 deep, rounded corners
part = difference(part, rotate([0, 0, A_LONG],
  translate([140, -19.5, -1], fillet({ r: 6, edges: "z" }, cube([72, 39, 4.5])))));
part = difference(part, rotate([0, 0, A_SHORT],
  translate([111, -19.5, -1], fillet({ r: 4, edges: "z" }, cube([39, 39, 4.5])))));

// through slot in the long tab, R3 ends
part = difference(part, rotate([0, 0, A_LONG], hull({ exact: true },
  translate([130.5, 0, -1], cylinder({ r: 3, h: T + 2 })),
  translate([167.5, 0, -1], cylinder({ r: 3, h: T + 2 })),
)));

// SKIP ind250: shallow Ø250 outline indents between lobes not modelled
// SKIP fillets: R3 ring-base, R5 plate top edge, 1 mm bore blends, small bore chamfers
return part;