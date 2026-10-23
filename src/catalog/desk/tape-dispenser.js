// A weighted-looking desk tape dispenser in three printed pieces: the body
// (a side profile with a trough for the roll, U-notches for the axle and a
// serrated front edge to tear against), a hub that fills the roll's core,
// and an axle pin. Every piece is a vertical extrusion or stack of them, so
// none needs support; the serrations are vertical ridges whose top edge is
// the cutter.

export default {
  id: "tape-dispenser",
  category: "desk",
  title: "Tape dispenser",
  summary: "a desk tape dispenser with a serrated tear edge, a hub for the roll's core and an axle pin.",
  print: "all three pieces as shown, no supports. The hub slides into the roll, the pin through the hub, and the pin drops into the notches.",
  names: ["tape dispenser", "desk tape dispenser", "tape holder", "tape roll holder", "tape cutter", "sticky tape dispenser"],
  nouns: ["dispenser"],
  keywords: ["tape", "roll", "desk", "office", "scotch"],
  fits: ["tape"],
  fromSpec: (s) => ({ tapeW: s.dims.w, coreD: s.dims.core, rollD: s.dims.d + 10 }),
  ask: { unless: ["tapeW", "coreD"], text: "What tape is it for? Say “for masking tape” or “for washi tape”; I sized it for a 3/4 inch roll of office tape on a 1 inch core." },
  tips: ["for masking tape", "24 mm tape", "3 inch core"],
  examples: ["I want a tape dispenser", "a tape dispenser for masking tape",
    "scotch tape dispenser for my desk", "tape holder for 24mm tape on a 3 inch core"],
  params: {
    tapeW: { default: 19, min: 9, max: 52, unit: "mm", label: "tape width", say: ["tape", "wide", "width"], more: ["wider"], less: ["narrower"] },
    coreD: { default: 25.4, min: 20, max: 80, unit: "mm", label: "roll core inside diameter", say: ["core", "inside"] },
    rollD: { default: 65, min: 35, max: 150, unit: "mm", label: "largest roll diameter", say: ["roll", "diameter", "across", "outside"], more: ["bigger"], less: ["smaller"] },
    side: { default: 6, min: 3, max: 12, unit: "mm", label: "side wall thickness", say: ["side", "wall"] },
    foot: { default: 10, min: 0, max: 30, unit: "mm", label: "extra foot each side", say: ["foot", "base", "stable"], more: ["steadier", "stabler"] },
    axleD: { default: 8, min: 5, max: 12, unit: "mm", label: "axle pin diameter", say: ["axle", "pin"] },
  },
  things: [
    { names: ["scotch tape dispenser", "clear tape dispenser", "office tape dispenser", "magic tape dispenser", "sellotape dispenser"],
      title: "Scotch tape dispenser", spec: "tape-scotch" },
    { names: ["masking tape dispenser", "painters tape dispenser", "masking tape holder"],
      title: "Masking tape dispenser", spec: "tape-masking", params: { side: 8, foot: 14 } },
    { names: ["washi tape dispenser", "washi tape holder", "decorative tape dispenser"], title: "Washi tape dispenser", spec: "tape-washi",
      params: { side: 5, foot: 8 } },
    { names: ["wide tape dispenser", "1 inch tape dispenser"], title: "Wide tape dispenser", params: { tapeW: 25, rollD: 75 } },
  ],
  body: `
// body side profile: x runs front to back, y runs up; pushed across the tape's width along z
const ar = axleD / 2;
const R = rollD / 2;
const flr = Math.min(4, side);
const za = R + flr + 3;                          // axle height: the roll clears the floor
const noseL = Math.max(14, axleD * 2);
const xa = noseL + R + 4;                        // axle position
const L = xa + R + 10;
const tw = tapeW + 1.5;                          // room for the roll between the side walls
const W = tw + 2 * side;
const hTop = za + ar + 6;
const sideProfile = [[0, 0], [L, 0], [L, za * 0.8], [Math.min(L - 2, xa + 14), hTop], [xa - 14, hTop], [noseL + 2, za], [0, za]];
let body = translate([0, W, 0], rotate([90, 0, 0], linearExtrude({ h: W }, polygon(sideProfile))));
if (foot > 0) {
  const fr = Math.min(8, foot);
  body = union(body, hull(...[[fr, fr - foot], [L - fr, fr - foot], [fr, W + foot - fr], [L - fr, W + foot - fr]].map(([x, y]) =>
    translate([x, y, 0], cylinder({ r: fr, h: 4, $fn: 32 })))));
}
// the trough for the roll, and a U-notch through each side wall for the pin
const aw = axleD + 0.6;
const cuts = [
  translate([noseL, side, flr], cube([L - noseL - 6, tw, hTop])),
  translate([xa - aw / 2, -foot - 1, za], cube([aw, W + 2 * foot + 2, hTop])),
  translate([xa, -foot - 1, za], rotate([-90, 0, 0], cylinder({ r: aw / 2, h: W + 2 * foot + 2, $fn: 32 }))),
];
// serrations: vertical V-grooves across the nose's front face, whose top edge cuts the tape
const pitchT = Math.max(2.5, side * 0.5);
const nT = Math.max(2, Math.floor(W / pitchT));
for (let i = 0; i < nT; i++) {
  const y = (W - nT * pitchT) / 2 + (i + 0.5) * pitchT;
  cuts.push(translate([0, 0, -1], linearExtrude({ h: za + 2 }, polygon([[-1, y - pitchT / 2 - 0.2], [1.6, y], [-1, y + pitchT / 2 + 0.2]]))));
}
body = difference(body, ...cuts);
// the hub fills the core; the pin goes through the hub and rests in the notches
const hr = coreD / 2 - 0.3, hl = tw - 1;
const bore = ar + 0.3;
const hub = hr - bore < 7
  ? difference(cylinder({ r: hr, h: hl, $fn: 64 }), translate([0, 0, -1], cylinder({ r: bore, h: hl + 2, $fn: 32 })))
  : union(
    difference(cylinder({ r: hr, h: hl, $fn: 64 }), translate([0, 0, -1], cylinder({ r: hr - 2.4, h: hl + 2, $fn: 64 }))),
    difference(cylinder({ r: bore + 2.4, h: hl, $fn: 32 }), translate([0, 0, -1], cylinder({ r: bore, h: hl + 2, $fn: 32 }))),
    ...[0, 120, 240].map((a) => rotate([0, 0, a], translate([bore + 1.5, -1.2, 0], cube([hr - bore - 2.5, 2.4, hl])))),
  );
const pin = cylinder({ r: ar, h: W - 0.5, $fn: 32 });
return translate([-L / 2, -W / 2, 0], group(body, translate([L + hr + 10, W / 2, 0], hub), translate([L + 2 * hr + ar + 18, W / 2, 0], pin)));
`,
};
