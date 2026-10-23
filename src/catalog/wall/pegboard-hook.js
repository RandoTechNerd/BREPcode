// A hook for IKEA Skadis or for ordinary pegboard. The back carries the clip
// the board takes: for Skadis a tab that goes through a 5 x 15 mm slot and
// drops down behind the board; for pegboard an L peg that goes through a
// hole and turns up behind it, plus a straight peg one hole (1 inch) lower.
// The clip is a thinner extrusion of its own outline (it has to pass the
// hole), the hook a wider one, and both are one side profile printed on its
// side, so the clip's downward prong lies flat on the bed instead of
// starting in mid-air.

export default {
  id: "pegboard-hook",
  category: "wall",
  title: "Pegboard hook",
  summary: "a hook that clips into IKEA Skadis slots or 1/4 inch pegboard holes.",
  print: "on its side as shown, no supports. PETG or PLA; try one in your board before printing a set.",
  names: ["pegboard hook", "peg board hook", "peg hook", "pegboard peg", "pegboard hanger", "pegboard hook rack"],
  nouns: ["hook", "peg", "hanger"],
  keywords: ["pegboard", "skadis", "ikea", "garage", "workshop", "board"],
  fits: ["skadis", "pegboard"],
  fromSpec: (s) => ({ board: s.kind === "skadis" ? "skadis" : s.dims.t < 5 ? "small" : "pegboard" }),
  tips: ["for Skadis", "80 mm long", "a J hook", "1/8 inch pegboard"],
  examples: ["I want a pegboard hook", "make me a skadis hook 60mm long", "a long pegboard hook 100mm",
    "a hook for my skadis board"],
  params: {
    board: { default: "skadis", unit: "choice", choices: ["skadis", "pegboard", "small"], label: "board (small = 1/8 in pegboard)",
      words: { skadis: ["skadis", "ikea"], small: ["1/8 pegboard", "1 8 pegboard", "thin pegboard", "small pegboard", "eighth inch pegboard"], pegboard: ["pegboard", "peg board", "1/4 pegboard", "quarter inch pegboard"] } },
    reach: { default: 40, min: 10, max: 150, unit: "mm", label: "how far it sticks out", say: ["reach", "out", "long", "length", "deep"], more: ["longer", "deeper"], less: ["shorter"] },
    width: { default: 10, min: 4.2, max: 40, unit: "mm", label: "hook width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    armT: { default: 6, min: 3, max: 14, unit: "mm", label: "arm thickness", say: ["thick", "thickness", "arm"], more: ["stronger", "thicker"], less: ["thinner"] },
    tipH: { default: 10, min: 0, max: 40, unit: "mm", label: "how far the tip turns up", say: ["tip", "lip"] },
    angle: { default: 10, min: 0, max: 45, unit: "deg", label: "upward tilt of the arm", say: ["angle", "tilt", "degree"] },
    plateH: { default: 30, min: 15, max: 100, unit: "mm", label: "back plate height below the clip", say: ["plate", "tall", "height"] },
    plateT: { default: 5, min: 3, max: 10, unit: "mm", label: "back plate thickness", say: ["back"] },
  },
  things: [
    { names: ["skadis hook", "ikea skadis hook", "skadis peg", "skadis hanger"], title: "Skadis hook", spec: "skadis" },
    { names: ["long skadis hook", "skadis long hook", "deep skadis hook"], title: "Long Skadis hook", spec: "skadis",
      params: { reach: 90, armT: 7, tipH: 12 } },
    { names: ["skadis j hook", "skadis cradle hook", "skadis u hook"], title: "Skadis J hook", spec: "skadis",
      params: { reach: 45, tipH: 25, width: 12 } },
    { names: ["long pegboard hook", "pegboard long hook", "deep pegboard hook"], title: "Long pegboard hook", spec: "pegboard-quarter",
      params: { reach: 100, armT: 7, tipH: 12 } },
    { names: ["pegboard j hook", "pegboard u hook", "pegboard cradle hook"], title: "Pegboard J hook", spec: "pegboard-quarter",
      params: { reach: 50, tipH: 25, width: 12 } },
    { names: ["small pegboard hook", "1/8 pegboard hook", "thin pegboard hook"], title: "Hook for 1/8 inch pegboard", spec: "pegboard-eighth",
      params: { reach: 35, armT: 5 } },
    { names: ["straight pegboard hook", "straight peg hook", "pegboard straight peg", "skadis straight hook"], title: "Straight peg hook",
      params: { tipH: 0, angle: 15, reach: 60 } },
  ],
  body: `
// side profile: x runs out from the board's face, y runs up; printed lying on
// it. The board sits behind, from x = -tB to 0.
const sk = board === "skadis";
const tB = sk ? 5 : board === "small" ? 3.2 : 6.35;            // board thickness
const hole = sk ? 5 : board === "small" ? 4.76 : 6.35;          // slot width or hole diameter
// a square clip section whose diagonal passes a round hole (Skadis: the slot width)
const pegS = sk ? 4.2 : (hole - 0.35) / Math.SQRT2;
const back = -(tB + 0.4);                                     // behind the board
const clips = sk
  // a tab through the slot that drops 7 mm down behind the board (tab plus drop clear the 15 mm slot)
  ? [[[0.5, 0], [0.5, 5], [back - 3.5, 5], [back - 3.5, -7], [back, -7], [back, 0]]]
  // an L through one hole that turns up behind the board, and a stub one hole lower
  : [[[0.5, 0], [0.5, pegS], [back, pegS], [back, pegS + (board === "small" ? 5 : 7)], [back - pegS, pegS + (board === "small" ? 5 : 7)], [back - pegS, 0]],
     [[0.5, -25.4], [0.5, -25.4 + pegS], [-(tB - 0.6), -25.4 + pegS], [-(tB - 0.6), -25.4]]];
const yTop = (sk ? 5 : pegS) + 3;
const yBot = sk ? -Math.max(plateH, 15) : Math.min(-25.4 - 3, -plateH);
// the hook: the arm leaves the plate at its foot, tilts up and turns up at the tip
const t = Math.tan(angle * Math.PI / 180);
const tipT = Math.max(3, armT * 0.8);
const gus = Math.min(armT, reach * 0.3);
const L = Math.max(reach, plateT + gus + tipT + 3);
const yb = (x) => yBot + x * t;
const tipTop = yb(L) + armT + tipH;
const outline = [
  [0, yBot], [L, yb(L)], [L, tipTop], [L - tipT, tipTop],
  [L - tipT, yb(L - tipT) + armT], [plateT + gus, yb(plateT + gus) + armT],
  [plateT, yb(plateT) + armT + gus], [plateT, Math.max(yTop, yb(plateT) + armT + gus + 2)], [0, Math.max(yTop, yb(plateT) + armT + gus + 2)],
];
const W = Math.max(width, pegS);
return union(
  linearExtrude({ h: W }, polygon(outline)),
  ...clips.map((pts) => linearExtrude({ h: pegS }, polygon(pts))),
);
`,
};
