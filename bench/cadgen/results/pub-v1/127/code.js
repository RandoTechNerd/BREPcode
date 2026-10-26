const XC = 384.62, RF = 99.29, RB = 79.29, H = 124, W = 5, TF = 10;
const stad = (R, h, z0) => translate([0, 0, z0], hull({ exact: true },
  translate([-XC, 0, 0], cylinder({ r: R, h })),
  translate([XC, 0, 0], cylinder({ r: R, h }))));
const BX = 199.76, BY = 272.27, FY = 292.6;
const zN = 213.6, ZT = 305;
const XP = 263;

const solid = union(
  stad(RF, TF, 0),
  stad(RB, H, 0),
  translate([-BX / 2, -BY / 2, 0], cube([BX, BY, H])),
  translate([-BX / 2, -FY / 2, 0], cube([BX, FY, TF])),
  translate([0, 0, H - 0.5], cylinder({ r1: 125, r2: 108.2, h: zN - H + 0.5 })),
  translate([0, 0, zN - 0.5], cylinder({ r: 216.43 / 2, h: ZT - zN + 0.5 })),
  translate([0, -100, 66], rotate([90, 0, 0], cylinder({ r: 96.44 / 2, h: 46.3 }))),
  translate([XP, 60, H - 1], cylinder({ r: 8, h: 169 - H + 1 })),
);

let part = difference(solid,
  stad(RB - W, H - W + 1, -1),
  translate([-BX / 2 + W, -BY / 2 + W, -1], cube([BX - 2 * W, BY - 2 * W, H - W + 1])),
);
part = difference(part, translate([0, 0, H - W - 1], cylinder({ r: 183.53 / 2, h: ZT - H + W + 3 })));
part = difference(part, translate([0, -90, 66], rotate([90, 0, 0], cylinder({ r: 79.43 / 2, h: 60 }))));

const holesA = [[-339.17, 70], [-339.17, -70], [328.09, 70], [328.09, -70]]
  .map(([x, y]) => translate([x, y, -1], cylinder({ r: 15, h: H + 2 })));
const holesB = [[-95, 105], [-95, -105], [95, 105], [95, -105]]
  .map(([x, y]) => translate([x, y, -1], cylinder({ r: 3.07, h: H + 2 })));
part = difference(part, ...holesA, ...holesB,
  translate([XP, 0, -1], cylinder({ r: 16.15 / 2, h: H + 2 })),
  translate([XP, -50, -1], cylinder({ r: 11.9 / 2, h: H + 2 })),
);
return part;