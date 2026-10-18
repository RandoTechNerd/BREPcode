// A bench dog: a peg that drops into a workbench's dog hole, with a head that
// stands above the top as a stop. Split up the middle so it springs, and can
// be made a hair oversize to stay put. Printed head down, so the
// peg is a plain column. A flat-faced head is cut flush with the peg's side,
// never inside it, so the peg never overhangs the cut.

export default {
  id: "bench-dog",
  category: "garage",
  title: "Bench dog",
  summary: "a workbench dog: a sprung peg for a 3/4 inch or 20 mm dog hole with a stop head.",
  print: "head down as shown, no supports. PETG or nylon so it springs without snapping.",
  names: ["bench dog", "workbench dog", "dog hole peg", "bench dog stop", "bench peg", "workbench peg", "dog hole stop"],
  nouns: ["dog", "peg", "stop"],
  keywords: ["bench", "workbench", "woodworking", "clamp", "planing", "mft", "hole"],
  fits: ["dog-hole"],
  primary: "holeD",
  fromSpec: (s) => ({ holeD: s.dims.d }),
  tips: ["for 20 mm holes", "taller head", "flat face"],
  examples: ["I want a bench dog", "make me a bench dog for 20mm holes",
    "a planing stop for my workbench", "3/4 inch dog hole peg"],
  params: {
    holeD: { default: 19.05, min: 10, max: 40, unit: "mm", label: "dog hole diameter", say: ["hole", "diameter", "dog"] },
    fit: { default: 0.1, min: -0.3, max: 0.6, unit: "mm", label: "clearance per side (negative = snug, the split lets it spring)", say: ["fit", "clearance", "loose", "snug"] },
    pegL: { default: 35, min: 10, max: 90, unit: "mm", label: "peg length into the hole", say: ["long", "length", "deep"], more: ["longer"], less: ["shorter"] },
    headD: { default: 30, min: 10, max: 80, unit: "mm", label: "head diameter (at least the hole)", say: ["head", "wide", "across"], more: ["wider"] },
    headH: { default: 10, min: 3, max: 40, unit: "mm", label: "head height above the bench", say: ["tall", "high"], more: ["taller", "higher"], less: ["lower", "shorter"] },
    slit: { default: 1.6, min: 0, max: 4, unit: "mm", label: "spring split width (0 = solid)", say: ["split", "slit", "spring"] },
    face: { default: "round", unit: "choice", choices: ["round", "flat"], label: "head shape",
      words: { flat: ["flat face", "flat faced", "flat head", "d shaped", "straight face"], round: ["round head", "round"] } },
  },
  things: [
    { names: ["20mm bench dog", "mft dog", "mft bench dog", "20 mm bench dog", "festool dog"], title: "20 mm bench dog", spec: "dog-20" },
    { names: ["planing stop", "planing dog", "bench stop", "workbench stop"], title: "Planing stop", params: { headD: 60, headH: 12, face: "flat" } },
    { names: ["low profile bench dog", "flush bench dog", "short bench dog"], title: "Low-profile bench dog", params: { headH: 4, headD: 26 } },
    { names: ["flat bench dog", "flat face bench dog", "flat faced bench dog"], title: "Flat-faced bench dog", params: { face: "flat", headD: 32 } },
  ],
  body: `
const pr = holeD / 2 - fit;                      // the peg
const hr = Math.max(headD / 2, pr);              // the head is never narrower than the peg
const ch = Math.min(1.5, pegL / 6);              // lead-in chamfer at the peg's tip
const top = headH + pegL;
const dog = union(
  cylinder({ r: hr, h: headH, $fn: 72 }),
  translate([0, 0, headH - 0.01], cylinder({ r: pr, h: pegL - ch + 0.01, $fn: 72 })),
  translate([0, 0, top - ch - 0.01], cylinder({ r1: pr, r2: pr - ch, h: ch + 0.01, $fn: 72 })),
);
const cuts = [];
// the spring split, up the peg from a little above the head
if (slit > 0) cuts.push(translate([-slit / 2, -hr - 1, headH + Math.min(4, pegL / 4)], cube([slit, 2 * hr + 2, top])));
// a flat stop face, just proud of the side of the peg (a tangent cut leaves slivers)
if (face === "flat" && hr > pr + 0.8) cuts.push(translate([pr + 0.3, -hr - 1, -1], cube([hr + 1, 2 * hr + 2, top + 2])));
return cuts.length ? difference(dog, ...cuts) : dog;
`,
};
