// A tapered plant pot with a rolled rim, a drainage hole, and a matching
// saucer printed beside it. Both are lathed profiles, so every curve is a
// true surface until export.

export default {
  id: "plant-pot",
  category: "garden",
  title: "Plant pot",
  summary: "a tapered pot with a drainage hole and a matching saucer.",
  print: "upright as shown, no supports. PETG if it will stay wet.",
  names: ["plant pot", "planter", "flower pot", "flowerpot", "succulent pot", "herb pot", "pot for plants",
    "plant pot with saucer", "pot with saucer", "cactus pot", "indoor planter"],
  nouns: ["pot", "planter"],
  keywords: ["plant", "flower", "succulent", "herb", "garden", "cactus", "drainage"],
  tips: ["120 mm across", "taller", "no saucer"],
  examples: ["I want a plant pot", "make me a planter 120mm across with a saucer",
    "a small succulent pot", "flower pot 150 mm tall without saucer"],
  params: {
    topD: { default: 100, min: 30, max: 240, unit: "mm", label: "top diameter", say: ["across", "diameter", "wide", "top"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    bottomD: { default: 75, min: 20, max: 240, unit: "mm", label: "bottom diameter", say: ["bottom", "base"] },
    height: { default: 90, min: 20, max: 240, unit: "mm", label: "height", say: ["tall", "high", "deep", "height"], more: ["taller", "deeper"], less: ["shorter", "shallower"] },
    wall: { default: 2.4, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 3, min: 1.6, max: 8, unit: "mm", label: "floor thickness", say: ["floor"] },
    rim: { default: 3, min: 0, max: 10, unit: "mm", label: "rim overhang", say: ["rim"] },
    drain: { default: 10, min: 0, max: 30, unit: "mm", label: "drainage hole (0 = none)", say: ["drain", "drainage", "hole"] },
    saucer: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "matching saucer",
      words: { no: ["no saucer", "without saucer", "without a saucer", "no tray"], yes: ["saucer", "drip tray", "with tray"] } },
  },
  things: [
    { names: ["succulent pot", "cactus pot", "small planter", "tiny pot"], title: "Succulent pot", params: { topD: 70, bottomD: 55, height: 60, drain: 6 } },
    { names: ["herb pot", "kitchen herb planter"], title: "Herb pot", params: { topD: 120, bottomD: 95, height: 110 } },
    { names: ["seedling pot", "seed starter", "seed starting pot"], title: "Seedling pot", params: { topD: 50, bottomD: 40, height: 50, wall: 1.6, saucer: "no", drain: 6 } },
    { names: ["large planter", "big plant pot", "large pot"], title: "Large planter", params: { topD: 200, bottomD: 150, height: 180, wall: 3, floor: 4 } },
    { names: ["bonsai pot", "bonsai planter", "bonsai tray"], title: "Bonsai pot", params: { topD: 160, bottomD: 140, height: 45, rim: 2, drain: 14, saucer: "no" } },
    { names: ["succulent bowl", "shallow planter", "bowl planter", "shallow pot"], title: "Succulent bowl", params: { topD: 150, bottomD: 95, height: 55, drain: 8 } },
    { names: ["tall planter", "cylinder planter", "straight planter", "tall pot"], title: "Tall planter", params: { topD: 120, bottomD: 120, height: 170, wall: 2.6 } },
    { names: ["nursery pot", "grow pot", "plastic nursery pot"], title: "Nursery pot", params: { topD: 100, bottomD: 80, height: 90, wall: 1.6, rim: 2, saucer: "no" } },
    { names: ["desk planter", "mini planter", "tiny succulent planter"], title: "Desk planter", params: { topD: 60, bottomD: 48, height: 55, drain: 6 } },
    { names: ["orchid pot", "orchid planter"], title: "Orchid pot", params: { topD: 130, bottomD: 100, height: 120, drain: 26 } },
  ],
  body: `
const rt = topD / 2, rb = Math.min(bottomD, topD) / 2;   // never wider at the foot: that would overhang
const lip = Math.min(rim, 0.6 * (height - floor - 2));
const profile = polygon([
  [0, 0], [rb, 0], [rt, height - lip], [rt + rim, height],
  [rt - wall, height], [rb - wall, floor], [0, floor],
]);
let pot = revolve(360, profile);
if (drain > 0) pot = difference(pot, translate([0, 0, -1], cylinder({ r: drain / 2, h: floor + 2, $fn: 32 })));
if (saucer !== "yes") return pot;
const rs = rb + 10, sh = 14;
const dish = revolve(360, polygon([[0, 0], [rs, 0], [rs + 4, sh], [rs + 2, sh], [rs - 1.5, 2], [0, 2]]));
return group(pot, translate([rt + rim + rs + 14, 0, 0], dish));
`,
};
