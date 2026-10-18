// A thumb page holder: a flat bar with a thumb hole in the middle. Put a
// thumb through it at the book's spine and the two wings hold both pages
// open, so a book can be read with one hand. One flat shape.

export default {
  id: "page-holder",
  category: "access",
  title: "Book page holder",
  summary: "a thumb ring with two wings that holds a book open, for reading with one hand.",
  print: "flat as shown, no supports.",
  names: ["book page holder", "page holder", "thumb page holder", "reading thumb ring", "book thumb", "page spreader",
    "thumb book holder", "book thumb ring", "one handed reading aid", "reading ring"],
  nouns: ["holder", "spreader", "ring"],
  keywords: ["book", "page", "pages", "thumb", "reading", "read", "one", "hand"],
  tips: ["wider wings", "for a big thumb", "thicker"],
  examples: ["I want a book page holder", "a thumb page holder for reading",
    "page holder 90mm wide", "make me a reading ring with a 25mm thumb hole"],
  params: {
    span: { default: 75, min: 40, max: 120, unit: "mm", label: "wing span", say: ["wide", "span", "long", "width"], more: ["wider", "longer"], less: ["narrower", "shorter"] },
    wingW: { default: 30, min: 18, max: 50, unit: "mm", label: "wing depth", say: ["wing"] },
    thumbD: { default: 22, min: 14, max: 32, unit: "mm", label: "thumb hole", say: ["thumb", "hole"], more: ["bigger"], less: ["smaller"] },
    thick: { default: 3.5, min: 2, max: 8, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "sturdier"] },
  },
  things: [
    { names: ["large page holder", "hardcover page holder", "big book page holder", "textbook page holder"], title: "Large page holder",
      params: { span: 100, wingW: 36, thumbD: 24, thick: 4 } },
    { names: ["kids page holder", "small page holder", "paperback page holder", "pocket book holder"], title: "Small page holder",
      params: { span: 60, wingW: 26, thumbD: 18, thick: 3 } },
    { names: ["page holder for arthritis", "easy grip page holder"], title: "Easy-grip page holder", params: { span: 85, wingW: 34, thumbD: 28, thick: 4 } },
  ],
  body: `
// lying flat: the wings run along x
const w = Math.max(wingW, thumbD + 8);           // keeps at least 4 mm round the thumb
const half = Math.max(span / 2, w / 2 + 2);
const bar = hull(...[-1, 1].map((s) => translate([s * (half - w / 2), 0, 0], cylinder({ r: w / 2, h: thick, $fn: 40 }))));
return difference(bar, translate([0, 0, -1], cylinder({ r: thumbD / 2, h: thick + 2, $fn: 40 })));
`,
};
