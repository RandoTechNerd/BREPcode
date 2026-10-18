// A pair of wedges that tilt a laptop (or a keyboard) toward you: the
// machine's front edge rests against a lip and its underside on the slope,
// with air underneath. Each wedge is one side profile with a window through
// it, printed lying down so it needs no support.

export default {
  id: "laptop-stand",
  category: "desk",
  title: "Laptop stand",
  summary: "a pair of wedges that tilt a laptop or keyboard toward you, with a front lip and air underneath.",
  print: "lying on their side as shown, no supports. One wedge goes under each side of the laptop.",
  names: ["laptop stand", "laptop riser", "laptop holder", "macbook stand", "notebook computer stand",
    "laptop tilt stand", "laptop wedge", "laptop stand for desk", "laptop lift"],
  nouns: ["stand", "riser", "wedge", "lift"],
  keywords: ["laptop", "macbook", "notebook", "tilt", "angle", "desk", "keyboard"],
  fits: ["laptop", "keyboard"],
  fromSpec(s) {
    if (s.kind === "laptop") return { depth: Math.min(250, Math.max(100, s.dims.d * 0.9)) };
    return { depth: Math.min(250, Math.max(100, s.dims.d - 10)), angle: 7, frontH: 5, lipH: 4 };
  },
  ask: { unless: ["depth"], text: "Which laptop is it for? Name it (“for a MacBook Air”) and I’ll size the wedges to it; I made them 220 mm long." },
  tips: ["for a MacBook Pro 14", "20 degrees", "40 mm higher at the front"],
  examples: ["I want a laptop stand", "laptop stand for my macbook air at 20 degrees",
    "a keyboard tilt stand", "laptop riser 250mm deep"],
  params: {
    angle: { default: 15, min: 3, max: 35, unit: "deg", label: "tilt", say: ["angle", "tilt", "degree", "slope"], more: ["steeper"], less: ["flatter"] },
    depth: { default: 220, min: 100, max: 250, unit: "mm", label: "wedge length front to back", say: ["deep", "depth", "long", "length"], more: ["longer", "deeper"], less: ["shorter"] },
    frontH: { default: 20, min: 4, max: 60, unit: "mm", label: "height at the front", say: ["high", "height", "lift", "raise", "front"], more: ["higher", "taller"], less: ["lower"] },
    lipH: { default: 8, min: 0, max: 20, unit: "mm", label: "front lip height", say: ["lip", "stop"] },
    wedgeW: { default: 25, min: 10, max: 60, unit: "mm", label: "wedge width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 6, min: 4, max: 12, unit: "mm", label: "frame thickness", say: ["thick", "thickness", "frame"], more: ["sturdier", "thicker"] },
    pieces: { default: 2, min: 1, max: 2, unit: "count", label: "wedges", say: ["wedge", "piece"] },
  },
  things: [
    { names: ["keyboard tilt stand", "keyboard riser", "keyboard stand", "keyboard wedge", "keyboard incline"], title: "Keyboard tilt stand",
      params: { angle: 7, depth: 120, frontH: 5, lipH: 4, wedgeW: 20 } },
    { names: ["laptop cooling stand", "laptop cooling riser", "laptop cooler stand"], title: "Laptop cooling stand",
      params: { angle: 12, frontH: 40, wedgeW: 30 } },
    { names: ["steep laptop stand", "laptop stand for eye level", "ergonomic laptop stand"], title: "Steep laptop stand",
      params: { angle: 30, frontH: 30, wedgeW: 30, wall: 7 } },
    { names: ["gaming laptop stand", "big laptop stand"], title: "Gaming laptop stand", spec: "laptop-gaming",
      params: { angle: 12, frontH: 30, wedgeW: 35, wall: 8 } },
    { names: ["ipad keyboard stand", "tablet keyboard stand", "magic keyboard stand"], title: "Tablet keyboard stand", spec: "keyboard-magic",
      params: { angle: 6, frontH: 4, lipH: 3, wedgeW: 18 } },
  ],
  body: `
// side profile: x runs front to back, y runs up
const a = angle * Math.PI / 180;
const lipT = Math.max(4, wall * 0.7);
const D = depth;
const slope = (x) => frontH + (x - lipT) * Math.tan(a);  // the surface the laptop rests on
const backH = slope(D);
const outline = [[0, 0], [D, 0], [D, backH], [lipT, frontH], [lipT, frontH + lipH], [0, frontH + lipH]];
// window: the outline shrunk by \`wall\` all round
const m = wall;
const under = (x) => slope(x) - m / Math.cos(a);
const xF = lipT + m, xB = D - m;
let win = null;
if (under(xB) > m + 4) {
  if (under(xF) > m + 2) win = [[xF, m], [xB, m], [xB, under(xB)], [xF, under(xF)]];
  else {
    const x1 = lipT + (m + m / Math.cos(a) - frontH) / Math.tan(a);
    if (x1 < xB - 4) win = [[x1, m], [xB, m], [xB, under(xB)]];
  }
}
const wedge = () => {
  const body = linearExtrude({ h: wedgeW }, polygon(outline));
  return win ? difference(body, translate([0, 0, -1], linearExtrude({ h: wedgeW + 2 }, polygon(win)))) : body;
};
const rowH = Math.max(backH, frontH + lipH) + 8;
const wedges = Array.from({ length: pieces }, (_, i) => translate([-D / 2, i * rowH, 0], wedge()));
return translate([0, -(pieces * rowH - 8) / 2, 0], group(...wedges));
`,
};
