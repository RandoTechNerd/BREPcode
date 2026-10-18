// A lamp shade: drum, empire (a straight taper) or bell, with a fitter ring
// at the top for an E27/E26 or E14 lamp holder or a harp's stud, held by
// spokes. Printed upside down, top ring on the bed, so the shade widens as it
// rises at no more than 45 degrees. The wall and a solid top are one turned
// outline, and the openings between the spokes are cut out of the flat top.

export default {
  id: "lamp-shade",
  category: "decor",
  title: "Lamp shade",
  summary: "a drum, tapered or bell lamp shade with a fitter ring for E27, E14 or a harp.",
  print: "upside down as shown, no supports. Use LED bulbs only: PLA softens at 60 C. Vase-thin walls glow nicely in white or natural PLA.",
  names: ["lamp shade", "lampshade", "light shade", "lamp cover", "shade for a lamp", "replacement lamp shade", "light cover shade"],
  nouns: ["shade"],
  keywords: ["lamp", "light", "pendant", "ceiling", "bulb", "table", "bedside", "e27", "e14"],
  fits: ["lampholder"],
  fromSpec: (s) => ({ fitter: s.id === "lampholder-e14" ? "e14" : s.id === "lampholder-harp" ? "spider" : "e27" }),
  tips: ["a bell shape", "for an E14 bulb", "250 mm across", "taller"],
  examples: ["I want a lamp shade", "make me a pendant lamp shade for an e27 bulb",
    "a drum lampshade 200mm across", "bell lamp shade 150mm tall"],
  params: {
    bottomD: { default: 200, min: 60, max: 250, unit: "mm", label: "bottom (wide end) diameter", say: ["across", "diameter", "bottom", "wide", "width"], more: ["wider", "bigger"], less: ["narrower", "smaller"] },
    topD: { default: 110, min: 40, max: 240, unit: "mm", label: "top diameter", say: ["top"] },
    height: { default: 150, min: 40, max: 250, unit: "mm", label: "height", say: ["tall", "high", "height", "long"], more: ["taller", "longer"], less: ["shorter"] },
    shape: { default: "empire", unit: "choice", choices: ["empire", "drum", "bell"], label: "shape",
      words: { drum: ["drum", "cylinder", "straight"], bell: ["bell", "flared", "curved", "tulip"], empire: ["empire", "tapered", "cone", "coolie"] } },
    fitter: { default: "e27", unit: "choice", choices: ["e27", "e14", "spider"], label: "lamp holder (spider = harp)",
      words: { e14: ["e14", "e12", "candelabra", "small bulb"], spider: ["spider", "harp", "table lamp"], e27: ["e27", "e26", "standard bulb", "medium base"] } },
    wall: { default: 1.6, min: 0.8, max: 3, unit: "mm", label: "wall thickness", say: ["wall", "thick"] },
    topT: { default: 3, min: 2, max: 6, unit: "mm", label: "top ring and spoke thickness", say: ["ring", "spoke"] },
    spokes: { default: 3, min: 3, max: 8, unit: "count", label: "spokes", say: ["spoke", "arm"] },
  },
  things: [
    { names: ["pendant lamp shade", "pendant shade", "pendant light shade", "ceiling light shade", "hanging lamp shade", "pendant light cover"],
      title: "Pendant shade", params: { shape: "bell", topD: 80, bottomD: 220, height: 160, fitter: "e27" } },
    { names: ["table lamp shade", "bedside lamp shade", "desk lamp shade"], title: "Table lamp shade",
      params: { shape: "empire", topD: 120, bottomD: 200, height: 150, fitter: "spider" } },
    { names: ["drum lamp shade", "drum shade", "drum lampshade", "cylinder lamp shade"], title: "Drum shade",
      params: { shape: "drum", topD: 200, bottomD: 200, height: 150 } },
    { names: ["e14 lamp shade", "small lamp shade", "candelabra lamp shade", "chandelier shade", "e12 lamp shade"], title: "Small E14 shade",
      params: { fitter: "e14", topD: 60, bottomD: 120, height: 100 } },
    { names: ["e27 lamp shade", "e26 lamp shade", "standard lamp shade"], title: "E27 shade", params: { fitter: "e27" } },
    { names: ["bell lamp shade", "bell shade", "tulip lamp shade"], title: "Bell shade", params: { shape: "bell", topD: 90, bottomD: 200, height: 140 } },
  ],
  body: `
// upside down: z = 0 is the top (on the bed), the wide end is up
const rb = bottomD / 2;
const hole = fitter === "e14" ? 29 : fitter === "spider" ? 7 : 40.5;   // fitter hole: E14, harp stud, E27/E26
const rh = hole / 2;
const rr = rh + 5;                                       // fitter ring outer radius
// a drum keeps a millimetre of taper: a dead-straight wall cut this way is a slow
// case for the kernel, and nobody can see 0.4 degrees
const rt0 = shape === "drum" ? rb - 1 : topD / 2;
const rt = Math.max(rt0, rr + 12, rb - height * 0.9);    // never widen faster than 45 degrees
const N = shape === "bell" ? 20 : 2;                     // a straight wall needs only its ends
const rAt = (u) => shape === "bell" ? rt + (rb - rt) * u * u : rt + (rb - rt) * u;
let out = Array.from({ length: N + 1 }, (_, i) => [rAt(i / N), height * i / N]);
// a bell's flare can outrun 45 degrees near the rim: hold it back
for (let i = 1; i <= N; i++) out[i][0] = Math.min(out[i][0], out[i - 1][0] + 0.9 * height / N);
const inner = out.map(([r, z]) => [r - wall, z]).filter(([, z]) => z >= topT).reverse();
const skin = revolve(360, polygon([[0, 0], ...out, ...inner, [out[0][0] - wall, topT], [0, topT]]));
// cut the top open between the spokes, leaving the fitter ring
const sector = (a0, a1, r0, r1, n = 12) => polygon([
  ...Array.from({ length: n + 1 }, (_, i) => [r0 * Math.cos(a0 + (a1 - a0) * i / n), r0 * Math.sin(a0 + (a1 - a0) * i / n)]),
  ...Array.from({ length: n + 1 }, (_, i) => [r1 * Math.cos(a1 - (a1 - a0) * i / n), r1 * Math.sin(a1 - (a1 - a0) * i / n)]),
]);
const spokeW = Math.max(5, topT * 2);
const rOut = out[0][0] - wall - 1.5;                     // keep the cut clear of the wall
const gap = (spokeW / 2) / rr;                           // half a spoke, as an angle at the ring
const windows = Array.from({ length: spokes }, (_, i) => {
  const a = 2 * Math.PI * i / spokes;
  return translate([0, 0, -1], linearExtrude({ h: topT + 2 }, sector(a + gap, a + 2 * Math.PI / spokes - gap, rr, rOut)));
});
const bore = translate([0, 0, -1], linearExtrude({ h: topT + 2 }, polygon(Array.from({ length: 48 }, (_, i) => [rh * Math.cos(Math.PI * i / 24), rh * Math.sin(Math.PI * i / 24)]))));
return difference(skin, bore, ...windows);
`,
};
