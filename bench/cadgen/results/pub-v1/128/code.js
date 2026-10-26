const R_FL = 365, T_FL = 60;
const SLOT_R = 335, SLOT_HW = 12, SLOT_SPAN = 30.14;
const NOTCH_W = 19.56, NOTCH_D = 12, NOTCH_A = 21.66;

const profile = [
  [184, 0], [365, 0], [365, 60], [305, 60], [305, 90], [287, 90], [287, 111.01],
  [250, 164.99], [225, 200], [225, 300], [125, 370.02], [50, 370.02],
  [50, 320.02], [120, 320.02], [120, 200], [184, 200],
];
let part = revolve(360, polygon(profile));

const deg = Math.PI / 180;
const P = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const slot = (ac) => {
  const a0 = (ac - SLOT_SPAN / 2) * deg, a1 = (ac + SLOT_SPAN / 2) * deg, am = ac * deg;
  const ro = SLOT_R + SLOT_HW, ri = SLOT_R - SLOT_HW;
  const c1 = P(SLOT_R, a1), c0 = P(SLOT_R, a0);
  const cap1 = [c1[0] - SLOT_HW * Math.sin(a1), c1[1] + SLOT_HW * Math.cos(a1)];
  const cap0 = [c0[0] + SLOT_HW * Math.sin(a0), c0[1] - SLOT_HW * Math.cos(a0)];
  const outline = path2d(
    P(ro, a0),
    arcTo(P(ro, am), P(ro, a1)),
    arcTo(cap1, P(ri, a1)),
    arcTo(P(ri, am), P(ri, a0)),
    arcTo(cap0, P(ro, a0)),
  );
  return translate([0, 0, -1], linearExtrude({ h: T_FL + 2 }, outline));
};

const notch = (a) => rotate([0, 0, a],
  translate([R_FL - NOTCH_D, -NOTCH_W / 2, -1], cube([NOTCH_D + 5, NOTCH_W, T_FL + 2])));

for (let k = 0; k < 8; k++) part = difference(part, slot(k * 45));
part = difference(part, notch(NOTCH_A));
part = difference(part, notch(NOTCH_A + 180));

return part;