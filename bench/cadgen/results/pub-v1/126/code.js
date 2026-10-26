const L = 770, W = 500, Wn = 350, H = 330, wall = 40;
const xT1 = 376, xT2 = 520, yN0 = (W - Wn) / 2, yN1 = yN0 + Wn;
const axY = 250, axZ = 190, bossL = 45;

const outline = [[0,0],[xT1,0],[xT2,yN0],[L,yN0],[L,yN1],[xT2,yN1],[xT1,W],[0,W]];
const inner = [[wall,wall],[xT1-16,wall],[xT2-16,yN0+wall],[L-wall,yN0+wall],[L-wall,yN1-wall],[xT2-16,yN1-wall],[xT1-16,W-wall],[wall,W-wall]];

const xCyl = (x, r, h) => translate([x, axY, axZ], rotate([0, 90, 0], cylinder({ r, h })));

let body = linearExtrude({ h: H }, polygon(outline));

const endBoss1 = xCyl(-bossL, 100, bossL + 1);
const endBoss2 = xCyl(L - 1, 100, bossL + 1);
const fX = 178, fZ = 145;
const frontBoss = translate([fX, 1, fZ], rotate([90, 0, 0], cylinder({ r: 50, h: 11 })));
const padX0 = 60, padY0 = 115, padW = 250, padD = 270, padH = 40;
const pad = translate([padX0, padY0, H - 1], cube([padW, padD, padH + 1]));

const footW = 80, footP = 70, footH = 40;
const footsW = [98, 301], footN = 635;
const feet = [];
for (const x of footsW) {
  feet.push(translate([x - footW / 2, -footP, 0], cube([footW, footP + 1, footH])));
  feet.push(translate([x - footW / 2, W - 1, 0], cube([footW, footP + 1, footH])));
}
feet.push(translate([footN - footW / 2, yN0 - footP, 0], cube([footW, footP + 1, footH])));
feet.push(translate([footN - footW / 2, yN1 - 1, 0], cube([footW, footP + 1, footH])));

body = union(body, endBoss1, endBoss2, frontBoss, pad, ...feet);

// cavity
body = difference(body, translate([0, 0, wall], linearExtrude({ h: H - 2 * wall }, polygon(inner))));

// bottom recess
body = difference(body, translate([385 - 130, axY - 130, -1], cube([260, 260, 31])));

// end bores: Ø40 through the walls, Ø75 x 10 counterbore outside, Ø120 x 15 inside
body = difference(body, xCyl(-bossL - 1, 20, bossL + wall + 10));
body = difference(body, xCyl(-bossL - 1, 37.5, 11));
body = difference(body, xCyl(wall - 15, 60, 16));
body = difference(body, xCyl(L - wall - 10, 20, bossL + wall + 11));
body = difference(body, xCyl(L + bossL - 10, 37.5, 11));
body = difference(body, xCyl(L - wall - 1, 60, 16));

// front boss bore through into the cavity
body = difference(body, translate([fX, wall + 10, fZ], rotate([90, 0, 0], cylinder({ r: 26, h: wall + 25 }))));
// 8 bolt holes on the wall face (y = 0), depth 20
for (let i = 0; i < 8; i++) {
  const a = (i * 45 + 22.5) * Math.PI / 180;
  body = difference(body, translate([fX + 70 * Math.cos(a), 20, fZ + 70 * Math.sin(a)], rotate([90, 0, 0], cylinder({ r: 4.2, h: 21 }))));
}

// foot counterbored holes
const footHoles = [[98, -38], [301, -38], [98, 538], [301, 538], [footN, 37], [footN, 463]];
for (const [x, y] of footHoles) {
  body = difference(body, translate([x, y, -1], cylinder({ r: 11, h: footH + 2 })));
  body = difference(body, translate([x, y, footH - 8], cylinder({ r: 30, h: 9 })));
}

// keyhole opening through the cover pad
const cX = padX0 + padW / 2, cY = padY0 + padD / 2, topZ = H + padH;
body = difference(body, translate([cX - 90, cY - 35, H - wall - 5], cube([180, 70, wall + padH + 10])));
body = difference(body, translate([cX, cY, H - wall - 5], cylinder({ r: 60, h: wall + padH + 10 })));

// 21 x Ø8.4 around the cover pad
const padHoles = [[96.9,130],[140.7,130],[184.5,130],[228.3,130],[272.1,130],[295,150.9],[295,194.7],[295,238.5],[295,282.3],[295,326.2],[295,370],[251.2,370],[207.4,370],[163.6,370],[119.8,370],[76,370],[75,327.1],[75,283.3],[75,239.5],[75,195.7],[75,151.9]];
for (const [x, y] of padHoles) {
  body = difference(body, translate([x, y, topZ - 30], cylinder({ r: 4.2, h: 31 })));
}

// 33 x Ø10.1 depth 30 on the top flange
const flangeHoles = [[20,20],[78,20],[137,20],[195,20],[253,20],[312,20],[370,20],[442,57.5],[514,95],[593,95],[672,95],[750,95],[750,157],[750,219],[750,281],[750,343],[750,405],[672,405],[593,405],[514,405],[442,442.5],[370,480],[312,480],[253,480],[195,480],[137,480],[78,480],[20,480],[20,403],[20,327],[20,250],[20,173],[20,97]];
for (const [x, y] of flangeHoles) {
  body = difference(body, translate([x, y, H - 30], cylinder({ r: 5.05, h: 31 })));
}

return body;