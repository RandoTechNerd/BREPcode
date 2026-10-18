// The classic nail-in picture hook: a small plate with a cup at the bottom
// for the picture wire, and a thickened boss at the top that a thin nail is
// driven through at 45 degrees down into the wall, so the load pushes the
// nail sideways into the wall instead of pulling it out. One side profile,
// printed on its side, so the 45-degree nail channel lies flat on the bed.

export default {
  id: "picture-hook",
  category: "wall",
  title: "Picture hook",
  summary: "a nail-in picture hook: a 45-degree nail channel and a cup for the hanging wire.",
  print: "on its side as shown, no supports. PETG; a panel pin or small nail goes through the channel.",
  names: ["picture hook", "picture hanger", "picture hanging hook", "nail picture hook", "picture nail hook",
    "art hanging hook", "photo hanging hook", "painting hook"],
  nouns: ["hook", "hanger"],
  keywords: ["picture", "art", "painting", "nail", "wall", "photo", "wire", "hang"],
  tips: ["two nails", "bigger cup", "20 mm wide"],
  examples: ["I want a picture hook", "make me a picture hanger with two nails",
    "a picture hanging hook 20mm wide", "a painting hook with a nail"],
  params: {
    cupD: { default: 6, min: 3, max: 20, unit: "mm", label: "size of the cup the wire sits in", say: ["cup", "wire"] },
    plateH: { default: 30, min: 18, max: 60, unit: "mm", label: "plate height", say: ["tall", "high", "height"] },
    width: { default: 12, min: 8, max: 40, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    plateT: { default: 3, min: 2, max: 6, unit: "mm", label: "plate thickness", say: ["thick", "thickness"], more: ["stronger", "thicker"] },
    lipH: { default: 5, min: 2, max: 15, unit: "mm", label: "front lip height", say: ["lip"] },
    bossT: { default: 3, min: 2, max: 8, unit: "mm", label: "nail boss thickness", say: ["boss"] },
    nailD: { default: 1.6, min: 1, max: 3, unit: "mm", label: "nail diameter", say: ["nail", "pin"] },
    nails: { default: 1, min: 1, max: 3, unit: "count", label: "nails", say: ["nail", "pin"] },
  },
  things: [
    { names: ["mirror hook", "mirror hanger", "mirror hanging hook"], title: "Mirror hook",
      params: { width: 20, nails: 2, plateT: 4, cupD: 8, plateH: 36 } },
    { names: ["heavy picture hook", "heavy duty picture hanger", "large picture hook"], title: "Heavy picture hook",
      params: { width: 30, nails: 3, plateT: 4.5, cupD: 10, plateH: 42, bossT: 4 } },
    { names: ["clock hook", "clock hanger", "wall clock hook"], title: "Clock hook", params: { cupD: 8, lipH: 8, width: 14 } },
    { names: ["small picture hook", "mini picture hanger", "tiny picture hook"], title: "Small picture hook",
      params: { width: 9, plateH: 22, cupD: 4, plateT: 2.4, lipH: 4, nailD: 1.2 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it
const rc = cupD / 2;
const T = plateT;
const Ro = rc + T;
const cx = T + rc, cy = Ro;                        // the cup's inner circle touches the plate face
const bossH = Math.max(10, bossT * 3);
const H = Math.max(plateH, cy + bossH + 4);
const qb = H - bossH;                              // the boss starts here, with a 45 degree shoulder
const arc = (r, a0, a1, N = 24) => Array.from({ length: N + 1 }, (_, i) => {
  const a = a0 + (a1 - a0) * i / N;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});
const outline = [
  ...arc(Ro, Math.PI, 2 * Math.PI),                // under the cup, from the wall to the front
  [cx + Ro, cy + lipH], [cx + rc, cy + lipH],      // the lip
  ...arc(rc, 0, -Math.PI),                         // back round the inside of the cup
  [T, qb], [T + bossT, qb + bossT], [T + bossT, H], [0, H],
];
const piece = linearExtrude({ h: width }, polygon(outline));
// the nail channel: from the boss face down at 45 degrees to the back
const yExit = H - T - bossT - 2;
const len = (T + bossT + 4) * Math.SQRT2;
const zs = nails === 1 ? [width / 2] : Array.from({ length: nails }, (_, i) => width * (0.2 + 0.6 * i / (nails - 1)));
const channels = zs.map((z) => translate([-2, yExit - 2, z],
  rotate([0, 0, 45], rotate([0, 90, 0], cylinder({ r: nailD / 2 + 0.15, h: len, $fn: 16 })))));
return difference(piece, ...channels);
`,
};
