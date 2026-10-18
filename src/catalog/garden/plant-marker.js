// Plant markers: a blank label paddle on a pointed stake, printed flat, with
// a shallow recess to write in or stick a label into. One outline, extruded;
// a set of them prints in a row.

export default {
  id: "plant-marker",
  category: "garden",
  title: "Plant marker",
  summary: "blank plant labels on pointed stakes, with a shallow panel to write on.",
  print: "flat as shown, no supports. Write on them with a paint pen, or print the panel in a second colour.",
  names: ["plant marker", "plant label", "garden marker", "plant tag", "plant stake label", "garden label",
    "plant name tag", "garden stake marker", "plant sign"],
  nouns: ["marker", "label", "tag", "stake", "sign"],
  keywords: ["plant", "garden", "herb", "seed", "vegetable", "row", "labels", "markers"],
  primary: "labelW",
  tips: ["6 markers", "longer stake", "80 mm wide label"],
  examples: ["I want some plant markers", "make me 6 plant labels", "plant marker with a 150mm stake",
    "a garden label 80mm wide"],
  params: {
    labelW: { default: 60, min: 25, max: 120, unit: "mm", label: "label width", say: ["wide", "width", "label"], more: ["wider"], less: ["narrower"] },
    labelH: { default: 25, min: 12, max: 80, unit: "mm", label: "label height", say: ["tall", "high"], more: ["taller"], less: ["shorter"] },
    stakeL: { default: 100, min: 30, max: 200, unit: "mm", label: "stake length", say: ["stake", "long", "length"], more: ["longer"], less: ["shorter"] },
    stakeW: { default: 10, min: 5, max: 20, unit: "mm", label: "stake width", say: ["stake width"] },
    thick: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"], less: ["thinner"] },
    recess: { default: 0.6, min: 0, max: 1.2, unit: "mm", label: "writing panel depth (0 = flat)", say: ["recess", "panel"] },
    count: { default: 3, min: 1, max: 10, unit: "count", label: "how many", say: ["marker", "label", "tag", "stake", "sign"] },
  },
  things: [
    { names: ["herb marker", "herb label", "herb garden marker"], title: "Herb marker", params: { labelW: 50, labelH: 20, stakeL: 80 } },
    { names: ["row marker", "garden row marker", "vegetable garden marker", "vegetable marker"], title: "Row marker",
      params: { labelW: 80, labelH: 35, stakeL: 180, stakeW: 14, thick: 3 } },
    { names: ["seed marker", "seedling label", "seed tray label"], title: "Seedling label", params: { labelW: 40, labelH: 16, stakeL: 60, stakeW: 7, thick: 2, count: 6 } },
    { names: ["pot label", "pot marker", "small plant label", "houseplant label"], title: "Pot label",
      params: { labelW: 35, labelH: 15, stakeL: 50, stakeW: 7, thick: 2, count: 6 } },
    { names: ["flower bed marker", "bulb marker", "perennial marker"], title: "Flower bed marker", params: { labelW: 60, labelH: 25, stakeL: 150, stakeW: 12, thick: 3 } },
    { names: ["tree label", "fruit tree label"], title: "Tree label", params: { labelW: 90, labelH: 40, stakeL: 200, stakeW: 16, thick: 3.5, count: 1 } },
  ],
  body: `
const r = Math.min(4, labelH / 3, labelW / 4);           // label corner radius
const sw = Math.min(stakeW, labelW - 2 * r - 1);          // the stake is never wider than the label
const tip = Math.min(sw * 1.5, stakeL * 0.4);             // length of the point
const y0 = stakeL;                                        // the label starts where the stake ends
const arc = (cx, cy, rr, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [cx + rr * Math.cos(t), cy + rr * Math.sin(t)];
});
const hw = labelW / 2, P = Math.PI;
const outline = [
  [0, 0], [sw / 2, tip], [sw / 2, y0],
  ...arc(hw - r, y0 + r, r, -P / 2, 0), ...arc(hw - r, y0 + labelH - r, r, 0, P / 2),
  ...arc(-hw + r, y0 + labelH - r, r, P / 2, P), ...arc(-hw + r, y0 + r, r, P, 1.5 * P),
  [-sw / 2, y0], [-sw / 2, tip],
];
let one = linearExtrude({ h: thick }, polygon(outline));
const m = 3, rp = Math.max(1, r - 1.5);                   // the writing panel, 3 mm in from the edge
if (recess > 0 && thick - recess >= 0.8 && labelH - 2 * m > 4) {
  const panel = [
    ...arc(hw - m - rp, y0 + m + rp, rp, -P / 2, 0), ...arc(hw - m - rp, y0 + labelH - m - rp, rp, 0, P / 2),
    ...arc(-hw + m + rp, y0 + labelH - m - rp, rp, P / 2, P), ...arc(-hw + m + rp, y0 + m + rp, rp, P, 1.5 * P),
  ];
  one = difference(one, translate([0, 0, thick - recess], linearExtrude({ h: recess + 1 }, polygon(panel))));
}
const pitch = labelW + 6;
return group(...Array.from({ length: count }, (_, i) => translate([(i - (count - 1) / 2) * pitch, -(stakeL + labelH) / 2, 0], one)));
`,
};
