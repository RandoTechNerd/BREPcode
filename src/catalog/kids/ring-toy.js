// A ring stacker for toddlers, or a ring toss game: a weighted base with a
// post, and flat rings. As a stacker the rings step down in size and share
// one hole; as a ring toss they are all alike with a big hole and a tall
// post. Base and post are one lathed piece; the rings print flat around it.

export default {
  id: "ring-toy",
  category: "kids",
  title: "Ring stacker",
  summary: "a stacking-ring toddler toy, or a ring toss game: a base with a post and flat rings.",
  print: "everything flat as shown, no supports. At the defaults every ring is over 32 mm across, so nothing is a small part; keep it that way for under-3s.",
  names: ["ring stacker", "stacking rings", "stacking ring toy", "ring stacking toy", "baby ring stacker", "rings on a post",
    "ring tower toy", "stacker toy"],
  nouns: ["rings", "stacker"],
  keywords: ["stacking", "stack", "toddler", "baby", "rings", "toss", "kids", "montessori", "post"],
  tips: ["7 rings", "ring toss", "bigger rings"],
  examples: ["I want a ring stacker", "make me stacking rings with 6 rings", "a ring toss game", "baby ring stacker"],
  params: {
    style: { default: "stacker", unit: "choice", choices: ["stacker", "toss"], label: "stacker or ring toss",
      words: { toss: ["toss", "throw", "quoits", "ring toss"], stacker: ["stacker", "stacking", "stack"] } },
    count: { default: 5, min: 2, max: 8, unit: "count", label: "rings", say: ["ring"] },
    ringD: { default: 80, min: 40, max: 130, unit: "mm", label: "largest ring diameter", say: ["ring", "across", "diameter"], more: ["bigger"], less: ["smaller"] },
    step: { default: 10, min: 0, max: 15, unit: "mm", label: "each ring smaller by (stacker)", say: ["step"] },
    ringT: { default: 12, min: 6, max: 25, unit: "mm", label: "ring thickness", say: ["thick", "thickness"] },
    postD: { default: 18, min: 10, max: 30, unit: "mm", label: "post diameter", say: ["post", "peg"] },
    postH: { default: 75, min: 30, max: 200, unit: "mm", label: "post height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    baseD: { default: 90, min: 50, max: 150, unit: "mm", label: "base diameter", say: ["base"] },
  },
  things: [
    { names: ["ring toss", "ring toss game", "quoits game", "ring throwing game"], title: "Ring toss", params: { style: "toss", count: 4, ringD: 110, ringT: 8, postH: 150, baseD: 130, postD: 20 } },
    { names: ["rainbow stacker", "seven ring stacker", "big ring stacker"], title: "Rainbow stacker", params: { count: 7, ringD: 90, step: 8, postH: 100, baseD: 100 } },
    { names: ["small ring stacker", "three ring stacker", "travel ring stacker"], title: "Small ring stacker", params: { count: 3, ringD: 65, step: 10, ringT: 12, postH: 45, baseD: 75 } },
    { names: ["donut stacker", "chunky ring stacker"], title: "Chunky ring stacker", params: { count: 4, ringD: 90, step: 12, ringT: 20, postD: 22, postH: 90, baseD: 100 } },
    { names: ["tabletop ring toss", "mini ring toss"], title: "Mini ring toss", params: { style: "toss", count: 5, ringD: 60, ringT: 6, postH: 90, postD: 14, baseD: 80 } },
  ],
  body: `
const toss = style === "toss";
const rp = postD / 2, bh = 8;
const Rb = Math.max(baseD / 2, rp + 15);
// base and post in one profile: a disc, a root cone, the post, a domed (coned) cap
const capH = rp * 0.8;
const base = revolve(360, polygon([[0, 0], [Rb, 0], [Rb, bh], [rp + 6, bh + 3], [rp, bh + 9], [rp, postH - capH], [rp * 0.35, postH], [0, postH]]));
// the rings: a stacker's share one hole and step down; a toss game's are alike with a wide hole
const hole = toss ? Math.max(postD + 30, ringD - 28) : postD + 5;
const sizes = Array.from({ length: count }, (_, i) => Math.max(toss ? ringD : ringD - i * step, hole + 20));
const ringOf = (D) => difference(cylinder({ r: D / 2, h: ringT, $fn: 64 }), translate([0, 0, -1], cylinder({ r: hole / 2, h: ringT + 2, $fn: 64 })));
// lay the pieces out in rows, left to right
const items = [{ d: 2 * Rb, part: base }, ...sizes.map((D) => ({ d: D, part: ringOf(D) }))];
const placed = [];
let x = 0, y = 0, row = 0, width = 0;
for (const it of items) {
  if (x > 0 && x + it.d > 250) { y += row + 6; x = 0; row = 0; }
  placed.push(translate([x + it.d / 2, y + it.d / 2, 0], it.part));
  x += it.d + 6; row = Math.max(row, it.d); width = Math.max(width, x - 6);
}
return translate([-width / 2, -(y + row) / 2, 0], group(...placed));
`,
};
