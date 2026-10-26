const RF = 365, TF = 60, L = 370.02;

const profile = polygon([
  [184, 0], [RF, 0], [RF, TF], [305, TF], [305, 90], [275, 111.01],
  [275, 164.99], [225, 200], [225, 300], [125, L], [50, L],
  [50, 320.02], [120, 320.02], [120, 200], [184, 200],
]);
let part = revolve(360, profile);

const rad = (a) => a * Math.PI / 180;
const P = (r, a) => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
const RS = 335, W = 12, half = 30.14 / 2;
const slot = (c) => {
  const a1 = c - half, a2 = c + half;
  const t2 = [-Math.sin(rad(a2)), Math.cos(rad(a2))];
  const t1 = [-Math.sin(rad(a1)), Math.cos(rad(a1))];
  const e2 = P(RS, a2), e1 = P(RS, a1);
  const outline = path2d(
    P(RS + W, a1),
    arcTo(P(RS + W, c), P(RS + W, a2)),
    arcTo([e2[0] + W * t2[0], e2[1] + W * t2[1]], P(RS - W, a2)),
    arcTo(P(RS - W, c), P(RS - W, a1)),
    arcTo([e1[0] - W * t1[0], e1[1] - W * t1[1]], P(RS + W, a1)),
  );
  return translate([0, 0, -1], linearExtrude({ h: TF + 2 }, outline));
};
for (let k = 0; k < 8; k++) part = difference(part, slot(k * 45));

const NW = 19.56, ND = 12;
const notch = (a) => rotate([0, 0, a],
  translate([RF - ND, -NW / 2, -1], cube([ND + 10, NW, TF + 2])));
part = difference(part, notch(28.68));
part = difference(part, notch(208.68));

return part;