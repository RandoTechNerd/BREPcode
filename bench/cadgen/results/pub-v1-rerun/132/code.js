const FR = 65, FT = 5, TR = 35, BORE = 31;
const Z_MID = 108, Z_STAR = 128, STAR_T = 12, H = 140;
const HR = 45, LR = 10, CR = 40;

const filletUp = (zFace, R) => difference(
  translate([0, 0, zFace], cylinder({ r: TR + R, h: R })),
  translate([0, 0, zFace + R], torus({ r: TR + R, tube: R })),
);
const filletDown = (zFace, R) => difference(
  translate([0, 0, zFace - R], cylinder({ r: TR + R, h: R })),
  translate([0, 0, zFace - R], torus({ r: TR + R, tube: R })),
);

// star outline: R10 lobes on R45 joined by concave R40 arcs tangent to them
const c30 = Math.cos(Math.PI / 6);
const D = (2 * HR * c30 + Math.sqrt(4 * HR * HR * c30 * c30 - 4 * (HR * HR - (CR + LR) ** 2))) / 2;
const rad = (d) => d * Math.PI / 180;
const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
// tangent point between lobe at angle 0 and the arc centred at +30°
const Cp = [D * Math.cos(rad(30)), D * Math.sin(rad(30))];
const dx = HR - Cp[0], dy = -Cp[1], dl = Math.hypot(dx, dy);
const Tp = [Cp[0] + CR * dx / dl, Cp[1] + CR * dy / dl];   // upper tangent point of lobe 0
const Tm = [Tp[0], -Tp[1]];                                 // lower tangent point of lobe 0

const segs = [];
for (let i = 0; i < 6; i++) {
  const a = rad(60 * i), an = rad(60 * (i + 1)), am = rad(60 * i + 30);
  // concave arc from lobe i to lobe i+1
  segs.push(arcTo([(D - CR) * Math.cos(am), (D - CR) * Math.sin(am)], rot(Tm, an)));
  // lobe arc around lobe i+1
  segs.push(arcTo([(HR + LR) * Math.cos(an), (HR + LR) * Math.sin(an)], rot(Tp, an)));
}
const starProfile = path2d(Tp, ...segs);
const star = translate([0, 0, Z_STAR], linearExtrude({ h: STAR_T }, starProfile));

let body = union(
  cylinder({ r: FR, h: FT }),
  translate([0, 0, FT - 0.5], cylinder({ r: TR, h: Z_STAR - FT + 1 })),
  translate([0, 0, Z_MID], cylinder({ r: FR, h: FT })),
  star,
  filletUp(FT, 10),
  filletDown(Z_MID, 10),
  filletUp(Z_MID + FT, 5),
  filletDown(Z_STAR, 10),
);

body = difference(body, translate([0, 0, -1], cylinder({ r: BORE, h: H + 2 })));
body = difference(body, translate([0, 0, H - STAR_T], cylinder({ r: 35, h: STAR_T + 1 })));

const fHoles = [];
for (let i = 0; i < 12; i++) {
  const a = rad(i * 30 + 90);
  const x = 55 * Math.cos(a), y = 55 * Math.sin(a);
  fHoles.push(translate([x, y, -1], cylinder({ r: 4, h: FT + 2 })));
  fHoles.push(translate([x, y, Z_MID - 1], cylinder({ r: 4, h: FT + 2 })));
}
body = difference(body, ...fHoles);

const sHoles = [];
for (let i = 0; i < 6; i++) {
  const a = rad(60 * i);
  sHoles.push(translate([HR * Math.cos(a), HR * Math.sin(a), Z_STAR - 1], cylinder({ r: 5, h: STAR_T + 2 })));
}
body = difference(body, ...sHoles);

return body;