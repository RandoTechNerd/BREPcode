// Split clamp block: horizontal bore, saw slot to the bore, counterbored clamp screw across the slot.
import { cube, difference, translate } from "brepscript";
const L = 50, W = 40, H = 60;
export default {
  title: "CLAMP BLOCK",
  // the saw slot goes in after the bore (the other order is refused by the kernel)
  model: ({ applyFeatures, features }) => difference(applyFeatures(cube([L, W, H]), features), translate([L / 2 - 1.5, -1, 35], cube([3, W + 2, 26]))),
  features: [
    { kind: "hole", at: [0, W / 2, 30], dir: [-1, 0, 0], d: 25, depth: L, through: true },
    { kind: "hole", at: [L / 2, 0, 50], dir: [0, -1, 0], d: 5.5, depth: W, through: true, cbore: { d: 10, depth: 6 }, ctx: 2 },
    ...[12, 38].map((x) => ({ kind: "hole", at: [x, W / 2, 0], dir: [0, 0, -1], d: 5, depth: 12, ctx: 3 })),
  ],
  dims: [{ view: "front", a: [L / 2 - 1.5, 0, H], b: [L / 2 + 1.5, 0, H], axis: "h", side: "above" }],
  leaders: [{ view: "front", at: [L / 2, 0, 58], text: ["SLOT 3 WIDE TO BORE"], dx: 120, dy: -70 }],
};
