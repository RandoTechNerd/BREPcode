const t = 0.81;
const W = 80.81, H = 60, Hstep = 45, tabX = 31.4;
const nx0 = 59.6, nx1 = 68.62, ny0 = 56.38;

const plate = union(
  cube([W, Hstep + 0.5, t]),
  translate([tabX, Hstep, 0], cube([W - tabX, H - Hstep, t])),
);
const sideWall = cube([t, Hstep, 26.31]);
const topWall = translate([0, Hstep - t, 0], cube([54.4, t, 25]));
const hook = union(
  translate([tabX, H - t, 0], cube([W - tabX, t, 13])),
  translate([tabX, 51, 13 - t], cube([W - tabX, H - 51, t])),
);
const flange = union(
  translate([50.4, 0, 0], cube([W - 50.4, t, 19.73])),
  translate([50.4, 0, 19.73 - t], cube([W - 50.4, 3.94, t])),
);
const gProf = polygon([[0.5, 0], [0.5, 19.73], [4, 19.73], [4.5, 17], [7, 12], [11, 7], [17, 3], [23.04, 0.5], [23.04, 0]]);
const gusset = translate([63, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: t }, gProf))));

let part = union(plate, sideWall, topWall, hook, flange, gusset);

// notch at the top edge
part = difference(part, translate([nx0, ny0, -1], cube([nx1 - nx0, 5, 16])));

// plate holes
for (const [x, y] of [[38.2, 8], [74.2, 8], [38.2, 54], [74.2, 54]]) {
  part = difference(part, translate([x, y, -1], cylinder({ r: 3, h: t + 2 })));
}
for (const [x, y] of [[59.6, 4.81], [2.5, 2.5]]) {
  part = difference(part, translate([x, y, -1], cylinder({ r: 1, h: t + 2 })));
}
// side wall hole (axis X)
part = difference(part, translate([-1, 30, 8], rotate([0, 90, 0], cylinder({ r: 3, h: t + 2 }))));
// top wall hole (axis Y)
part = difference(part, translate([14, Hstep - t - 1, 13], rotate([-90, 0, 0], cylinder({ r: 3, h: t + 2 }))));
// bottom flange hole (axis Y)
part = difference(part, translate([54.4, -1, 17], rotate([-90, 0, 0], cylinder({ r: 1.5, h: t + 2 }))));

return part;