const AF = 278.56, Rc = (AF / 2) / Math.cos(Math.PI / 8);
const zF = 50, T = 15, H = zF + T;
const hubR = 92.5, boreR = 77.5;
const d2r = Math.PI / 180;
const pol = (r, a) => [r * Math.cos(a * d2r), r * Math.sin(a * d2r)];

const oct = [];
for (let k = 0; k < 8; k++) oct.push(pol(Rc, 22.5 + 45 * k));
const flange = translate([0, 0, zF], linearExtrude({ h: T }, polygon(oct)));
const hub = cylinder({ r: hubR, h: zF + 0.5 });

const ribT = 12;
const ribProf = polygon([[hubR - 1, 24.36], [hubR - 1, zF + 0.5], [133.2, zF + 0.5], [133.2, zF - 0.5]]);
const rib = rotate([90, 0, 0], linearExtrude({ h: ribT, center: true }, ribProf));
const ribs = [];
for (let k = 0; k < 8; k++) ribs.push(rotate([0, 0, 22.5 + 45 * k], rib));

let part = union(flange, hub, ...ribs);

part = difference(part, translate([0, 0, -1], cylinder({ r: boreR, h: zF + 1 })));
part = difference(part, translate([0, 0, -1], cylinder({ r: 30, h: H + 2 })));

for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * d2r;
  part = difference(part, drill([147.79 * Math.cos(a), 147.79 * Math.sin(a), H], [0, 0, 1], { d: 12.5, through: true }));
}

for (let k = 0; k < 8; k++) {
  const a = (22.5 + 45 * k) * d2r;
  part = difference(part, drill([85.36 * Math.cos(a), 85.36 * Math.sin(a), H], [0, 0, 1], { d: 10, depth: 20 }));
}

const r1 = 97.5, r2 = 132, wo = 30.5, wi = wo - (r2 - r1) / Math.tan(67.5 * d2r);
const pocketDepth = T - 5.7;
const fp = translate([0, 0, H - pocketDepth], linearExtrude({ h: pocketDepth + 1 }, polygon([[r1, -wi], [r2, -wo], [r2, wo], [r1, wi]])));
for (let k = 0; k < 8; k++) part = difference(part, rotate([0, 0, 45 * k], fp));

const s1 = 35, s2 = 72, sw = 3;
const sp = [];
for (const r of [s1, s2]) sp.push(r);
const half = (r) => 15 - (sw / r) / d2r;
const spokePocket = translate([0, 0, H - 7.5], linearExtrude({ h: 8.5 }, polygon([
  pol(s1, -half(s1)), pol(s2, -half(s2)), pol(s2, half(s2)), pol(s1, half(s1)),
])));
for (let k = 0; k < 12; k++) part = difference(part, rotate([0, 0, 15 + 30 * k], spokePocket));

return part;