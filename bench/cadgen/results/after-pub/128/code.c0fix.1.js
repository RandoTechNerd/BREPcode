// Flat face levels (z = 0, 60, 200, 320.02, 370.02) all come from this lathe profile
const RF = 365, TF = 60;
const profile = polygon([
  [50, 370.02], [125, 370.02], [225, 300], [225, 200], [275, 164.99],
  [275, 111.01], [305, 90], [305, 60], [RF, 60], [RF, 0],
  [184, 0], [184, 200], [120, 200], [120, 320.02], [50, 320.02],
]);
let body = revolve(360, profile);

// S: 8 arc slots on Ø670, width 24 (R12 ends), 30.14° between end centres (length 200.2)
const RS = 335, W = 12, HALF = 30.14 / 2;
const rad = (d) => d * Math.PI / 180;
const pt = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
const slot = (c) => {
  const a0 = c - HALF, a1 = c + HALF;
  const C1 = pt(RS, a1), C0 = pt(RS, a0);
  const t1 = [-Math.sin(rad(a1)), Math.cos(rad(a1))];
  const t0 = [-Math.sin(rad(a0)), Math.cos(rad(a0))];
  const p = path2d(
    pt(RS + W, a0),
    arcTo(pt(RS + W, c), pt(RS + W, a1)),
    arcTo([C1[0] + W * t1[0], C1[1] + W * t1[1]], pt(RS - W, a1)),
    arcTo(pt(RS - W, c), pt(RS - W, a0)),
    arcTo([C0[0] - W * t0[0], C0[1] - W * t0[1]], pt(RS + W, a0)),
  );
  return translate([0, 0, -1], linearExtrude({ h: TF + 2 }, p));
};
const slots = [];
for (let i = 0; i < 8; i++) slots.push(slot(i * 45));
body = difference(body, ...slots);

// N: two rim notches 36 wide x 19.56 deep through the flange
const ND = 19.56, NW = 36, NA = 25.17;
const notch = (a) => rotate([0, 0, a],
  translate([RF - ND, -NW / 2, -1], cube([ND + 5, NW, TF + 2])));
body = difference(body, notch(NA));
body = difference(body, notch(NA + 180));

// SKIP R68: no matching edge in the section; construction/leader radius
return body;