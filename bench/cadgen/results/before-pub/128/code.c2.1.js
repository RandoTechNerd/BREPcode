const R = 365, TF = 60;
const ang = (d) => d * Math.PI / 180;

let body = union(
  cylinder({ r: R, h: TF }),
  translate([0, 0, 59.5], cylinder({ r: 305, h: 30.5 })),
  translate([0, 0, 90], cylinder({ r1: 305, r2: 275, h: 21.01 })),
  translate([0, 0, 110.5], cylinder({ r: 275, h: 54.49 })),
  translate([0, 0, 164.99], cylinder({ r1: 275, r2: 225, h: 35.01 })),
  translate([0, 0, 199.5], cylinder({ r: 225, h: 100.5 })),
  translate([0, 0, 300], cylinder({ r1: 225, r2: 125, h: 70.02 })),
);

// Pocket A: Ø368 recess, 200 deep from the flange face
body = difference(body, translate([0, 0, -1], cylinder({ r: 184, h: 201 })));
// Pocket B: Ø240 bore up to z=320.02
body = difference(body, translate([0, 0, 199], cylinder({ r: 120, h: 121.02 })));
// Hole C: Ø100 through the top
body = difference(body, translate([0, 0, 300], cylinder({ r: 50, h: 80 })));

// Slots D: 8 arc slots, width 24, on Ø670, through the flange
const RC = 335, W2 = 12, SPAN = 30.14;
const arcSlot = (c) => {
  const a0 = c - SPAN / 2, a1 = c + SPAN / 2;
  const pts = [[0, 0]];
  for (let i = 0; i <= 6; i++) {
    const a = ang(a0 + (a1 - a0) * i / 6);
    pts.push([450 * Math.cos(a), 450 * Math.sin(a)]);
  }
  const wedge = translate([0, 0, -2], linearExtrude({ h: TF + 4 }, polygon(pts)));
  const ring = difference(
    translate([0, 0, -1], cylinder({ r: RC + W2, h: TF + 2 })),
    translate([0, 0, -2], cylinder({ r: RC - W2, h: TF + 4 })),
  );
  const end = (a) => translate([RC * Math.cos(ang(a)), RC * Math.sin(ang(a)), -1], cylinder({ r: W2, h: TF + 2 }));
  return union(intersection(ring, wedge), end(a0), end(a1));
};
for (let k = 0; k < 8; k++) body = difference(body, arcSlot(43.75 + 45 * k));

// Notches E: two rim notches, 19.56 wide, 15 deep, through the flange
const NW = 19.56, ND = 15;
for (const a of [25.17, 205.17]) {
  const n = rotate([0, 0, a], translate([R - ND, -NW / 2, -1], cube([ND + 10, NW, TF + 2])));
  body = difference(body, n);
}

return body;