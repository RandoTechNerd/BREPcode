// A spinning top, printed upside down: it stands on its stem, the body
// flares out at 50 degrees to the rim, and the point is the last thing
// printed. Flip it over and twirl the stem. Round, or with flat sides: four
// sides make a dreidel shape (blank faces, to draw the letters on).

export default {
  id: "spinning-top",
  category: "kids",
  title: "Spinning top",
  summary: "a twirling top with a stem, a rim and a point; round, or faceted (four sides is a dreidel).",
  print: "upside down, standing on its stem as shown; no supports. One piece, no small parts at the default size.",
  names: ["spinning top", "spin top", "spinning top toy", "toy top", "finger top", "twirling top", "spinner top", "whirl top"],
  nouns: ["top"],
  keywords: ["spinning", "spin", "twirl", "toy", "kids", "dreidel", "spinner"],
  primary: "rimD",
  tips: ["60 mm across", "4 sides", "longer stem"],
  examples: ["I want a spinning top", "make me a spinning top 60mm across", "a spin top with 6 sides", "dreidel"],
  params: {
    rimD: { default: 45, min: 20, max: 90, unit: "mm", label: "rim diameter", say: ["across", "diameter", "wide", "rim"], more: ["bigger", "wider"], less: ["smaller"] },
    stemD: { default: 8, min: 4, max: 14, unit: "mm", label: "stem diameter", say: ["stem", "handle"] },
    stemL: { default: 16, min: 8, max: 40, unit: "mm", label: "stem length", say: ["stem length", "long"] },
    rimH: { default: 4, min: 1, max: 25, unit: "mm", label: "rim band height", say: ["rim height", "band", "tall"] },
    point: { default: 0.8, min: 0.4, max: 1.5, unit: "ratio", label: "point height, as a share of the rim radius", say: ["point", "tip"] },
    sides: { default: 0, min: 0, max: 8, unit: "count", label: "flat sides (0 = round)", say: ["side", "sided", "face"] },
  },
  things: [
    { names: ["dreidel", "dreidel top", "four sided top"], title: "Dreidel", params: { sides: 4, rimD: 40, rimH: 20, stemL: 12, point: 0.9 } },
    { names: ["hexagon top", "six sided top", "hex top"], title: "Hexagon top", params: { sides: 6, rimH: 6 } },
    { names: ["diamond top", "double cone top"], title: "Diamond top", params: { rimH: 1.5, point: 1.2 } },
    { names: ["big spinning top", "large spinning top", "giant spinning top"], title: "Big spinning top", params: { rimD: 80, stemD: 12, stemL: 25, rimH: 6 } },
    { names: ["mini spinning top", "tiny spinning top", "small spinning top"], title: "Mini spinning top (a small part: ages 3+)", params: { rimD: 26, stemD: 5, stemL: 10, rimH: 2.5 } },
    { names: ["battle top", "battle spinning top", "stadium top"], title: "Battle top", params: { rimD: 50, rimH: 7, sides: 8, point: 0.6 } },
  ],
  body: `
const rs = stemD / 2, rr = Math.max(rimD / 2, rs + 4);
const k = Math.tan(50 * Math.PI / 180);
const z1 = stemL, z2 = z1 + (rr - rs) * k, z3 = z2 + rimH;   // stem top, rim bottom, rim top (upside down)
const tipR = Math.min(1, rs / 3), zTip = z3 + rr * point;
// the stem ends in a little knob, which is what it stands on while printing
const rk = Math.max(rs + 1.5, 4.5), foot = [[0, 0], [rk, 0], [rk, 1.2], [rs, 1.2 + rk - rs]];
const round = sides < 3;
if (round) return revolve(360, polygon([...foot, [rs, z1], [rr, z2], [rr, z3], [tipR, zTip], [0, zTip]]));
// faceted: the same stack from flat-sided pieces, each overlapping the next a little
const n = sides, f = 1 / Math.cos(Math.PI / n);           // corner radius from flat radius
const seg = (r1, r2, z, h) => translate([0, 0, z], cylinder({ r1: r1 * f, r2: r2 * f, h, $fn: n }));
return union(
  revolve(360, polygon([...foot, [rs, z1 + 0.5], [0, z1 + 0.5]])),
  seg(rs, rr, z1, z2 - z1 + 0.01),
  seg(rr, rr, z2, rimH + 0.01),
  seg(rr, tipR, z3, zTip - z3),
);
`,
};
