// A side-release buckle for webbing, both halves printed flat side by side.
// The female is a sleeve with a window in each side; the male is a flat plate
// whose two outer arms carry barbs. Pushed home, the arms flex in past the
// mouth and the barbs spring out into the windows, their square backs
// catching the windows' front edges; squeeze the barbs and it lets go. A
// centre tongue keeps it straight. The sleeve's roof is the one bridge.

export default {
  id: "strap-buckle",
  category: "travel",
  title: "Side-release buckle",
  summary: "a two-part side-release buckle for webbing that prints flat, sized from the strap width.",
  print: "both halves flat, side by side, no supports; the female's roof is a short bridge. PETG or nylon. Not load-rated: bags and straps, never a harness or anything you hang from.",
  names: ["side release buckle", "strap buckle", "backpack buckle", "plastic buckle", "webbing buckle", "quick release buckle",
    "buckle clip", "snap buckle", "replacement buckle", "strap clip buckle"],
  nouns: ["buckle"],
  keywords: ["strap", "webbing", "backpack", "bag", "belt", "release", "clip", "luggage"],
  fits: ["webbing"],
  fromSpec: (s) => ({ strapW: s.dims.w }),
  bridgeArea: (v) => (v.strapW + 12) * (0.7 * v.strapW + 9) + 40,
  tips: ["for 1 inch webbing", "thicker", "stronger barbs"],
  examples: ["I want a side release buckle", "make me a strap buckle for 1 inch webbing",
    "backpack buckle for 20mm straps", "paracord bracelet buckle"],
  params: {
    strapW: { default: 25.4, min: 10, max: 52, unit: "mm", label: "webbing width", say: ["wide", "width"] },
    strapT: { default: 2.5, min: 1, max: 5, unit: "mm", label: "webbing thickness", say: ["thick"] },
    thick: { default: 8, min: 5, max: 14, unit: "mm", label: "buckle thickness", say: ["thickness"], more: ["thicker", "stronger"] },
    wall: { default: 1.8, min: 1.2, max: 3, unit: "mm", label: "sleeve wall", say: ["wall"] },
    armT: { default: 2.2, min: 1.4, max: 3.5, unit: "mm", label: "barb arm thickness (stiffness)", say: ["arm", "stiff"] },
    barb: { default: 1.2, min: 0.6, max: 2, unit: "mm", label: "barb height", say: ["barb", "catch"] },
    fit: { default: 0.3, min: 0.15, max: 0.6, unit: "mm", label: "clearance per side", say: ["fit", "clearance", "loose", "tight"] },
  },
  things: [
    { names: ["paracord bracelet buckle", "paracord buckle", "3/8 inch buckle", "bracelet buckle"], title: "Paracord bracelet buckle",
      params: { strapW: 10, strapT: 4.2, thick: 6, armT: 1.6, barb: 0.8, wall: 1.4 } },
    { names: ["5/8 inch buckle", "small strap buckle", "watch strap buckle"], title: "5/8 inch buckle", params: { strapW: 16, thick: 6.5, armT: 1.8, barb: 1 } },
    { names: ["chest strap buckle", "sternum strap buckle", "backpack chest buckle"], title: "Chest strap buckle", spec: "webbing-20mm", params: { thick: 7 } },
    { names: ["1 inch buckle", "1 inch side release buckle", "25mm buckle"], title: "1 inch buckle", spec: "webbing-1in" },
    { names: ["luggage strap buckle", "suitcase strap buckle", "1.5 inch buckle"], title: "Luggage strap buckle", spec: "webbing-38mm", params: { thick: 10, armT: 2.8, wall: 2.2 } },
    { names: ["2 inch buckle", "wide strap buckle", "cargo strap buckle"], title: "2 inch buckle", spec: "webbing-2in", params: { thick: 11, armT: 3.2, wall: 2.4, barb: 1.6 } },
  ],
  body: `
// x runs along the strap (the male goes in toward +x), y across it, z up
const S = strapW;
const sh = strapT + 0.8;                         // strap slot height
const Wf = S + 12;                               // the female's outside width
const Wc = Wf - 2 * wall;                        // its channel
const hc = thick - 2 * wall;
const Lc = 0.7 * S + 8;                          // channel length
const ww = Math.max(4, Math.min(7, S / 4));      // window length
const xw = Lc - ww - 3;                          // window front edge
const Lf = Lc + 1.5 + sh + 3.5;
// ---- female: a sleeve open at x = 0, windows in the sides, a strap bar at the back
const female = difference(
  translate([0, -Wf / 2, 0], cube([Lf, Wf, thick])),
  translate([-1, -Wc / 2, wall], cube([Lc + 1, Wc, hc])),
  translate([xw, -Wf / 2 - 1, wall], cube([ww, Wf + 2, hc])),
  translate([Lc + 1.5, -(S + 1) / 2, -1], cube([sh, S + 1, thick + 2])),
);
// ---- male: a flat plate that slides into the channel
const hm = hc - 2 * fit;
const Wm = Wc - 2 * fit;
const Lb = 3.5 + sh + 3;                         // its base, outside the sleeve
const Lp = xw + ww - 0.4;                        // arm tips stop short of the channel's end
const gw = Math.max(3, Wm - 2 * armT - 2 * (barb + 0.6));
const slab = (pts) => linearExtrude({ h: hm }, polygon(pts));
const rampL = Math.min(4, ww - 1);
const xb = xw + 0.3;                             // the barb's square back, just behind the window's front edge
const arm = (s) => slab([
  [-0.01, s * (Wm / 2 - armT)], [-0.01, s * Wm / 2], [xb, s * Wm / 2], [xb, s * (Wm / 2 + barb)],
  [xb + rampL, s * Wm / 2], [Lp, s * (Wm / 2 - 0.6)], [Lp, s * (Wm / 2 - armT)],
]);
const male = difference(
  union(
    translate([-Lb, -Wf / 2, 0], cube([Lb + 0.01, Wf, hm])),
    arm(1), arm(-1),
    translate([-0.01, -gw / 2, 0], cube([Lp - 1, gw, hm])),          // the centre tongue
  ),
  translate([-Lb + 3.5, -(S + 1) / 2, -1], cube([sh, S + 1, hm + 2])),
);
// side by side on the bed
return group(translate([2, 0, 0], female), translate([-Lb - 4, Wf + 8, 0], male));
`,
};
