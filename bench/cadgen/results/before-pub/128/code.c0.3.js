const z1 = 60, z2 = 90, z3 = 111.01, z4 = 164.99, z5 = 200, z6 = 300, z7 = 370.02, zb = 320.02;
const R0 = 365, R1 = 305, R2 = 275, R3 = 225, R4 = 125;
const rBore = 184, rMid = 120, rTop = 50;
const slotR = 335, slotW = 24, slotSpan = 30.14;
const notchW = 19.56, notchD = 12, notchA = 28.68;
const ov = 0.5;

// Turned body from overlapping cylinders and cones (each cone starts 0.5 low, inside the piece below)
let body = union(
  cylinder({ r: R0, h: z1 }),
  translate([0, 0, z1 - ov], cylinder({ r: R1, h: z2 - z1 + ov })),
  translate([0, 0, z2 - ov], cylinder({ r1: R1, r2: R2, h: z3 - z2 + ov })),
  translate([0, 0, z3 - ov], cylinder({ r: R2, h: z4 - z3 + ov })),
  translate([0, 0, z4 - ov], cylinder({ r1: R2, r2: R3, h: z5 - z4 + ov })),
  translate([0, 0, z5 - ov], cylinder({ r: R3, h: z6 - z5 + ov })),
  translate([0, 0, z6 - ov], cylinder({ r1: R3, r2: R4, h: z7 - z6 + ov })),
);

// Bores, cut one at a time
body = difference(body, translate([0, 0, -1], cylinder({ r: rBore, h: z5 + 1 })));
body = difference(body, translate([0, 0, z5 - 1], cylinder({ r: rMid, h: zb - z5 + 1 })));
body = difference(body, translate([0, 0, zb - 1], cylinder({ r: rTop, h: z7 - zb + 2 })));

// Arc slots: an annulus clipped by a wedge, plus a round cap at each end
const rad = (a) => a * Math.PI / 180;
const annulus = difference(
  translate([0, 0, -1], cylinder({ r: slotR + slotW / 2 - 0.01, h: z1 + 2 })),
  translate([0, 0, -2], cylinder({ r: slotR - slotW / 2 + 0.01, h: z1 + 4 })),
);
const RW = 420;
for (let i = 0; i < 8; i++) {
  const c = i * 45, a0 = c - slotSpan / 2, a1 = c + slotSpan / 2;
  const pts = [[0, 0]];
  for (let k = 0; k <= 4; k++) {
    const a = rad(a0 + (a1 - a0) * k / 4);
    pts.push([RW * Math.cos(a), RW * Math.sin(a)]);
  }
  const wedge = translate([0, 0, -1.5], linearExtrude({ h: z1 + 3 }, polygon(pts)));
  body = difference(body, intersection(annulus, wedge));
  for (const a of [a0, a1]) {
    body = difference(body, translate([slotR * Math.cos(rad(a)), slotR * Math.sin(rad(a)), -1],
      cylinder({ r: slotW / 2, h: z1 + 2 })));
  }
}

// Rim notches
const notch = (a) => rotate([0, 0, a],
  translate([R0 - notchD, -notchW / 2, -1], cube([notchD + 5, notchW, z1 + 2])));
body = difference(body, notch(notchA));
body = difference(body, notch(notchA + 180));

return body;