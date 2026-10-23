// An under-desk hook: a plate screwed up into the underside of the desk, a
// drop, and a wide U the headband (or a bag strap) rests in. One flat
// profile, printed on its side, so the bend that takes the weight has its
// layers running round it rather than across it.

export default {
  id: "headphone-hanger",
  category: "desk",
  title: "Under-desk headphone hanger",
  summary: "screws up under a desk and holds headphones (or a bag) in a wide U.",
  print: "on its side as shown, no supports. Screws go up through the plate into the desk.",
  names: ["headphone hanger", "headphone hook", "headphone holder", "headset holder", "headset hanger",
    "under desk hook", "hook under desk", "under desk headphone hanger", "desk hook", "headphone mount"],
  nouns: ["hook", "hanger", "holder", "mount"],
  keywords: ["headphone", "headset", "desk", "under", "gaming"],
  tips: ["50 mm wide", "hang it 60 mm lower", "bigger saddle"],
  examples: ["I want a headphone hanger", "under desk hook for my headset",
    "headphone holder that screws under the desk, 50mm wide", "a hook under my desk for my backpack"],
  params: {
    bandW: { default: 40, min: 15, max: 90, unit: "mm", label: "hook width", say: ["wide", "width", "band"], more: ["wider"], less: ["narrower"] },
    drop: { default: 40, min: 15, max: 140, unit: "mm", label: "how far below the desk it hangs", say: ["drop", "low", "hang", "below", "down"], more: ["lower", "longer"], less: ["higher", "shorter"] },
    saddleR: { default: 16, min: 6, max: 45, unit: "mm", label: "inside radius of the U", say: ["saddle", "radius", "u"], more: ["bigger", "larger"], less: ["smaller"] },
    lipH: { default: 14, min: 4, max: 50, unit: "mm", label: "front lip height", say: ["lip"] },
    plateL: { default: 60, min: 35, max: 140, unit: "mm", label: "mounting plate length", say: ["plate", "length", "long"] },
    wall: { default: 6, min: 4, max: 12, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["stronger", "thicker", "sturdier"] },
    screwD: { default: 4, min: 3, max: 5.5, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["bag hook under desk", "under desk bag hook", "purse hook", "backpack hook", "under desk backpack hook"],
      title: "Under-desk bag hook", keywords: ["backpack", "bag", "purse", "handbag"], params: { bandW: 30, drop: 50, saddleR: 20, wall: 8, lipH: 22 } },
    { names: ["gaming headset holder", "headset stand under desk"], title: "Headset hanger", keywords: ["gaming", "headset"], params: { bandW: 50, saddleR: 20 } },
    { names: ["controller hook", "controller hanger"], title: "Controller hanger", keywords: ["controller", "gamepad"], params: { bandW: 30, drop: 30, saddleR: 12, lipH: 18 } },
  ],
  body: `
// side profile: x runs along the desk, y runs up (desk underside at y = 0)
const ro = saddleR + wall;
const dropX = plateL - wall;                     // the drop hangs from the far end
const cx = dropX + wall + saddleR, cy = -drop;
const arc = (r, a0, a1, N = 32) => Array.from({ length: N + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / N;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
});
const outline = [
  [0, 0], [0, -wall], [dropX, -wall], [dropX, cy],
  ...arc(ro, Math.PI, 2 * Math.PI),              // down round the outside of the U
  [cx + ro, cy + lipH], [cx + saddleR, cy + lipH],
  ...arc(saddleR, 2 * Math.PI, Math.PI),         // back round the inside
  [dropX + wall, 0],
];
const piece = linearExtrude({ h: bandW }, polygon(outline));

// screw holes up through the plate, countersunk from below
const k = screwD / 2;
const xs = plateL >= 45 ? [10, dropX - 8] : [plateL / 2 - 4];
const holes = xs.flatMap((x) => [
  translate([x, 1, bandW / 2], rotate([90, 0, 0], cylinder({ r: screwD / 2, h: wall + 2, $fn: 24 }))),
  translate([x, -wall + k - 0.02, bandW / 2], rotate([90, 0, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]);
return translate([0, drop + ro, 0], difference(piece, ...holes));
`,
};
