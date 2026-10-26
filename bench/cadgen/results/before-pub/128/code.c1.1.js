const RF = 365, TF = 60;
const L = 370.02;
const body = union(
  cylinder({ r: RF, h: TF }),
  translate([0, 0, TF - 0.5], cylinder({ r: 305, h: 30.5 })),
  translate([0, 0, 89.5], cylinder({ r: 275, h: 111.01 - 89.5 })),
  translate([0, 0, 111.01 - 0.01], cone({ r1: 275, r2: 237.2, h: 164.99 - 111.01 + 0.01 })),
  translate([0, 0, 164.99 - 0.01], cylinder({ r: 237.2, h: 200 - 164.99 + 0.5 })),
  translate([0, 0, 200], cylinder({ r: 225, h: 100.01 })),
  translate([0, 0, 300], cone({ r1: 225, r2: 125, h: L - 300 })),
);

let part = difference(body, translate([0, 0, -1], cylinder({ r: 184, h: 201 })));
part = difference(part, translate([0, 0, 199], cylinder({ r: 120, h: 320.02 - 199 })));
part = difference(part, translate([0, 0, 300], cylinder({ r: 50, h: 80 })));

const RS = 335, W = 12, half = 30.14 / 2;
const rad = (a) => a * Math.PI / 180;
const slot = (c) => {
  const a1 = c - half, a2 = c + half, R = 500;
  const wedge = linearExtrude({ h: TF + 4 }, polygon([
    [0, 0],
    [R * Math.cos(rad(a1)), R * Math.sin(rad(a1))],
    [R * Math.cos(rad(c)), R * Math.sin(rad(c))],
    [R * Math.cos(rad(a2)), R * Math.sin(rad(a2))],
  ]));
  const ring = difference(cylinder({ r: RS + W, h: TF + 4 }),
    translate([0, 0, -1], cylinder({ r: RS - W, h: TF + 6 })));
  return translate([0, 0, -2], union(
    intersection(ring, wedge),
    translate([RS * Math.cos(rad(a1)), RS * Math.sin(rad(a1)), 0], cylinder({ r: W, h: TF + 4 })),
    translate([RS * Math.cos(rad(a2)), RS * Math.sin(rad(a2)), 0], cylinder({ r: W, h: TF + 4 })),
  ));
};
for (let k = 0; k < 8; k++) part = difference(part, slot(k * 45));

const notch = (a) => rotate([0, 0, a],
  translate([RF - 36, -19.56 / 2, -1], cube([50, 19.56, TF + 2])));
part = difference(part, notch(21.66));
part = difference(part, notch(201.66));

return part;