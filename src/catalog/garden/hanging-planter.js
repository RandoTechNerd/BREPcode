// A hanging planter: a lathed pot with lugs round the rim for the cords.
// Each lug is a fin standing out from the wall, its underside a steep slope
// back into the wall (a gusset, and no overhang), with a cord hole straight
// down through it. Closed bottom by default, so it can hang indoors.

export default {
  id: "hanging-planter",
  category: "garden",
  title: "Hanging planter",
  summary: "a pot with cord lugs round the rim, to hang from a hook or a macrame hanger.",
  print: "upright as shown, no supports. No drain hole by default, so it can hang indoors; PETG if it lives outside.",
  names: ["hanging planter", "hanging pot", "hanging plant pot", "hanging flower pot", "ceiling planter",
    "hanging plant holder", "suspended planter", "plant hanger pot"],
  nouns: ["planter", "pot"],
  keywords: ["hanging", "hang", "ceiling", "macrame", "cord", "string", "plant", "trailing"],
  primary: "topD",
  tips: ["4 lugs", "180 mm across", "with a drain hole"],
  examples: ["I want a hanging planter", "make me a hanging pot 160mm across with 4 lugs",
    "a hanging plant pot for my kitchen window"],
  params: {
    topD: { default: 140, min: 60, max: 230, unit: "mm", label: "top diameter", say: ["across", "diameter", "wide", "top"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    bottomD: { default: 100, min: 30, max: 230, unit: "mm", label: "bottom diameter", say: ["bottom", "base"] },
    height: { default: 110, min: 40, max: 220, unit: "mm", label: "height", say: ["tall", "high", "deep", "height"], more: ["taller", "deeper"], less: ["shorter", "shallower"] },
    wall: { default: 2.2, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 3, min: 1.6, max: 8, unit: "mm", label: "floor thickness", say: ["floor"] },
    lugs: { default: 3, min: 2, max: 6, unit: "count", label: "cord lugs", say: ["lug", "cord", "string", "chain"] },
    holeD: { default: 5, min: 2.5, max: 10, unit: "mm", label: "cord hole diameter", say: ["hole", "cord"] },
    drain: { default: 0, min: 0, max: 30, unit: "mm", label: "drain hole (0 = none)", say: ["drain", "drainage"] },
  },
  things: [
    { names: ["hanging succulent planter", "hanging succulent pot"], title: "Hanging succulent planter",
      params: { topD: 90, bottomD: 60, height: 70, holeD: 3.5 } },
    { names: ["hanging herb planter", "hanging herb pot"], title: "Hanging herb planter", params: { topD: 150, bottomD: 110, height: 120 } },
    { names: ["air plant hanger", "hanging air plant holder"], title: "Air plant hanger",
      params: { topD: 70, bottomD: 40, height: 45, holeD: 3, wall: 1.8 } },
    { names: ["hanging basket", "hanging flower basket", "large hanging planter"], title: "Hanging basket",
      params: { topD: 220, bottomD: 150, height: 140, wall: 2.6, lugs: 4, holeD: 6, drain: 10 } },
    { names: ["outdoor hanging planter", "hanging pot with drainage", "hanging planter with drainage"], title: "Outdoor hanging planter",
      params: { drain: 10 } },
    { names: ["trailing plant pot", "pothos hanging pot", "string of pearls planter"], title: "Trailing plant pot",
      params: { topD: 160, bottomD: 120, height: 95 } },
  ],
  body: `
const rt = topD / 2, rb = Math.min(bottomD, topD) / 2;   // never wider at the foot
const rOut = (z) => rb + (rt - rb) * z / height;          // the outside of the wall at height z
const pot = revolve(360, polygon([[0, 0], [rb, 0], [rt, height], [rt - wall, height], [rb - wall, floor], [0, floor]]));

// a lug: a fin in the radial plane, its underside sloping back into the wall at 55 degrees
const reach = holeD + 9;                                   // how far it stands out past the rim
const k = Math.tan(55 * Math.PI / 180);
const zA = height - 4 - (reach + wall / 2) * k;
const xIn = (z) => rOut(z) - wall / 2;                     // inside the wall, never in the soil
const zD = height - 4 - (rt + reach - xIn(zA)) * k;
// on a short, steep pot the slope would reach the bed: then the lug is a buttress standing on it
const low = zD < 2;
const fin = low ? polygon([[xIn(height), height], [rt + reach, height], [rt + reach, 0], [xIn(0), 0]])
  : polygon([[xIn(height), height], [rt + reach, height], [rt + reach, height - 4], [xIn(zD), zD]]);
const t = Math.max(6, holeD + 4);                          // fin thickness
const lug = translate([0, t / 2, 0], rotate([90, 0, 0], linearExtrude({ h: t }, fin)));
const xh = rt + reach - holeD / 2 - 3;
const zh = low ? -1 : zD - 1;
const lugHole = translate([xh, 0, zh], cylinder({ r: holeD / 2, h: height - zh + 1, $fn: 20 }));
const one = difference(lug, lugHole);
const all = Array.from({ length: lugs }, (_, i) => rotate([0, 0, 360 * i / lugs], one));
const body = union(pot, ...all);
return drain > 0 ? difference(body, translate([0, 0, -1], cylinder({ r: drain / 2, h: floor + 2, $fn: 32 }))) : body;
`,
};
