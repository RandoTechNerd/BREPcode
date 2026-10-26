const L = 55, T = 6, zc = 3, tn = Math.tan(2.1 * Math.PI / 180);
const yL = 16.5, yR = yL - L * tn;
const outline = linearExtrude({ h: 12 }, polygon([[0, -yL], [L, -yR], [L, yR], [0, yL]]));
let prof = translate([0, 0, -3], outline);
prof = difference(prof, translate([-1, -8.5, -4], cube([11.5, 17, 14])));
prof = difference(prof, translate([44.5, -8.5, -4], cube([11.5, 17, 14])));

const lugCyl = (x) => translate([x, 20, zc], rotate([90, 0, 0], cylinder({ r: 5, h: 40 })));
const stock = union(translate([0, -20, 0], cube([L, 40, T])), lugCyl(5), lugCyl(50));
let body = intersection(prof, stock);

const wall = 2, pd = 2.1, x0 = 13, x1 = 42;
const yt = (x) => yL - x * tn - wall;
const pocketTop = linearExtrude({ h: pd + 1 }, polygon([[x0, 1], [x1, 1], [x1, yt(x1)], [x0, yt(x0)]]));
const pocketBot = linearExtrude({ h: pd + 1 }, polygon([[x0, -yt(x0)], [x1, -yt(x1)], [x1, -1], [x0, -1]]));
body = difference(body, translate([0, 0, T - pd], pocketTop));
body = difference(body, translate([0, 0, T - pd], pocketBot));
body = difference(body, translate([0, 0, -1], pocketTop));
body = difference(body, translate([0, 0, -1], pocketBot));

const bx = 36;
const boss9 = translate([bx, -14.5, zc], rotate([90, 0, 0], cylinder({ r: 4.5, h: 4.5 })));
const boss6 = translate([bx, -18.5, zc], rotate([90, 0, 0], cylinder({ r: 3, h: 4.5 })));
body = union(body, boss9, boss6);

body = difference(body, translate([bx, -24, zc], rotate([-90, 0, 0], cylinder({ r: 1.5, h: 8.8 }))));
body = difference(body, translate([5, 20, zc], rotate([90, 0, 0], cylinder({ r: 0.8, h: 40 }))));
body = difference(body, translate([50, 20, zc], rotate([90, 0, 0], cylinder({ r: 0.8, h: 40 }))));
return body;