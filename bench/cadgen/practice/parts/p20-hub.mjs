// Pulley hub: stepped cylinder, through bore with a keyway, two radial set screws, a bolt flange.
import { cylinder, union, translate } from "brepscript";
export default {
  title: "FLANGED HUB",
  body: () => union(cylinder({ d: 90, h: 10, $fn: 128 }), translate([0, 0, 9], cylinder({ d: 45, h: 31, $fn: 128 }))),
  features: [
    { kind: "hole", at: [0, 0, 40], dir: [0, 0, 1], d: 25, depth: 40, through: true },
    { kind: "pocket", at: [0, 12.5, 40], dir: [0, 0, 1], l: 8, w: 7, depth: 40, ctx: 1, alone: true },
    { kind: "hole", at: [22.5, 0, 28], dir: [1, 0, 0], d: 5, depth: 12, ctx: 2 },
    { kind: "hole", at: [0, -22.5, 28], dir: [0, -1, 0], d: 5, depth: 12, ctx: 3 },
    ...[45, 135, 225, 315].map((a) => ({ kind: "hole", at: [36 * Math.cos(a * Math.PI / 180), 36 * Math.sin(a * Math.PI / 180), 10], dir: [0, 0, 1], d: 6.6, depth: 10, through: true, noPos: true, ctx: 4 })),
  ],
  dims: [{ view: "front", a: [-45, 0, 10], b: [-45, 0, 0], axis: "v", side: "left" }],
  leaders: [
    { view: "top", at: [36 * 0.707, -36 * 0.707, 10], text: ["4X ON Ø72 PCD, 45° OFFSET"], dx: 120, dy: 130 },
    { view: "top", at: [-22.5 * 0.7, 22.5 * 0.7, 40], text: ["Ø45 X 40 HIGH"], dx: -90, dy: -120 },
  ],
};
