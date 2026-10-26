// Cover plate: eight countersunk holes around a shallow rounded pocket.
import { cube, fillet } from "brepscript";
const S = 110, T = 8;
const pts = [[10, 10], [55, 10], [100, 10], [10, 55], [100, 55], [10, 100], [55, 100], [100, 100]];
export default {
  title: "COVER PLATE",
  body: () => fillet({ r: 5, edges: "z" }, cube([S, S, T])),
  features: [
    ...pts.map(([x, y]) => ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 5.5, depth: T, through: true, csk: { d: 11, angle: 90 } })),
    { kind: "pocket", at: [S / 2, S / 2, T], dir: [0, 0, 1], l: 70, w: 70, depth: 3, r: 6, ctx: 2 },
  ],
  notes: ["CORNER RADII R5."],
};
