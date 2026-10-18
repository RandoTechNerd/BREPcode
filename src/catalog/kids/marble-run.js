// Marble run tiles: square blocks that sit side by side and stack. A
// straight tile has a half-pipe groove falling gently across it, a curve
// turns the marble through 90 degrees, a funnel drops it down a shaft into
// the tile below, and an exit tile catches it from above and sends it out
// one side through a tunnel with a pointed roof. Grooves are never deeper
// than their centre line, so there is no undercut to support.

export default {
  id: "marble-run",
  category: "kids",
  title: "Marble run tile",
  summary: "stackable marble run tiles: straight, curve, funnel drop and side exit, sized to your marbles.",
  print: "upright as shown, no supports. Marbles are a choking hazard: not for children under 3.",
  names: ["marble run", "marble run tile", "marble track", "marble run piece", "marble run block", "marble tower piece",
    "marble race track", "marble maze tile"],
  nouns: ["tile", "track", "piece"],
  keywords: ["marble", "marbles", "run", "track", "roll", "stack", "kids"],
  fits: ["marble"],
  fromSpec: (s) => ({ marbleD: s.dims.d }),
  tips: ["curve", "funnel", "taller tile"],
  examples: ["I want a marble run", "make me a marble run curve", "marble run funnel tile 50mm tall",
    "marble track pieces for 25mm marbles"],
  params: {
    kind: { default: "straight", unit: "choice", choices: ["straight", "curve", "funnel", "exit"], label: "tile type",
      words: { curve: ["curve", "corner", "turn", "bend"], funnel: ["funnel", "drop"], exit: ["exit", "tunnel", "catch"], straight: ["straight"] } },
    tile: { default: 40, min: 25, max: 80, unit: "mm", label: "tile size", say: ["tile", "wide", "square", "size"], more: ["bigger"], less: ["smaller"] },
    height: { default: 30, min: 15, max: 80, unit: "mm", label: "tile height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter", "lower"] },
    marbleD: { default: 16, min: 10, max: 26, unit: "mm", label: "marble diameter", say: ["marble"] },
    drop: { default: 2, min: 0, max: 5, unit: "mm", label: "fall across a straight tile", say: ["slope", "fall"] },
  },
  things: [
    { names: ["marble run straight", "straight marble track", "marble run straight piece"], title: "Marble run straight", params: { kind: "straight" } },
    { names: ["marble run curve", "marble run corner", "marble track curve"], title: "Marble run curve", params: { kind: "curve" } },
    { names: ["marble run funnel", "marble funnel", "marble run drop"], title: "Marble run funnel", params: { kind: "funnel" } },
    { names: ["marble run exit", "marble run tunnel", "marble run catcher"], title: "Marble run exit", params: { kind: "exit" } },
    { names: ["tall marble run block", "marble run riser"], title: "Tall marble run funnel", params: { kind: "funnel", height: 60 } },
    { names: ["big marble run", "shooter marble run"], title: "Big marble run straight", spec: "shooter-marble", params: { tile: 55, height: 35 } },
  ],
  body: `
const s = Math.max(tile, marbleD + 12), h = Math.max(height, marbleD * 0.7 + 6);
const rg = marbleD / 2 + 1.5;                             // groove radius: a millimetre and a half of room
const block = translate([-s / 2, -s / 2, 0], cube([s, s, h]));
if (kind === "straight") {
  // a half-pipe whose centre runs along the top, falling a little (never deeper than its centre by much)
  const fall = Math.min(drop, rg * 0.5);
  const a = Math.atan2(fall, s) * 180 / Math.PI;
  const groove = translate([-s / 2 - 2, 0, h], rotate([0, 90 + a, 0], cylinder({ r: rg, h: s + 4, $fn: 48 })));
  return difference(block, groove);
}
if (kind === "curve") {
  // a quarter of a ring centred on one corner, so it enters on one side and leaves on the next
  return difference(block, translate([-s / 2, -s / 2, h], torus({ r: s / 2, tube: rg, $fn: 48 })));
}
const shaftR = marbleD / 2 + 1;
if (kind === "funnel") {
  // a cone down to a shaft straight through, into the tile below
  const fr = Math.min(s / 2 - 2, shaftR + h * 0.6);
  return difference(block,
    translate([0, 0, h - (fr - shaftR) - 0.5], cylinder({ r1: shaftR - 0.5, r2: fr, h: fr - shaftR + 0.51, $fn: 48 })),
    translate([0, 0, -1], cylinder({ r: shaftR, h: h + 2, $fn: 32 })));
}
// exit: a shaft from the top meets a tunnel with a pointed roof running out one side
const tw = marbleD + 3, k = Math.tan(60 * Math.PI / 180);
const wallH = Math.max(2, marbleD * 0.6);
const roof = [[-tw / 2, 0], [tw / 2, 0], [tw / 2, wallH], [0, wallH + tw / 2 * k], [-tw / 2, wallH]];
// the tunnel starts behind the shaft, so the shaft's foot opens fully into it
const back = shaftR + 1;
const tunnel = translate([-back, 0, 2], rotate([90, 90, 0], linearExtrude({ h: s / 2 + 2 + back }, polygon(roof))));
return difference(block, tunnel, translate([0, 0, 2 + wallH - 0.5], cylinder({ r: shaftR, h: h, $fn: 32 })));
`,
};
