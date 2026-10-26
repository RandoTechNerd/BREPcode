const z1 = 60, z2 = 90, z3 = 111.01, z4 = 164.99, z5 = 200, z6 = 300, z7 = 370.02, zb = 320.02;
const R0 = 365, R1 = 305, R2 = 275, R3 = 225, R4 = 125;
const rBore = 184, rMid = 120, rTop = 50;
const slotR = 335, slotW = 24, slotSpan = 30.14;
const notchW = 19.56, notchD = 12, notchA = 28.68;

// Whole turned body as one annular profile (no axis cut needed)
const profile = polygon([
  [rBore, 0], [R0, 0], [R0, z1], [R1, z1], [R1, z2], [R2, z3], [R2, z4],
  [R3, z5], [R3, z6], [R4, z7], [rTop, z7], [rTop, zb], [rMid, zb], [rMid, z5], [rBore, z5],
]);
let body = revolve(360, profile);

const rad = (a) => a * Math.PI / 180;
const slot = (c) => {
  const a0 = c - slotSpan / 2, a1 = c + slotSpan / 2;
  const arc = rotate([0, 0, a0], revolve(slotSpan, polygon([
    [slotR - slotW / 2, -1], [slotR + slotW / 2, -1],
    [slotR + slotW / 2, z1 + 1], [slotR - slotW / 2, z1 + 1],
  ])));
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