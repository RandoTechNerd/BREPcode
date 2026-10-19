// An L bookend with a brace: the books stand on the long foot, which holds
// it down, and lean on the upright. The foot's tip is thinned so it slides
// under the first book. One side profile, printed lying on its side, so the
// layers run up the upright and round the corner that takes the load.

export default {
  id: "bookend",
  category: "desk",
  title: "Bookend",
  summary: "an L-shaped bookend with a corner brace; the books stand on its foot and hold it down.",
  print: "lying on its side as shown, no supports. Comes as a pair.",
  names: ["bookend", "bookends", "book end", "book ends", "book stopper", "book support", "shelf bookend", "desk bookend"],
  nouns: ["bookend", "stopper"],
  keywords: ["book", "books", "shelf", "desk", "library"],
  tips: ["200 mm tall", "heavier brace", "just one bookend"],
  examples: ["I want a pair of bookends", "make me a bookend 180mm tall",
    "a book end for my shelf", "heavy duty bookends"],
  params: {
    height: { default: 150, min: 50, max: 250, unit: "mm", label: "upright height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    baseL: { default: 110, min: 40, max: 200, unit: "mm", label: "foot length", say: ["foot", "base", "long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 110, min: 40, max: 200, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    thick: { default: 5, min: 3, max: 12, unit: "mm", label: "plate thickness", say: ["thick", "thickness", "plate"], more: ["thicker", "sturdier", "stronger"], less: ["thinner"] },
    brace: { default: 40, min: 0, max: 120, unit: "mm", label: "corner brace size", say: ["brace", "gusset"], more: ["heavier"] },
    pieces: { default: 2, min: 1, max: 2, unit: "count", label: "bookends", say: ["bookend", "piece"] },
  },
  things: [
    { names: ["heavy duty bookend", "heavy duty bookends", "strong bookend", "sturdy bookend"], title: "Heavy-duty bookend",
      params: { thick: 8, brace: 70, baseL: 140 } },
    { names: ["small bookend", "mini bookend", "small bookends", "paperback bookend"], title: "Small bookend",
      params: { height: 90, baseL: 70, width: 70, thick: 4, brace: 25 } },
    { names: ["tall bookend", "tall bookends", "binder bookend", "file bookend"], title: "Tall bookend",
      params: { height: 230, baseL: 150, width: 120, thick: 7, brace: 60 } },
    { names: ["vinyl record bookend", "record bookend", "vinyl bookend", "lp bookend"], title: "Record bookend",
      params: { height: 220, baseL: 160, width: 150, thick: 6, brace: 60 } },
    { names: ["magazine bookend", "comic book bookend", "manga bookend"], title: "Magazine bookend",
      params: { height: 200, baseL: 120, width: 90, thick: 5, brace: 45 } },
    { names: ["cookbook bookend", "kitchen bookend"], title: "Cookbook bookend", params: { height: 180, baseL: 140, width: 120, thick: 6, brace: 50 } },
  ],
  body: `
// side profile: x runs along the shelf, y runs up
const tip = Math.min(1.6, thick);                // the foot thins to a slip at its end
const b = Math.min(brace, height - thick - 5, baseL - thick - 10);
const outline = [[0, 0], [baseL, 0], [baseL, tip], [Math.max(thick + b, baseL - 30), thick],
  ...(b > 2 ? [[thick + b, thick], [thick, thick + b]] : [[thick, thick]]),
  [thick, height], [thick * 0.4, height], [0, height - thick * 0.6]];
const one = linearExtrude({ h: width }, polygon(outline));
if (pieces < 2) return translate([-baseL / 2, -height / 2, 0], one);
return translate([-baseL - 4, -height / 2, 0], group(one, translate([2 * baseL + 8, 0, 0], mirror([1, 0, 0], one))));
`,
};
