// Mounting plate: four counterbored M6 corner holes, a centre bore, a slot.
import { cube, fillet } from "brepscript";
const L = 120, W = 80, T = 12;
export default {
  title: "MOUNTING PLATE",
  body: () => fillet({ r: 8, edges: "z" }, cube([L, W, T])),
  features: [
    ...[[12, 12], [L - 12, 12], [12, W - 12], [L - 12, W - 12]].map(([x, y]) =>
      ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 6.6, depth: T, through: true, cbore: { d: 11, depth: 6.5 } })),
    { kind: "hole", at: [L / 2, W / 2, T], dir: [0, 0, 1], d: 30, depth: T, through: true, ctx: 2 },
    { kind: "slot", at: [L / 2, 15, T], dir: [0, 0, 1], w: 8, len: 30, depth: T, through: true, ctx: 3 },
  ],
  notes: ["CORNER RADII R8."],
};
