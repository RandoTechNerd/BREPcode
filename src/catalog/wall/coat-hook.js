// A single wall hook: a back plate with an arm that leaves it at the bottom,
// tilts up a little and ends in an upturned, rounded tip. One side profile,
// printed on its side, so every layer runs along the arm and nothing hangs
// in the air; the wedge where the arm meets the plate is solid, and that is
// what takes the load. Screws through the plate, or a flat back for an
// adhesive strip.

export default {
  id: "coat-hook",
  category: "wall",
  title: "Coat hook",
  summary: "a single wall hook with an upturned tip, screwed on or stuck on with an adhesive strip.",
  print: "on its side as shown, no supports; the flat back goes against the wall.",
  names: ["coat hook", "wall hook", "jacket hook", "clothes hook", "garment hook", "j hook",
    "single wall hook", "coat peg", "wall mounted hook", "hook for coats"],
  nouns: ["hook", "peg", "hanger"],
  keywords: ["coat", "jacket", "wall", "entryway", "hallway", "hang", "clothes"],
  fits: ["adhesive"],
  fromSpec: (s) => ({ mount: "adhesive", width: Math.max(14, s.dims.w + 3), plateH: Math.max(40, s.dims.len) }),
  specNote: "the back is flat for the strip; press it on for 30 seconds before loading",
  tips: ["two prongs", "60 mm reach", "adhesive instead of screws", "stronger"],
  examples: ["I want a coat hook", "make me a wall hook 60mm long",
    "a double coat hook for the hallway", "a hook with command strips", "stick on hook with no screws"],
  params: {
    reach: { default: 45, min: 20, max: 120, unit: "mm", label: "how far it sticks out", say: ["reach", "out", "long", "length", "deep"], more: ["longer", "deeper"], less: ["shorter"] },
    plateH: { default: 70, min: 30, max: 160, unit: "mm", label: "back plate height", say: ["tall", "high", "height", "plate"], more: ["taller"], less: ["lower"] },
    width: { default: 22, min: 10, max: 80, unit: "mm", label: "hook width", say: ["wide", "width"], more: ["wider"], less: ["narrower", "slimmer"] },
    armT: { default: 8, min: 4, max: 16, unit: "mm", label: "arm thickness", say: ["thick", "thickness", "arm"], more: ["stronger", "thicker", "sturdier", "heavier"], less: ["thinner", "lighter"] },
    tipH: { default: 14, min: 0, max: 50, unit: "mm", label: "how far the tip turns up", say: ["tip", "lip"] },
    angle: { default: 10, min: 0, max: 40, unit: "deg", label: "upward tilt of the arm", say: ["angle", "tilt", "degree"] },
    prongs: { default: 1, min: 1, max: 2, unit: "count", label: "prongs (2 = a short one above)", say: ["prong", "arm"] },
    plateT: { default: 6, min: 3, max: 12, unit: "mm", label: "back plate thickness", say: ["back"] },
    mount: { default: "screw", unit: "choice", choices: ["screw", "adhesive"], label: "mounting",
      words: { adhesive: ["adhesive", "command strip", "command", "stick on", "sticky", "no drill", "no screws", "without screws", "tape", "self adhesive"], screw: ["screw", "screwed"] } },
    screwD: { default: 4.5, min: 3, max: 6.5, unit: "mm", label: "screw hole diameter", say: ["screw", "hole"] },
  },
  things: [
    { names: ["double coat hook", "double hook", "two prong hook", "double wall hook"], title: "Double coat hook",
      params: { prongs: 2, reach: 55, plateH: 100 } },
    { names: ["adhesive hook", "command hook", "command strip hook", "stick on hook", "no drill hook", "self adhesive hook", "sticky hook", "renter friendly hook"],
      title: "Adhesive hook", spec: "command-medium", params: { reach: 30, armT: 6, tipH: 10 } },
    { names: ["key hook", "single key hook"], title: "Key hook", params: { reach: 25, width: 12, armT: 5, plateH: 40, tipH: 8, plateT: 4 } },
    { names: ["hat hook", "cap hook", "baseball cap hook"], title: "Hat hook", params: { reach: 60, tipH: 25, width: 30, angle: 15 } },
    { names: ["heavy duty hook", "heavy duty wall hook", "strong wall hook", "heavy coat hook"], title: "Heavy-duty hook",
      params: { armT: 14, width: 40, plateT: 9, reach: 60, plateH: 110 } },
    { names: ["umbrella hook", "umbrella hanger"], title: "Umbrella hook", params: { reach: 35, tipH: 18, armT: 7 } },
    { names: ["mini hook", "small wall hook", "tiny hook", "small hook"], title: "Mini hook",
      params: { reach: 20, width: 12, armT: 4, plateH: 32, tipH: 6, plateT: 3, screwD: 3.5 } },
  ],
  body: `
// side profile: x runs out from the wall, y runs up; printed lying on it
const t = Math.tan(angle * Math.PI / 180);
const tipT = Math.max(3, armT * 0.8);
const gus = Math.min(armT, reach * 0.3);
const L = Math.max(reach, plateT + gus + tipT + 3);
// one arm: its underside starts at (x0, y0) on the plate and rises to the
// tip; the top comes back along the arm to a chamfer that braces it to the
// plate face. Returns the outline from the plate face round to the plate face.
const armPts = (x0, y0, len, up) => {
  const yb = (x) => y0 + (x - x0) * t;
  const top = yb(len) + armT + up;
  const rt = tipT / 2;
  const tip = up >= rt
    ? Array.from({ length: 13 }, (_, i) => [len - rt + rt * Math.cos(Math.PI * i / 12), top - rt + rt * Math.sin(Math.PI * i / 12)])
    : [[len, top], [len - tipT, top]];
  return [
    [x0, y0], [len, yb(len)], ...tip,
    [len - tipT, yb(len - tipT) + armT],
    [plateT + gus, yb(plateT + gus) + armT],
    [plateT, yb(plateT) + armT + gus],
  ];
};
const rootTop = plateT * t + armT + gus;
const H = Math.max(plateH, rootTop + 14);
const lower = [...armPts(0, 0, L, tipH), [plateT, H], [0, H]];
const parts = [linearExtrude({ h: width }, polygon(lower))];
// the second, shorter prong sits a little under halfway up the plate
const y2 = rootTop + (H - rootTop) * 0.4;
const top2 = y2 + 0.5 * t + armT + gus;
if (prongs > 1) {
  const upper = armPts(plateT - 0.5, y2, Math.max(plateT + gus + tipT + 3, L * 0.6), tipH * 0.7);
  parts.push(linearExtrude({ h: width }, polygon([...upper, [plateT - 0.5, upper[upper.length - 1][1]]])));
}
const piece = parts.length > 1 ? union(...parts) : parts[0];
if (mount !== "screw") return piece;

// countersunk screws through the plate, in whatever clear plate there is
const spans = prongs > 1 ? [[rootTop, y2], [top2 + 1, H]] : [[rootTop, H]];
const ys = spans.filter(([a, b]) => b - a >= 2.6 * screwD)
  .flatMap(([a, b]) => b - a >= 7 * screwD ? [a + (b - a) * 0.3, a + (b - a) * 0.75] : [(a + b) / 2]);
if (!ys.length) ys.push((rootTop + H) / 2);
const zs = width < 45 ? [width / 2] : [width * 0.25, width * 0.75];
const k = Math.min(screwD / 2, plateT - 1);
const holes = ys.flatMap((y) => zs.flatMap((z) => [
  translate([-1, y, z], rotate([0, 90, 0], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 }))),
  translate([plateT - k + 0.02, y, z], rotate([0, 90, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]));
return difference(piece, ...holes);
`,
};
