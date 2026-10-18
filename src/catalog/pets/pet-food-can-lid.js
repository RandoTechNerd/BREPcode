// A lid for an opened can of pet food, so the rest keeps in the fridge. A
// flat disc covers the rim and a hollow tapered plug presses into the opening:
// the taper seals any can whose opening falls inside its range, so one lid
// fits a few sizes. A flat tab on the side lifts it off.
//
// It prints upside down, disc on the bed, plug rising. The plug narrows as it
// rises and its hollow inside leans no more than 40 degrees from upright, so
// nothing overhangs.

export default {
  id: "pet-food-can-lid",
  category: "pets",
  title: "Pet food can lid",
  summary: "a push-in lid for opened pet food cans: a tapered plug seals a range of can sizes, with a lift tab.",
  print: "upside down as shown (disc on the bed), no supports. Food contact: PETG or PLA from a food-safe spool, hand wash, replace it once scratched.",
  // "can" is a stop word to the matcher, so every name here still reads as a
  // pet food lid without it ("pet food can lid" is matched as "pet food lid")
  names: ["pet food can lid", "pet food can cover", "can lid for pet food", "pet food lid", "pet food tin lid",
    "pet food can topper", "pet food can cap", "can cover for pet food", "wet food can lid", "wet pet food lid"],
  nouns: ["lid", "cover", "cap"],
  keywords: ["can", "pet", "food", "dog", "cat", "fridge", "wet"],
  fits: ["pet-can"],
  fromSpec: (s) => ({ canD: s.dims.d }),
  specNote: "the taper seals openings a few mm either side; cans vary, measure yours",
  primary: "canD",
  tips: ["85 mm across", "wider range", "longer tab"],
  examples: ["I want a pet food can lid", "make me a dog food can lid",
    "a can lid for my 3 oz cat food cans", "pet food can cover 85mm across"],
  params: {
    canD: { default: 76, min: 50, max: 120, unit: "mm", label: "can diameter across the rim", say: ["diameter", "across", "rim", "wide"], more: ["bigger", "wider"], less: ["smaller"] },
    spread: { default: 16, min: 6, max: 40, unit: "mm", label: "taper range: how much bigger or smaller an opening still seals", say: ["range", "spread", "taper"] },
    plugH: { default: 14, min: 6, max: 30, unit: "mm", label: "plug depth", say: ["plug", "deep", "depth"] },
    diskT: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "top thickness", say: ["thick", "thickness", "top"] },
    wall: { default: 1.8, min: 1.2, max: 4, unit: "mm", label: "plug wall thickness (thinner flexes to seal)", say: ["wall"] },
    tab: { default: 12, min: 0, max: 25, unit: "mm", label: "lift tab length (0 = none)", say: ["tab", "pull", "handle"] },
  },
  things: [
    { names: ["cat food can lid", "cat food can cover", "cat food lid", "cat food tin lid", "3 oz cat food can lid"], title: "Cat food can lid (3 oz)",
      spec: "pet-can-cat-3oz", params: { spread: 12, plugH: 10 } },
    { names: ["dog food can lid", "dog food can cover", "dog food lid", "dog food tin lid", "13 oz dog food can lid"], title: "Dog food can lid (13 oz)",
      spec: "pet-can-dog-13oz", params: {} },
    { names: ["large dog food can lid", "large dog food can cover", "22 oz dog food can lid", "big dog food lid"], title: "Large dog food can lid (22 oz)",
      spec: "pet-can-dog-22oz", params: { spread: 18, plugH: 16, diskT: 2.8 } },
    { names: ["medium cat food can lid", "5.5 oz cat food can lid", "5.5 oz cat food lid", "medium cat food lid"], title: "Cat food can lid (5.5 oz)",
      spec: "pet-can-cat-5oz", params: { spread: 14, plugH: 12 } },
    { names: ["universal pet food can lid", "universal pet food lid", "universal pet food can cover", "universal dog food can lid", "universal cat food can lid"],
      title: "Universal can lid", params: { canD: 82, spread: 32, plugH: 24, tab: 15 } },
  ],
  body: `
// the opening of an opened can is about 10 mm less than its rim; the plug
// tapers from a little over that to spread less, at no more than 40 degrees
const open0 = canD - 10;
const rB = Math.min(canD / 2 - 2, (open0 + spread / 2) / 2);
const rT = Math.max(6, rB - spread / 2);
const h = Math.max(plugH, (rB - rT) / Math.tan(40 * Math.PI / 180));
const phi = Math.atan((rB - rT) / h);
const wh = wall / Math.cos(phi);                         // the wall, measured across
const Rd = canD / 2 + 3;                                 // the top reaches past the rim
const hole = Math.max(2, rT - wh);
const lid = revolve(360, polygon([
  [0, 0], [Rd, 0], [Rd, diskT], [rB, diskT], [rT, diskT + h],
  [hole, diskT + h], [hole + rB - rT, diskT], [0, diskT],         // hollow inside, parallel to the outside
]));
if (tab <= 0) return lid;
const tw = Math.min(18, Rd);
const lift = hull(
  translate([Rd - 6, -tw / 2, 0], cube([1, tw, diskT])),
  translate([Rd + tab, 0, 0], cylinder({ r: tw / 2, h: diskT, $fn: 32 })));
return translate([-tab / 2, 0, 0], union(lid, lift));
`,
};
