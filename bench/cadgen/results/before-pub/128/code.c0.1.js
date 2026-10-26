const z1 = 60, z2 = 90, z3 = 111.01, z4 = 164.99, z5 = 200, z6 = 300, z7 = 370.02, zb = 320.02;
const R0 = 365, R1 = 305, R2 = 275, R3 = 225, R4 = 125;
const slotR = 335, slotW = 24, slotSpan = 30.14;
const notchW = 19.56, notchD = 12, notchA = 28.68;

let body = union(
  cylinder({ r: R0, h: z1 + 0.5 }),
  translate([0, 0, z1], cylinder({ r: R1, h: z2 - z1 + 0.5 })),
  translate([0, 0, z2], cylinder({ r1: R1, r2: R2, h: z3 - z2 })),
  translate([0, 0, z3 - 0.5], cylinder({ r: R2, h: z4 - z3 + 0.5 })),
  translate([0, 0, z4], cylinder({ r1: R2, r2: R3, h: z5 - z4 })),
  translate([0, 0, z5 - 0.5], cylinder({ r: R3, h: z6 - z5 + 0.5 })),
  translate([0, 0, z6], cylinder({ r1: R3, r2: R4, h: z7 - z6 })),
);

body = difference(body, translate([0, 0, -1], cylinder({ r: 184, h: z5 + 1 })));
body = difference(body, translate([0, 0, z5 - 1], cylinder({ r: 120, h: zb - z5 + 1 })));
body = difference(body, translate([0, 0, zb - 1], cylinder({ r: 50, h: z7 - zb + 2 })));

const rad = (a) => a * Math.PI / 180;
const slot = (c) => {
  const a0 = c - slotSpan / 2, a1 = c + slotSpan / 2;
  const pts = [[0, 0]];
  for (let i = 0; i <= 8; i++) {
    const a = rad(a0 + (a1 - a0) * i / 8);
    pts.push([400 * Math.cos(a), 400 * Math.sin(a)]);
  }
  const ring = difference(
    translate([0, 0, -1], cylinder({ r: slotR + slotW / 2, h: z1 + 2 })),
    translate([0, 0, -2], cylinder({ r: slotR - slotW / 2, h: z1 + 4 })),
  );
  const arc = intersection(ring, translate([0, 0, -1], linearExtrude({ h: z1 + 2 }, polygon(pts))));
  const cap = (a) => translate([slotR * Math.cos(rad(a)), slotR * Math.sin(rad(a)), -1],
    cylinder({ r: slotW / 2, h: z1 + 2 }));
  return union(arc, cap(a0), cap(a1));
};
for (let i = 0; i < 8; i++) body = difference(body, slot(i * 45));

const notch = (a) => rotate([0, 0, a],
  translate([R0 - notchD, -notchW / 2, -1], cube([notchD + 5, notchW, z1 + 2])));
body = difference(body, notch(notchA));
body = difference(body, notch(notchA + 180));

return body;