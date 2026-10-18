// A hose guide: a spool that drops over a stake or rebar at the corner of a
// bed, so a dragged hose rolls past instead of flattening the plants. A
// lathed hourglass printed upright: the lower flange slopes in (no
// overhang at any angle), the upper one flares out at 50 degrees. Capped,
// it also covers the sharp end of a rebar stake.

export default {
  id: "hose-guide",
  category: "garden",
  title: "Hose guide",
  summary: "a spool that sits on a stake or rebar at a bed corner so the hose rolls past the plants.",
  print: "upright as shown, no supports. It spins on the stake; ASA or PETG outdoors.",
  names: ["hose guide", "garden hose guide", "hose guide stake", "hose guide spool", "hose stake", "hose spool guide",
    "hose roller guide"],
  nouns: ["guide", "roller", "spool"],
  keywords: ["hose", "garden", "bed", "corner", "stake", "rebar", "drag"],
  fits: ["stake"],
  fromSpec: (s) => ({ stakeD: s.dims.d }),
  tips: ["for #3 rebar", "taller", "open top"],
  examples: ["I want a hose guide", "make me a garden hose guide for rebar",
    "hose guide 120mm tall with an open top", "a hose roller for the corner of my flower bed"],
  params: {
    stakeD: { default: 12.7, min: 6, max: 30, unit: "mm", label: "stake diameter it drops over", say: ["stake", "rebar", "rod", "pole"] },
    waistD: { default: 40, min: 24, max: 100, unit: "mm", label: "waist diameter (where the hose runs)", say: ["waist", "across", "diameter"] },
    flangeD: { default: 70, min: 35, max: 160, unit: "mm", label: "flange diameter", say: ["flange", "wide", "rim"], more: ["wider"], less: ["narrower"] },
    height: { default: 90, min: 40, max: 200, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    flangeH: { default: 6, min: 3, max: 20, unit: "mm", label: "flange thickness", say: ["thick"] },
    top: { default: "capped", unit: "choice", choices: ["capped", "open"], label: "top",
      words: { open: ["open top", "through hole", "open"], capped: ["capped", "closed top", "cap"] } },
  },
  things: [
    { names: ["hose roller", "spinning hose guide", "hose guide roller"], title: "Hose roller", params: { waistD: 50, flangeD: 80, top: "open" } },
    { names: ["flower bed hose guide", "corner hose guide", "garden bed hose guide", "raised bed hose guide"], title: "Bed corner hose guide", params: { height: 120 } },
    { names: ["rebar hose guide", "hose guide for rebar"], title: "Rebar hose guide", spec: "rebar-4" },
    { names: ["tall hose guide", "hose guide post"], title: "Tall hose guide", params: { height: 170, waistD: 45, flangeD: 80, flangeH: 8 } },
    { names: ["mini hose guide", "small hose guide", "soaker hose guide"], title: "Small hose guide", params: { height: 60, waistD: 30, flangeD: 50, flangeH: 4, stakeD: 9.5 } },
  ],
  body: `
const rb = stakeD / 2 + 0.5;                             // the bore: loose, so it spins
const rw = Math.max(waistD / 2, rb + 3);
const rf = Math.max(flangeD / 2, rw + 2);
const fh = Math.min(flangeH, height / 4);
const k = Math.tan(50 * Math.PI / 180);
const dr = Math.min(rf - rw, (height - 2 * fh - 2) / (1 + k));   // how far the flanges stand out
const z1 = fh + dr, z3 = height - fh, z2 = z3 - dr * k;
const spool = revolve(360, polygon([
  [0, 0], [rw + dr, 0], [rw + dr, fh], [rw, z1], [rw, z2], [rw + dr, z3], [rw + dr, height], [0, height],
]));
// a blind bore from below ends in a steep cone (no flat ceiling); open goes right through
const coneH = rb * 1.2;
const boreTop = top === "open" ? height + 1 : Math.max(10, height - 3 - coneH);
const cuts = [translate([0, 0, -1], cylinder({ r: rb, h: boreTop + 1, $fn: 32 }))];
if (top !== "open") cuts.push(translate([0, 0, boreTop - 0.01], cylinder({ r1: rb, r2: 0.2, h: coneH, $fn: 32 })));
return difference(spool, ...cuts);
`,
};
