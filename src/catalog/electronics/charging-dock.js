// A charging dock for an earbud case, or the round puck of a watch
// charger. The case stands in a pocket with its charging plug coming up
// through the floor; the cable runs out the back through a tunnel along the
// bed whose roof is a 45 degree peak, not a flat bridge. A puck lies in a
// round pocket and its cable leaves through a groove in the top. Sized from
// the cases' and pucks' published dimensions.

export default {
  id: "charging-dock",
  category: "electronics",
  title: "Charging dock",
  summary: "a dock that holds an earbud case on its charging plug, or a watch charger puck, with the cable routed out the back.",
  print: "upright as shown, no supports. Push the plug up through the slot from below.",
  names: ["charging dock", "charger dock", "earbud dock", "earbuds charging stand", "earbud case holder", "earbuds holder",
    "earbud stand", "earbud charging dock", "earbuds dock", "charging cradle", "watch charger dock", "watch charging dock"],
  nouns: ["dock", "cradle"],
  keywords: ["charging", "charger", "earbud", "earbuds", "airpods", "buds", "watch", "nightstand", "puck"],
  fits: ["case", "puck"],
  fromSpec: (s) => s.kind === "puck"
    ? { devW: s.dims.d, devT: s.dims.d, pocket: s.dims.t + 0.5, form: "round", plugW: 0 }
    : { devW: s.dims.w, devT: s.dims.t, pocket: Math.min(30, Math.max(8, s.dims.h * 0.35)), form: "rect" },
  specNote: "with 0.4 mm of room each side",
  ask: {
    unless: ["devW"],
    text: "Which case or charger is it for? Name it (“for AirPods Pro”, “Galaxy Buds”, “Apple Watch charger”) and I’ll size the pocket; I used AirPods Pro 2.",
  },
  tips: ["for Galaxy Buds", "for an Apple Watch charger", "deeper pocket"],
  examples: ["make me a charging dock", "an airpods pro charging stand",
    "earbud dock for galaxy buds", "a watch charger dock for my apple watch"],
  params: {
    devW: { default: 60.6, min: 10, max: 120, unit: "mm", label: "case width (or puck diameter)", say: ["wide", "width", "diameter", "across"] },
    devT: { default: 21.7, min: 5, max: 60, unit: "mm", label: "case thickness", say: ["thick", "thickness"] },
    pocket: { default: 15, min: 4, max: 50, unit: "mm", label: "pocket depth", say: ["pocket", "deep", "depth"], more: ["deeper"], less: ["shallower"] },
    plugW: { default: 12, min: 0, max: 20, unit: "mm", label: "plug slot width (0 = cable out the top)", say: ["plug", "connector"] },
    cableD: { default: 4, min: 2, max: 8, unit: "mm", label: "cable diameter", say: ["cable", "cord", "wire"] },
    baseH: { default: 14, min: 6, max: 40, unit: "mm", label: "base under the pocket", say: ["base", "tall", "high", "height"] },
    wall: { default: 3, min: 2, max: 8, unit: "mm", label: "wall thickness", say: ["wall"] },
    form: { default: "rect", unit: "choice", choices: ["rect", "round"], label: "pocket shape",
      words: { round: ["round", "puck", "circular", "watch"], rect: ["rectangular", "square"] } },
  },
  things: [
    { names: ["airpods dock", "airpods charging stand", "airpods pro charging stand", "airpods holder", "airpods pro dock", "airpods pro stand", "airpods stand"],
      title: "AirPods Pro dock", spec: "case-airpods-pro-2" },
    { names: ["airpods 4 dock", "airpods 4 stand", "airpods 4 holder"], title: "AirPods 4 dock", spec: "case-airpods-4" },
    { names: ["galaxy buds dock", "galaxy buds stand", "galaxy buds holder", "galaxy buds charging stand", "samsung buds dock"], title: "Galaxy Buds dock", spec: "case-galaxy-buds-2-pro" },
    { names: ["pixel buds dock", "pixel buds stand", "pixel buds holder", "pixel buds charging stand"], title: "Pixel Buds dock", spec: "case-pixel-buds-pro" },
    { names: ["apple watch charger dock", "apple watch charging dock", "apple watch puck holder", "apple watch charger holder", "watch puck holder"],
      title: "Apple Watch charger dock", spec: "puck-apple-watch", params: { baseH: 10 } },
    { names: ["power bank dock", "power bank stand"], title: "Power bank dock", params: { devW: 70, devT: 25, pocket: 25, plugW: 12, baseH: 16 } },
  ],
  body: `
const fit = Math.min(0.4, wall / 5);
const round = form === "round";
const pw = devW + 2 * fit, pt = (round ? devW : devT) + 2 * fit;
const W = Math.max(pw + 2 * wall, 40), D = Math.max(pt + 2 * wall, 40);
const H = baseH + pocket;
const rounded = (w, d, h, r, z = 0) => hull(...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
  translate([sx * (w / 2 - r), sy * (d / 2 - r), z], cylinder({ r, h, $fn: 32 }))));
const block = rounded(W, D, H, Math.min(8, W / 4, D / 4));
const cuts = [round
  ? translate([0, 0, baseH], cylinder({ d: pw, h: pocket + 1, $fn: 64 }))
  : rounded(pw, pt, pocket + 1, Math.min(pt / 2 - 0.1, 6), baseH)];
const ct = cableD + 1.5;                             // cable channel width
if (plugW > 0 && !round) {
  // the plug comes up through the floor; its cable leaves along the bed under a 45 degree roof
  const pT = Math.min(8, pt - 2);
  cuts.push(translate([-plugW / 2, -pT / 2, -1], cube([plugW, pT, baseH + 1.01])));
  const th = Math.min(cableD + 1, baseH - 4);
  // rotate([90, 0, 0]) keeps the profile's x, sends its y to z, and the extrusion to -y
  cuts.push(translate([0, D / 2 + 1, 0], rotate([90, 0, 0], linearExtrude({ h: D / 2 + 1 },
    polygon([[-ct / 2, -1], [ct / 2, -1], [ct / 2, th], [0, th + ct / 2], [-ct / 2, th]])))));
} else {
  // the cable leaves the pocket through a groove in the top, out the back
  cuts.push(translate([-ct / 2, 0, baseH], cube([ct, D / 2 + 1, pocket + 1])));
}
return difference(block, ...cuts);
`,
};
