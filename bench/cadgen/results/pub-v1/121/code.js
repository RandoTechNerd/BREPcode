const AF = 300, T = 15, H = 65;
const R_oct = (AF / 2) / Math.cos(Math.PI / 8);
const hubR = 92.5, boreR = 77.5;
const gT = 10, gOut = 133.2, gTan = Math.tan(25.12 * Math.PI / 180);

const oct = [];
for (let i = 0; i < 8; i++) {
  const a = (22.5 + 45 * i) * Math.PI / 180;
  oct.push([R_oct * Math.cos(a), R_oct * Math.sin(a)]);
}
const plate = linearExtrude({ h: T }, polygon(oct));
const hub = translate([0, 0, T - 0.5], cylinder({ r: hubR, h: H - T + 0.5 }));

const gH = (gOut - hubR + 2) * gTan;
const gProf = polygon([[hubR - 2, 0], [gOut, 0], [hubR - 2, gH]]);
const gusset = (deg) => rotate([0, 0, deg],
  translate([0, 0, T - 0.5], rotate([90, 0, 0], linearExtrude({ h: gT, center: true }, gProf))));
const gussets = [];
for (let i = 0; i < 8; i++) gussets.push(gusset(22.5 + 45 * i));

let body = union(plate, hub, ...gussets);

body = difference(body, translate([0, 0, T], cylinder({ r: boreR, h: H })));
body = difference(body, translate([0, 0, -1], cylinder({ r: 30, h: T + 2 })));

const bolts = [[56.56,136.54],[-56.56,136.54],[56.56,-136.54],[-56.56,-136.54],
               [136.54,56.56],[-136.54,56.56],[136.54,-56.56],[-136.54,-56.56]];
const small = [[32.66,78.86],[-32.66,78.86],[32.66,-78.86],[-32.66,-78.86],
               [78.86,32.66],[-78.86,32.66],[78.86,-32.66],[-78.86,-32.66]];
body = difference(body, ...bolts.map(([x, y]) => translate([x, y, -1], cylinder({ d: 12.5, h: T + 2 }))));
body = difference(body, ...small.map(([x, y]) => translate([x, y, -1], cylinder({ d: 10, h: T + 2 }))));

return body;