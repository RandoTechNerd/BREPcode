// Legs that turn any board into a monitor riser or desk shelf: each leg is a
// frame with a lip front and back, and the board drops in between the lips
// so it cannot slide off. One flat side profile with a window through it,
// printed lying down, so every face is vertical and nothing hangs.

export default {
  id: "riser-leg",
  category: "desk",
  title: "Monitor riser legs",
  summary: "legs that hold a wooden board up as a monitor riser or desk shelf, with lips that keep the board in place.",
  print: "lying on their side as shown, no supports. Print one per end (two for a short board, three for a long one).",
  names: ["monitor riser", "monitor stand", "monitor riser legs", "riser legs", "desk riser", "screen riser",
    "monitor stand legs", "shelf riser legs", "board riser legs"],
  nouns: ["riser", "legs", "leg"],
  keywords: ["monitor", "screen", "board", "shelf", "desk", "raise", "lift"],
  tips: ["120 mm tall", "for a 250 mm deep board", "3 legs"],
  examples: ["I want a monitor riser", "monitor riser legs 120mm tall for a 250mm deep board",
    "make me legs for a desk shelf", "a speaker riser"],
  params: {
    height: { default: 100, min: 30, max: 200, unit: "mm", label: "height under the board", say: ["tall", "high", "height", "lift", "raise"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    boardD: { default: 220, min: 80, max: 300, unit: "mm", label: "board depth front to back", say: ["board", "deep", "depth", "shelf"], more: ["deeper"], less: ["shallower"] },
    legW: { default: 40, min: 15, max: 100, unit: "mm", label: "leg width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 8, min: 4, max: 16, unit: "mm", label: "frame thickness", say: ["thick", "thickness", "frame", "strong"], more: ["stronger", "thicker", "sturdier"] },
    lipH: { default: 8, min: 0, max: 30, unit: "mm", label: "lip height above the board's underside", say: ["lip"] },
    pieces: { default: 2, min: 1, max: 4, unit: "count", label: "legs", say: ["leg", "piece", "support"] },
  },
  things: [
    { names: ["desk shelf riser", "desk shelf legs", "desktop shelf legs", "desk hutch legs"], title: "Desk shelf legs",
      params: { height: 150, boardD: 200, legW: 40 } },
    { names: ["speaker riser", "desk speaker riser", "speaker stand legs", "speaker shelf legs"], title: "Speaker riser",
      params: { height: 70, boardD: 160, legW: 35 } },
    { names: ["dual monitor riser", "double monitor riser", "long monitor riser", "two monitor riser"], title: "Dual monitor riser legs",
      params: { height: 100, boardD: 250, legW: 50, pieces: 3 } },
    { names: ["low monitor riser", "small monitor riser", "laptop shelf riser"], title: "Low monitor riser",
      params: { height: 55, boardD: 180, legW: 35 } },
    { names: ["tall monitor riser", "high monitor riser", "standing desk riser"], title: "Tall monitor riser",
      params: { height: 180, boardD: 240, legW: 50, wall: 10 } },
  ],
  body: `
// side profile: x runs front to back, y runs up (the board's underside at y = height)
const D = boardD + 1 + 2 * wall;                 // 0.5 mm of room each side of the board
const top = height + lipH;
const outline = [[0, 0], [D, 0], [D, top], [D - wall, top], [D - wall, height], [wall, height], [wall, top], [0, top]];
// a window through the frame, its corners cut at 45 degrees so they stay strong
const m = Math.max(wall * 1.5, 6);
const ww = D - 2 * m, wh = height - 2 * m;
const leg = () => {
  const frame = linearExtrude({ h: legW }, polygon(outline));
  if (ww < 12 || wh < 12) return frame;
  const c = Math.min(ww, wh) / 3;
  const win = [[m + c, m], [D - m - c, m], [D - m, m + c], [D - m, height - m - c], [D - m - c, height - m],
    [m + c, height - m], [m, height - m - c], [m, m + c]];
  return difference(frame, translate([0, 0, -1], linearExtrude({ h: legW + 2 }, polygon(win))));
};
const legs = Array.from({ length: pieces }, (_, i) => translate([-D / 2, i * (top + 10), 0], leg()));
return translate([0, -(pieces * (top + 10) - 10) / 2, 0], group(...legs));
`,
};
