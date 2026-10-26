// Thick spacer ring with three countersunk axial holes and a radial set-screw hole.
import { cylinder, difference, translate, chamfer } from "brepscript";
const OD = 80, ID = 40, H = 25;
export default {
  title: "SPACER RING",
  body: () => difference(chamfer({ d: 1.5, edges: "top" }, chamfer({ d: 1.5, edges: "bottom" }, cylinder({ d: OD, h: H, $fn: 128 }))), translate([0, 0, -1], cylinder({ d: ID, h: H + 2, $fn: 128 }))),
  features: [
    ...[90, 210, 330].map((a) => ({ kind: "hole", at: [30 * Math.cos(a * Math.PI / 180), 30 * Math.sin(a * Math.PI / 180), H], dir: [0, 0, 1], d: 5.5, depth: H, through: true, csk: { d: 10, angle: 90 }, noPos: true })),
    { kind: "hole", at: [OD / 2, 0, H / 2], dir: [1, 0, 0], d: 5, depth: 21, through: true, ctx: 2 },
  ],
  leaders: [
    { view: "top", at: [30 * Math.cos(330 * Math.PI / 180), 30 * Math.sin(330 * Math.PI / 180), H], text: ["3X EQ SP ON Ø60 PCD"], dx: 130, dy: 130 },
    { view: "top", at: [-ID / 2, 0, H], text: [`BORE Ø${ID} THRU`], dx: -60, dy: -180 },
    { view: "front", at: [OD / 2 - 0.7, 0, H - 0.7], text: ["C1.5 TOP & BOTTOM"], dx: 80, dy: -60 },
  ],
};
