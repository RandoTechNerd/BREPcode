// A plant clip: two C-shaped rings back to back, one snapping onto a stake
// or cane, the other closing round a stem. Printed flat, so the rings flex
// in the plane they open in. With a big stem ring it is a support hoop.

export default {
  id: "plant-clip",
  category: "garden",
  title: "Plant clip",
  summary: "a snap-on clip that holds a stem to a stake, cane or trellis; a big one is a support ring.",
  print: "flat as shown, no supports. PETG flexes without cracking; print a few spare.",
  names: ["plant clip", "plant support clip", "garden clip", "stake clip", "plant stake clip", "stem clip",
    "cane clip", "plant support ring", "plant ring"],
  nouns: ["clip", "ring", "support"],
  keywords: ["plant", "stem", "stake", "cane", "vine", "tomato", "trellis", "garden", "bamboo"],
  fits: ["stake"],
  fromSpec: (s) => ({ stakeD: s.dims.d + 0.4 }),
  primary: "stemD",
  tips: ["for a bamboo cane", "20 mm stem", "closed stem loop"],
  examples: ["I want a plant clip", "make me a clip for my tomato plant",
    "plant clip for a bamboo cane", "plant support ring 150mm across"],
  params: {
    stakeD: { default: 10, min: 3, max: 30, unit: "mm", label: "stake or cane diameter", say: ["stake", "cane", "pole", "rod"] },
    stemD: { default: 15, min: 4, max: 200, unit: "mm", label: "stem loop diameter", say: ["stem", "loop", "across", "diameter"], more: ["bigger", "larger"], less: ["smaller"] },
    ringW: { default: 3, min: 1.6, max: 8, unit: "mm", label: "ring band width", say: ["band", "ring"], more: ["stronger", "stiffer"] },
    height: { default: 8, min: 4, max: 20, unit: "mm", label: "clip height", say: ["tall", "high", "height", "thick"] },
    stemGap: { default: 0.6, min: 0, max: 0.9, unit: "ratio", label: "stem loop opening (0 = closed)", say: ["opening"] },
    stakeGap: { default: 0.75, min: 0, max: 0.9, unit: "ratio", label: "stake opening (0 = closed)", say: ["snap"] },
  },
  things: [
    { names: ["tomato clip", "tomato plant clip", "tomato stake clip", "tomato support clip"], title: "Tomato clip", params: { stemD: 18, stakeD: 11 } },
    { names: ["trellis clip", "trellis net clip", "vine clip", "climbing plant clip"], title: "Trellis clip", params: { stemD: 12, stakeD: 5, ringW: 2.4, height: 6 } },
    { names: ["orchid clip", "orchid stem clip", "orchid support clip"], title: "Orchid clip", params: { stemD: 8, stakeD: 5, ringW: 2, height: 6 } },
    { names: ["bamboo cane clip", "bamboo stake clip"], title: "Bamboo cane clip", spec: "bamboo-cane", params: { stemD: 14 } },
    { names: ["stake connector", "cane connector", "stake cross clip"], title: "Stake connector", params: { stemD: 10.4, stemGap: 0.75, ringW: 3.5, height: 10 } },
    { names: ["peony ring", "peony support ring", "plant support hoop"], title: "Peony support ring", params: { stemD: 200, stakeD: 11, ringW: 5, height: 10, stemGap: 0 } },
    { names: ["pepper plant clip", "cucumber clip", "eggplant clip"], title: "Pepper plant clip", params: { stemD: 14, stakeD: 11 } },
    { names: ["houseplant support ring", "monstera support ring"], title: "Houseplant support ring", params: { stemD: 120, stakeD: 10, ringW: 4, stemGap: 0.15 } },
  ],
  body: `
// a C: a ring band of inner radius ri, opening a chord g wide, facing angle face
const C = (ri, w, g, face, n = 48) => {
  const ro = ri + w;
  if (g <= 0) return difference(cylinder({ r: ro, h: height, $fn: n }), translate([0, 0, -1], cylinder({ r: ri, h: height + 2, $fn: n })));
  const ai = Math.asin(Math.min(0.95, g / 2 / ri)), ao = Math.asin(Math.min(0.95, g / 2 / ro));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = face + ao + (2 * Math.PI - 2 * ao) * i / n; pts.push([ro * Math.cos(t), ro * Math.sin(t)]); }
  for (let i = n; i >= 0; i--) { const t = face + ai + (2 * Math.PI - 2 * ai) * i / n; pts.push([ri * Math.cos(t), ri * Math.sin(t)]); }
  return linearExtrude({ h: height }, polygon(pts));
};
const rs = stakeD / 2, rt = stemD / 2;
const d = rs + ringW + rt + ringW * 0.5 + 1.5;            // centre to centre, with a short neck
const neck = translate([rs + ringW * 0.5, -Math.max(ringW, 3) / 2, 0], cube([d - rs - rt - ringW * 1, Math.max(ringW, 3), height]));
const stake = C(rs, ringW, stakeGap * stakeD, Math.PI);
const stem = translate([d, 0, 0], C(rt, ringW, stemGap * stemD, 0, stemD > 60 ? 96 : 48));
return translate([-d / 2, 0, 0], union(stake, neck, stem));
`,
};
