// A flat winder for rope, line and shop cords: two wide ears and a narrow
// waist between them, so the turns stay put. A slot in one ear grips the
// end and a hole in the other hangs it on a nail. Flat, so it prints in
// minutes. (Charger and extension-cord winders are electronics' cable winder.)

export default {
  id: "rope-winder",
  category: "garage",
  title: "Rope winder",
  summary: "a flat winder that keeps rope, paracord, fishing line or a power tool's cord coiled, with a slot to lock the end.",
  print: "flat as shown, no supports.",
  names: ["rope winder", "rope wrap", "rope keeper", "line winder", "rope winding board", "cord winding board", "rope storage winder",
    "garage cord wrap", "shop cord wrap"],
  nouns: ["winder"],
  keywords: ["rope", "line", "string", "twine", "paracord", "wind", "coil", "garage", "shop"],
  fits: ["cable"],
  fromSpec: (s) => ({ slotW: Math.max(2, Math.round(s.dims.d * 9) / 10) }),
  tips: ["200 mm long", "for 8 mm rope", "no hanging hole"],
  examples: ["I want a rope winder", "make me a rope winder 200mm long",
    "a paracord winder", "kite string winder"],
  params: {
    length: { default: 120, min: 40, max: 250, unit: "mm", label: "length", say: ["long", "length"], more: ["longer", "bigger"], less: ["shorter", "smaller"] },
    width: { default: 50, min: 20, max: 120, unit: "mm", label: "width across the ears", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    ear: { default: 22, min: 8, max: 60, unit: "mm", label: "ear length at each end", say: ["ear", "end"] },
    notch: { default: 12, min: 4, max: 45, unit: "mm", label: "how deep the cord sits each side", say: ["notch", "deep", "depth"], more: ["deeper"] },
    thick: { default: 4, min: 2, max: 10, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker", "stiffer"] },
    slotW: { default: 6, min: 0, max: 16, unit: "mm", label: "end-locking slot width (0 = none)", say: ["cord", "rope", "slot"] },
    hangD: { default: 8, min: 0, max: 20, unit: "mm", label: "hanging hole (0 = none)", say: ["hang", "hole", "nail"] },
  },
  things: [
    { names: ["paracord winder", "paracord holder", "paracord keeper"], title: "Paracord winder", spec: "paracord",
      params: { length: 110, width: 44, ear: 18, notch: 13, thick: 4, hangD: 8 } },
    { names: ["heavy rope winder", "boat rope winder", "dock line winder", "mooring line winder"], title: "Heavy rope winder",
      params: { length: 200, width: 100, ear: 34, notch: 30, thick: 7, slotW: 10, hangD: 14 } },
    { names: ["power tool cord wrap", "tool cord winder", "drill cord wrap", "saw cord wrap"], title: "Power tool cord wrap",
      params: { length: 150, width: 60, ear: 25, notch: 15, thick: 5, slotW: 7 } },
    { names: ["fishing line winder", "fishing line spool", "kite string winder", "kite winder", "kite line winder"], title: "Line winder",
      params: { length: 100, width: 40, ear: 15, notch: 12, thick: 3, slotW: 1.2, hangD: 6 } },
    { names: ["string winder", "twine winder", "garden twine winder", "chalk line winder"], title: "String winder",
      params: { length: 90, width: 36, ear: 14, notch: 10, thick: 3, slotW: 1.6, hangD: 6 } },
  ],
  body: `
const n = Math.min(notch, width / 2 - 4);        // the waist never narrower than 8 mm
const e = Math.min(ear, length / 3);
const rc = Math.min(5, e / 3, width / 6);        // corner rounding
// a rounded rectangle from x0 to x1, the full width, thick tall
const pad = (x0, x1) => hull(...[[x0 + rc, -width / 2 + rc], [x1 - rc, -width / 2 + rc], [x0 + rc, width / 2 - rc], [x1 - rc, width / 2 - rc]]
  .map(([x, y]) => translate([x, y, 0], cylinder({ r: rc, h: thick, $fn: 24 }))));
const body = union(
  pad(0, e),
  pad(length - e, length),
  translate([e - 1, -width / 2 + n, 0], cube([length - 2 * e + 2, width - 2 * n, thick])),
);
const cuts = [];
// the end-locking slot runs in from the outer end of the first ear
if (slotW > 0) cuts.push(hull(
  translate([-1, -slotW / 2, -1], cube([0.01, slotW, thick + 2])),
  translate([e * 0.6, 0, -1], cylinder({ r: slotW / 2, h: thick + 2, $fn: 24 }))));
if (hangD > 0) cuts.push(translate([length - e / 2, 0, -1], cylinder({ r: Math.min(hangD, e - 4, width - 8) / 2, h: thick + 2, $fn: 32 })));
return translate([-length / 2, 0, 0], cuts.length ? difference(body, ...cuts) : body);
`,
};
