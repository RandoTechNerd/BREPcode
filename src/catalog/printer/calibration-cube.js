// The calibration cube: measure it with calipers and the X, Y and Z
// error is right there. With no lettering to print, the axes are marked by
// grooves instead: one up the X face, two up the Y face, three across the
// top. Hollow makes the single-wall cube used to check flow (print it in
// vase mode, measure the wall).

export default {
  id: "calibration-cube",
  category: "printer",
  title: "Calibration cube",
  summary: "a test cube to measure with calipers, with grooves marking X, Y and Z, or a single-wall cube for flow.",
  print: "upright as shown, no supports. Hollow: vase mode, then measure the wall.",
  names: ["calibration cube", "test cube", "xyz cube", "cali cube", "xyz calibration cube", "dimension test cube",
    "calibration test cube", "dimensional accuracy cube", "steps calibration cube", "accuracy test cube"],
  nouns: ["cube"],
  keywords: ["calibration", "calibrate", "test", "xyz", "accuracy", "printer", "dimension"],
  primary: "size",
  tips: ["40 mm", "hollow", "no marks"],
  examples: ["make me a calibration cube", "a 20mm xyz calibration cube",
    "test cube 40 mm", "a hollow single wall calibration cube for flow"],
  params: {
    size: { default: 20, min: 5, max: 50, unit: "mm", label: "cube size", say: ["size", "cube", "side", "big", "wide"], more: ["bigger"], less: ["smaller"] },
    form: { default: "solid", unit: "choice", choices: ["solid", "hollow"], label: "solid or single-wall hollow",
      words: { hollow: ["hollow", "single wall", "vase", "vase mode", "flow", "open top", "shell"], solid: ["solid"] } },
    wallT: { default: 0.8, min: 0.4, max: 5, unit: "mm", label: "wall thickness when hollow", say: ["wall", "thick"] },
    marks: { default: "yes", unit: "choice", choices: ["no", "yes"], label: "axis grooves",
      words: { no: ["no marks", "plain", "no grooves", "without marks", "blank"], yes: ["marks", "grooves", "marked"] } },
  },
  things: [
    { names: ["20mm calibration cube", "20 mm test cube"], title: "20 mm calibration cube", params: { size: 20 } },
    { names: ["10mm test cube", "small calibration cube", "mini test cube"], title: "10 mm test cube", params: { size: 10 } },
    { names: ["40mm calibration cube", "large calibration cube", "big test cube"], title: "40 mm calibration cube", params: { size: 40 } },
    { names: ["single wall cube", "flow calibration cube", "flow test cube", "vase mode cube", "hollow calibration cube", "extrusion multiplier cube"],
      title: "Single-wall flow cube", params: { form: "hollow", wallT: 0.45, size: 25 } },
    { names: ["plain test cube", "blank calibration cube"], title: "Plain test cube", params: { marks: "no" } },
  ],
  body: `
const s = size;
const block = translate([-s / 2, -s / 2, 0], cube([s, s, s]));
if (form === "hollow") {
  const t = Math.min(wallT, s / 4);
  return difference(block, translate([-s / 2 + t, -s / 2 + t, Math.max(0.6, t)], cube([s - 2 * t, s - 2 * t, s])));
}
if (marks !== "yes") return block;
// vertical grooves print as plain walls; the top ones are open to the sky
const gd = Math.min(0.8, s * 0.04), gw = Math.min(1.6, s * 0.08);
const up = (x, y, w, d) => translate([x, y, -1], cube([w, d, s + 2]));
return difference(block,
  up(s / 2 - gd, -gw / 2, gd + 1, gw),                               // X: one
  up(-s * 0.15 - gw / 2, s / 2 - gd, gw, gd + 1),                     // Y: two
  up(s * 0.15 - gw / 2, s / 2 - gd, gw, gd + 1),
  ...[-0.2, 0, 0.2].map((f) => translate([s * f - gw / 2, -s / 2 - 1, s - gd], cube([gw, s + 2, gd + 1]))),  // Z: three
);
`,
};
