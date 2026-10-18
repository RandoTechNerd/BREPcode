// A plain light-switch or outlet cover plate (no text) to the NEMA WD-6 sizes:
// toggle, Decora (rocker or GFCI) and duplex-outlet openings, or blank, one to
// four gangs on the standard 1.812 inch gang spacing, standard, midway or
// jumbo outline. Printed face down: the front comes off the bed smooth, the
// bevelled edge widens upward at 45 degrees, and the skirt round the back is
// the last thing printed.

export default {
  id: "wall-plate",
  category: "home",
  title: "Wall plate",
  summary: "a plain switch or outlet cover plate to the standard sizes, one to four gangs.",
  print: "face down as shown, no supports. PLA or PETG; screws are the #6-32 ones from the old plate.",
  names: ["wall plate", "switch plate", "outlet cover", "light switch cover", "switch cover", "outlet plate",
    "receptacle cover", "faceplate", "wall plate cover", "cover plate", "electrical cover plate"],
  nouns: ["plate", "cover", "faceplate"],
  keywords: ["switch", "outlet", "light", "receptacle", "socket", "electrical", "gang", "wall"],
  tips: ["2 gang", "decora", "jumbo size", "switch and outlet"],
  examples: ["I want a light switch cover", "make me a 2 gang outlet cover",
    "a decora switch plate", "blank wall plate jumbo size", "switch plate with 3 gangs"],
  params: {
    gangs: { default: 1, min: 1, max: 4, unit: "count", label: "gangs (devices side by side)", say: ["gang", "switch", "outlet", "device"] },
    opening: { default: "toggle", unit: "choice", choices: ["toggle", "decora", "duplex", "blank"], label: "opening",
      words: { blank: ["blank", "no hole", "solid", "blanking"], decora: ["decora", "rocker", "decorator", "gfci", "gfi", "paddle", "usb outlet"], toggle: ["toggle", "light switch", "switch"], duplex: ["outlet", "receptacle", "duplex", "plug", "socket"] } },
    last: { default: "same", unit: "choice", choices: ["same", "toggle", "decora", "duplex", "blank"], label: "opening in the last gang (for a combo plate)" },
    size: { default: "standard", unit: "choice", choices: ["standard", "midway", "jumbo"], label: "outline size",
      words: { jumbo: ["jumbo", "oversized", "oversize", "extra large"], midway: ["midway", "mid size", "midsize", "preferred"], standard: ["standard", "normal"] } },
    faceT: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "face thickness", say: ["face", "thick", "thickness"] },
    depth: { default: 6, min: 4, max: 10, unit: "mm", label: "overall depth off the wall", say: ["deep", "depth"] },
    bevel: { default: 2.5, min: 0, max: 4, unit: "mm", label: "edge bevel", say: ["bevel", "edge"] },
    cornerR: { default: 2, min: 0.5, max: 6, unit: "mm", label: "corner radius", say: ["corner", "round"] },
    screwD: { default: 3.8, min: 3, max: 4.5, unit: "mm", label: "screw holes (#6-32)", say: ["screw"] },
  },
  things: [
    { names: ["light switch plate", "toggle switch plate", "toggle plate", "toggle switch cover", "single switch plate"],
      title: "Light switch cover", params: { opening: "toggle" } },
    { names: ["outlet cover plate", "receptacle plate", "plug cover plate", "duplex outlet cover", "duplex plate", "single outlet cover"],
      title: "Outlet cover", params: { opening: "duplex" } },
    { names: ["decora plate", "decora switch plate", "rocker switch cover", "gfci cover", "gfci outlet cover", "decorator plate", "rocker plate", "usb outlet cover"],
      title: "Decora plate", params: { opening: "decora" } },
    { names: ["blank wall plate", "blank plate", "blank cover plate", "blank outlet cover", "blanking plate"], title: "Blank wall plate",
      params: { opening: "blank" } },
    { names: ["double light switch cover", "double switch plate", "two gang switch cover", "double switch cover"], title: "Double switch plate",
      params: { gangs: 2, opening: "toggle" } },
    { names: ["double outlet cover", "two gang outlet cover", "quad outlet cover", "double outlet plate"], title: "Double outlet cover",
      params: { gangs: 2, opening: "duplex" } },
    { names: ["switch and outlet cover", "light switch and outlet cover", "switch outlet combo plate", "combo wall plate", "combination wall plate"],
      title: "Switch and outlet plate", params: { gangs: 2, opening: "toggle", last: "duplex" } },
    { names: ["triple switch plate", "three gang switch cover", "triple light switch cover", "triple switch cover"], title: "Triple switch plate",
      params: { gangs: 3, opening: "toggle" } },
    { names: ["double decora plate", "double rocker switch cover", "two gang decora plate"], title: "Double Decora plate",
      params: { gangs: 2, opening: "decora" } },
    { names: ["jumbo outlet cover", "oversized outlet cover", "jumbo wall plate", "oversized wall plate", "oversized switch plate"],
      title: "Jumbo wall plate", params: { size: "jumbo", opening: "duplex" } },
  ],
  body: `
// printed face down: z = 0 is the front, the skirt rises toward the wall.
// Sizes are NEMA WD-6, in inches times 25.4.
const pitch = 1.812 * 25.4;                                  // gang to gang
const W1 = (size === "jumbo" ? 3.5 : size === "midway" ? 3.125 : 2.75) * 25.4;
const H = (size === "jumbo" ? 5.25 : size === "midway" ? 4.875 : 4.5) * 25.4;
const W = W1 + (gangs - 1) * pitch;
const skirt = faceT * 0.75;                              // the rim round the back
const b = Math.min(bevel, faceT + skirt - 0.8, depth - 1);
// a rounded rectangle w x h centred on the origin, from z0 to z0 + t
const slab = (w, h, r, z0, t) => {
  const rr = Math.max(0.4, Math.min(r, w / 2 - 0.1, h / 2 - 0.1));
  return hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) =>
    translate([sx * (w / 2 - rr), sy * (h / 2 - rr), z0], cylinder({ r: rr, h: t, $fn: 24 }))));
};
const outer = b > 0
  ? hull(slab(W - 2 * b, H - 2 * b, cornerR - b * 0.4, 0, 0.01), slab(W, H, cornerR, b, depth - b))
  : slab(W, H, cornerR, 0, depth);
const cavity = slab(W - 2 * skirt, H - 2 * skirt, cornerR - skirt, faceT, depth);
// openings, as outlines, extruded through the face
const roundRect = (w, h, r, n = 6) => {
  const corner = (cx, cy, a0) => Array.from({ length: n + 1 }, (_, i) => {
    const a = a0 + (Math.PI / 2) * i / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  return [...corner(w / 2 - r, h / 2 - r, 0), ...corner(-w / 2 + r, h / 2 - r, Math.PI / 2),
    ...corner(-w / 2 + r, -h / 2 + r, Math.PI), ...corner(w / 2 - r, -h / 2 + r, 3 * Math.PI / 2)];
};
// a duplex receptacle face: a 1.343 inch circle with flats 1.125 inch apart
const receptacle = (cy) => {
  const r = 1.343 * 25.4 / 2, hh = 1.125 * 25.4 / 2;
  const a = Math.asin(hh / r);
  const side = (a0, a1) => Array.from({ length: 13 }, (_, i) => {
    const t = a0 + (a1 - a0) * i / 12;
    return [r * Math.cos(t), cy + r * Math.sin(t)];
  });
  return [...side(-a, a), ...side(Math.PI - a, Math.PI + a)];
};
const through = (pts, x) => translate([x, 0, -1], linearExtrude({ h: faceT + 2 }, polygon(pts)));
const cuts = [cavity];
const k = Math.min(1.5, faceT - 0.8);                        // countersink for the oval heads
const screwAt = (x, y) => {
  cuts.push(translate([x, y, -1], cylinder({ r: screwD / 2, h: faceT + 2, $fn: 20 })));
  cuts.push(translate([x, y, -0.01], cylinder({ r1: screwD / 2 + k, r2: screwD / 2, h: k + 0.01, $fn: 20 })));
};
for (let i = 0; i < gangs; i++) {
  const x = (i - (gangs - 1) / 2) * pitch;
  const kind = i === gangs - 1 && last !== "same" ? last : opening;
  if (kind === "toggle") {
    cuts.push(through(roundRect(0.406 * 25.4, 0.94 * 25.4, 1.5), x));
    screwAt(x, 2.375 * 25.4 / 2); screwAt(x, -2.375 * 25.4 / 2);
  } else if (kind === "decora") {
    cuts.push(through(roundRect(1.31 * 25.4, 2.63 * 25.4, 1), x));
    screwAt(x, 3.812 * 25.4 / 2); screwAt(x, -3.812 * 25.4 / 2);
  } else if (kind === "duplex") {
    const dy = 1.531 * 25.4 / 2;
    cuts.push(through(receptacle(dy), x), through(receptacle(-dy), x));
    screwAt(x, 0);
  } else {
    // a blank plate screws to the box ears
    screwAt(x, 3.281 * 25.4 / 2); screwAt(x, -3.281 * 25.4 / 2);
  }
}
return difference(outer, ...cuts);
`,
};
