// A pair of dumbbell cradles: blocks with round saddles that the dumbbell
// heads rest in, one cradle under each end. Saddles can step up so a row
// of weights is easy to read and grab. A stepped front profile stretched
// front to back, the saddles cut with cylinders, printed as it stands.

export default {
  id: "dumbbell-cradle",
  category: "fitness",
  title: "Dumbbell cradle",
  summary: "a pair of saddle blocks that hold dumbbells (or a barbell) off the floor, optionally stepped.",
  print: "upright as shown, no supports. One cradle goes under each end of the weights; 40% infill.",
  names: ["dumbbell rack", "dumbbell holder", "dumbbell cradle", "dumbbell stand", "dumbbell storage", "dumbbell rest",
    "dumbbell saddle", "weight rack for dumbbells", "dumbbell tray"],
  nouns: ["rack", "cradle", "holder", "stand", "saddle"],
  keywords: ["dumbbell", "dumbbells", "weight", "weights", "gym", "hex", "barbell", "kettlebell"],
  fits: ["bar"],
  fromSpec: (s) => ({ headD: s.dims.d, count: 1 }),
  primary: "headD",
  ask: {
    unless: ["headD"],
    text: "How big across are the dumbbell heads? Say “120 mm heads”; I used 100 mm, about a 10 lb (5 kg) hex dumbbell.",
  },
  tips: ["120 mm heads", "3 saddles", "stepped"],
  examples: ["I want a dumbbell rack", "make me a dumbbell holder for 3 dumbbells with 90mm heads",
    "a stepped dumbbell stand", "barbell holder for the floor"],
  params: {
    headD: { default: 100, min: 40, max: 250, unit: "mm", label: "dumbbell head diameter", say: ["head", "diameter", "across"], more: ["bigger"], less: ["smaller"] },
    count: { default: 2, min: 1, max: 6, unit: "count", label: "saddles per cradle", say: ["dumbbell", "saddle", "weight", "pair"] },
    depth: { default: 45, min: 20, max: 120, unit: "mm", label: "cradle depth, along the dumbbell", say: ["deep", "depth"] },
    step: { default: 0, min: 0, max: 60, unit: "mm", label: "each saddle higher than the last", say: ["step", "tier"] },
    baseH: { default: 15, min: 8, max: 60, unit: "mm", label: "height under the saddle", say: ["base", "lift", "high"] },
    gap: { default: 4, min: 0, max: 15, unit: "mm", label: "room around the head", say: ["gap", "clearance"] },
  },
  things: [
    { names: ["stepped dumbbell rack", "tiered dumbbell rack", "dumbbell staircase"], title: "Stepped dumbbell rack", params: { count: 3, step: 25 } },
    { names: ["small dumbbell rack", "hand weight holder", "light dumbbell rack"], title: "Small dumbbell rack", params: { headD: 70, count: 4, step: 15, depth: 40 } },
    { names: ["hex dumbbell holder", "hex dumbbell rack"], title: "Hex dumbbell holder", params: { headD: 115, count: 2, gap: 6 } },
    { names: ["adjustable dumbbell cradle", "adjustable dumbbell stand", "adjustable dumbbell holder"], title: "Adjustable dumbbell cradle", params: { headD: 230, count: 1, depth: 70, baseH: 25 } },
    { names: ["barbell holder", "barbell floor rest", "barbell cradle"], title: "Barbell holder", spec: "olympic-barbell", params: { depth: 40, baseH: 30 } },
    { names: ["ez curl bar holder", "curl bar rest"], title: "Curl bar holder", spec: "olympic-barbell", params: { depth: 40, baseH: 30, count: 1 } },
  ],
  body: `
const R = (headD + gap) / 2;
const side = Math.max(8, headD * 0.08);                   // wall between and beside the saddles
const pitch = 2 * R + side;
const W = count * pitch + side;
const dip = headD * 0.4;                                  // how deep a head sits
const top = (i) => baseH + dip + i * step;
// a stepped front profile, one step per saddle (a plain block when there is no step)
const prof = [[0, 0], [W, 0], [W, top(count - 1)]];
for (let i = count - 1; i >= 1 && step > 0; i--) prof.push([i * pitch + side / 2, top(i)], [i * pitch + side / 2, top(i - 1)]);
prof.push([0, top(0)]);
const across = (pts, h, y0) => translate([0, y0 + h, 0], rotate([90, 0, 0], linearExtrude({ h }, polygon(pts))));
const saddles = Array.from({ length: count }, (_, i) =>
  translate([side + R + i * pitch, depth + 1, baseH + R + i * step], rotate([90, 0, 0], cylinder({ r: R, h: depth + 2 }))));
const one = difference(across(prof, depth, 0), ...saddles);
return group(translate([-W / 2, -depth - 6, 0], one), translate([-W / 2, 6, 0], one));
`,
};
