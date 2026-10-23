// A cabinet or drawer knob, turned: mushroom, barrel, cone or flat disc,
// screwed on from inside the door with the usual 8-32 or M4 knob screw (into
// a pilot hole, a captive nut, or a heat-set insert). Printed standing on the
// face that meets the door; wherever the profile flares out it does so at 45
// degrees or less.

export default {
  id: "cabinet-knob",
  category: "home",
  title: "Cabinet knob",
  summary: "a turned knob for cabinets and drawers that takes a standard knob screw.",
  print: "standing on its base as shown, no supports. 100% infill or 6 walls round the screw.",
  names: ["cabinet knob", "furniture knob", "replacement knob", "cabinet door knob", "cabinet pull knob",
    "door knob for a cabinet", "kitchen knob", "drawer knobs"],
  nouns: ["knob"],
  keywords: ["cabinet", "drawer", "dresser", "cupboard", "kitchen", "furniture", "wardrobe", "door"],
  fits: ["screw"],
  fromSpec: (s) => ({ holeD: Math.round(s.dims.d * 0.85 * 10) / 10 }),
  specNote: "a pilot hole the screw cuts its own thread in",
  primary: "headD",
  tips: ["40 mm across", "a cone", "with a captive nut", "taller"],
  examples: ["I want a cabinet knob", "make me a drawer knob 35mm across",
    "mushroom knob with a nut for an m4 screw", "a replacement knob for my dresser"],
  params: {
    headD: { default: 30, min: 12, max: 70, unit: "mm", label: "knob diameter", say: ["diameter", "across", "wide", "size", "big"], more: ["bigger", "wider"], less: ["smaller"] },
    height: { default: 25, min: 12, max: 60, unit: "mm", label: "how far it stands off the door", say: ["tall", "high", "height", "out", "long", "deep"], more: ["taller", "longer"], less: ["shorter", "flatter"] },
    baseD: { default: 16, min: 8, max: 50, unit: "mm", label: "base diameter", say: ["base"] },
    shape: { default: "mushroom", unit: "choice", choices: ["mushroom", "barrel", "cone", "disc"], label: "shape",
      words: { barrel: ["barrel", "cylinder", "cylindrical"], cone: ["cone", "tapered", "conical"], disc: ["flat", "disc", "disk", "pancake"], mushroom: ["mushroom", "dome", "round"] } },
    fixing: { default: "screw", unit: "choice", choices: ["screw", "nut", "insert"], label: "how the screw holds (pilot, captive nut, heat-set insert)",
      words: { nut: ["nut", "hex nut", "captive nut"], insert: ["insert", "heat set", "threaded insert"], screw: ["self tapping", "pilot"] } },
    holeD: { default: 3.4, min: 2.5, max: 6, unit: "mm", label: "pilot hole", say: ["hole", "pilot"] },
    nutAF: { default: 7, min: 5.5, max: 10, unit: "mm", label: "nut across flats (M4 = 7, 8-32 = 8.7)", say: ["nut"] },
  },
  things: [
    { names: ["drawer knob", "drawer pull knob", "drawer knob replacement"], title: "Drawer knob" },
    { names: ["dresser knob", "dresser drawer knob", "chest of drawers knob"], title: "Dresser knob", params: { headD: 34, height: 26 } },
    { names: ["kitchen cabinet knob", "cupboard knob", "cupboard door knob", "kitchen cupboard knob"], title: "Kitchen cabinet knob",
      params: { headD: 32, height: 28 } },
    { names: ["mushroom knob", "round cabinet knob", "dome knob"], title: "Mushroom knob", params: { shape: "mushroom" } },
    { names: ["barrel knob", "cylinder knob", "round barrel knob"], title: "Barrel knob", params: { shape: "barrel", headD: 22, height: 28 } },
    { names: ["cone knob", "tapered knob", "conical knob"], title: "Cone knob", params: { shape: "cone", headD: 30, baseD: 18, height: 26 } },
    { names: ["flat knob", "disc knob", "flat cabinet knob"], title: "Flat knob", params: { shape: "disc", headD: 38, height: 18 } },
    { names: ["wardrobe knob", "large cabinet knob", "armoire knob", "big knob"], title: "Large knob", params: { headD: 45, height: 32, baseD: 22 } },
    { names: ["small knob", "mini knob", "jewelry box knob", "tiny knob"], title: "Small knob", params: { headD: 16, height: 16, baseD: 10, holeD: 2.8 } },
  ],
  body: `
// a half profile spun round the z axis; z = 0 is the face against the door
const R = headD / 2;
const rb = Math.min(baseD / 2, R);
const arcPts = (cx, cy, rx, ry, a0, a1, n = 12) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + (a1 - a0) * i / n;
  return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
});
let side;
if (shape === "barrel" || shape === "cone") {
  // straight sides (a cone widens no faster than 45 degrees), a rounded top edge
  const e = Math.min(3, R * 0.25, height * 0.2);
  const r0 = shape === "barrel" ? R : Math.max(rb, R - (height - e) * 0.95);
  side = [[r0, 0], [R, height - e], ...arcPts(R - e, height - e, e, e, 0, Math.PI / 2).slice(1)];
} else {
  // a collar, a neck, a 45-degree flare out to the head, and a dome
  const dh = shape === "disc" ? Math.min(2, height * 0.12) : Math.min(R * 0.5, height * 0.3);
  const zc = height * 0.12;
  const A = height - dh - 1 - zc;                  // the height the neck and flare share
  let rn = Math.max(R * 0.45, holeD / 2 + 2.5);
  let rbE = Math.max(rb, rn);
  if (rbE - rn + R - rn > A) {
    rn = Math.min(R, Math.max((rbE + R - A) / 2, R - A));
    rbE = Math.max(rb, rn);
  }
  const zTop = height - dh - 1;
  side = [[rbE, 0], [rbE, zc], [rn, zc + rbE - rn], [rn, zTop - (R - rn)], [R, zTop], [R, height - dh],
    ...arcPts(0, height - dh, R, dh, 0, Math.PI / 2).slice(1)];
}
// the screw comes in from the door side: its hole is part of the turned
// outline (a bore cut down a revolve's axis is very slow); a nut pocket is cut
const deep = Math.min(height - 3, fixing === "insert" ? 8 : 15);
const hr = (fixing === "insert" ? holeD + 2.2 : fixing === "nut" ? holeD + 0.9 : holeD) / 2;
const pts = [[hr, 0], ...side.filter(([r]) => r > 0.01), [0, height], [0, deep], [hr, deep]];
// drop points the outline reached twice (a neck as wide as the base, say)
const knobby = revolve(360, polygon(pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4)));
if (fixing !== "nut") return knobby;
const rcn = (nutAF + 0.3) / Math.sqrt(3);
return difference(knobby, translate([0, 0, -1], linearExtrude({ h: nutAF * 0.46 + 1.3 },
  polygon(Array.from({ length: 6 }, (_, i) => [rcn * Math.cos(Math.PI * i / 3), rcn * Math.sin(Math.PI * i / 3)])))));
`,
};
