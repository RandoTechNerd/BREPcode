// A rain gauge: a straight tube reads rainfall directly (10 mm in the tube
// is 10 mm of rain, whatever its width), so the marks are just rings every
// few millimetres up the outside, a deeper one every fifth. The marks are V
// grooves with steep flanks, cut into one lathed profile, so the tube prints
// upright with nothing hanging. It screws to a fence post by a back plate,
// or stands on a wide foot.

export default {
  id: "rain-gauge",
  category: "garden",
  title: "Rain gauge",
  summary: "a straight tube with ring marks every few millimetres of rain, on a fence-post plate or a foot.",
  print: "upright as shown, no supports. A clear or white filament makes the water easy to read.",
  names: ["rain gauge", "rain gage", "rainfall gauge", "rain meter", "precipitation gauge", "rain measuring tube",
    "garden rain gauge"],
  nouns: ["gauge", "gage"],
  keywords: ["rain", "rainfall", "weather", "garden", "measure"],
  tips: ["200 mm tall", "marks every 10 mm", "on a foot"],
  examples: ["I want a rain gauge", "make me a rain gauge 200mm tall", "rain gauge with marks every 10mm",
    "a rain gauge for my fence post"],
  params: {
    tubeD: { default: 40, min: 20, max: 80, unit: "mm", label: "inside diameter", say: ["across", "diameter", "wide"], more: ["wider"], less: ["narrower"] },
    height: { default: 160, min: 60, max: 240, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    step: { default: 5, min: 2, max: 20, unit: "mm", label: "rain between marks", say: ["every", "mark", "step"] },
    wall: { default: 2.4, min: 1.6, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    mount: { default: "plate", unit: "choice", choices: ["plate", "foot"], label: "fence plate or standing foot",
      words: { foot: ["foot", "freestanding", "standing", "stake"], plate: ["fence", "post", "plate", "wall"] } },
  },
  things: [
    { names: ["fence rain gauge", "fence post rain gauge", "post mounted rain gauge"], title: "Fence-post rain gauge", params: { height: 200 } },
    { names: ["freestanding rain gauge", "standing rain gauge", "rain gauge with foot"], title: "Freestanding rain gauge", params: { mount: "foot" } },
    { names: ["mini rain gauge", "small rain gauge"], title: "Mini rain gauge", params: { tubeD: 25, height: 100 } },
    { names: ["large rain gauge", "tall rain gauge"], title: "Large rain gauge", params: { tubeD: 60, height: 230, step: 10 } },
  ],
  body: `
const Ri = tubeD / 2, R = Ri + wall, fl = 3;
const foot = mount === "foot";
const z0 = foot ? 18 : 0;                                 // where the tube proper starts
// the outside edge, bottom to top, with a V groove at every mark (flanks steeper than 45 degrees)
const edge = [];
for (let n = 1; fl + n * step < height - 4; n++) {
  const z = fl + n * step;
  const major = n % 5 === 0;
  const gh = Math.min(major ? 3 : 1.4, step * (major ? 0.9 : 0.6)), gd = Math.min(gh * 0.4, wall - 1);
  if (z - gh / 2 > z0 + 1) edge.push([R, z - gh / 2], [R - gd, z], [R, z + gh / 2]);
}
const base = foot ? [[0, 0], [R + 15, 0], [R + 15, 3], [R, z0]] : [[0, 0], [R, 0]];
const gauge = revolve(360, polygon([...base, ...edge, [R, height], [Ri, height], [Ri, fl], [0, fl]]));
if (foot) return gauge;

// a back plate for a fence post, screws outside the tube's shadow, countersunk on the front
const pw = 2 * R + 26, pt = 5, y0 = R - 1;
const plate = translate([-pw / 2, y0, 0], cube([pw, pt, height]));
const screwAt = (x, z) => [
  translate([x, y0 - 1, z], rotate([-90, 0, 0], cylinder({ r: 2.25, h: pt + 2, $fn: 20 }))),
  translate([x, y0 - 0.01, z], rotate([-90, 0, 0], cylinder({ r1: 4.6, r2: 2.25, h: 2.35, $fn: 20 }))),
];
const xs = R + 7;
// holes into the plate alone first: cutting a flat box is far cheaper than cutting the grooved tube
const drilled = difference(plate, ...screwAt(-xs, height * 0.25), ...screwAt(xs, height * 0.25), ...screwAt(-xs, height * 0.75), ...screwAt(xs, height * 0.75));
return union(gauge, drilled);
`,
};
