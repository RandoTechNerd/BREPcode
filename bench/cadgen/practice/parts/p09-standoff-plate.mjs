// PCB carrier: plate with four bored standoff bosses and a cable cutout.
import { cube, fillet } from "brepscript";
const L = 120, W = 90, T = 6;
const P = [[20, 15], [100, 15], [20, 75], [100, 75]];
export default {
  title: "STANDOFF PLATE",
  body: () => fillet({ r: 6, edges: "z" }, cube([L, W, T])),
  features: [
    ...P.map(([x, y]) => ({ kind: "boss", at: [x, y, T], dir: [0, 0, 1], d: 10, h: 12, bore: 3.2, noJig: false })),
    ...P.map(([x, y]) => ({ kind: "hole", at: [x, y, 0], dir: [0, 0, -1], d: 3.2, depth: T, through: true, ctx: 2, noPos: true })),
    { kind: "pocket", at: [L / 2, W / 2, T], dir: [0, 0, 1], l: 40, w: 20, depth: T, r: 4, ctx: 3 },
  ],
  notes: ["BOSS BORES Ø3.2 THRU ALL.", "CORNER RADII R6."],
};
