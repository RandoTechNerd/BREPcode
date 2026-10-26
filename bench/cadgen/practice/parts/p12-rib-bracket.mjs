// Ribbed wall bracket: back plate, shelf, centre rib; holes in both plates.
import { cube, union, translate, linearExtrude, polygon, rotate } from "brepscript";
const W = 80, T = 8, H = 90, D = 70;
export default {
  title: "RIBBED BRACKET",
  body: () => union(cube([W, T, H]), cube([W, D, T]),
    translate([W / 2 - 5, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: 10 }, polygon([[T - 1, T - 1], [D - 10, T - 1], [T - 1, H - 15]])))))),
  features: [
    ...[[15, 70], [65, 70], [15, 30], [65, 30]].map(([x, z]) => ({ kind: "hole", at: [x, 0, z], dir: [0, -1, 0], d: 8.5, depth: T, through: true })),
    ...[[15, 50], [65, 50]].map(([x, y]) => ({ kind: "hole", at: [x, y, T], dir: [0, 0, 1], d: 6.6, depth: T, through: true, ctx: 2 })),
  ],
  dims: [
    { view: "right", a: [0, 0, 0], b: [0, T, 0], axis: "h", side: "below" },
    { view: "right", a: [0, D, T], b: [0, D, 0], axis: "v", side: "right" },
    { view: "top", a: [W / 2 - 5, 30, T], b: [W / 2 + 5, 30, T], axis: "h", side: "above" },
  ],
  leaders: [{ view: "right", at: [0, 30, 30], text: ["RIB 10 THK"], dx: 120, dy: -80 }],
};
