// A hook that snaps onto a car headrest post, for a bag, a purse or a coat.
// Everything is a plan-view outline extruded straight up from the bed: the
// snap ring round the post, an arm out from it, and a taller post at the
// arm's end that keeps a handle from sliding off. So nothing overhangs.
// Printed standing as it sits on the post.

export default {
  id: "headrest-hook",
  category: "vehicle",
  title: "Headrest hook",
  summary: "a hook that snaps onto a car headrest post to hang a bag, purse or coat behind the seat.",
  print: "upright as shown, no supports. PETG. Not load-rated: groceries, a bag, a coat; nothing heavy in a hard stop.",
  names: ["headrest hook", "car seat hook", "car headrest hook", "car purse hook", "car bag hook", "headrest hanger",
    "car seat hanger", "grocery bag hook for car", "car hook for bags", "back seat hook"],
  nouns: ["hook", "hanger", "headrest"],
  keywords: ["car", "headrest", "seat", "purse", "bag", "grocery", "handbag", "backseat"],
  primary: "postD",
  ask: {
    unless: ["postD"],
    text: "How thick is your headrest post? Most are 10 to 14 mm; I used 12. Measure it with the headrest raised.",
  },
  tips: ["for a 14 mm post", "two arms", "longer arm"],
  examples: ["I want a headrest hook", "make me a car seat hook for a 14mm post",
    "car purse hook with two arms", "headrest hanger for grocery bags"],
  params: {
    postD: { default: 12, min: 8, max: 16, unit: "mm", label: "headrest post diameter", say: ["post", "headrest", "rod", "diameter"] },
    grip: { default: 0.3, min: 0, max: 1, unit: "mm", label: "how much smaller than the post (grip)", say: ["grip", "tight"] },
    clipH: { default: 18, min: 10, max: 40, unit: "mm", label: "clip height along the post", say: ["clip", "tall"], more: ["taller"] },
    ringT: { default: 3.5, min: 2.4, max: 6, unit: "mm", label: "ring thickness", say: ["ring"], more: ["stronger", "stiffer"] },
    armL: { default: 40, min: 20, max: 90, unit: "mm", label: "arm length", say: ["arm", "long", "length", "reach"], more: ["longer"], less: ["shorter"] },
    armW: { default: 10, min: 6, max: 20, unit: "mm", label: "arm width", say: ["wide", "width"], more: ["wider"] },
    armH: { default: 10, min: 6, max: 25, unit: "mm", label: "arm height (its strength)", say: ["thick", "height"], more: ["thicker", "sturdier"] },
    tipH: { default: 14, min: 0, max: 40, unit: "mm", label: "tip post height above the arm", say: ["tip", "lip"] },
    arms: { default: 1, min: 1, max: 2, unit: "count", label: "arms (1 out the back, 2 to the sides)", say: ["arm", "hook"] },
  },
  things: [
    { names: ["double headrest hook", "double car seat hook", "two way headrest hook"], title: "Double headrest hook", params: { arms: 2 } },
    { names: ["purse hook for car", "handbag hook for car", "car handbag holder"], title: "Car purse hook", params: { armL: 35, tipH: 18 } },
    { names: ["car coat hook", "headrest coat hanger", "car seat coat hook"], title: "Car coat hook", params: { armL: 30, armH: 14, tipH: 20, armW: 14 } },
    { names: ["heavy headrest hook", "strong headrest hook"], title: "Heavy headrest hook", params: { armH: 16, armW: 14, ringT: 5, clipH: 26 } },
  ],
  body: `
const r = postD / 2 - grip;                      // a touch smaller: it grips
const ro = r + ringT;
const mouth = postD * 0.8;                        // narrower than the post: it snaps on
const ring = difference(
  cylinder({ r: ro, h: clipH, $fn: 64 }),
  translate([0, 0, -1], cylinder({ r, h: clipH + 2, $fn: 64 })),
  // the mouth faces forward (+x), away from the arms
  translate([0, -mouth / 2, -1], cube([ro + 1, mouth, clipH + 2])),
);
// one arm out the back, or one to each side
const dirs = arms === 2 ? [90, -90] : [180];
const tipT = Math.max(4, armW * 0.6);
const parts = dirs.flatMap((a) => [
  rotate([0, 0, a], translate([ro - 1, -armW / 2, 0], cube([armL + 1, armW, armH]))),
  rotate([0, 0, a], translate([ro + armL - tipT, -armW / 2, 0], cube([tipT, armW, armH + tipH]))),
]);
return union(ring, ...parts);
`,
};
