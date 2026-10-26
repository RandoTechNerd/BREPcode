// U-channel: open-top channel with base holes and side holes.
import { cube, difference, translate } from "brepscript";
const L = 140, W = 60, H = 45, t = 6;
export default {
  title: "U-CHANNEL",
  body: () => difference(cube([L, W, H]), translate([-1, t, t], cube([L + 2, W - 2 * t, H]))),
  features: [
    ...[25, 70, 115].map((x) => ({ kind: "hole", at: [x, W / 2, t], dir: [0, 0, 1], d: 8.5, depth: t, through: true })),
    ...[35, 105].map((x) => ({ kind: "hole", at: [x, 0, 28], dir: [0, -1, 0], d: 6.6, depth: t, through: true, ctx: 2 })),
  ],
  dims: [
    { view: "right", a: [0, 0, H], b: [0, t, H], axis: "h", side: "above" },
    { view: "right", a: [0, W, t], b: [0, W, 0], axis: "v", side: "right" },
  ],
  notes: ["WALL THICKNESS 6 THROUGHOUT."],
};
