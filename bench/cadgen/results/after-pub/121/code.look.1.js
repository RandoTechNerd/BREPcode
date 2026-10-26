const A = 150, PT = 15, HH = 50, ZT = HH + PT;
const RC = A / Math.cos(Math.PI / 8);
const oct = [];
for (let i = 0; i < 8; i++) {
  const a = (22.5 + 45 * i) * Math.PI / 180;
  oct.push([RC * Math.cos(a), RC * Math.sin(a)]);
}
const plate = translate([0, 0, HH], linearExtrude({ h: PT }, polygon(oct)));
const hub = cylinder({ r: 88, h: HH + 0.5 });

const h2 = [[78.86, 32.66], [32.66, 78.86], [-32.66, 78.86], [-78.86, 32.66],
            [-78.86, -32.66], [-32.66, -78.86], [32.66, -78.86], [78.86, -32.66]];
const h1 = [[136.54, 56.56], [56.56, 136.54], [-56.56, 136.54], [-136.54, 56.56],
            [-136.54, -56.56], [-56.56, -136.54], [56.56, -136.54], [136.54, -56.56]];

let body = union(plate, hub);
for (const [x, y] of h2) body = union(body, translate([x, y, 0], cylinder({ r: 9.5, h: HH + 0.5 })));

// sloped ribs R
const ribT = 8;
const ribProf = polygon([[86.5, 24.36], [133.2, 43.49], [133.2, HH + 0.5], [86.5, HH + 0.5]]);
const rib = translate([0, ribT / 2, 0], rotate([90, 0, 0], linearExtrude({ h: ribT }, ribProf)));
for (let k = 0; k < 8; k++) body = union(body, rotate([0, 0, 22.5 + 45 * k], rib));

// bore
body = difference(body, translate([0, 0, -1], cylinder({ r: 77.5, h: HH + 1 })));

// through pockets P: R97.5..R139.28, 61 wide at mid-height, sides at 67.5 deg, R5 corners
const rIn = 97.5, rOut = 139.28, wMid = 61, inset = (rOut - rIn) * Math.tan(22.5 * Math.PI / 180);
const hIn = (wMid - inset) / 2, hOut = (wMid + inset) / 2;
const pk = fillet({ r: 5, edges: "z" }, linearExtrude({ h: PT + 2 }, polygon([
  [rIn, -hIn], [rOut, -hOut], [rOut, hOut], [rIn, hIn]])));
for (let k = 0; k < 8; k++) body = difference(body, translate([0, 0, HH - 1], rotate([0, 0, 45 * k], pk)));

// centre hole C (through the plate into the bore)
body = difference(body, translate([0, 0, HH - 1], cylinder({ r: 30, h: PT + 2 })));

// top pockets TP, 7.5 deep, running into the Ø60 hole
const tp = linearExtrude({ h: 8.5 }, polygon([[28, -5.5], [72, -16.79], [72, 16.79], [28, 5.5]]));
for (let k = 0; k < 12; k++) body = difference(body, translate([0, 0, ZT - 7.5], rotate([0, 0, 15 + 30 * k], tp)));

// holes H1, H2
for (const [x, y] of h1) body = difference(body, translate([x, y, HH - 1], cylinder({ r: 6.25, h: PT + 2 })));
for (const [x, y] of h2) body = difference(body, translate([x, y, -1], cylinder({ r: 5, h: ZT + 2 })));

// SKIP R1: R1.00 blend in SECTION C-C too small to matter
return body;