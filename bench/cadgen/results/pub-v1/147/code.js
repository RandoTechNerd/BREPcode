const R = 100, rimT = 3, hubPlateZ = 11, hubR0 = 33;
const H = 31, hubTop = 30, hubRtop = 30.15, hubRbase = 31;
const vC = [25.6, 49.2], vRin = 56.2, vRout = 63.8;
const a0 = -69.5, a1 = 12;
const tapD = 10.2, tapDepth = 24;

const plate = union(
  cylinder({ r: R, h: rimT }),
  translate([0, 0, rimT - 0.1], cylinder({ r1: R, r2: hubR0, h: hubPlateZ - rimT + 0.1 })),
);
const hub = translate([0, 0, 10], cylinder({ r1: hubRbase, r2: hubRtop, h: hubTop - 10 }));

const pts = [[vC[0], vC[1]]];
for (let i = 0; i <= 16; i++) {
  const a = (a0 + (a1 - a0) * i / 16) * Math.PI / 180;
  pts.push([vC[0] + 75 * Math.cos(a), vC[1] + 75 * Math.sin(a)]);
}
const wedge = translate([0, 0, -1], linearExtrude({ h: H + 2 }, polygon(pts)));
const ring = difference(
  translate([vC[0], vC[1], 0], cylinder({ r: vRout, h: H })),
  translate([vC[0], vC[1], -1], cylinder({ r: vRin, h: H + 2 })),
);
const vane = intersection(intersection(ring, wedge), cylinder({ r: R, h: H }));

let body = union(plate, hub);
for (let i = 0; i < 6; i++) body = union(body, rotate([0, 0, i * 60], vane));

return difference(
  body,
  translate([0, 0, -1], cylinder({ r: tapD / 2, h: tapDepth + 1 })),
);