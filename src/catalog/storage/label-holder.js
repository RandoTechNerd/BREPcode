// A C-channel that a paper or card label slides into from the side, with a
// way to hang it: a hook over a bin's rim, a clamp round the front of a
// shelf board, or a flat back for tape. Everything is one side profile,
// printed standing on its end, so every layer is the whole profile and
// nothing overhangs; the label's length is the print's height.

export default {
  id: "label-holder",
  category: "storage",
  title: "Label holder",
  summary: "a slide-in label channel that hooks over a bin rim, clamps a shelf edge or sticks on with tape.",
  print: "standing on its end as shown, no supports. Slide the label in from the side.",
  names: ["label holder", "label clip", "label frame", "label sleeve", "label channel", "label plate holder",
    "slide in label holder", "card label holder"],
  nouns: ["holder", "clip", "frame", "sleeve"],
  keywords: ["label", "tag", "bin", "shelf", "name", "sign"],
  tips: ["80 mm long", "for a 3 mm bin wall", "for an 18 mm shelf", "tape on"],
  examples: ["make me a label holder", "a label clip for a 3 mm bin rim",
    "shelf label holder for 18mm shelves", "label holder 80mm long with tape"],
  params: {
    labelW: { default: 60, min: 20, max: 150, unit: "mm", label: "label length", say: ["long", "length", "wide", "width"], more: ["longer", "wider"], less: ["shorter"] },
    labelH: { default: 22, min: 8, max: 60, unit: "mm", label: "label height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    paperT: { default: 0.8, min: 0.3, max: 3, unit: "mm", label: "room for the label's thickness", say: ["paper", "card", "thick"] },
    wall: { default: 1.6, min: 1.2, max: 3, unit: "mm", label: "wall thickness", say: ["wall"] },
    mount: { default: "rim", unit: "choice", choices: ["tape", "rim", "shelf"], label: "how it fixes on",
      // rim before shelf: a "wire shelf" label hooks over the wire
      words: { tape: ["tape", "adhesive", "sticky", "stick on", "flat back", "glue"], rim: ["rim", "bin", "wire", "crate", "tote", "basket"], shelf: ["shelf", "shelves", "board", "clamp"] } },
    edgeT: { default: 3, min: 1, max: 40, unit: "mm", label: "thickness of the rim or shelf it fits", say: ["rim", "edge", "shelf", "shelves", "board", "wall"] },
    reach: { default: 10, min: 4, max: 30, unit: "mm", label: "how far the hook or clamp reaches", say: ["reach", "hook", "drop"] },
  },
  things: [
    { names: ["bin label holder", "bin label clip", "bin label", "storage bin label holder"], title: "Bin label holder", params: { mount: "rim", edgeT: 2.5 } },
    { names: ["shelf label holder", "shelf edge label holder", "shelf label clip", "shelf tag holder"], title: "Shelf label holder",
      params: { mount: "shelf", edgeT: 18, labelW: 80, reach: 12 } },
    { names: ["wire shelf label holder", "wire basket label holder", "wire rack label"], title: "Wire shelf label holder",
      params: { mount: "rim", edgeT: 5.5, reach: 8, labelW: 70 } },
    { names: ["drawer label holder", "drawer label frame", "cabinet label holder"], title: "Drawer label holder",
      params: { mount: "tape", labelW: 50, labelH: 18 } },
    { names: ["crate label holder", "tote label holder", "tote label clip"], title: "Tote label holder",
      params: { mount: "rim", edgeT: 4, labelW: 90, labelH: 30, reach: 14 } },
    { names: ["price tag holder", "price label holder"], title: "Price tag holder", params: { mount: "shelf", edgeT: 18, labelW: 40, labelH: 25 } },
  ],
  body: `
// side profile: x runs back toward the bin or shelf, y runs up; extruded labelW tall
const lipT = wall;
const lipO = Math.min(2.5, labelH * 0.12);           // how far the lips cover the label edges
const H = labelH + 2 * wall;
const bx = lipT + paperT;                            // inside face of the back plate
const bk = bx + wall;                                // outside of the back plate
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const pieces = [[
  [0, 0], [bk, 0], [bk, H], [0, H], [0, H - wall - lipO], [lipT, H - wall - lipO], [lipT, H - wall],
  [bx, H - wall], [bx, wall], [lipT, wall], [lipT, wall + lipO], [0, wall + lipO],
]];
if (mount === "rim") {
  // over the top of a wall edgeT thick, and down its back
  pieces.push(rect(bk - 0.01, H - wall, bk + edgeT + wall, H));
  pieces.push(rect(bk + edgeT, H - wall - reach, bk + edgeT + wall, H));
}
if (mount === "shelf") {
  // arms over and under the front of a board edgeT thick, the lower one with a grip bump
  const yb = H - 2 * wall - edgeT;                   // bottom of the lower arm
  if (yb < 0) pieces.push(rect(bx, yb, bk, 0.01));   // carry the back plate down to it
  pieces.push(rect(bk - 0.01, H - wall, bk + reach, H));
  pieces.push([[bk - 0.01, yb], [bk + reach, yb], [bk + reach, yb + wall], [bk + reach - 1.2, yb + wall + 0.6], [bk + reach - 2.4, yb + wall], [bk - 0.01, yb + wall]]);
}
const solid = pieces.map((p) => linearExtrude({ h: labelW }, polygon(p)));
const lo = mount === "shelf" ? Math.min(0, H - 2 * wall - edgeT) : 0;
return translate([0, -lo, 0], solid.length > 1 ? union(...solid) : solid[0]);
`,
};
