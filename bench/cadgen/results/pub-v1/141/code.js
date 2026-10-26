const T = 11, H = 124, ROut = 131, RIn = 115;
const zPort = 57, portR = 49.13 / 2, tapD = 26.5;
const lugs = [
  [-37.79, 163.69, 22.5, 20], [122.87, 114.58, 22.5, 20], [-160.66, 49.12, 22.5, 20],
  [-145.49, -84, 22.5, 20], [96.36, -137.62, 22.5, 20], [160.66, -49.12, 22.5, 20],
  [-139.71, 125.8, 27.5, 22],
];
const ports = [180, 60];

const lugBody = ([x, y, rb]) => {
  const a = Math.atan2(y, x) * 180 / Math.PI;
  const r = Math.hypot(x, y);
  return union(
    translate([x, y, 0], cylinder({ r: rb, h: 30 })),
    rotate([0, 0, a], translate([125, -rb, 0], cube([r - 125, 2 * rb, 30]))),
  );
};

const portBoss = (a) => rotate([0, 0, a],
  translate([110, 0, zPort], rotate([0, 90, 0], cylinder({ r: portR, h: 38 }))));

let body = cylinder({ r: 150, h: T });
body = union(body, translate([0, 0, T - 0.5], cylinder({ r1: 149.5, r2: 132, h: 19 })));
body = union(body, cylinder({ r: ROut, h: H }));
for (const l of lugs) body = union(body, lugBody(l));
for (const a of ports) body = union(body, portBoss(a));

body = difference(body, translate([0, 0, -1], cylinder({ r: RIn, h: H + 2 })));
body = difference(body, translate([0, 0, -1], cylinder({ r: 134, h: 4 })));
for (const [x, y, , d] of lugs) {
  body = difference(body, translate([x, y, -1], cylinder({ r: d / 2, h: 32 })));
}
for (const a of ports) {
  body = difference(body, rotate([0, 0, a],
    translate([RIn - 5, 0, zPort], rotate([0, 90, 0], cylinder({ r: tapD / 2, h: 148 - RIn + 6 })))));
}
return body;