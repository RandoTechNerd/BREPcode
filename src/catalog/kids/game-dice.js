// Six-sided dice with pips. Each die is a cube with chamfered edges (a hull
// of three crossed boxes, so every chamfer is 45 degrees and the bottom
// edges print clean) and conical pips: a 90 degree cone is steep enough on
// the sides and the underside alike. Opposite faces add to seven, with the
// one on the bed.

export default {
  id: "game-dice",
  category: "kids",
  title: "Game dice",
  summary: "six-sided dice with pips (or blank faces), chamfered edges, one or a set.",
  print: "flat as shown, the one face down; no supports. At 25 mm a die is too big to swallow; standard 16 mm dice are small parts (ages 3+).",
  names: ["game dice", "six sided dice", "toy dice", "pip dice", "dot dice", "d6 dice", "board game dice", "playing dice",
    "six sided die", "big dice", "dice"],
  nouns: ["die"],
  keywords: ["game", "board", "pips", "dots", "roll", "counting", "kids"],
  primary: "size",
  tips: ["5 dice", "16 mm", "blank faces"],
  examples: ["I want some game dice", "make me 2 six sided dice 20mm", "big dice for counting", "a set of 5 board game dice"],
  params: {
    size: { default: 25, min: 10, max: 60, unit: "mm", label: "die size", say: ["size", "across", "big", "wide"], more: ["bigger"], less: ["smaller"] },
    count: { default: 1, min: 1, max: 12, unit: "count", label: "how many dice", say: ["dice", "die"] },
    pips: { default: "dots", unit: "choice", choices: ["dots", "blank"], label: "pips or blank faces",
      words: { blank: ["blank", "no dots", "no pips", "plain"], dots: ["dots", "pips", "spots"] } },
    edge: { default: 1.5, min: 0.4, max: 5, unit: "mm", label: "edge chamfer", say: ["edge", "chamfer", "round"] },
    pipR: { default: 0.09, min: 0.05, max: 0.13, unit: "ratio", label: "pip size, as a share of the die", say: ["pip", "dot"] },
  },
  things: [
    { names: ["standard dice", "16mm dice", "small dice", "regular dice"], title: "Standard 16 mm dice (small parts: ages 3+)", params: { size: 16, edge: 1 } },
    { names: ["jumbo dice", "giant dice", "large dice"], title: "Jumbo dice", params: { size: 45, edge: 3 } },
    { names: ["counting dice", "math dice", "learning dice"], title: "Counting dice", params: { size: 30, edge: 2, pipR: 0.1 } },
    { names: ["blank dice", "blank die", "custom dice blank"], title: "Blank dice", params: { pips: "blank" } },
    { names: ["five dice set", "set of five dice", "dice for yatzy"], title: "Five dice", params: { size: 16, count: 5, edge: 1 } },
    { names: ["travel dice", "mini dice", "tiny dice"], title: "Travel dice (small parts: ages 3+)", params: { size: 12, count: 2, edge: 0.8 } },
    { names: ["pair of dice", "two dice", "dice pair"], title: "Pair of dice", params: { size: 18, count: 2, edge: 1.2 } },
  ],
  body: `
const s = size, c = Math.min(edge, s / 5);
// a cube with every edge chamfered at 45 degrees: the hull of three crossed boxes
const block = hull(
  translate([-s / 2, -s / 2 + c, -s / 2 + c], cube([s, s - 2 * c, s - 2 * c])),
  translate([-s / 2 + c, -s / 2, -s / 2 + c], cube([s - 2 * c, s, s - 2 * c])),
  translate([-s / 2 + c, -s / 2 + c, -s / 2], cube([s - 2 * c, s - 2 * c, s])),
);
// pips: 90 degree cones sunk into each face; opposite faces add to seven
const pr = s * pipR, q = s * 0.26;
const LAYOUT = {
  1: [[0, 0]], 2: [[-q, -q], [q, q]], 3: [[-q, -q], [0, 0], [q, q]], 4: [[-q, -q], [q, -q], [-q, q], [q, q]],
  5: [[-q, -q], [q, -q], [0, 0], [-q, q], [q, q]], 6: [[-q, -q], [q, -q], [-q, 0], [q, 0], [-q, q], [q, q]],
};
// a pip cutter pointing down into the top face, then turned onto each face
const pip = (u, v) => translate([u, v, s / 2 - pr], cylinder({ r1: 0, r2: pr + 0.4, h: pr + 0.4, $fn: 24 }));
const FACES = [[6, [0, 0, 0]], [1, [180, 0, 0]], [2, [90, 0, 0]], [5, [-90, 0, 0]], [3, [0, 90, 0]], [4, [0, -90, 0]]];
const cuts = pips === "dots" ? FACES.flatMap(([n, r]) => LAYOUT[n].map(([u, v]) => rotate(r, pip(u, v)))) : [];
const die = translate([0, 0, s / 2], cuts.length ? difference(block, ...cuts) : block);
const per = Math.ceil(Math.sqrt(count)), pitch = s + 5;
return group(...Array.from({ length: count }, (_, i) => translate([((i % per) - (per - 1) / 2) * pitch, (Math.floor(i / per) - (Math.ceil(count / per) - 1) / 2) * pitch, 0], die)));
`,
};
