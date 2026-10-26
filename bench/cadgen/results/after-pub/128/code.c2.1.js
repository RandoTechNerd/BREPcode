const Z = 370.02;
const prof = polygon([
  [50, Z], [125, Z], [225, 300], [225, 200], [275, 164.99], [275, 111.01],
  [305, 90], [305, 60], [365, 60], [365, 0], [184, 0], [184, 200],
  [120, 200], [120, 320.02], [50, 320.02],
]);
let body = revolve(360, prof);

// S: 8 arc slots on Ø670, width 24 (R12), 30.14° overall including caps
const Rc = 335, w = 12, Ro = Rc + w, Ri = Rc - w;
const hHalf = (30.14 - 2 * (Math.asin(w / Rc) * 180 / Math.PI)) / 2;
const P = (r, t) => [r * Math.cos(t * Math.PI / 180), r * Math.sin(t * Math.PI / 180)];
const slot = (a) => {
  const t0 = a - hHalf, t1 = a + hHalf;
  const c1 = P(Rc, t1), c0 = P(Rc, t0);
  const tg = (t) => [-Math.sin(t * Math.PI / 180), Math.cos(t * Math.PI / 180)];
  const g1 = tg(t1), g0 = tg(t0);
  const path = path2d(
    P(Ro, t0),
    arcTo(P(Ro, a), P(Ro, t1)),
    arcTo([c1[0] + w * g1[0], c1[1] + w * g1[1]], P(Ri, t1)),
    arcTo(P(Ri, a), P(Ri, t0)),
    arcTo([c0[0] - w * g0[0], c0[1] - w * g0[1]], P(Ro, t0)),
  );
  return translate([0, 0, -1], linearExtrude({ h: 62 }, path));
};
const slots = [];
for (let i = 0; i < 8; i++) slots.push(slot(i * 45));
body = difference(body, ...slots);

// N: two edge notches, 36 wide x 19.56 deep, through the flange
const notch = (ang) => rotate([0, 0, ang],
  translate([365 - 19.56, -18, -1], cube([40, 36, 62])));
body = difference(body, notch(25));
body = difference(body, notch(205));

// SKIP R68: no matching edge in the section, so the feature it belongs to is unclear
return body;