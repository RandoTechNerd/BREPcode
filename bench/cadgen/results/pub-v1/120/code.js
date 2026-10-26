const W = 300, D = 223, H = 175, FT = 7.5, FW = 327, FD = 250, C = 45, t = 4, fl = 5;
const zf = H - FT;
const ext = (pts, len) => translate([0, len / 2, 0],
  rotate([90, 0, 0], linearExtrude({ h: len }, polygon(pts))));
const outer = ext([[-W/2 + C, 0], [W/2 - C, 0], [W/2, C], [W/2, zf + 0.5], [-W/2, zf + 0.5], [-W/2, C]], D);
const flange = translate([-FW/2, -FD/2, zf], fillet({ r: 15, edges: "z" }, cube([FW, FD, FT])));
const s = t * Math.SQRT2;
const xi = W/2 - t, x0 = W/2 - C - s + fl, zc = xi - (W/2 - C) + s;
const inner = ext([[-x0, fl], [x0, fl], [xi, zc], [xi, H + 5], [-xi, H + 5], [-xi, zc]], D - 2 * t);
const bossPts = [[-86,79.5],[1,79.5],[79,79.5],[-86,-9.5],[-6,-9.5],[-86,-84.5],[4,-84.5],[79,-84.5]];
const bosses = bossPts.map(([x, y]) => translate([x, y, fl - 0.5], cylinder({ r: 7, h: 9.5 })));
let part = union(difference(union(outer, flange), inner), ...bosses);
const fh = [[-88,117],[0,117],[88,117],[-88,-117],[0,-117],[88,-117],
            [-156.5,88],[-156.5,0],[-156.5,-88],[156.5,88],[156.5,0],[156.5,-88]];
for (const [x, y] of fh) part = difference(part, drill([x, y, H], [0, 0, 1], { d: 5, through: true }));
for (const [x, y] of bossPts) part = difference(part, drill([x, y, fl + 9], [0, 0, 1], { d: 3.3, depth: 8 }));
return part;