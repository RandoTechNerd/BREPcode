// EDITING sample: the p01 mounting plate as input.step, and an instruction.
// The ground truth is the edited plate; the bounding box does not change, so
// the input and the answer share one (centred) frame, as on the leaderboard.
import { cube, fillet } from "brepscript";
const L = 120, W = 80, T = 12;
const corners = [[12, 12], [L - 12, 12], [12, W - 12], [L - 12, W - 12]].map(([x, y]) =>
  ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 6.6, depth: T, through: true, cbore: { d: 11, depth: 6.5 } }));
const bore = (d) => ({ kind: "hole", at: [L / 2, W / 2, T], dir: [0, 0, 1], d, depth: T, through: true, ctx: 2 });
const slot = (w) => ({ kind: "slot", at: [L / 2, 15, T], dir: [0, 0, 1], w, len: 30, depth: T, through: true, ctx: 3 });
export default {
  title: "MOUNTING PLATE (EDIT)",
  body: () => fillet({ r: 8, edges: "z" }, cube([L, W, T])),
  features: [
    ...corners, bore(36), slot(10),
    ...[[L / 2 - 20, W / 2 + 20], [L / 2 + 20, W / 2 + 20]].map(([x, y]) =>
      ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 6.6, depth: T, through: true, ctx: 4 })),
  ],
  edit: {
    before: [...corners, bore(30), slot(8)],
    instruction: "Open the central through bore from Ø30 to Ø36. Widen the through slot from 8 mm to 10 mm, keeping its centre line and its 30 mm centre-to-centre length. Add two Ø6.6 through holes, 20 mm either side of the central bore's centre along X and 20 mm from it along +Y (the side away from the slot).",
  },
};
