// NEMA 17 motor plate: pilot bore, 31 mm square screw pattern, four corner mounting holes.
import { cube } from "brepscript";
const S = 70, T = 6, c = S / 2;
export default {
  title: "MOTOR PLATE",
  body: () => cube([S, S, T]),
  features: [
    { kind: "hole", at: [c, c, T], dir: [0, 0, 1], d: 22.5, depth: T, through: true },
    ...[[-15.5, -15.5], [15.5, -15.5], [-15.5, 15.5], [15.5, 15.5]].map(([x, y]) => ({ kind: "hole", at: [c + x, c + y, T], dir: [0, 0, 1], d: 3.4, depth: T, through: true, cbore: { d: 6.5, depth: 3.5 } })),
    ...[[6, 6], [S - 6, 6], [6, S - 6], [S - 6, S - 6]].map(([x, y]) => ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 5.5, depth: T, through: true, ctx: 2 })),
  ],
};
