// Units mm. Z is the part axis: flange face at z = 0, cone top at z = 370.02.
const R_FL = 365, T_FL = 60;
const NOTCH_W = 36, NOTCH_D = 19.56, NOTCH_A = 25.17;
const SLOT_R = 335, SLOT_HW = 12, SLOT_HALF = 30.14 / 2;

// Revolved body. The profile is a ring in (r, z): it never touches the axis.
const profile = polygon([
  [R_FL, 0], [R_FL, T_FL],
  [305, T_FL], [305, 90],
  [275, 111.01], [275, 164.99],
  [225, 200], [225, 300],
  [125, 370.02], [68, 370.02],
  [68, 320.02], [120, 320.02],
  [120, 200], [184, 200],
  [184, 0],
]);
const body = revolve(360, profile);

// One arc slot on R335, 24 wide, with round ends, cut through the flange.
const deg = Math.PI / 180;
const P = (r, a) => [r * Math.cos(a * deg), r * Math.sin(a * deg)];
const slot = (ac) => {
  const a1 = ac - SLOT_HALF, a2 = ac + SLOT_HALF;
  const ro = SLOT_R + SLOT_HW, ri = SLOT_R - SLOT_HW;
  const c2 = P(SLOT_R, a2), c1 = P(SLOT_R, a1);
  const t2 = [-Math.sin(a2 * deg), Math.cos(a2 * deg)];
  const t1 = [-Math.sin(a1 * deg), Math.cos(a1 * deg)];
  const prof = path2d(
    P(ro, a1),
    arcTo(P(ro, ac), P(ro, a2)),
    arcTo([c2[0] + SLOT_HW * t2[0], c2[1] + SLOT_HW * t2[1]], P(ri, a2)),
    arcTo(P(ri, ac), P(ri, a1)),
    arcTo([c1[0] - SLOT_HW * t1[0], c1[1] - SLOT_HW * t1[1]], P(ro, a1)),
  );
  return translate([0, 0, -1], linearExtrude({ h: T_FL + 2 }, prof));
};
const slots = [];
for (let i = 0; i < 8; i++) slots.push(slot(i * 45));

// Two rim notches: 19.56 deep, 36 wide, through the flange.
const notch = (a) => rotate([0, 0, a],
  translate([R_FL - NOTCH_D, -NOTCH_W / 2, -1], cube([NOTCH_D + 20, NOTCH_W, T_FL + 2])));

let part = difference(body, ...slots);
part = difference(part, notch(NOTCH_A));
part = difference(part, notch(NOTCH_A + 180));
// SKIP Ø100: no edge in the section matches it; the through hole is modelled at Ø136 (R68)
return part;