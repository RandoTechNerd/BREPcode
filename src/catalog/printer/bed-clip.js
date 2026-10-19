// A spring clip that holds a glass or mirror build plate onto the printer's
// bed: a C that reaches under the bed and over the glass, with a small nub
// at the tip that presses down. One side profile, printed on its side, so
// every layer runs round the C and it springs instead of snapping.

export default {
  id: "bed-clip",
  category: "printer",
  title: "Bed clip",
  summary: "a spring clip that holds a glass or mirror build plate onto the printer's bed.",
  print: "on its side as shown, no supports. PETG or ABS: the bed gets warm.",
  names: ["bed clip", "glass bed clip", "bed plate clip", "printer bed clip", "bed glass clamp", "heated bed clip",
    "glass plate clip", "bed clamp", "bed surface clip"],
  nouns: ["clip", "clamp"],
  keywords: ["bed", "glass", "plate", "printer", "mirror", "heated"],
  tips: ["for 4 mm bed and 6 mm glass", "15 mm wide", "longer reach"],
  examples: ["make me a bed clip", "glass bed clip for a 3mm bed with 4mm glass",
    "bed clip for 4mm glass", "a print bed clip for my ender"],
  params: {
    bedT: { default: 3, min: 1, max: 8, unit: "mm", label: "bed thickness", say: ["bed", "aluminium", "aluminum", "heatbed"] },
    glassT: { default: 4, min: 1, max: 8, unit: "mm", label: "glass or plate thickness", say: ["glass", "mirror", "plate", "sheet"] },
    lipL: { default: 8, min: 4, max: 20, unit: "mm", label: "how far it reaches over the glass", say: ["lip", "reach", "over"] },
    backL: { default: 14, min: 6, max: 30, unit: "mm", label: "how far it reaches under the bed", say: ["under", "back", "arm"] },
    width: { default: 12, min: 6, max: 30, unit: "mm", label: "clip width", say: ["wide", "width"] },
    wallT: { default: 3, min: 2, max: 5, unit: "mm", label: "clip thickness", say: ["wall", "strong", "stiff"], more: ["stronger", "stiffer"] },
    squeeze: { default: 0.3, min: 0, max: 1, unit: "mm", label: "how much tighter than bed plus glass", say: ["squeeze", "tight", "grip"] },
  },
  things: [
    { names: ["ender 3 bed clip", "ender glass bed clip", "cr 10 bed clip"], title: "Ender 3 glass bed clip", params: { bedT: 3, glassT: 4 } },
    { names: ["mirror bed clip", "mirror glass bed clip"], title: "Mirror bed clip", params: { bedT: 3, glassT: 3 } },
    { names: ["thick glass bed clip", "borosilicate bed clip"], title: "Thick glass bed clip", params: { bedT: 3, glassT: 6, lipL: 10 } },
    { names: ["pei sheet clip", "spring steel sheet clip", "flex plate clip"], title: "Flex plate clip", params: { bedT: 3, glassT: 1, lipL: 6 } },
  ],
  body: `
// side profile: x runs in over the bed, y runs up; the bed's edge sits against x = 0
const t = wallT;
const open = Math.max(1, bedT + glassT - squeeze);
const nub = Math.min(0.8, open / 3);
const outline = [
  [-t, 0], [backL, 0], [backL, t], [0, t],
  [0, open + t], [lipL - 2.5, open + t], [lipL - 1.2, open + t - nub], [lipL, open + t],
  [lipL, open + 2 * t], [-t, open + 2 * t],
];
return linearExtrude({ h: width }, polygon(outline));
`,
};
