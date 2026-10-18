// A measuring scoop that holds a set volume when levelled: a lathed cup whose
// inside is a frustum, sized by solving its volume formula for the radius, and
// a flat handle lying on the bed. The cup walls flare 10 degrees, so the
// outside leans in toward the bed by the same small angle and never hangs.
// The handle is unioned to the outer cup first and the cavity cut after, so
// the handle can never wall off part of the measure.

export default {
  id: "measuring-scoop",
  category: "kitchen",
  title: "Measuring scoop",
  summary: "a scoop that holds an exact volume when levelled, with a flat handle and a hanging hole.",
  print: "upright as shown, no supports. Food contact: use PETG or PLA from a food-safe spool, hand wash, and replace it once scratched.",
  names: ["measuring scoop", "measuring cup", "measuring spoon", "measure scoop", "kitchen scoop",
    "scoop with handle", "dosing scoop", "portion scoop"],
  nouns: ["scoop", "measure", "spoon"],
  keywords: ["ml", "cup", "teaspoon", "tablespoon", "measuring", "baking", "flour", "sugar", "kitchen"],
  primary: "volume",
  tips: ["30 ml", "longer handle", "deeper"],
  examples: ["I want a measuring scoop", "make me a 50 ml measuring scoop",
    "a measuring cup that holds 100 ml with a long handle", "coffee scoop"],
  params: {
    volume: { default: 59, min: 1, max: 500, unit: "count", label: "capacity in millilitres (level full)", say: ["ml", "milliliter", "millilitre", "cc", "capacity"] },
    deep: { default: 0.6, min: 0.3, max: 1.2, unit: "ratio", label: "depth as a share of the width (higher = deeper, narrower)" },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2, min: 1.2, max: 4, unit: "mm", label: "floor thickness", say: ["floor", "bottom"] },
    handleL: { default: 90, min: 30, max: 180, unit: "mm", label: "handle length past the cup", say: ["handle", "long", "length"], more: ["longer"], less: ["shorter"] },
    handleW: { default: 16, min: 8, max: 30, unit: "mm", label: "handle width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    handleT: { default: 4, min: 2.4, max: 8, unit: "mm", label: "handle thickness", say: ["thick", "thickness"], more: ["thicker", "stronger", "sturdier"], less: ["thinner"] },
    hangHole: { default: 5, min: 0, max: 10, unit: "mm", label: "hanging hole in the handle (0 = none)", say: ["hole", "hang"] },
  },
  things: [
    { names: ["tablespoon measure", "tablespoon scoop", "1 tablespoon measure", "tbsp scoop", "tablespoon measuring spoon"],
      title: "Tablespoon measure (15 ml)", params: { volume: 15, handleL: 70, handleW: 12 } },
    { names: ["teaspoon measure", "teaspoon scoop", "1 teaspoon measure", "tsp scoop", "teaspoon measuring spoon"],
      title: "Teaspoon measure (5 ml)", params: { volume: 5, handleL: 60, handleW: 10, handleT: 3 } },
    { names: ["coffee scoop", "coffee measure", "coffee measuring scoop", "ground coffee scoop", "coffee spoon"],
      title: "Coffee scoop (2 tablespoons)", params: { volume: 30, deep: 0.7, handleL: 80 } },
    { names: ["tea scoop", "loose leaf tea scoop", "tea measure", "tea spoon scoop"], title: "Tea scoop", params: { volume: 5, deep: 0.45, handleL: 70, handleW: 10, handleT: 3 } },
    { names: ["quarter cup measure", "1/4 cup measure", "quarter cup scoop", "1/4 cup measuring cup"], title: "1/4 cup measure", params: { volume: 59 } },
    { names: ["third cup measure", "1/3 cup measure", "third cup scoop", "1/3 cup measuring cup"], title: "1/3 cup measure", params: { volume: 79 } },
    { names: ["half cup measure", "1/2 cup measure", "half cup scoop", "1/2 cup measuring cup"], title: "1/2 cup measure", params: { volume: 118, handleL: 100 } },
    { names: ["one cup measure", "1 cup measure", "full cup measure", "1 cup measuring cup", "cup measure"], title: "1 cup measure", params: { volume: 237, handleL: 110, handleW: 20, handleT: 5 } },
    { names: ["rice cup", "rice measuring cup", "rice scoop", "rice cooker cup"], title: "Rice cooker cup (180 ml)", params: { volume: 180, deep: 0.75, handleL: 40 } },
    { names: ["flour scoop", "sugar scoop", "canister scoop", "baking scoop"], title: "Flour scoop", params: { volume: 120, deep: 0.5, handleL: 110, handleW: 20, handleT: 5 } },
    { names: ["protein scoop", "protein powder scoop", "supplement scoop", "powder scoop"], title: "Protein powder scoop", params: { volume: 70, deep: 0.8, handleL: 60 } },
  ],
  body: `
// inside: a frustum flaring 10 degrees, depth = deep x its top width
const flare = Math.tan(10 * Math.PI / 180);
const c = 1 - 2 * deep * flare;                 // bottom radius as a share of the top radius
const R = Math.cbrt(3 * volume * 1000 / (2 * Math.PI * deep * (1 + c + c * c)));
const rb = c * R, depthIn = 2 * deep * R;
const H = floor + depthIn;
const Ro = R + wall, rbo = rb + wall;
const outer = revolve(360, polygon([[0, 0], [rbo, 0], [Ro, H], [0, H]]));
const cavity = translate([0, 0, floor], revolve(360, polygon([[0, 0], [rb, 0], [R + 0.01, depthIn + 0.01], [R + 0.01, depthIn + 1], [0, depthIn + 1]])));

// a flat handle on the bed, a rounded tongue running out along +x
const w = Math.min(handleW, 2 * rbo);
const t = Math.min(handleT, H);
const tip = rbo + handleL;
const arm = hull(
  translate([0, -w / 2, 0], cube([1, w, t])),
  translate([tip - w / 2, 0, 0], cylinder({ r: w / 2, h: t, $fn: 32 })),
);
let scoop = difference(union(outer, arm), cavity);
if (hangHole > 0) {
  const hr = Math.min(hangHole, w - 4) / 2;
  if (hr > 0.5) scoop = difference(scoop, translate([tip - w / 2, 0, -1], cylinder({ r: hr, h: t + 2, $fn: 24 })));
}
return translate([-(tip - Ro) / 2, 0, 0], scoop);
`,
};
