// Display steps for figures, amiibo or model cars: a hollow staircase, so a
// wide riser costs a few walls of plastic instead of a solid block. The
// stair outline and its offset inside are one side profile with a hole,
// printed lying on its side, so every wall is vertical while it prints.

export default {
  id: "display-riser",
  category: "gaming",
  title: "Display riser",
  summary: "hollow display steps for figures, amiibo, Funko Pops or model cars.",
  print: "lying on its side as shown, no supports; the width becomes the print height.",
  names: ["display riser", "display stand", "display steps", "display stairs", "stepped riser", "tiered display stand",
    "collectible display riser", "figure riser", "tiered riser", "display risers"],
  nouns: ["riser", "steps", "tiers"],
  keywords: ["display", "figure", "figures", "collectible", "shelf", "tier", "step"],
  tips: ["4 steps", "50 mm deep steps", "200 mm wide"],
  examples: ["I want a display riser", "display steps with 4 tiers 200mm wide",
    "an amiibo display stand", "funko pop riser"],
  params: {
    steps: { default: 3, min: 1, max: 6, unit: "count", label: "steps", say: ["step", "tier", "level", "row"] },
    stepD: { default: 40, min: 15, max: 100, unit: "mm", label: "step depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    stepH: { default: 30, min: 10, max: 80, unit: "mm", label: "step height", say: ["tall", "high", "height", "rise"], more: ["taller", "higher"], less: ["lower"] },
    width: { default: 180, min: 40, max: 250, unit: "mm", label: "width", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower", "shorter"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["sturdier"] },
  },
  things: [
    { names: ["amiibo display stand", "amiibo riser", "amiibo stand", "amiibo display"], title: "Amiibo display riser",
      params: { steps: 3, stepD: 45, stepH: 25, width: 200 } },
    { names: ["funko pop riser", "funko riser", "funko display stand", "funko pop display", "funko pop stand"], title: "Funko Pop riser",
      params: { steps: 2, stepD: 95, stepH: 60, width: 200, wall: 3.5 } },
    { names: ["action figure riser", "figure display riser", "figure display stand", "action figure display", "figurine riser"],
      title: "Figure display riser", params: { steps: 3, stepD: 50, stepH: 40 } },
    { names: ["minifigure display", "minifig display stand", "minifigure riser", "lego minifigure display"], title: "Minifigure display",
      params: { steps: 5, stepD: 18, stepH: 14, width: 150, wall: 2 } },
    { names: ["model car display", "diecast display riser", "hot wheels display", "model car riser"], title: "Model car display riser",
      params: { steps: 3, stepD: 50, stepH: 25, width: 220 } },
  ],
  body: `
// side profile: x runs front to back, y runs up; printed lying on it, \`width\` thick
const D = steps * stepD, H = steps * stepH;
const outer = [[0, 0], [D, 0], [D, H]];
for (let k = steps; k >= 1; k--) {
  outer.push([(k - 1) * stepD, k * stepH]);
  if (k > 1) outer.push([(k - 1) * stepD, (k - 1) * stepH]);
}
const solid = linearExtrude({ h: width }, polygon(outer));
if (stepH < 2 * wall + 3 || stepD < 2 * wall + 3) return translate([-D / 2, -H / 2, 0], solid);
// the same staircase, \`wall\` inside it all round
const inner = [[wall, wall], [D - wall, wall], [D - wall, H - wall]];
for (let k = steps; k >= 1; k--) {
  inner.push([(k - 1) * stepD + wall, k * stepH - wall]);
  if (k > 1) inner.push([(k - 1) * stepD + wall, (k - 1) * stepH - wall]);
}
return translate([-D / 2, -H / 2, 0], difference(solid, translate([0, 0, -1], linearExtrude({ h: width + 2 }, polygon(inner)))));
`,
};
