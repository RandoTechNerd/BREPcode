// A one-hand jar and bottle opener for weak or painful grips: a paddle with
// a stack of toothed round pockets, biggest on top, so one tool fits a range
// of lids. Press it down over the lid, the teeth bite, and the long handle
// does the twisting. The pockets open upward as it prints, so each step is
// a ledge facing up.

export default {
  id: "jar-opener",
  category: "access",
  title: "Jar opener",
  summary: "a long-handled opener with stepped, toothed pockets that grip a range of jar lids and bottle caps.",
  print: "flat as shown, pockets up, no supports.",
  names: ["jar opener", "lid opener", "jar lid opener", "jar opener for arthritis", "jar gripper", "lid gripper",
    "jar twister", "multi size jar opener", "jar lid twister", "easy jar opener"],
  nouns: ["opener", "gripper", "twister"],
  keywords: ["jar", "lid", "cap", "arthritis", "grip", "twist", "open", "weak"],
  fits: ["lid"],
  fromSpec: (s) => ({ lidMax: Math.min(130, s.dims.d + 6), lidMin: Math.max(15, s.dims.d - 16), steps: 3 }),
  specNote: "three steps either side of that size",
  tips: ["for pill bottles", "bigger lids", "5 steps", "longer handle"],
  examples: ["I want a jar opener", "a jar opener for arthritis", "make me an opener for my pill bottle",
    "jar lid opener for lids up to 100mm"],
  params: {
    lidMax: { default: 90, min: 30, max: 130, unit: "mm", label: "biggest lid", say: ["biggest", "largest", "max", "up", "lid", "across"], more: ["bigger"] },
    lidMin: { default: 30, min: 15, max: 110, unit: "mm", label: "smallest lid", say: ["smallest", "min", "down", "cap"], less: ["smaller"] },
    steps: { default: 4, min: 1, max: 6, unit: "count", label: "lid sizes (steps)", say: ["step", "size", "pocket"] },
    stepH: { default: 6, min: 3, max: 14, unit: "mm", label: "depth of each step", say: ["deep", "depth"] },
    handleL: { default: 90, min: 0, max: 160, unit: "mm", label: "handle length", say: ["handle", "long", "length", "lever"], more: ["longer"], less: ["shorter"] },
    wall: { default: 4, min: 3, max: 8, unit: "mm", label: "rim thickness", say: ["wall", "rim"] },
  },
  things: [
    { names: ["bottle cap twister", "twist off cap opener", "soda bottle cap opener", "water bottle cap opener", "bottle cap opener for arthritis",
      "twist cap opener"], title: "Bottle cap opener", spec: "lid-soda-cap", params: { lidMax: 40, lidMin: 26, steps: 3, stepH: 7, handleL: 80 } },
    { names: ["pill bottle opener", "medicine bottle opener", "child proof cap opener", "prescription bottle opener"], title: "Pill bottle opener",
      spec: "lid-pill-bottle", params: { lidMax: 48, lidMin: 32, steps: 3, stepH: 7, handleL: 80 } },
    { names: ["mason jar opener", "canning jar opener", "jam jar opener"], title: "Mason jar opener",
      params: { lidMax: 92, lidMin: 70, steps: 2, stepH: 8 } },
    { names: ["big jar opener", "large jar opener", "wide jar opener"], title: "Large jar opener",
      params: { lidMax: 120, lidMin: 70, steps: 4, stepH: 7, handleL: 110, wall: 5 } },
    { names: ["milk jug opener", "jug cap opener", "juice bottle opener"], title: "Jug cap opener", spec: "lid-milk-jug",
      params: { lidMax: 46, lidMin: 34, steps: 2, stepH: 8, handleL: 70 } },
  ],
  body: `
const lo = Math.min(lidMin, lidMax - 2);
const R = lidMax / 2 + wall;                     // the round end
const flr = Math.max(2.4, wall * 0.75);
const T = steps * stepH + flr;
const tipR = Math.max(10, Math.min(16, R * 0.5));
const paddle = handleL > 0
  ? hull(cylinder({ r: R, h: T, $fn: 64 }), translate([R + handleL, 0, 0], cylinder({ r: tipR, h: T * 0.75, $fn: 32 })))
  : hull(cylinder({ r: R, h: T, $fn: 64 }));
// each step is a toothed round pocket; the teeth (about 4 mm apart) bite the lid's edge
const toothed = (d) => {
  const n = Math.max(12, Math.round(Math.PI * d / 4));
  return polygon(Array.from({ length: 2 * n }, (_, i) => {
    const a = Math.PI * i / n, r = d / 2 + (i % 2 ? 1.2 : 0);
    return [r * Math.cos(a), r * Math.sin(a)];
  }));
};
const cuts = Array.from({ length: steps }, (_, i) => {
  const d = steps < 2 ? lidMax : lidMax - (lidMax - lo) * i / (steps - 1);
  return translate([0, 0, T - (i + 1) * stepH], linearExtrude({ h: (i + 1) * stepH + 1 }, toothed(d)));
});
if (handleL > 0) cuts.push(translate([R + handleL, 0, -1], cylinder({ r: Math.min(5, tipR / 2), h: T + 2, $fn: 24 })));
return translate([-(R + handleL) / 2 + R / 2 - (handleL > 0 ? tipR / 2 : 0), 0, 0], difference(paddle, ...cuts));
`,
};
