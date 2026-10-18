// A wall ring for things that hang nose-down: a hair dryer, a curling iron,
// a straightener, a handheld shower head. A tapered collar (wider at the
// top, so the tool settles into it) stands out from a wall plate on an arm.
// It prints exactly as it hangs, every piece rising straight off the bed:
// the plate on its bottom edge, the collar on its rim, the arm between them,
// so there is no overhang at all. An optional gap in the front of the collar
// lets a hose or a cord pass through; the screws go in above the collar.

export default {
  id: "wall-ring-holder",
  category: "bathroom",
  title: "Wall ring holder",
  summary: "a wall-mounted tapered ring for a hair dryer, curling iron, straightener or shower head, with an optional gap for the hose or cord.",
  print: "upright as shown, exactly as it hangs; no supports. PETG near a hot tool or in the shower.",
  names: ["hair dryer holder", "blow dryer holder", "hairdryer holder", "hair dryer wall mount", "hair dryer stand",
    "wall ring holder", "hair tool holder", "hair dryer hanger", "dryer holder"],
  nouns: ["holder", "ring", "mount", "hanger"],
  keywords: ["dryer", "hair", "wall", "bathroom", "curling", "straightener", "shower", "salon"],
  fits: ["collar"],
  fromSpec: (s) => ({ topD: s.dims.top, botD: s.dims.bottom, ...(s.dims.gap ? { gap: s.dims.gap } : {}) }),
  primary: "topD",
  tips: ["80 mm across", "a 16 mm gap for the hose", "2 rings", "with tape"],
  examples: ["I want a hair dryer holder", "make me a blow dryer holder 80 mm across",
    "a wall holder for my curling iron", "hair tool holder with 3 rings"],
  params: {
    topD: { default: 74, min: 15, max: 130, unit: "mm", label: "ring opening at the top", say: ["across", "diameter", "top", "opening", "ring", "wide"], more: ["bigger", "wider"], less: ["smaller", "narrower"] },
    botD: { default: 56, min: 10, max: 130, unit: "mm", label: "ring opening at the bottom (smaller = more taper)", say: ["bottom"] },
    ringH: { default: 30, min: 10, max: 80, unit: "mm", label: "ring height", say: ["deep", "depth", "tall"], more: ["deeper", "taller"], less: ["shallower"] },
    gap: { default: 0, min: 0, max: 60, unit: "mm", label: "gap in the front for a hose or cord (0 = closed ring)", say: ["gap", "hose", "cord", "slot"] },
    wallT: { default: 4, min: 2.5, max: 10, unit: "mm", label: "ring wall thickness", say: ["thick", "thickness", "wall"], more: ["stronger", "thicker"] },
    offWall: { default: 18, min: 0, max: 80, unit: "mm", label: "room between the wall and the ring", say: ["away", "out", "off", "from"] },
    rings: { default: 1, min: 1, max: 4, unit: "count", label: "rings side by side", say: ["ring", "tool", "holder"] },
    plateW: { default: 60, min: 30, max: 220, unit: "mm", label: "wall plate width", say: ["plate", "width"] },
    plateH: { default: 75, min: 30, max: 200, unit: "mm", label: "wall plate height", say: ["high", "height"] },
    plateT: { default: 5, min: 3, max: 10, unit: "mm", label: "wall plate thickness", say: ["plate"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
    mount: { default: "screws", unit: "choice", choices: ["screws", "tape"], label: "how it mounts",
      words: { tape: ["tape", "adhesive", "stick on", "no screws", "no drilling", "command strip", "sticky"], screws: ["screws", "screw", "screwed"] } },
  },
  things: [
    { names: ["curling iron holder", "curling wand holder", "curling iron stand", "curling iron hanger"], title: "Curling iron holder",
      spec: "bath-curling-iron", params: { ringH: 36, wallT: 3.5, offWall: 14, plateW: 44, plateH: 70 } },
    { names: ["flat iron holder", "hair straightener holder", "straightener holder", "flat iron hanger", "hair straightener stand"],
      title: "Straightener holder", spec: "bath-flat-iron", params: { ringH: 36, wallT: 3.5, offWall: 14, plateW: 50, plateH: 70 } },
    { names: ["shower head holder", "handheld shower head holder", "shower wand holder", "hand shower holder", "shower head mount", "shower sprayer holder"],
      title: "Shower head holder", spec: "bath-shower-head", params: { ringH: 26, wallT: 4, offWall: 8, plateW: 40, plateH: 60 } },
    { names: ["spray bottle holder", "spray bottle hanger", "cleaning spray holder", "spray bottle wall mount"],
      title: "Spray bottle holder", spec: "bath-spray-bottle", params: { ringH: 16, wallT: 4, offWall: 30, plateW: 50, plateH: 55 } },
    { names: ["hair brush holder", "hairbrush holder", "paddle brush holder", "round brush holder"],
      title: "Hair brush holder", spec: "bath-hair-brush", params: { ringH: 24, wallT: 3.5, offWall: 10, plateW: 44, plateH: 60 } },
    { names: ["hair tool organizer", "styling tool holder", "salon tool holder", "hot tool holder"],
      title: "Hair tool holder (three rings)", params: { rings: 3, topD: 60, botD: 42, ringH: 30, plateH: 80, offWall: 14 } },
    { names: ["electric shaver holder", "shaver holder", "beard trimmer holder", "trimmer holder", "electric razor holder"], title: "Shaver holder",
      params: { topD: 56, botD: 42, ringH: 30, offWall: 10, plateW: 50, plateH: 70 } },
  ],
  body: `
// print = as hung: x along the wall, the wall at y = plateT, the ring out toward -y, z up
const rT = topD / 2, rB = Math.min(botD, topD) / 2;   // never narrower at the top
const Ro = rT + wallT;
const sp = Math.max(6, wallT * 1.5);                  // between neighbouring rings
const W = Math.max(plateW, rings * 2 * Ro + (rings - 1) * sp + 12);
const g = Math.max(0, Math.min(14, offWall + wallT * 0.8, (plateH - ringH) * 0.35));
const minH = ringH + g + (mount === "screws" ? 4 * screwD + 10 : 4);
const H = Math.max(plateH, minH);
const yc = -(offWall + Ro);
const armW = Math.min(Ro * 1.2, 2 * Ro - 2);

// a profile drawn in (x, z) and stood up as a wall from y0 to y0 + t
const inXZ = (pts, y0, t) => translate([0, y0 + t, 0], rotate([90, 0, 0], linearExtrude({ h: t }, polygon(pts))));
// a profile drawn in (y, z) and stood up from x0 to x0 + t
const inYZ = (pts, x0, t) => translate([x0, 0, 0], rotate([90, 90, 0], linearExtrude({ h: t }, polygon(pts))));

const rc = Math.min(10, W / 4, (H - ringH) / 2);
const arcPts = (cx, a0, a1, n = 8) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [cx + rc * Math.cos(t), H - rc + rc * Math.sin(t)];
});
const parts = [inXZ([[-W / 2, 0], [W / 2, 0], ...arcPts(W / 2 - rc, 0, Math.PI / 2), ...arcPts(-W / 2 + rc, Math.PI / 2, Math.PI)], 0, plateT)];
const centers = Array.from({ length: rings }, (_, i) => (i - (rings - 1) / 2) * (2 * Ro + sp));
for (const xc of centers) {
  parts.push(translate([xc, yc, 0], cylinder({ r: Ro, h: ringH, $fn: 64 })));
  parts.push(translate([xc - armW / 2, yc, 0], cube([armW, plateT / 2 - yc, ringH])));
  if (g > 0.5) parts.push(inYZ([[plateT / 2, ringH - 0.01], [plateT / 2, ringH + g], [-g, ringH - 0.01]], xc - armW / 2, armW));
}
const cuts = [];
const gw = Math.min(gap, 1.8 * rB);
for (const xc of centers) {
  // the tapered bore: wider at the top, so it never overhangs
  cuts.push(translate([xc, yc, -0.01], cylinder({ r1: rB, r2: rT, h: ringH + 0.02, $fn: 64 })));
  if (gw > 0) cuts.push(translate([xc - gw / 2, yc - Ro - 1, -1], cube([gw, Ro + 1, ringH + 2])));
}

// screw holes above the ring: teardrops pointed up (they print), countersunk on the room side
if (mount === "screws") {
  const r = screwD / 2;
  const zS = ringH + g + (H - ringH - g) / 2;
  const tear = polygon([...Array.from({ length: 25 }, (_, i) => {
    const t = 3 * Math.PI / 4 + i * (3 * Math.PI / 2) / 24;
    return [r * Math.cos(t), r * Math.sin(t)];
  }), [0, r * Math.SQRT2]]);
  const xs = W >= 50 ? [-W / 2 + 2 * screwD + 5, W / 2 - 2 * screwD - 5] : [0];
  for (const x of xs) {
    cuts.push(translate([x, plateT + 1, zS], rotate([90, 0, 0], linearExtrude({ h: plateT + 2 }, tear))));
    cuts.push(translate([x, -0.01, zS], rotate([-90, 0, 0], cylinder({ r1: 2 * r, r2: r, h: r, $fn: 32 }))));
  }
}
return translate([0, -yc / 2, 0], difference(union(...parts), ...cuts));
`,
};
