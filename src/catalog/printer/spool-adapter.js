// A hub that plugs a spool's big centre hole down to a bearing or a rod. A
// flange stops it pushing through; the hub slips into the hole; the middle
// is a seat for a 608 skate bearing (22 x 7, the commonest there is) or a
// plain hole for a rod. Big hubs get a ring of lightening holes, cut
// straight down so nothing has to bridge.

export default {
  id: "spool-adapter",
  category: "printer",
  title: "Spool hub adapter",
  summary: "a hub that fits a spool's centre hole and turns it on a 608 bearing or a rod.",
  print: "flange down as shown, no supports. Press the bearing in from the top.",
  names: ["spool adapter", "spool hub adapter", "spool hub", "spool bearing adapter", "filament spool adapter",
    "spool insert", "spool bushing", "spool center adapter", "spool hole adapter", "spool bearing hub"],
  nouns: ["adapter", "hub", "insert", "bushing"],
  keywords: ["spool", "filament", "bearing", "608", "rod", "hole"],
  fits: ["spool"],
  fromSpec: (s) => ({ boreD: s.dims.bore }),
  primary: "boreD",
  tips: ["for a 52 mm hole", "for an 8 mm rod", "longer hub"],
  examples: ["make me a spool adapter", "608 bearing spool adapter for a 55mm hole",
    "spool hub adapter for an 8mm rod", "a spool insert for a 3kg spool"],
  params: {
    boreD: { default: 53, min: 20, max: 80, unit: "mm", label: "spool hole diameter", say: ["hole", "bore", "hub", "diameter"] },
    hubL: { default: 12, min: 5, max: 40, unit: "mm", label: "how far the hub goes in", say: ["long", "deep", "length"] },
    flange: { default: 6, min: 0, max: 20, unit: "mm", label: "flange lip past the hole (0 = none)", say: ["flange", "lip"] },
    plateT: { default: 3, min: 2, max: 6, unit: "mm", label: "flange thickness", say: ["thick", "thickness"] },
    centre: { default: "608", unit: "choice", choices: ["608", "rod"], label: "what goes through the middle",
      words: { rod: ["rod", "bar", "pipe", "dowel", "no bearing"], "608": ["608", "bearing", "skate bearing"] } },
    rodD: { default: 8.5, min: 3, max: 30, unit: "mm", label: "rod diameter (rod centre)", say: ["rod", "bar", "pipe", "dowel"] },
  },
  things: [
    { names: ["608 spool adapter", "608 bearing spool hub", "skate bearing spool adapter"], title: "608 spool adapter", params: { centre: "608" } },
    { names: ["spool rod adapter", "spool rod insert", "spool dowel adapter"], title: "Spool rod adapter", params: { centre: "rod", rodD: 8.5 } },
    { names: ["spool hole reducer", "spool bore reducer", "spool reducer"], title: "Spool hole reducer", params: { centre: "rod", rodD: 30, hubL: 15 } },
    { names: ["small spool adapter", "mini spool adapter", "sample spool adapter"], title: "Small spool adapter", spec: "spool-mini" },
    { names: ["3kg spool adapter", "large spool adapter", "big spool adapter"], title: "3 kg spool adapter", spec: "spool-3kg", params: { hubL: 18 } },
  ],
  body: `
const seat = centre === "608" && boreD >= 27;       // a 608 is 22 across: it needs a hub to live in
const hubR = boreD / 2 - 0.3;                        // slips into the spool's hole
const tall = (flange >= 1 ? plateT : 0) + hubL;
const solid = flange >= 1
  ? union(cylinder({ r: boreD / 2 + flange, h: plateT, $fn: 72 }), translate([0, 0, plateT - 0.01], cylinder({ r: hubR, h: hubL + 0.01, $fn: 72 })))
  : cylinder({ r: hubR, h: hubL, $fn: 72 });
const holeR = seat ? 11.08 : Math.min(rodD / 2 + 0.2, hubR - 3);
const cuts = seat
  ? [translate([0, 0, tall - Math.min(7.2, tall - 1.2)], cylinder({ r: holeR, h: 8, $fn: 64 })),
     translate([0, 0, -1], cylinder({ r: 9.5, h: tall + 2, $fn: 64 }))]   // push the bearing out from below
  : [translate([0, 0, -1], cylinder({ r: holeR, h: tall + 2, $fn: 64 }))];
// lightening holes in the ring between the middle and the hub wall
const band = hubR - holeR - 4;
if (band >= 8) {
  const hr = band / 2 - 1, rc = holeR + 2 + band / 2;
  const n = Math.max(3, Math.floor(2 * Math.PI * rc / (2 * hr + 4)));
  for (let i = 0; i < n; i++) {
    const a = 2 * Math.PI * i / n;
    cuts.push(translate([rc * Math.cos(a), rc * Math.sin(a), -1], cylinder({ r: hr, h: tall + 2, $fn: 32 })));
  }
}
return difference(solid, ...cuts);
`,
};
