// L-bracket: base with two slots, upright with two countersunk holes, two gussets.
import { cube, union, translate, linearExtrude, polygon, rotate } from "brepscript";
const L = 100, D = 70, T = 10, H = 80;
const gusset = (x) => translate([x, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: 8 }, polygon([[T - 1, T - 1], [40, T - 1], [T - 1, 50]])))));
export default {
  title: "ANGLE BRACKET",
  body: () => union(cube([L, D, T]), cube([L, T, H]), gusset(10), gusset(L - 18)),
  features: [
    { kind: "slot", at: [30, 45, T], dir: [0, 0, 1], w: 9, len: 16, depth: T, through: true, angle: 90 },
    { kind: "slot", at: [70, 45, T], dir: [0, 0, 1], w: 9, len: 16, depth: T, through: true, angle: 90 },
    { kind: "hole", at: [30, 0, 55], dir: [0, -1, 0], d: 6.6, depth: T, through: true, csk: { d: 13, angle: 90 }, ctx: 2 },
    { kind: "hole", at: [70, 0, 55], dir: [0, -1, 0], d: 6.6, depth: T, through: true, csk: { d: 13, angle: 90 }, ctx: 2 },
  ],
  dims: [
    { view: "right", a: [0, D, T], b: [0, D, 0], axis: "v", side: "right" },
    { view: "right", a: [0, 0, H], b: [0, T, H], axis: "h", side: "above" },
    { view: "front", a: [10, 0, 0], b: [18, 0, 0], axis: "h", side: "below" },
  ],
  leaders: [{ view: "right", at: [0, 25, 30], text: ["2X GUSSET 8 THK", "31 X 41"], dx: 100, dy: -120 }],
};
