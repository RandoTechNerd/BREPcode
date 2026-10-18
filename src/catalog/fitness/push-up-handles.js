// Push-up handles that print with no supports: two leg plates and a grip,
// every part lying flat. The grip is a round bar with its underside cut
// to a flat and two 50 degree chamfers (a teardrop), so it prints lying
// down with its layers running along it, the strong way. Its ends step down
// to pegs of the same shape that press through matching sockets in the
// legs, keyed so the grip cannot turn.

export default {
  id: "push-up-handles",
  category: "fitness",
  title: "Push-up handles",
  summary: "a push-up handle in three flat parts: two legs and a keyed grip that presses into them.",
  print: "all parts flat as shown, no supports. You put your weight on it: PETG, 6 walls, 40% infill, and glue the pegs. Print two.",
  names: ["push up handles", "push up bars", "push up handle", "push up stand", "pushup handles", "pushup bars",
    "push up grips", "pushup grips", "push up stands"],
  nouns: ["handles", "bars", "grips", "stand"],
  keywords: ["push", "pushup", "exercise", "workout", "fitness", "floor", "calisthenics"],
  primary: "gripD",
  tips: ["taller", "36 mm grip", "longer grip"],
  examples: ["I want push up handles", "make me push up bars 120mm tall", "push up handles with a 36 mm grip",
    "a pair of pushup grips"],
  params: {
    gripD: { default: 32, min: 24, max: 45, unit: "mm", label: "grip thickness", say: ["grip", "thick", "diameter"], more: ["thicker"], less: ["thinner"] },
    gripL: { default: 110, min: 80, max: 180, unit: "mm", label: "grip length between the legs", say: ["long", "length", "wide"], more: ["longer", "wider"], less: ["shorter"] },
    height: { default: 100, min: 50, max: 200, unit: "mm", label: "leg height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["lower", "shorter"] },
    baseL: { default: 110, min: 60, max: 200, unit: "mm", label: "foot length, front to back", say: ["base", "foot", "deep"] },
    legT: { default: 12, min: 8, max: 20, unit: "mm", label: "leg thickness", say: ["leg"] },
    fit: { default: 0.25, min: 0, max: 0.8, unit: "mm", label: "peg clearance per side", say: ["fit", "clearance", "tolerance"] },
  },
  things: [
    { names: ["mini parallettes", "parallettes", "parallette bars", "parallel bars"], title: "Mini parallettes", params: { height: 150, gripL: 160, baseL: 160, legT: 14 } },
    { names: ["handstand handles", "handstand blocks", "l sit handles"], title: "Handstand handles", params: { height: 130, baseL: 140, gripD: 34 } },
    { names: ["low push up bars", "low profile push up handles"], title: "Low push-up bars", params: { height: 60, baseL: 100 } },
    { names: ["kids push up bars", "small push up handles"], title: "Small push-up handles", params: { gripD: 26, gripL: 90, height: 70, baseL: 90, legT: 10 } },
    { names: ["dip bar handles", "heavy duty push up bars"], title: "Heavy-duty push-up bars", params: { gripD: 38, legT: 18, baseL: 130 } },
  ],
  body: `
// the grip's cross-section: a circle of radius r with a flat underside and 50 degree chamfers up to it
const teardrop = (r, n = 40) => {
  const a = 0.766 * r - 0.839 * 0.357 * r;               // half the flat
  const pts = [[-a, 0], [a, 0]];
  for (let i = 0; i <= n; i++) {
    const t = (-40 + 260 * i / n) * Math.PI / 180;
    pts.push([r * Math.cos(t), r + r * Math.sin(t)]);
  }
  return polygon(pts);
};
const r = gripD / 2, rp = r - 4;                         // the pegs are 4 mm smaller, sharing the flat
// grip: profile x across, profile y up; lying along x on its flat
const along = (prof, len, x0) => translate([x0, 0, 0], rotate([90, 90, 0], linearExtrude({ h: len }, prof)));
const grip = union(along(teardrop(r), gripL, 0), along(teardrop(rp), legT + 0.01, -legT), along(teardrop(rp), legT + 0.01, gripL - 0.01));

// a leg: a side-view trapezoid lying flat, with the peg's socket near the top
const H = height, B = baseL, T = 2 * r + 12;
const ys = Math.max(8, H - 6 - 2 * rp);                  // bottom of the socket
const leg = difference(
  linearExtrude({ h: legT }, polygon([[-B / 2, 0], [B / 2, 0], [T / 2, H], [-T / 2, H]])),
  translate([0, ys - fit, -1], linearExtrude({ h: legT + 2 }, teardrop(rp + fit))),
);
return group(
  translate([-B / 2 - 4, 0, 0], leg), translate([B / 2 + 4, 0, 0], leg),
  translate([-gripL / 2, H + 10 + r, 0], grip),
);
`,
};
