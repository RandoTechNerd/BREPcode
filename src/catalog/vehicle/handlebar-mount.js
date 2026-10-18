// A clamp for a bike, scooter or motorcycle bar with something on it: a
// phone cradle on top, a bag hook below, or a second ring beside it for a
// pump or a U-lock. The clamp is a split ring closed by one bolt through two
// ears. Everything is in the bar's cross-section, so the whole part is one
// outline extruded along the bar and printed standing, bar axis vertical.

export default {
  id: "handlebar-mount",
  category: "vehicle",
  title: "Handlebar mount",
  summary: "a bolt-on bar clamp with a phone cradle, a bag hook, or a ring for a pump or U-lock.",
  print: "standing as shown (bar axis up), no supports. One M4 bolt and nut close the clamp. PETG.",
  names: ["handlebar mount", "handlebar clamp", "bar mount", "handlebar accessory mount", "bike handlebar mount",
    "scooter handlebar mount", "bar clamp mount", "handlebar holder"],
  nouns: ["mount", "clamp", "holder"],
  keywords: ["bike", "bicycle", "handlebar", "scooter", "motorcycle", "cycling", "bar", "ebike"],
  fits: ["bar", "phone"],
  fromSpec: (s) => s.kind === "bar" ? { barD: s.dims.d } : { phoneW: Math.round((s.dims.w + 2) * 10) / 10, phoneT: Math.round((s.dims.t + 3) * 10) / 10 },
  primary: "barD",
  ask: {
    unless: ["barD"],
    text: "Where does it clamp? Bars are 22.2 mm at the grips and 25.4, 31.8 or 35 mm by the stem; I used 22.2. Say it (“on a 31.8 bar”).",
  },
  tips: ["on a 31.8 bar", "for a Pixel 9", "a bag hook instead", "wider"],
  examples: ["I want a bike phone mount", "make me a handlebar phone holder for a 31.8mm bar",
    "scooter bag hook", "frame pump holder for my bike"],
  params: {
    top: { default: "phone", unit: "choice", choices: ["phone", "hook", "ring"], label: "what it carries",
      words: { hook: ["hook", "bag hook", "bags"], ring: ["pump", "lock", "u lock", "ring"], phone: ["phone", "cradle"] } },
    barD: { default: 22.2, min: 15, max: 40, unit: "mm", label: "bar diameter", say: ["bar", "handlebar", "tube", "diameter", "stem"] },
    width: { default: 20, min: 12, max: 60, unit: "mm", label: "clamp width along the bar", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    ringT: { default: 4, min: 3, max: 7, unit: "mm", label: "clamp ring thickness", say: ["ring", "thick"], more: ["stronger", "stiffer"] },
    screwD: { default: 4.4, min: 3, max: 6, unit: "mm", label: "clamp bolt hole", say: ["bolt", "screw"] },
    phoneW: { default: 80, min: 55, max: 100, unit: "mm", label: "phone width with its case", say: [] },
    phoneT: { default: 12, min: 6, max: 20, unit: "mm", label: "phone thickness with its case", say: ["case", "thickness"] },
    itemD: { default: 25, min: 8, max: 50, unit: "mm", label: "ring size (pump or lock shackle)", say: ["pump", "shackle", "lock"] },
    drop: { default: 30, min: 10, max: 80, unit: "mm", label: "hook drop below the bar", say: ["drop", "below"] },
    hookW: { default: 30, min: 15, max: 60, unit: "mm", label: "hook width (room for handles)", say: ["hook", "handle"] },
  },
  things: [
    { names: ["bike phone mount", "bike phone holder", "bicycle phone holder", "handlebar phone mount", "handlebar phone holder",
      "scooter phone holder", "motorcycle phone mount", "bike phone clamp"], title: "Bike phone mount", params: { top: "phone", width: 45 } },
    { names: ["scooter bag hook", "scooter hook", "handlebar bag hook", "bike bag hook", "e scooter hook", "handlebar hook", "scooter grocery hook"],
      title: "Handlebar bag hook", params: { top: "hook", width: 18 } },
    { names: ["frame pump holder", "bike pump holder", "bike pump mount", "pump clip", "bike pump clip"], title: "Frame pump holder",
      params: { top: "ring", itemD: 25, barD: 35 } },
    { names: ["u lock holder", "bike lock holder", "bike lock mount", "u lock mount", "bike lock bracket"], title: "U-lock holder",
      params: { top: "ring", itemD: 16, barD: 35, width: 25 } },
  ],
  body: `
// cross-section: the bar runs along z; y is up on the bike, x is fore and aft
const r = barD / 2 + 0.2;                        // a hair of room: the bolt does the gripping
const ro = r + ringT;
const gap = Math.max(2, ringT / 2);              // the split the bolt closes
const earL = 7 + screwD, earT = 4.5;
const plate = (pts) => linearExtrude({ h: width }, polygon(pts));
const box = (x0, y0, x1, y1) => plate([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
const parts = [
  cylinder({ r: ro, h: width, $fn: 72 }),
  box(-ro - earL, gap / 2, -r + 0.5, gap / 2 + earT),           // the two ears, behind the bar
  box(-ro - earL, -gap / 2 - earT, -r + 0.5, -gap / 2),
];
const cuts = [
  translate([0, 0, -1], cylinder({ r, h: width + 2, $fn: 72 })),
  translate([-ro - earL - 1, -gap / 2, -1], cube([earL + ringT + 2, gap, width + 2])),
  // the bolt, across both ears
  translate([-ro - earL / 2, gap / 2 + earT + 1, width / 2], rotate([90, 0, 0], cylinder({ r: screwD / 2, h: gap + 2 * earT + 2, $fn: 24 }))),
];
if (top === "phone") {
  // a cradle on a stem above the bar; the phone slides in along the bar and is gripped by its long edges
  const sw = 12, yb = ro + 6;
  const iw = phoneW + 1, wl = 3;
  const inner = wl + phoneT + 1;                 // floor, phone, room
  parts.push(box(-sw / 2, r + 1, sw / 2, yb + 0.01));
  parts.push(box(-iw / 2 - wl, yb, iw / 2 + wl, yb + wl));
  for (const s of [-1, 1]) {
    parts.push(plate([[s * iw / 2, yb], [s * (iw / 2 + wl), yb], [s * (iw / 2 + wl), yb + inner + wl], [s * iw / 2, yb + inner + wl]]));
    parts.push(plate([[s * (iw / 2 - 4), yb + inner], [s * (iw / 2 + 0.01), yb + inner], [s * (iw / 2 + 0.01), yb + inner + wl], [s * (iw / 2 - 4), yb + inner + wl]]));
  }
  parts.push(translate([0, 0, 0], linearExtrude({ h: 2 }, polygon([[-iw / 2, yb], [iw / 2, yb], [iw / 2, yb + inner + wl], [-iw / 2, yb + inner + wl]]))));
} else if (top === "hook") {
  // a stem down from the bar, then a squared J that bag handles sit in
  const sw = 10, yb = -(ro + drop), ht = 6, tipH = 14;
  parts.push(box(-sw / 2, yb, sw / 2, -r - 1));
  parts.push(box(-sw / 2, yb - ht, hookW + sw / 2, yb + 0.01));
  parts.push(box(hookW + sw / 2 - 6, yb - ht, hookW + sw / 2, yb + tipH));
} else {
  // a second ring beside the bar, its mouth facing away, for a pump or a lock shackle
  const ri = itemD / 2, rr = ri + 3;
  const cx = ro + rr - 1.5;
  parts.push(translate([cx, 0, 0], cylinder({ r: rr, h: width, $fn: 64 })));
  cuts.push(translate([cx, 0, -1], cylinder({ r: ri, h: width + 2, $fn: 64 })));
  cuts.push(translate([cx + ri * 0.5, -ri * 0.8, -1], cube([rr, ri * 1.6, width + 2])));
}
return difference(union(...parts), ...cuts);
`,
};
