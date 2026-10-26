// Flanged bearing housing: square flange, round body, bearing seat counterbore, through bore.
import { cube, cylinder, union, translate, fillet } from "brepscript";
const F = 100, TF = 12, BD = 76, BH = 30;
export default {
  title: "BEARING HOUSING",
  body: () => union(translate([-F / 2, -F / 2, 0], fillet({ r: 10, edges: "z" }, cube([F, F, TF]))), translate([0, 0, TF - 1], cylinder({ d: BD, h: BH + 1, $fn: 128 }))),
  features: [
    { kind: "hole", at: [0, 0, TF + BH], dir: [0, 0, 1], d: 40, depth: TF + BH, through: true, cbore: { d: 52, depth: 15 } },
    ...[[-38, -38], [38, -38], [-38, 38], [38, 38]].map(([x, y]) => ({ kind: "hole", at: [x, y, TF], dir: [0, 0, 1], d: 9, depth: TF, through: true, ctx: 2 })),
  ],
  dims: [{ view: "front", a: [-F / 2, 0, TF], b: [-F / 2, 0, 0], axis: "v", side: "left" }],
  leaders: [{ view: "top", at: [BD / 2 * 0.707, BD / 2 * 0.707, TF + BH], text: [`Ø${BD}`], dx: 140, dy: -20 }],
  notes: ["FLANGE CORNER RADII R10."],
};
