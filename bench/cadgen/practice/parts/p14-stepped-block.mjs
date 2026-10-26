// Stepped locating block: three steps, tapped holes on two steps, a dowel hole pair.
import { cube, union, translate } from "brepscript";
export default {
  title: "STEPPED BLOCK",
  body: () => union(cube([120, 60, 15]), translate([40, 0, 14], cube([80, 60, 16])), translate([80, 0, 29], cube([40, 60, 16]))),
  features: [
    ...[[20, 15], [20, 45]].map(([x, y]) => ({ kind: "hole", at: [x, y, 15], dir: [0, 0, 1], d: 6.8, depth: 12 })),
    ...[[60, 15], [60, 45]].map(([x, y]) => ({ kind: "hole", at: [x, y, 30], dir: [0, 0, 1], d: 6.8, depth: 15, ctx: 2 })),
    ...[[100, 15], [100, 45]].map(([x, y]) => ({ kind: "hole", at: [x, y, 45], dir: [0, 0, 1], d: 8, depth: 20, ctx: 3 })),
  ],
  dims: [
    { view: "front", a: [120, 0, 15], b: [120, 0, 0], axis: "v", side: "right" },
    { view: "front", a: [120, 0, 30], b: [120, 0, 0], axis: "v", side: "right" },
    { view: "front", a: [0, 0, 15], b: [40, 0, 30], axis: "h", side: "above" },
    { view: "front", a: [0, 0, 15], b: [80, 0, 45], axis: "h", side: "above" },
  ],
};
