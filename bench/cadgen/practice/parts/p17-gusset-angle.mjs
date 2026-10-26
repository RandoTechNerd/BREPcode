// Heavy angle with a corner fillet strip, counterbored base holes and a large through hole in the upright.
import { cube, union, translate, difference, cylinder, rotate } from "brepscript";
const L = 90, T = 12, A = 70;
const filletStrip = translate([0, T, T], difference(cube([L, 8, 8]), translate([-1, 8, 8], rotate([0, 90, 0], cylinder({ r: 8, h: L + 2, $fn: 96 })))));
export default {
  title: "HEAVY ANGLE",
  body: () => union(cube([L, A, T]), cube([L, T, A]), translate([0, -0.01, -0.01], filletStrip)),
  features: [
    ...[20, 70].map((x) => ({ kind: "hole", at: [x, 48, T], dir: [0, 0, 1], d: 9, depth: T, through: true, cbore: { d: 15, depth: 9 } })),
    { kind: "hole", at: [L / 2, 0, 45], dir: [0, -1, 0], d: 26, depth: T, through: true, ctx: 2 },
  ],
  dims: [{ view: "right", a: [0, A, T], b: [0, A, 0], axis: "v", side: "right" }, { view: "right", a: [0, 0, A], b: [0, T, A], axis: "h", side: "above" }],
  leaders: [{ view: "right", at: [0, T + 2.3, T + 2.3], text: ["R8 INSIDE CORNER"], dx: 120, dy: -100 }],
};
