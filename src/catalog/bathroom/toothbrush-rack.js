// A wall rack the toothbrushes (or razors, or a shaving brush) hang in: a
// shelf with U-notches open to its front edge, a back plate rising from its
// back edge, and a triangular cheek at each end. It prints exactly as it
// hangs: the shelf flat on the bed, the back plate and cheeks standing up
// from it, so nothing overhangs. The screw holes through the back plate are
// pointed at the top (a teardrop) so they print clean without support.

export default {
  id: "toothbrush-rack",
  category: "bathroom",
  title: "Wall toothbrush rack",
  summary: "a wall rack with front-opening notches the toothbrushes or razors hang in, screwed or taped to the wall.",
  print: "as shown: shelf flat on the bed, back plate standing up (no supports). It mounts the same way up. PETG near water.",
  names: ["wall toothbrush holder", "toothbrush rack", "wall toothbrush rack", "wall mounted toothbrush holder",
    "hanging toothbrush holder", "toothbrush hanger", "toothbrush wall mount", "adhesive toothbrush holder"],
  nouns: ["rack", "hanger", "holder"],
  keywords: ["toothbrush", "toothbrushes", "wall", "razor", "bathroom", "mounted", "hang", "hanging"],
  tips: ["5 slots", "no screws (tape)", "wider notches", "deeper"],
  examples: ["I want a wall toothbrush holder", "make me a toothbrush rack with 5 slots",
    "wall mounted toothbrush holder with tape", "a toothbrush hanger for 3 brushes"],
  params: {
    slots: { default: 4, min: 1, max: 10, unit: "count", label: "notches", say: ["slot", "notch", "toothbrush", "brush", "razor"] },
    notchW: { default: 10, min: 5, max: 30, unit: "mm", label: "notch width", say: ["notch", "slot", "opening"], more: ["wider"], less: ["narrower", "tighter"] },
    notchL: { default: 18, min: 8, max: 45, unit: "mm", label: "notch length", say: ["long", "length"] },
    gapW: { default: 14, min: 6, max: 40, unit: "mm", label: "plastic between notches", say: ["spacing", "apart", "gap"] },
    depth: { default: 44, min: 25, max: 90, unit: "mm", label: "how far it sticks out from the wall", say: ["deep", "depth", "out"], more: ["deeper"], less: ["shallower"] },
    backH: { default: 40, min: 20, max: 100, unit: "mm", label: "back plate height", say: ["tall", "high", "height", "back"], more: ["taller"], less: ["shorter", "lower"] },
    plateT: { default: 4, min: 3, max: 10, unit: "mm", label: "shelf thickness", say: ["thick", "thickness", "shelf"], more: ["thicker", "stronger"] },
    backT: { default: 4, min: 3, max: 8, unit: "mm", label: "back plate thickness", say: ["plate"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
    mount: { default: "screws", unit: "choice", choices: ["screws", "tape"], label: "how it mounts",
      words: { tape: ["tape", "adhesive", "stick on", "no screws", "no drilling", "command strip", "sticky"], screws: ["screws", "screw", "screwed"] } },
  },
  things: [
    { names: ["razor holder", "razor hanger", "razor rack", "wall razor holder", "razor wall mount"], title: "Razor holder",
      params: { slots: 2, notchW: 12, notchL: 20, depth: 46, gapW: 18 } },
    { names: ["shaving brush holder", "shaving brush stand", "shave brush holder", "shaving brush hanger"], title: "Shaving brush holder",
      params: { slots: 1, notchW: 21, notchL: 30, depth: 60, gapW: 22, backH: 50, plateT: 5 } },
    { names: ["toothbrush and razor rack", "toothbrush and razor holder", "razor and toothbrush holder"], title: "Toothbrush and razor rack",
      params: { slots: 5, notchW: 12, gapW: 14 } },
    { names: ["shaving set holder", "razor and brush holder", "shaving kit holder"], title: "Razor and shaving brush holder",
      params: { slots: 2, notchW: 21, notchL: 30, depth: 60, gapW: 22, backH: 50, plateT: 5 } },
    { names: ["single toothbrush holder", "single toothbrush hanger", "travel toothbrush hanger"], title: "Single toothbrush holder",
      params: { slots: 1, gapW: 16, backH: 34 } },
    { names: ["electric toothbrush wall holder", "electric toothbrush hanger", "electric toothbrush wall mount"], title: "Electric toothbrush wall holder",
      params: { slots: 2, notchW: 24, notchL: 32, depth: 62, gapW: 18, backH: 50, plateT: 5 } },
  ],
  body: `
// print = as hung: x along the wall, y out from the wall, z up
const gT = Math.max(3, backT);                        // end cheek thickness
const W = 2 * gT + slots * notchW + (slots + 1) * gapW;
const D = Math.max(depth, backT + notchW + 8);
const nL = Math.max(notchW / 2 + 2, Math.min(notchL, D - backT - 6));          // leave a bridge of plastic behind each notch
const rC = Math.min(6, (D - backT) / 3);              // rounded front corners

// a profile drawn in (x, z) and stood up as a wall from y0 to y0 + t
const inXZ = (pts, y0, t) => translate([0, y0 + t, 0], rotate([90, 0, 0], linearExtrude({ h: t }, polygon(pts))));
// a profile drawn in (y, z) and stood up from x0 to x0 + t
const inYZ = (pts, x0, t) => translate([x0, 0, 0], rotate([90, 90, 0], linearExtrude({ h: t }, polygon(pts))));

const shelfPlate = hull(
  cube([W, 1, plateT]),
  translate([rC, D - rC, 0], cylinder({ r: rC, h: plateT, $fn: 32 })),
  translate([W - rC, D - rC, 0], cylinder({ r: rC, h: plateT, $fn: 32 })),
);
const rT = Math.min(8, W / 4, (backH - plateT) / 2);   // rounded top corners on the back plate
const arcPts = (cx, a0, a1, n = 10) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [cx + rT * Math.cos(t), backH - rT + rT * Math.sin(t)];
});
const backPlate = inXZ([[0, 0], [W, 0], ...arcPts(W - rT, 0, Math.PI / 2), ...arcPts(rT, Math.PI / 2, Math.PI)], 0, backT);
const cheek = [[backT - 0.01, plateT - 0.01], [D - rC - 1, plateT - 0.01], [backT - 0.01, backH - rT]];
let part = union(shelfPlate, backPlate, inYZ(cheek, 0, gT), inYZ(cheek, W - gT, gT));

// the notches: a straight U open to the front, with a flared mouth
const cuts = [];
const fl = Math.min(2, gapW / 4);
for (let i = 0; i < slots; i++) {
  const x = gT + gapW + notchW / 2 + i * (notchW + gapW);
  const y1 = D - nL + notchW / 2;
  cuts.push(hull(
    translate([x, y1, -1], cylinder({ r: notchW / 2, h: plateT + 2, $fn: 32 })),
    translate([x - notchW / 2, D - 1, -1], cube([notchW, 2, plateT + 2])),
  ));
  cuts.push(translate([0, 0, -1], linearExtrude({ h: plateT + 2 }, polygon([
    [x - notchW / 2, D - fl - 0.01], [x + notchW / 2, D - fl - 0.01], [x + notchW / 2 + fl, D + 0.01], [x - notchW / 2 - fl, D + 0.01]]))));
}

// screw holes through the back plate: teardrops (pointed up, so they print), countersunk on the room side
if (mount === "screws") {
  const r = screwD / 2;
  const zH = plateT + Math.max(r + 3, (backH - plateT) * 0.55);
  const tear = polygon([...Array.from({ length: 25 }, (_, i) => {
    const t = 3 * Math.PI / 4 + i * (3 * Math.PI / 2) / 24;
    return [r * Math.cos(t), r * Math.sin(t)];
  }), [0, r * Math.SQRT2]]);
  const xs = W < 70 ? [W / 2] : [W * 0.22, W * 0.78];
  for (const x of xs) {
    cuts.push(translate([x, backT + 1, zH], rotate([90, 0, 0], linearExtrude({ h: backT + 2 }, tear))));
    cuts.push(translate([x, backT + 0.01, zH], rotate([90, 0, 0], cylinder({ r1: r + r, r2: r, h: r, $fn: 32 }))));
  }
}
part = difference(part, ...cuts);
// turned so the notches face the front of the view
return rotate([0, 0, 180], translate([-W / 2, -D / 2, 0], part));
`,
};
