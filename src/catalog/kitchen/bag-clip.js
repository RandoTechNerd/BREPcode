// A one-piece spring clip for bags: two arms joined by a loop that does the
// springing, converging to a hair's gap at the tip. The bag goes in at the
// tip and forces the arms apart; the loop pulls them back. Flat, so it prints
// in minutes with every layer running along the arms.

export default {
  id: "bag-clip",
  category: "kitchen",
  title: "Bag clip",
  summary: "a one-piece spring clip that keeps chip, bread and coffee bags shut.",
  print: "flat as shown, no supports. PETG or PLA; PETG springs back better.",
  names: ["bag clip", "chip clip", "bag sealer clip", "bread bag clip", "snack clip", "food clip",
    "bag closure", "chip bag clip", "bag sealing clip", "clip for bags"],
  nouns: ["clip", "closure", "sealer"],
  keywords: ["bag", "chip", "snack", "bread", "food", "kitchen", "seal", "coffee", "cereal"],
  tips: ["140 mm long", "stronger", "wider"],
  examples: ["I want a bag clip", "make me a chip clip 120mm long",
    "a strong clip for coffee bags", "bread bag clip"],
  params: {
    length: { default: 90, min: 40, max: 200, unit: "mm", label: "length", say: ["long", "length"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    clipW: { default: 12, min: 6, max: 30, unit: "mm", label: "width", say: ["wide", "width", "tall"], more: ["wider"], less: ["narrower"] },
    armT: { default: 3, min: 2, max: 6, unit: "mm", label: "arm thickness at the tip", say: ["arm", "thick"], more: ["stronger", "stiffer", "thicker"], less: ["softer", "weaker"] },
    springT: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "spring loop thickness", say: ["spring"] },
    loop: { default: 8, min: 4, max: 20, unit: "mm", label: "spring loop size", say: ["loop", "hinge"] },
    gap: { default: 0.6, min: 0.4, max: 3, unit: "mm", label: "gap at the tip", say: ["gap", "opening"] },
  },
  things: [
    { names: ["bread clip", "bread bag closure"], title: "Bread clip", params: { length: 60, clipW: 10 } },
    { names: ["coffee bag clip", "cereal bag clip", "large bag clip", "big chip clip", "freezer bag clip"],
      title: "Large bag clip", params: { length: 140, clipW: 16, armT: 4, springT: 3 } },
    { names: ["mini bag clip", "small bag clip", "spice bag clip"], title: "Mini bag clip", params: { length: 50, clipW: 8, armT: 2.4, loop: 6 } },
    { names: ["dog food bag clip", "pet food bag clip", "kibble bag clip", "cat food bag clip", "pet food clip"],
      title: "Pet food bag clip", params: { length: 200, clipW: 20, armT: 5, springT: 3.6, loop: 12 } },
    { names: ["flour bag clip", "sugar bag clip", "rice bag clip", "pasta bag clip", "medium bag clip"],
      title: "Pantry bag clip", params: { length: 115, clipW: 14, armT: 3.4, springT: 2.8 } },
    { names: ["frozen vegetable clip", "frozen food bag clip", "ice bag clip"], title: "Freezer bag clip", params: { length: 120, clipW: 14, armT: 3.6, springT: 3 } },
  ],
  body: `
const rI = loop / 2, rO = rI + springT;
const tip = gap / 2;
const arc = (r, a0, a1, N = 24) => Array.from({ length: N + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / N;
  return [r * Math.cos(t), r * Math.sin(t)];
});
const outline = [
  [length, tip + armT],                          // top arm tip, outside
  ...arc(rO, Math.PI / 2, 3 * Math.PI / 2),      // round the back of the loop
  [length, -tip - armT],                         // bottom arm tip, outside
  [length, -tip],
  ...arc(rI, 3 * Math.PI / 2, Math.PI / 2),      // back round the inside
  [length, tip],
];
return translate([-length / 2, 0, 0], linearExtrude({ h: clipW }, polygon(outline)));
`,
};
