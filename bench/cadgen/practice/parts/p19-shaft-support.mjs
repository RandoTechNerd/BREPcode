// Shaft support (SK-style): T-shaped body, vertical shaft bore, clamp slot and two base holes.
import { cube, union, translate, difference, fillet } from "brepscript";
const BL = 84, BD = 20, BT = 10, UW = 42, UH = 50;
export default {
  title: "SHAFT SUPPORT",
  body: () => difference(
    union(cube([BL, BD, BT]), translate([(BL - UW) / 2, 0, BT - 8], fillet({ r: 6, edges: "y" }, cube([UW, BD, UH + 8])))),
    translate([BL / 2 - 1, -1, 35], cube([2, BD + 2, 40]))),
  features: [
    { kind: "hole", at: [BL / 2, 0, 35], dir: [0, -1, 0], d: 20, depth: BD, through: true },
    ...[10, BL - 10].map((x) => ({ kind: "hole", at: [x, BD / 2, BT], dir: [0, 0, 1], d: 6.6, depth: BT, through: true, ctx: 2 })),
    { kind: "hole", at: [BL / 2 + UW / 2, BD / 2, 52], dir: [1, 0, 0], d: 5.5, depth: UW, through: true, cbore: { d: 9.5, depth: 6 }, ctx: 3 },
  ],
  dims: [
    { view: "front", a: [0, 0, BT], b: [0, 0, 0], axis: "v", side: "left" },
    { view: "front", a: [(BL - UW) / 2, 0, BT + UH - 1], b: [(BL + UW) / 2, 0, BT + UH - 1], axis: "h", side: "above" },
  ],
  leaders: [{ view: "front", at: [BL / 2, 0, 56], text: ["SLOT 2 WIDE"], dx: 140, dy: -90 }, { view: "front", at: [(BL + UW) / 2 - 2, 0, BT + UH - 3], text: ["R6 TYP"], dx: 110, dy: -30 }],
};
