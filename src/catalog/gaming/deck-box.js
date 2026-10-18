// A deck box: a rounded box the deck stands in on its short edge, with a
// finger scoop down both faces to pinch the deck out, and a lift-off lid
// that slides down over the top. The lid prints upside down beside the box,
// so both are open-topped while they print.

export default {
  id: "deck-box",
  category: "gaming",
  title: "Deck box",
  summary: "a box for a deck of cards with a finger scoop and a lift-off lid, sized to the deck.",
  print: "as shown: box upright, lid upside down beside it. No supports.",
  names: ["deck box", "card deck box", "card box", "trading card box", "card case", "deck case", "card storage box",
    "deck holder", "playing card holder box"],
  nouns: ["box", "case"],
  keywords: ["deck", "card", "cards", "sleeved", "tcg", "ccg"],
  fits: ["deck"],
  fromSpec: (s) => ({ cardW: s.dims.w + 1, cardH: s.dims.h + 1, cards: s.dims.n, sleeve: s.dims.t > 0.5 ? "sleeved" : "bare" }),
  specNote: "with room for the deck to slide",
  ask: { unless: ["cards", "cardW"], text: "Which cards is it for? Say “for a commander deck” or “for a Pokemon deck”; I sized it for 60 sleeved standard cards." },
  tips: ["for a commander deck", "100 cards", "unsleeved", "taller lid"],
  examples: ["I want a deck box", "commander deck box for 100 sleeved cards",
    "a box for my pokemon deck", "deck box for 75 cards"],
  params: {
    cardW: { default: 67, min: 40, max: 130, unit: "mm", label: "card width (in its sleeve)", say: ["wide", "width"] },
    cardH: { default: 92, min: 40, max: 130, unit: "mm", label: "card height (in its sleeve)", say: ["tall", "high", "height"] },
    cards: { default: 60, min: 5, max: 200, unit: "count", label: "cards", say: ["card", "deck"] },
    sleeve: { default: "sleeved", unit: "choice", choices: ["sleeved", "bare", "double"], label: "sleeves",
      words: { bare: ["unsleeved", "no sleeves", "without sleeves", "bare"], double: ["double sleeved", "double sleeves", "two sleeves"], sleeved: ["sleeved", "sleeves", "in sleeves"] } },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    lidH: { default: 35, min: 10, max: 120, unit: "mm", label: "lid depth", say: ["lid", "cap"], more: ["deeper"] },
    fit: { default: 0.25, min: 0.1, max: 0.6, unit: "mm", label: "lid clearance per side", say: ["fit", "clearance", "tolerance"] },
    notchW: { default: 30, min: 0, max: 60, unit: "mm", label: "finger scoop width (0 = none)", say: ["scoop", "notch", "finger"] },
  },
  things: [
    { names: ["mtg deck box", "magic deck box", "magic the gathering deck box", "mtg card box"], title: "MTG deck box", spec: "deck-mtg" },
    { names: ["commander deck box", "edh deck box", "100 card deck box"], title: "Commander deck box", spec: "deck-commander" },
    { names: ["pokemon deck box", "pokemon card box", "ptcg deck box"], title: "Pokemon deck box", spec: "deck-pokemon" },
    { names: ["yugioh deck box", "yu gi oh deck box", "yugioh card box"], title: "Yu-Gi-Oh deck box", spec: "deck-yugioh" },
    { names: ["playing card box", "poker card box", "deck of cards box", "playing card case"], title: "Playing card box", spec: "deck-poker",
      params: { lidH: 30 } },
    { names: ["uno card box", "uno box", "uno card case"], title: "Uno card box", spec: "deck-uno" },
    { names: ["tarot card box", "tarot deck box", "tarot box", "oracle card box"], title: "Tarot card box", spec: "deck-tarot", params: { lidH: 45 } },
    { names: ["bridge card box", "bridge deck box"], title: "Bridge card box", spec: "deck-bridge", params: { lidH: 30 } },
  ],
  body: `
const per = sleeve === "bare" ? 0.32 : sleeve === "double" ? 0.8 : 0.65;   // each card's thickness
const stack = cards * per + 2;
const iw = cardW + 1, il = stack + 1;            // half a millimetre of room round the deck
const W = iw + 2 * wall, D = il + 2 * wall;
const flr = Math.max(1.6, wall);
const H = cardH + flr;                           // the deck sits all the way in
const r = Math.min(3, W / 4, D / 4);
// a rounded rectangle w x d, h tall, centred, from z
const rounded = (w, d, h, rr, z = 0) => hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) =>
  translate([i * (w / 2 - rr), j * (d / 2 - rr), z], cylinder({ r: rr, h, $fn: 24 }))));
let box = difference(rounded(W, D, H, r), rounded(iw, il, H, Math.max(0.4, r - wall), flr));
const nw = Math.min(notchW, iw - 6);
if (nw > 0) {
  // a finger scoop down both faces of the deck, round at the bottom
  const zc = H - Math.max(nw / 2 + 2, Math.min(cardH * 0.35, nw));
  box = difference(box,
    translate([-nw / 2, -D / 2 - 1, zc], cube([nw, D + 2, H])),
    translate([0, D / 2 + 1, zc], rotate([90, 0, 0], cylinder({ r: nw / 2, h: D + 2, $fn: 32 }))));
}
// the lid slides down over the box
const lh = Math.min(lidH, H - 5);
const LW = W + 2 * (fit + wall), LD = D + 2 * (fit + wall);
const lid = difference(rounded(LW, LD, lh + flr, r + fit + wall), rounded(W + 2 * fit, D + 2 * fit, lh + 1, r + fit, flr));
return group(translate([-(LW + 10) / 2, 0, 0], box), translate([(W + 10) / 2, 0, 0], lid));
`,
};
