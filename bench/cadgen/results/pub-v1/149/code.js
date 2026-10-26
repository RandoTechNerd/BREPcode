const OD = 150, H = 25, BR = 47.5, FLOOR = 13, RB = 67, KEY_R = 42, KW = 2.5;
const rad = (d) => d * Math.PI / 180;
const pol = (r, deg) => [r * Math.cos(rad(deg)), r * Math.sin(rad(deg))];

const kb = Math.sqrt(BR * BR - KW * KW);
const tabPts = (deg) => {
  const u = [Math.cos(rad(deg)), Math.sin(rad(deg))];
  const v = [-u[1], u[0]];
  const P = (a, b) => [u[0] * a + v[0] * b, u[1] * a + v[1] * b];
  return [P(kb, -KW), P(KEY_R, -KW), P(KEY_R, KW), P(kb, KW)];
};
const segs = [];
for (let k = 0; k < 4; k++) {
  const t = tabPts(k * 90);
  if (k === 0) segs.push(t[0]);
  segs.push(t[1], t[2], t[3]);
  const next = tabPts(((k + 1) % 4) * 90)[0];
  segs.push(arcTo(pol(BR, k * 90 + 45), next));
}
const bore = path2d(...segs);
let part = linearExtrude({ h: H }, region2d(circle2d({ r: OD / 2 }), bore));

// workholding flats 149 across at 45 deg
for (const deg of [45, 135, 225, 315]) {
  part = difference(part, rotate([0, 0, deg], translate([74.5, -50, -1], cube([10, 100, H + 2]))));
}

// Ø10 thru
const h10 = [];
for (let k = 0; k < 4; k++) {
  const [x, y] = pol(RB, k * 90);
  h10.push(translate([x, y, -1], cylinder({ r: 5, h: H + 2 })));
}
part = difference(part, ...h10);

// Ø9 thru
const cb = [];
for (let k = 0; k < 4; k++) cb.push(pol(RB, 34 + k * 90));
part = difference(part, ...cb.map(([x, y]) => translate([x, y, -1], cylinder({ r: 4.5, h: H + 2 }))));

// V pockets: bisector along -y (hole radial) for the bottom hole, 100° included
const L = 36, half = 50;
const pocketPts = (ax, ay) => {
  const a0 = rad(-90);
  return [
    [ax, ay],
    [ax + L * Math.cos(a0 - rad(half)), ay + L * Math.sin(a0 - rad(half))],
    [ax + L * Math.cos(a0 + rad(half)), ay + L * Math.sin(a0 + rad(half))],
  ];
};
for (let k = 0; k < 4; k++) {
  for (const sx of [23, -23]) {
    part = difference(part, rotate([0, 0, k * 90],
      translate([0, 0, FLOOR], linearExtrude({ h: H }, polygon(pocketPts(sx, -61))))));
  }
}

// counterbores Ø15 x 8.6
part = difference(part, ...cb.map(([x, y]) => translate([x, y, H - 8.6], cylinder({ r: 7.5, h: 10 }))));

// 8X Ø5 x 12
const h5 = [];
for (const deg of [45, 55, 135, 145, 225, 235, 315, 325]) {
  const [x, y] = pol(52, deg);
  h5.push(translate([x, y, H - 12], cylinder({ r: 2.5, h: 13 })));
}
part = difference(part, ...h5);

// R2.5 x 12 reliefs beside each key
const rel = [];
for (let k = 0; k < 4; k++) {
  for (const s of [-5.2, 5.2]) {
    const y = -Math.sqrt(47.8 * 47.8 - s * s);
    rel.push(rotate([0, 0, k * 90], translate([s, y, H - 12], cylinder({ r: 2.5, h: 13 }))));
  }
}
part = difference(part, ...rel);

return part;