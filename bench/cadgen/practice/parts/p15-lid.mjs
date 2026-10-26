// Enclosure lid: shelled from below, rounded corners, four corner screw holes, a cable gland hole on one side.
import { cube, fillet, difference, translate, union, cylinder } from "brepscript";
const L = 120, W = 80, H = 25, t = 3;
const posts = [[8, 8], [L - 8, 8], [8, W - 8], [L - 8, W - 8]];
export default {
  title: "ENCLOSURE LID",
  body: () => union(
    difference(fillet({ r: 8, edges: "z" }, cube([L, W, H])), translate([t, t, -1], fillet({ r: 5, edges: "z" }, cube([L - 2 * t, W - 2 * t, H - t + 1])))),
    ...posts.map(([x, y]) => translate([x, y, 2], cylinder({ d: 11, h: H - 3, $fn: 64 })))),
  features: [
    ...posts.map(([x, y]) => ({ kind: "hole", at: [x, y, H], dir: [0, 0, 1], d: 3.4, depth: H, through: true, csk: { d: 7, angle: 90 } })),
    { kind: "hole", at: [L, W / 2, 12], dir: [1, 0, 0], d: 16, depth: t, through: true, ctx: 2 },
  ],
  dims: [{ view: "front", a: [L, 0, H], b: [L, 0, H - t], axis: "v", side: "right" }],
  leaders: [{ view: "top", at: [8 + 5, 8, H], text: ["4X POST Ø11 INSIDE"], dx: 40, dy: 150 }],
  notes: ["WALL 3 THK, OPEN UNDERSIDE.", "OUTER CORNERS R8, INNER R5."],
};
