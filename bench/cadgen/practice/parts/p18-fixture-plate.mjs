// Fixture plate: 5 x 3 grid of blind tapped holes, two dowel holes, counterbored corner holes.
import { cube } from "brepscript";
const L = 160, W = 100, T = 15;
const grid = [];
for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) grid.push([30 + 25 * i, 25 + 25 * j]);
export default {
  title: "FIXTURE PLATE",
  body: () => cube([L, W, T]),
  features: [
    ...grid.map(([x, y]) => ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 6.8, depth: 12, noPos: true })),
    ...[[10, 10], [L - 10, 10], [10, W - 10], [L - 10, W - 10]].map(([x, y]) => ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 9, depth: T, through: true, cbore: { d: 15, depth: 9 }, ctx: 2 })),
    ...[[10, W / 2], [L - 10, W / 2]].map(([x, y]) => ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 8, depth: 10, ctx: 3 })),
  ],
  leaders: [{ view: "top", at: [30, 25, T], text: ["15X GRID 25 PITCH", "FIRST AT (30, 25)"], dx: -20, dy: 200 }],
};
