// A slot stand that holds a flat round thing upright to show it off: a
// signed hockey puck, a disc golf disc, a race medal, a challenge coin.
// A rounded block with a chamfered top and a slot leaning back a little,
// cut right across so a wide disc can overhang both ends.

export default {
  id: "puck-stand",
  category: "fitness",
  title: "Puck and disc stand",
  summary: "a slotted stand that holds a puck, disc, medal or coin upright, leaning back a little.",
  print: "upright as shown, no supports.",
  names: ["puck stand", "puck display stand", "puck holder", "disc display stand", "disc stand",
    "hockey puck display", "disc golf stand"],
  nouns: ["stand", "holder", "display"],
  keywords: ["puck", "disc", "hockey", "medal", "coin", "display", "signed", "golf"],
  fits: ["disc"],
  fromSpec: (s) => ({ itemD: s.dims.d, itemT: s.dims.t }),
  tips: ["for a disc golf disc", "lean back more", "taller"],
  examples: ["I want a puck stand", "make me a display stand for my signed hockey puck",
    "disc golf display stand", "a stand for a challenge coin"],
  params: {
    itemD: { default: 76.2, min: 20, max: 300, unit: "mm", label: "diameter of what it holds", say: ["diameter", "across"] },
    itemT: { default: 25.4, min: 1, max: 40, unit: "mm", label: "thickness of what it holds", say: ["thick", "thickness"] },
    lean: { default: 12, min: 0, max: 30, unit: "deg", label: "lean back", say: ["lean", "angle", "tilt", "degree"] },
    height: { default: 18, min: 8, max: 60, unit: "mm", label: "stand height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower", "shorter"] },
    fit: { default: 0.6, min: 0.2, max: 2, unit: "mm", label: "slot clearance", say: ["fit", "clearance", "loose"] },
  },
  things: [
    { names: ["hockey puck stand", "signed puck holder", "hockey puck display stand", "puck display"], title: "Hockey puck stand", spec: "hockey-puck" },
    { names: ["disc golf display stand", "disc golf disc stand", "disc golf disc holder"], title: "Disc golf disc stand", spec: "disc-golf-disc", params: { height: 22 } },
    { names: ["flying disc stand", "ultimate disc stand", "flying disc display"], title: "Flying disc stand", spec: "ultimate-disc", params: { height: 25 } },
    { names: ["medal display stand", "medal stand", "single medal stand"], title: "Medal stand", spec: "race-medal", params: { height: 14 } },
    { names: ["challenge coin stand", "challenge coin display stand", "coin display stand"], title: "Challenge coin stand", spec: "challenge-coin", params: { height: 10, fit: 0.4 } },
    { names: ["poker chip display stand", "casino chip stand"], title: "Poker chip stand", spec: "poker-chip", params: { height: 10, fit: 0.4 } },
  ],
  body: `
const st = itemT + fit;                                   // slot width
const W = Math.max(40, itemD * 0.45);                     // across, under the item
const D = Math.max(36, st + 24, itemD * 0.3);             // front to back: room behind for the lean
const c = Math.min(3, height / 4);
const rr = Math.min(8, D / 3);
const corners = (w, d, r, z, h) => [[r, r], [w - r, r], [r, d - r], [w - r, d - r]].map(([x, y]) =>
  translate([x - w / 2, y - d / 2, z], cylinder({ r, h, $fn: 24 })));
const block = hull(...corners(W, D, rr, 0, height - c), ...corners(W - 2 * c, D - 2 * c, rr - c * 0.6, height - 0.5, 0.5));
const sd = Math.min(height - 3, Math.max(6, itemD * 0.12));   // slot depth
const yc = -D * 0.15;                                     // a little in front of centre, so more base is behind
const notch = translate([0, yc, height - sd], rotate([-lean, 0, 0], translate([-W / 2 - 1, -st / 2, 0], cube([W + 2, st, sd + height]))));
return difference(block, notch);
`,
};
