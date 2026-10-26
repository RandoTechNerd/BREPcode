// Pillow block: base with two slotted mounting holes, raised block with a horizontal bore.
import { cube, union, translate, fillet } from "brepscript";
const L = 130, D = 40, TB = 14, BW = 60, BH = 50;
export default {
  title: "PILLOW BLOCK",
  body: () => union(cube([L, D, TB]), translate([(L - BW) / 2, 0, TB - 12], fillet({ r: 10, edges: "y" }, cube([BW, D, BH + 12])))),
  features: [
    { kind: "slot", at: [15, D / 2, TB], dir: [0, 0, 1], w: 11, len: 10, depth: TB, through: true },
    { kind: "slot", at: [L - 15, D / 2, TB], dir: [0, 0, 1], w: 11, len: 10, depth: TB, through: true },
    { kind: "hole", at: [L / 2, 0, 38], dir: [0, -1, 0], d: 32, depth: D, through: true, ctx: 2 },
    { kind: "hole", at: [L / 2, D / 2, TB + BH - 1], dir: [0, 0, 1], d: 6, depth: 12, ctx: 3 },
  ],
  dims: [
    { view: "front", a: [0, 0, TB], b: [0, 0, 0], axis: "v", side: "left" },
    { view: "front", a: [(L - BW) / 2, 0, TB + BH - 1], b: [(L + BW) / 2, 0, TB + BH - 1], axis: "h", side: "above" },
    { view: "front", a: [L, 0, 0], b: [L / 2 + 16, 0, 38], axis: "v", side: "right" },
  ],
  leaders: [{ view: "front", at: [(L + BW) / 2 - 3, 0, TB + BH - 4], text: ["R10 TYP"], dx: 110, dy: -50 }],
};
