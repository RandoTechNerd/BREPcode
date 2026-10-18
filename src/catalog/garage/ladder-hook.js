// A long-reach garage hook: a wall plate, a straight arm with an upturned tip,
// and a solid gusset under the arm that carries the load back into the wall.
// One flat side profile, printed lying on its side, so every layer runs the
// length of the arm and there is nothing to support.

export default {
  id: "ladder-hook",
  category: "garage",
  title: "Ladder hook",
  summary: "a long-reach garage wall hook with a gusset, for ladders, folding chairs, a wheelbarrow or lumber.",
  print: "on its side as shown, no supports. PETG or nylon with 6+ walls. Not load-rated: load it by hand first, and never over a walkway.",
  names: ["ladder hook", "ladder hanger", "ladder bracket", "ladder wall mount", "ladder storage hook", "garage utility hook",
    "garage storage hook", "long garage hook", "deep garage hook"],
  nouns: ["hook", "hanger", "bracket"],
  keywords: ["garage", "ladder", "shed", "wall", "store", "hang"],
  tips: ["150 mm reach", "taller tip", "60 mm wide"],
  examples: ["I want a ladder hook", "make me a ladder hanger with 150mm reach",
    "hook for folding chairs in the garage", "a wheelbarrow hanger"],
  params: {
    reach: { default: 100, min: 30, max: 200, unit: "mm", label: "reach out from the wall", say: ["reach", "deep", "long", "out"], more: ["deeper", "longer"], less: ["shorter"] },
    tipH: { default: 25, min: 0, max: 80, unit: "mm", label: "tip height above the arm", say: ["tip", "lip"], more: ["taller"] },
    armT: { default: 14, min: 6, max: 40, unit: "mm", label: "arm thickness", say: ["thick"], more: ["stronger", "thicker", "sturdier"] },
    width: { default: 40, min: 15, max: 120, unit: "mm", label: "hook width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    drop: { default: 50, min: 10, max: 200, unit: "mm", label: "plate below the arm (gusset height)", say: ["drop", "below", "gusset"] },
    above: { default: 30, min: 16, max: 80, unit: "mm", label: "plate above the arm (screws)", say: ["above", "plate"] },
    wall: { default: 8, min: 4, max: 16, unit: "mm", label: "wall plate thickness", say: ["wall"] },
    screwD: { default: 5, min: 3, max: 7, unit: "mm", label: "screw hole diameter", say: ["screw"] },
  },
  things: [
    { names: ["folding chair hook", "folding chair hanger", "lawn chair hook", "lawn chair hanger", "camp chair hook", "chair hanger"],
      title: "Folding chair hook", params: { reach: 80, tipH: 22 } },
    { names: ["step stool hook", "step stool hanger", "step ladder hook"], title: "Step stool hook", params: { reach: 60, tipH: 20 } },
    { names: ["wheelbarrow hanger", "wheelbarrow hook", "wheelbarrow wall mount"], title: "Wheelbarrow hanger",
      params: { reach: 140, tipH: 45, armT: 18, width: 60 } },
    { names: ["lumber rack arm", "lumber storage bracket", "wood rack bracket", "pipe storage arm", "lumber rack bracket"],
      title: "Lumber rack arm", params: { reach: 180, tipH: 12, armT: 20, drop: 80 } },
    { names: ["sawhorse hanger", "sawhorse hook"], title: "Sawhorse hanger", params: { reach: 110, tipH: 30, armT: 16, width: 50 } },
    { names: ["extension ladder hook", "extension ladder hanger"], title: "Extension ladder hook", params: { reach: 130, tipH: 30, armT: 16, width: 50 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it
const armTop = drop + armT;
const peak = armTop + above;
const g = Math.min(drop, reach * 0.75);          // the gusset under the arm
const tipT = Math.max(6, armT * 0.6);
const outline = [
  [0, 0], [wall, 0], [wall, drop - g], [wall + g, drop],
  [wall + reach, drop], [wall + reach, armTop + tipH], [wall + reach - tipT, armTop + tipH], [wall + reach - tipT, armTop],
  [wall, armTop], [wall, peak], [0, peak],
];
const piece = linearExtrude({ h: width }, polygon(outline));
// countersunk screw holes through the plate above the arm, and one below the gusset if there is room
const k = screwD / 2;
const zs = width < 50 ? [width / 2] : [width * 0.25, width * 0.75];
const ys = [armTop + above / 2, ...(drop - g > 2 * screwD + 8 ? [(drop - g) / 2] : [])];
const holes = ys.flatMap((y) => zs.flatMap((z) => [
  translate([-1, y, z], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))),
  translate([wall - k + 0.02, y, z], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]));
return difference(piece, ...holes);
`,
};
