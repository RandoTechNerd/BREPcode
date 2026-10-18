// An egg tray: a grid of cups, each a lathed cup whose hollow is the lower
// half of an egg (a half ellipsoid), on a thin base that ties them together.
// The cups overlap a little so the tray is one solid even without the base.
// Inside, the bowls face up and the outsides are straight, so it prints
// upright with no support.

export default {
  id: "egg-tray",
  category: "kitchen",
  title: "Egg holder",
  summary: "a tray of egg-shaped cups for the fridge or the counter, sized to the eggs.",
  print: "upright as shown, no supports. PETG if it lives in the fridge door.",
  names: ["egg holder", "egg tray", "egg storage", "egg organizer", "fridge egg tray", "egg rack", "egg storage tray",
    "egg crate", "egg carton", "refrigerator egg holder"],
  nouns: ["tray", "rack", "carton"],
  keywords: ["egg", "eggs", "fridge", "refrigerator", "dozen", "kitchen"],
  fits: ["egg"],
  fromSpec: (s) => ({ eggD: s.dims.d, depthP: Math.min(36, Math.max(10, s.dims.len * 0.38)) }),
  specNote: "each cup allows a millimetre round the egg",
  primary: "eggD",
  tips: ["18 eggs", "2 rows", "deeper cups"],
  examples: ["I want an egg holder", "make me an egg tray for 6 eggs in 2 rows",
    "fridge egg tray for 12 eggs", "egg holder for duck eggs"],
  params: {
    eggs: { default: 12, min: 1, max: 36, unit: "count", label: "number of eggs", say: ["egg", "eggs", "cup", "cups"] },
    rows: { default: 3, min: 1, max: 6, unit: "count", label: "rows", say: ["row", "rows"] },
    eggD: { default: 44, min: 22, max: 62, unit: "mm", label: "egg diameter", say: ["diameter", "across"], more: ["bigger"], less: ["smaller"] },
    depthP: { default: 21, min: 8, max: 36, unit: "mm", label: "cup depth", say: ["deep", "depth", "cup"], more: ["deeper"], less: ["shallower"] },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "cup wall at the rim", say: ["wall", "thick"] },
    floorT: { default: 2, min: 1.2, max: 5, unit: "mm", label: "base thickness", say: ["floor", "base"] },
  },
  things: [
    { names: ["6 egg holder", "half dozen egg holder", "six egg holder", "half dozen egg tray"], title: "6-egg holder", params: { eggs: 6, rows: 2 } },
    { names: ["dozen egg holder", "12 egg holder", "dozen egg tray", "twelve egg tray"], title: "12-egg holder", params: { eggs: 12, rows: 3 } },
    { names: ["egg cup", "boiled egg cup", "soft boiled egg cup", "egg cup holder"], title: "Egg cup", params: { eggs: 1, rows: 1, depthP: 26, wall: 2.4, floorT: 3 } },
    { names: ["quail egg tray", "quail egg holder", "quail egg storage"], title: "Quail egg tray", spec: "egg-quail", params: { eggs: 24, rows: 4 } },
    { names: ["duck egg tray", "duck egg holder"], title: "Duck egg tray", spec: "egg-duck", params: { eggs: 6, rows: 2 } },
    { names: ["jumbo egg tray", "large egg tray", "extra large egg holder"], title: "Jumbo egg tray", spec: "egg-jumbo", params: { eggs: 12, rows: 3 } },
    { names: ["egg door tray", "fridge door egg holder", "egg strip"], title: "Fridge door egg strip", params: { eggs: 6, rows: 1 } },
  ],
  body: `
const a = eggD / 2 + 1;                          // the hollow, a millimetre round the egg
const Rc = a + wall;
const H = floorT + depthP;
const pitch = 2 * Rc - wall * 0.5;               // neighbours overlap so the tray is one piece
// one cup: a cylinder with the lower half of an egg hollowed out of it
const half = (n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const t = (Math.PI / 2) * i / n;
  return [a * Math.sin(t), H - depthP * Math.cos(t)];
});
const cupAt = (x, y) => translate([x, y, 0], difference(
  cylinder({ r: Rc, h: H, $fn: 40 }),
  revolve({ angle: 360, $fn: 40 }, polygon([[0, floorT], ...half().slice(1), [a, H + 1], [0, H + 1]])),
));
const nr = Math.min(rows, eggs), nc = Math.ceil(eggs / nr);
const W = (nc - 1) * pitch, Dp = (nr - 1) * pitch;
const cups = [];
for (let k = 0; k < eggs; k++) cups.push(cupAt((k % nc) * pitch - W / 2, Math.floor(k / nc) * pitch - Dp / 2));
const r = Rc * 0.6;
const base = hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (W / 2 + Rc - r), sy * (Dp / 2 + Rc - r), 0], cylinder({ r, h: floorT, $fn: 32 }))));
return union(base, ...cups);
`,
};
