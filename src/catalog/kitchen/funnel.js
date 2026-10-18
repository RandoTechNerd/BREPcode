// A funnel: a spout that drops into the neck, a cone, and a straight rim. Two
// lathed solids, the outside and the hollow, one cut from the other. The cone
// is printed mouth up, so its outside leans out no further than 45 degrees
// and never hangs. A thin rib down the spout keeps a gap to the neck so air
// can get out and the funnel does not glug.
//
// The same shape sized to a jar mouth is a canning funnel, and sized to an
// espresso basket (a short spout that drops into the basket, tall walls) it
// is a dosing funnel.

export default {
  id: "funnel",
  category: "kitchen",
  title: "Funnel",
  summary: "a pouring funnel with an air rib on the spout, sized to a bottle, a jar mouth or an espresso basket.",
  print: "upright, mouth up, no supports. Food contact: PETG or food-safe PLA, hand wash.",
  names: ["funnel", "kitchen funnel", "food funnel", "pouring funnel", "small funnel", "large funnel", "wide funnel",
    "plastic funnel", "funnel for bottles", "bottle funnel", "jar funnel"],
  nouns: ["funnel"],
  keywords: ["pour", "pouring", "bottle", "jar", "spout", "kitchen", "liquid", "powder"],
  fits: ["jar", "basket"],
  fromSpec(s) {
    if (s.kind === "basket") return { spoutD: s.dims.d - 0.6, spoutL: 8, topD: s.dims.d + 24, flare: 40, rim: 18, airRib: 0 };
    return { spoutD: s.dims.mouth - 4, spoutL: 18, topD: Math.min(160, s.dims.d + 60), flare: 40, rim: 6, airRib: 0 };
  },
  specNote: "the spout drops in with a little room",
  tips: ["150 mm across", "20 mm spout", "longer spout"],
  examples: ["I want a funnel", "make me a kitchen funnel 150mm across",
    "a funnel for bottles with a 15 mm spout", "canning funnel for wide mouth mason jars", "dosing funnel for a 58mm portafilter"],
  params: {
    topD: { default: 110, min: 30, max: 240, unit: "mm", label: "mouth diameter", say: ["across", "diameter", "mouth", "top", "wide"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    spoutD: { default: 16, min: 6, max: 100, unit: "mm", label: "spout outside diameter", say: ["spout", "nozzle", "neck", "outlet"] },
    spoutL: { default: 35, min: 3, max: 120, unit: "mm", label: "spout length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    flare: { default: 38, min: 20, max: 45, unit: "deg", label: "cone angle from upright (45 = flattest that prints)", say: ["angle", "cone", "degree"], more: ["flatter"], less: ["steeper"] },
    rim: { default: 6, min: 0, max: 60, unit: "mm", label: "straight rim above the cone", say: ["rim", "collar", "wall"] },
    wall: { default: 1.6, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"], less: ["thinner"] },
    airRib: { default: 1.2, min: 0, max: 3, unit: "mm", label: "air rib on the spout (0 = none)", say: ["rib", "air"] },
  },
  things: [
    { names: ["canning funnel", "jam funnel", "mason jar funnel", "regular mouth funnel", "canning jar funnel"], title: "Canning funnel", spec: "mason-regular" },
    { names: ["wide mouth funnel", "wide mouth canning funnel", "wide mouth jar funnel"], title: "Canning funnel (wide mouth)", spec: "mason-wide" },
    { names: ["dosing funnel", "espresso dosing funnel", "portafilter funnel", "espresso funnel", "dosing ring", "58mm dosing funnel"], title: "Espresso dosing funnel", spec: "basket-58" },
    { names: ["breville dosing funnel", "sage dosing funnel", "54mm dosing funnel"], title: "Dosing funnel (54 mm)", spec: "basket-54" },
    { names: ["delonghi dosing funnel", "51mm dosing funnel"], title: "Dosing funnel (51 mm)", spec: "basket-51" },
    { names: ["spice funnel", "spice jar funnel", "small spice funnel"], title: "Spice jar funnel", params: { topD: 60, spoutD: 22, spoutL: 12, rim: 4, airRib: 0 } },
    { names: ["water bottle funnel", "bottle neck funnel", "drink bottle funnel"], title: "Bottle funnel", params: { topD: 90, spoutD: 18, spoutL: 30 } },
    { names: ["powder funnel", "protein powder funnel", "formula funnel", "supplement funnel"], title: "Powder funnel", params: { topD: 90, spoutD: 24, spoutL: 25, flare: 35, rim: 8, airRib: 0 } },
    { names: ["essential oil funnel", "perfume funnel", "mini funnel", "tiny funnel"], title: "Mini funnel", params: { topD: 34, spoutD: 7, spoutL: 12, flare: 35, rim: 3, airRib: 0 } },
  ],
  body: `
const tf = Math.tan(flare * Math.PI / 180);
const Ro = topD / 2;
const rs = Math.min(spoutD / 2, Ro - wall - 1);  // the spout can be no wider than the mouth
const ri = Math.max(1, rs - wall);                // the hole down the spout
const wh = wall / Math.cos(flare * Math.PI / 180); // the cone wall measured across
const zc = spoutL + (Ro - rs) / tf;                // where the cone meets the rim
const lift = (wh - (rs - ri)) / tf;               // the bore's cone starts this much higher
const top = zc + Math.max(rim, lift + 0.6);
const outside = revolve(360, polygon([[0, 0], [rs, 0], [rs, spoutL], [Ro, zc], [Ro, top], [0, top]]));
const bore = revolve(360, polygon([[0, -1], [ri, -1], [ri, spoutL + lift], [Ro - wall, zc + lift], [Ro - wall, top + 1], [0, top + 1]]));
let part = difference(outside, bore);
if (airRib > 0 && spoutL > 4) {
  const ribW = Math.max(1, wall * 0.8);
  part = union(part, translate([rs - 0.3, -ribW / 2, 0], cube([airRib + 0.3, ribW, spoutL])));
}
return part;
`,
};
