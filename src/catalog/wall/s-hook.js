// An S hook: two open loops joined by a straight middle, the upper loop for
// the rod or rail it hangs on and the lower one for whatever hangs from it.
// Printed flat, so the layers lie in the plane of the S and the load runs
// along them; the ends are rounded off.

export default {
  id: "s-hook",
  category: "wall",
  title: "S hook",
  summary: "an S-shaped hook for closet rods, rails and racks, sized to the rod.",
  print: "flat as shown, no supports. PETG; print a few at once.",
  names: ["s hook", "s shaped hook", "s hooks", "hanging s hook", "double ended hook", "s hanger"],
  nouns: ["hook"],
  keywords: ["hang", "rod", "rail", "closet", "rack", "bar"],
  fits: ["rod", "handle"],
  fromSpec: (s) => ({ topD: s.dims.d + 4 }),
  specNote: "the upper loop is 4 mm bigger than the rod",
  primary: "topD",
  tips: ["for a closet rod", "bigger bottom loop", "heavier"],
  examples: ["I want an s hook", "make me an s hook for a 30mm rail",
    "s hooks for my closet rod", "a large s hook with a 50mm loop"],
  params: {
    topD: { default: 30, min: 8, max: 80, unit: "mm", label: "upper loop (rod) diameter", say: ["top", "upper", "rod", "rail", "bar", "loop"] },
    bottomD: { default: 25, min: 8, max: 80, unit: "mm", label: "lower loop diameter", say: ["bottom", "lower"] },
    mid: { default: 25, min: 0, max: 150, unit: "mm", label: "straight middle length", say: ["long", "length", "middle", "drop"], more: ["longer"], less: ["shorter"] },
    thick: { default: 6, min: 3, max: 14, unit: "mm", label: "loop thickness", say: ["thick", "thickness"], more: ["stronger", "thicker", "heavier"], less: ["thinner", "lighter"] },
    width: { default: 8, min: 4, max: 25, unit: "mm", label: "hook width (print height)", say: ["wide", "width"] },
    curl: { default: 60, min: 20, max: 110, unit: "deg", label: "how far each end curls back", say: ["curl", "angle", "degree"] },
  },
  things: [
    { names: ["closet rod hook", "closet rod s hook", "closet s hook", "wardrobe rail hook"], title: "Closet rod S hook",
      spec: "closet-rod-wood", params: { bottomD: 30, mid: 30 } },
    { names: ["rail hook", "rail s hook", "clothes rail hook", "bar hook"], title: "Rail S hook", params: { topD: 22, bottomD: 22, mid: 20 } },
    { names: ["large s hook", "big s hook", "jumbo s hook"], title: "Large S hook", params: { topD: 50, bottomD: 45, thick: 9, width: 12, mid: 40 } },
    { names: ["small s hook", "mini s hook", "tiny s hook"], title: "Small S hook", params: { topD: 12, bottomD: 12, thick: 3.5, width: 5, mid: 8 } },
    { names: ["heavy duty s hook", "strong s hook"], title: "Heavy-duty S hook", params: { thick: 11, width: 15, topD: 35, bottomD: 35 } },
  ],
  body: `
// flat in x/y, printed lying down
const r1 = topD / 2 + thick / 2, r2 = bottomD / 2 + thick / 2;   // centre-line radii
const a = curl * Math.PI / 180;
// a band of the given centre-line radius round (cx, cy) from angle a0 to a1,
// with a rounded end at a1
const band = (cx, cy, r, a0, a1, N = 40) => {
  const at = (rr, t) => [cx + rr * Math.cos(t), cy + rr * Math.sin(t)];
  const outer = Array.from({ length: N + 1 }, (_, i) => at(r + thick / 2, a0 + (a1 - a0) * i / N));
  const end = at(r, a1);
  const cap = Array.from({ length: 11 }, (_, i) => {
    const t = a1 + Math.PI * i / 10;
    return [end[0] + thick / 2 * Math.cos(t), end[1] + thick / 2 * Math.sin(t)];
  });
  const inner = Array.from({ length: N + 1 }, (_, i) => at(r - thick / 2, a1 - (a1 - a0) * i / N));
  return polygon([...outer, ...cap.slice(1, -1), ...inner]);
};
const yTop = mid / 2, yBot = -mid / 2;
const pieces = [
  // the upper loop opens downward on the right: from the top of the middle, over, and back down
  band(-r1, yTop, r1, 0, Math.PI + a),
  // the lower loop opens upward: from the bottom of the middle, under, and back up
  band(r2, yBot, r2, Math.PI, 2 * Math.PI + a),
];
// the straight middle, overlapping a little into both loops
pieces.push(polygon([[-thick / 2, yBot - 0.3], [thick / 2, yBot - 0.3], [thick / 2, yTop + 0.3], [-thick / 2, yTop + 0.3]]));
return union(...pieces.map((p) => linearExtrude({ h: width }, p)));
`,
};
