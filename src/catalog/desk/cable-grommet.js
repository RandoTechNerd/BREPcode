// A desk cable grommet: a flanged sleeve that lines the hole through the
// desktop, and a cap with a notch the cables come up through. Both are
// stacked cylinders printed flange-down, so the only faces that look down
// are on the bed.

export default {
  id: "cable-grommet",
  category: "desk",
  title: "Desk cable grommet",
  summary: "a flanged sleeve for the cable hole in a desk, with a notched cap the cables come up through.",
  print: "both pieces flange-down as shown, no supports.",
  names: ["desk grommet", "cable grommet", "grommet for desk", "desk cable grommet", "cable hole cover", "desk hole cover",
    "cable pass through", "cord grommet", "wire grommet", "desk cable hole", "cable port cover"],
  nouns: ["grommet"],
  keywords: ["desk", "hole", "cable", "cord", "wire", "pass"],
  fits: ["grommet"],
  primary: "holeD",
  fromSpec: (s) => ({ holeD: s.dims.d }),
  ask: { unless: ["holeD"], text: "How big is the hole in your desk? Most are 60 mm (2-3/8 in) or 80 mm; I made this one for 60 mm." },
  tips: ["80 mm", "for a 2 inch hole", "desk 30 mm thick", "no cap"],
  examples: ["I want a desk grommet", "cable grommet for an 80mm hole",
    "a desk grommet 60 mm for a 25 mm thick desk", "make a cable hole cover"],
  params: {
    holeD: { default: 60, min: 20, max: 120, unit: "mm", label: "hole diameter", say: ["hole", "diameter", "across", "size"], more: ["bigger", "larger"], less: ["smaller"] },
    deskT: { default: 20, min: 5, max: 60, unit: "mm", label: "sleeve depth (desk thickness)", say: ["deep", "depth", "thick", "thickness", "sleeve"] },
    flangeW: { default: 6, min: 2, max: 20, unit: "mm", label: "flange overlap round the hole", say: ["flange", "rim", "overlap"], more: ["wider"] },
    flangeT: { default: 3, min: 1.6, max: 6, unit: "mm", label: "flange thickness", say: ["flange"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "sleeve wall", say: ["wall"] },
    notchW: { default: 22, min: 0, max: 50, unit: "mm", label: "cable notch width (0 = none)", say: ["notch", "opening", "cable", "slot"] },
    cap: { default: "yes", unit: "choice", choices: ["no", "yes"], label: "cap",
      words: { no: ["no cap", "without cap", "without a cap", "open", "sleeve only", "ring only"], yes: ["with cap", "cap", "cover", "lid"] } },
  },
  things: [
    { names: ["2 inch desk grommet", "2 inch grommet", "50mm grommet", "2 inch cable grommet"], title: "2 inch desk grommet", spec: "grommet-51" },
    { names: ["80mm desk grommet", "80mm grommet", "large desk grommet", "big cable grommet"], title: "80 mm desk grommet", spec: "grommet-80" },
    { names: ["60mm desk grommet", "60mm grommet", "standard desk grommet"], title: "60 mm desk grommet", spec: "grommet-60" },
    { names: ["35mm cable grommet", "small cable grommet", "small desk grommet", "mini grommet"], title: "Small cable grommet", spec: "grommet-35",
      params: { notchW: 12, flangeW: 5 } },
    { names: ["grommet sleeve", "grommet ring", "desk hole liner", "open desk grommet"], title: "Grommet sleeve", params: { cap: "no" } },
    { names: ["thick desk grommet", "grommet for thick desk", "butcher block grommet"], title: "Grommet for a thick desk", params: { deskT: 40, wall: 3 } },
  ],
  body: `
// both pieces stand on their flanges; every face is vertical or looks up
const ro = holeD / 2 - 0.3;                      // slips into the hole
const ri = ro - wall;
const rf = holeD / 2 + flangeW;
const e = Math.min(1, flangeT / 3);              // the flange's top edge is bevelled
const ring = difference(
  union(cylinder({ r1: rf, r2: rf - e, h: flangeT }), translate([0, 0, flangeT / 2], cylinder({ r: ro, h: flangeT / 2 + deskT }))),
  translate([0, 0, -1], cylinder({ r: ri, h: flangeT + deskT + 2 })));
if (cap !== "yes") return ring;
// the cap: a disc over the flange, and a short collar that drops into the sleeve
const capT = Math.max(2, flangeT * 0.8);
const co = ri - 0.4, cw = Math.min(1.6, co / 3), ch = Math.min(8, deskT);
let lid = difference(union(cylinder({ r1: rf, r2: rf - e, h: capT }), translate([0, 0, capT / 2], cylinder({ r: co, h: capT / 2 + ch }))),
  translate([0, 0, capT + 0.01], cylinder({ r: co - cw, h: ch + 1 })));
const nw = Math.min(notchW, 1.6 * co);
if (nw > 0) lid = difference(lid, translate([co * 0.2, -nw / 2, -1], cube([rf, nw, capT + ch + 2])));
return group(ring, translate([2 * rf + 8, 0, 0], lid));
`,
};
