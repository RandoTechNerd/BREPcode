// A built-up handle: a fat, softly ridged grip with a hole straight through
// it that a spoon, fork, pen, toothbrush or brush handle pushes into. A turned
// profile printed standing on end; the ridges are gentle enough that no part
// of the outside leans out more than about 20 degrees.

export default {
  id: "utensil-grip",
  category: "access",
  title: "Built-up utensil grip",
  summary: "a fat ridged grip that a spoon, fork, pen or brush handle pushes into, for hands that cannot close tightly.",
  print: "standing on end as shown, no supports. A snug push fit; a wrap of tape on the handle makes it tighter.",
  names: ["utensil grip", "built up utensil handle", "built up spoon handle", "spoon grip", "fork grip", "adaptive utensil handle",
    "cutlery grip", "adaptive spoon handle", "built up handle", "foam grip handle", "easy grip utensil handle"],
  nouns: ["grip", "handle"],
  keywords: ["spoon", "fork", "utensil", "cutlery", "eating", "arthritis", "adaptive", "built"],
  tips: ["for a pen", "40 mm thick", "no ridges"],
  examples: ["I want a built up spoon handle", "a large grip pen holder for arthritis",
    "utensil grip 35mm thick", "make me a pencil grip"],
  params: {
    gripD: { default: 32, min: 18, max: 50, unit: "mm", label: "grip diameter", say: ["thick", "diameter", "fat", "across"], more: ["fatter", "thicker", "bigger"], less: ["thinner", "slimmer"] },
    length: { default: 100, min: 40, max: 160, unit: "mm", label: "grip length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    holeW: { default: 13, min: 3, max: 30, unit: "mm", label: "hole width (diameter if round)", say: ["hole", "handle", "width", "wide"] },
    holeT: { default: 3.5, min: 1, max: 15, unit: "mm", label: "hole thickness (flat handles)", say: ["slot"] },
    form: { default: "flat", unit: "choice", choices: ["flat", "round"], label: "hole shape",
      words: { round: ["round hole", "round", "pen", "pencil", "brush", "crochet", "stylus"], flat: ["flat", "spoon", "fork", "knife", "toothbrush", "razor"] } },
    ridges: { default: 4, min: 0, max: 8, unit: "count", label: "finger ridges", say: ["ridge", "finger", "groove"] },
  },
  things: [
    { names: ["large grip pen holder", "pen grip for arthritis", "chunky pen grip", "pen grip", "fat pen grip", "big pen grip",
      "writing aid", "pen holder for arthritis", "adaptive pen grip"], title: "Large-grip pen holder",
    params: { form: "round", holeW: 9.6, length: 90, gripD: 30 } },
    { names: ["pencil grip", "chunky pencil grip", "pencil holder for arthritis", "fat pencil grip"], title: "Pencil grip",
      params: { form: "round", holeW: 8.4, length: 80, gripD: 28 } },
    { names: ["toothbrush grip", "built up toothbrush handle", "toothbrush handle grip", "adaptive toothbrush handle"], title: "Toothbrush grip",
      params: { form: "flat", holeW: 12, holeT: 7, length: 90 } },
    { names: ["razor grip", "razor handle grip", "built up razor handle"], title: "Razor grip", params: { form: "flat", holeW: 11, holeT: 7, length: 90 } },
    { names: ["crochet hook grip", "crochet hook handle", "knitting needle grip"], title: "Crochet hook grip",
      params: { form: "round", holeW: 5.6, length: 90, gripD: 24 } },
    { names: ["paintbrush grip", "paint brush grip", "art brush grip", "makeup brush grip"], title: "Paintbrush grip",
      params: { form: "round", holeW: 8.2, length: 90, gripD: 28 } },
    { names: ["stylus grip", "apple pencil grip", "tablet pen grip"], title: "Stylus grip", params: { form: "round", holeW: 9.2, length: 100, gripD: 30 } },
    { names: ["knife grip", "built up knife handle", "adaptive knife handle"], title: "Knife grip", params: { form: "flat", holeW: 16, holeT: 6, length: 105, gripD: 34 } },
  ],
  body: `
const R = gripD / 2;
const hw = Math.min(holeW, gripD - 6), ht = Math.min(holeT, hw);
const amp = ridges > 0 ? Math.min(1.5, R * 0.08) : 0;
// the outline turned about the axis: gentle finger ridges, eased in at both ends
const radius = (z) => {
  const ease = Math.min(1, z / 4, (length - z) / 4);
  return R - amp + amp * Math.cos(2 * Math.PI * ridges * z / length) - (1 - Math.max(0, ease)) * 1.6;
};
const prof = [[0, 0], ...Array.from({ length: 49 }, (_, i) => [radius(length * i / 48), length * i / 48]), [0, length]];
const body = revolve({ $fn: 64 }, polygon(prof));
// the hole: a round bore, or a rounded slot for a flat handle
const hole = form === "round"
  ? cylinder({ r: hw / 2 + 0.15, h: length + 2, $fn: 32 })
  : hull(...[-1, 1].map((s) => translate([s * (hw - ht) / 2, 0, 0], cylinder({ r: ht / 2 + 0.15, h: length + 2, $fn: 20 }))));
return difference(body, translate([0, 0, -1], hole));
`,
};
