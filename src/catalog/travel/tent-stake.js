// A tent stake with a T section: a flat flange that lies on the bed and a
// rib standing up along it, both tapering to a point, with a striking head
// and a notch each side to catch the guy line. The flange is the top view
// and the rib the side view, each extruded once, so the stake is two prisms
// and a block, and the rib is the stiffness a flat printed peg lacks.

export default {
  id: "tent-stake",
  category: "travel",
  title: "Tent stake",
  summary: "a T-section tent stake with a striking head and guy-line notches, for soft ground and sand.",
  print: "flange down as shown, no supports. PETG or nylon. For soft ground, sand and snow: a printed stake bends or snaps in rock and hard clay.",
  names: ["tent stake", "tent peg", "tent stakes", "tent pegs", "camping stake", "camping peg", "ground stake", "ground peg"],
  nouns: ["stake", "peg"],
  keywords: ["tent", "camping", "camp", "tarp", "guy", "ground", "sand", "snow"],
  tips: ["230 mm long", "wider for sand", "deeper rib"],
  examples: ["I want a tent stake", "make me a tent peg 200mm long",
    "sand stake for the beach", "a wide snow stake for my tent"],
  params: {
    length: { default: 180, min: 80, max: 250, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 18, min: 10, max: 45, unit: "mm", label: "flange width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    flangeT: { default: 3, min: 2, max: 6, unit: "mm", label: "flange thickness", say: ["flange", "thick"] },
    ribH: { default: 12, min: 6, max: 25, unit: "mm", label: "rib height at the head", say: ["rib", "deep", "tall"], more: ["deeper", "stronger", "stiffer"] },
    ribT: { default: 3, min: 2, max: 6, unit: "mm", label: "rib thickness", say: ["rib"] },
    tipL: { default: 40, min: 15, max: 80, unit: "mm", label: "point length", say: ["point", "tip"] },
    notch: { default: 5, min: 0, max: 12, unit: "mm", label: "guy-line notch depth (0 = none)", say: ["notch", "hook", "line"] },
  },
  things: [
    { names: ["sand stake", "sand peg", "beach tent stake", "beach stake"], title: "Sand stake", params: { length: 230, width: 36, ribH: 16, tipL: 50 } },
    { names: ["snow stake", "snow peg", "snow anchor"], title: "Snow stake", params: { length: 230, width: 42, ribH: 14, tipL: 40 } },
    { names: ["tarp stake", "tarp peg", "awning peg", "awning stake"], title: "Tarp stake", params: { length: 150 } },
    { names: ["groundsheet peg", "mini tent peg", "small tent stake", "footprint peg"], title: "Mini tent peg", params: { length: 100, width: 12, ribH: 8, tipL: 25 } },
    { names: ["heavy duty tent stake", "strong tent stake", "heavy tent peg"], title: "Heavy tent stake", params: { width: 24, flangeT: 4, ribH: 18, ribT: 4.5 } },
  ],
  body: `
// x runs from the head to the point
const L = length, w = width;
const head = Math.max(8, w * 0.5);                // the striking head's length
const xn = head + 4;                              // where the guy-line notches sit
const xt = L - tipL;                              // where the taper to the point starts
// the flange, seen from above
const plan = [[0, -w / 2], [xt, -w / 2], [L, -0.75], [L, 0.75], [xt, w / 2], [0, w / 2]];
let flange = linearExtrude({ h: flangeT }, polygon(plan));
if (notch > 0) {
  // a notch each side that leans back toward the head, so a tight line stays in it
  const n = Math.min(notch, w / 2 - ribT / 2 - 1);
  const cut = (s) => linearExtrude({ h: flangeT + 2 }, polygon([
    [xn, s * (w / 2 + 1)], [xn + 6, s * (w / 2 + 1)], [xn + 2, s * (w / 2 - n)], [xn - 2, s * (w / 2 - n)],
  ]));
  flange = difference(flange, translate([0, 0, -1], cut(1)), translate([0, 0, -1], cut(-1)));
}
// the rib, seen from the side: full height at the head, tapering to the point
const side = [[0, 0], [L, 0], [L, 0.8], [xt, ribH * 0.55], [head, ribH], [0, ribH]];
const rib = translate([0, ribT / 2, 0], rotate([90, 0, 0], linearExtrude({ h: ribT }, polygon(side))));
// the head: a block across the flange to strike
const strike = translate([0, -w / 2, 0], cube([head, w, Math.max(flangeT + 2, ribH * 0.6)]));
return translate([-L / 2, 0, 0], union(flange, rib, strike));
`,
};
