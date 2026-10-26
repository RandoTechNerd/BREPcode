// Pipe flange: disc with a raised hub, through bore, six bolt holes on a pitch circle.
import { cylinder, union, translate, chamfer } from "brepscript";
const OD = 140, T = 14, HUB = 70, HH = 22, BORE = 40, PCD = 110, N = 6;
const bolts = Array.from({ length: N }, (_, i) => {
  const a = (i * 360 / N) * Math.PI / 180;
  return { kind: "hole", at: [PCD / 2 * Math.cos(a), PCD / 2 * Math.sin(a), T], dir: [0, 0, 1], d: 13.5, depth: T, through: true, noPos: true };
});
export default {
  title: "PIPE FLANGE",
  body: () => union(chamfer({ d: 2, edges: "top" }, cylinder({ d: OD, h: T, $fn: 128 })), translate([0, 0, T - 1], cylinder({ d: HUB, h: HH + 1, $fn: 128 }))),
  features: [
    ...bolts,
    { kind: "hole", at: [0, 0, T + HH], dir: [0, 0, 1], d: BORE, depth: T + HH, through: true, ctx: 2 },
  ],
  dims: [{ view: "front", a: [-OD / 2, 0, T], b: [-OD / 2, 0, 0], axis: "v", side: "left" }],
  leaders: [
    { view: "top", at: [-PCD / 2 * 0.707, -PCD / 2 * 0.707, T], text: [`6X EQ SP ON Ø${PCD} PCD`], dx: -40, dy: 120 },
    { view: "top", at: [HUB / 2 * 0.707, -HUB / 2 * 0.707, T + HH], text: [`HUB Ø${HUB}`], dx: 120, dy: 160 },
    { view: "front", at: [OD / 2 - 1, 0, T - 0.5], text: ["C2 X 45°"], dx: 60, dy: -60 },
  ],
};
