// A mug tree: a post on a heavy disc with pegs that angle up and out, on two
// levels a third of a turn apart so the mugs hang clear of each other. The
// pegs leave the post at 46 degrees or steeper, so their undersides stay
// inside the angle a printer can build without support, and the whole tree
// prints standing up in one piece.

export default {
  id: "mug-tree",
  category: "kitchen",
  title: "Mug tree",
  summary: "a post on a weighted base with angled pegs on two levels for hanging mugs.",
  print: "upright as shown, no supports. Use 3+ walls and 20% infill: the pegs take the load.",
  names: ["mug tree", "mug holder stand", "mug stand", "coffee mug tree", "cup tree", "mug rack stand", "coffee mug stand",
    "mug holder tree", "countertop mug holder"],
  nouns: ["tree", "stand"],
  keywords: ["mug", "mugs", "cup", "cups", "coffee", "tea", "countertop", "hang"],
  tips: ["8 pegs", "longer pegs", "taller"],
  examples: ["I want a mug tree", "make me a mug stand with 8 pegs",
    "coffee mug tree 200 mm tall", "a cup tree with longer pegs"],
  params: {
    pegs: { default: 6, min: 2, max: 12, unit: "count", label: "pegs", say: ["peg", "arm", "mug", "cup", "hook"] },
    pegL: { default: 70, min: 30, max: 120, unit: "mm", label: "peg length", say: ["peg", "arm", "long", "length"], more: ["longer"], less: ["shorter"] },
    pegR: { default: 5.5, min: 3, max: 10, unit: "mm", label: "peg radius", say: ["thick", "thickness"], more: ["thicker", "stronger"], less: ["thinner"] },
    elev: { default: 50, min: 46, max: 80, unit: "deg", label: "peg angle above level (46 = flattest that prints)", say: ["angle", "degree", "tilt"], more: ["steeper"], less: ["flatter"] },
    postH: { default: 230, min: 100, max: 245, unit: "mm", label: "post height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    postR: { default: 11, min: 6, max: 25, unit: "mm", label: "post radius", say: ["post", "pole"] },
    baseR: { default: 75, min: 40, max: 125, unit: "mm", label: "base radius", say: ["base", "foot"], more: ["wider"], less: ["narrower"] },
    baseT: { default: 8, min: 4, max: 16, unit: "mm", label: "base thickness", say: ["heavy", "weight"] },
    levelGap: { default: 90, min: 40, max: 140, unit: "mm", label: "drop from the top pegs to the lower ones", say: ["gap", "spacing", "level"] },
  },
  things: [
    { names: ["small mug tree", "mini mug tree", "4 mug tree"], title: "Small mug tree", params: { pegs: 4, postH: 180, baseR: 65 } },
    { names: ["espresso cup tree", "espresso cup holder", "demitasse cup tree", "small cup tree"], title: "Espresso cup tree", params: { pegs: 6, pegL: 45, pegR: 4, postH: 170, baseR: 60, levelGap: 60 } },
    { names: ["large mug tree", "8 mug tree", "big mug tree"], title: "Large mug tree", params: { pegs: 8, pegL: 80, postH: 240, postR: 13, baseR: 90, baseT: 10 } },
    { names: ["bottle drying rack", "baby bottle drying rack", "bottle drying tree", "baby bottle tree", "water bottle drying rack"],
      title: "Bottle drying tree", params: { pegs: 8, pegL: 100, pegR: 6, elev: 70, postH: 240, baseR: 100, baseT: 6, levelGap: 110 } },
    { names: ["tumbler drying rack", "glass drying tree", "cup drying tree"], title: "Glass drying tree", params: { pegs: 6, pegL: 110, pegR: 7, elev: 72, postH: 230, baseR: 95, levelGap: 110 } },
  ],
  body: `
const el = elev * Math.PI / 180;
const reach = postR + pegL;
const zTop = postH - reach * Math.sin(el) - 5;                 // upper peg tips stay below the post top
const zLow = Math.max(baseT + pegR + 4, zTop - levelGap);
// pegs are octagonal prisms: flat faces keep the boolean with the post quick
const pr = Math.min(pegR, postR * 0.9) / Math.cos(Math.PI / 8);
const octagon = polygon(Array.from({ length: 8 }, (_, i) => [pr * Math.cos((i + 0.5) * Math.PI / 4), pr * Math.sin((i + 0.5) * Math.PI / 4)]));
// each starts part way out inside the post, a little further each time, so no
// two pegs meet in a mirror-image seam (the mesh would share an edge there)
const peg = (az, z, i) => {
  const s0 = postR * (0.3 + 0.05 * (i % 7));
  return translate([0, 0, z], rotate([0, 0, az], rotate([0, 90 - elev, 0], translate([0, 0, s0], linearExtrude({ h: reach - s0 }, octagon)))));
};
const arms = Array.from({ length: pegs }, (_, i) =>
  peg(4.5 + i * 360 / pegs, i % 2 === 0 ? Math.max(zLow, zTop) : zLow, i));   // 4.5: off the post's facet seams
return union(
  cylinder({ r: baseR, h: baseT, $fn: 72 }),
  cylinder({ r: postR, h: postH, $fn: 40 }),
  translate([0, 0, postH - 0.01], cylinder({ r1: postR, r2: postR * 0.35, h: postR, $fn: 40 })),
  ...arms,
);
`,
};
