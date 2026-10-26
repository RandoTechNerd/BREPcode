// Slotted adjustment rail with chamfered top edges and end tapped holes.
import { cube, chamfer } from "brepscript";
const L = 200, W = 30, T = 12;
export default {
  title: "SLOTTED RAIL",
  body: () => chamfer({ d: 1, edges: "top" }, cube([L, W, T])),
  features: [
    ...[30, 80, 130, 170].map((x) => ({ kind: "slot", at: [x, W / 2, T], dir: [0, 0, 1], w: 6.6, len: 14, depth: T, through: true })),
    { kind: "hole", at: [0, W / 2, T / 2], dir: [-1, 0, 0], d: 4.2, depth: 15, ctx: 2 },
    { kind: "hole", at: [L, W / 2, T / 2], dir: [1, 0, 0], d: 4.2, depth: 15, ctx: 3 },
  ],
  notes: ["CHAMFER TOP EDGES C1."],
};
