// A turned adapter between two round things: a shop-vac hose cuff, a tool's
// dust port, a dust-collection hose or fitting, a PVC pipe. Each end either
// slips OVER something (its bore is that size plus clearance) or goes INTO
// it (its outside is that size less clearance), with a degree of taper so it
// tightens as it is pushed home. The cone between the ends is never flatter
// than 45 degrees, so it prints upright, end A down, with no support.

export default {
  id: "hose-adapter",
  category: "garage",
  title: "Hose adapter",
  summary: "a turned adapter that joins a vacuum or dust-collection hose to a tool port, a pipe or another hose.",
  print: "upright, end A on the bed, no supports. Measure both ends: hose labels are nominal sizes, not what the cuff measures.",
  names: ["hose adapter", "vacuum hose adapter", "shop vac adapter", "shop vac hose adapter", "dust collection adapter",
    "dust collector adapter", "vacuum adapter", "dust hose adapter", "hose reducer", "dust collection fitting", "vac adapter"],
  nouns: ["adapter", "reducer", "fitting", "coupler", "connector"],
  keywords: ["vacuum", "vac", "dust", "hose", "port", "shop", "pipe", "sander", "saw", "extractor"],
  fits: ["hose"],
  fromSpec: (s) => s.dims.id ? { dA: s.dims.id, fitA: "into" } : { dA: s.dims.od, fitA: "over" },
  ask: {
    unless: ["dA", "dB"],
    text: "What does each end meet? Give both sizes (“57 mm cuff to a 35 mm port”) and whether each end slips over or goes into it. I made a 2-1/2 inch shop-vac hose (its 57 mm cuff) to a 4 inch dust-collection hose.",
  },
  tips: ["from 57 mm to 35 mm", "end B goes over", "longer sleeves"],
  examples: ["I want a shop vac adapter", "make me a dust port adapter from 57mm to 35mm",
    "hose adapter for a 4 inch dust collection hose", "vacuum hose adapter for 2 inch pvc"],
  params: {
    dA: { default: 57.2, min: 10, max: 160, unit: "mm", label: "end A size (what it meets)", say: ["from", "first", "big", "cuff"] },
    fitA: { default: "over", unit: "choice", choices: ["over", "into"], label: "end A slips over it, or goes into it",
      words: { into: ["a goes into", "a inside"], over: ["a goes over", "a over"] } },
    lenA: { default: 40, min: 10, max: 120, unit: "mm", label: "end A sleeve length", say: ["sleeve", "long"] },
    dB: { default: 101.6, min: 10, max: 160, unit: "mm", label: "end B size (what it meets)", say: ["to", "second", "small", "port", "tool"] },
    fitB: { default: "into", unit: "choice", choices: ["into", "over"], label: "end B goes into it, or slips over it",
      words: { over: ["b goes over", "b over", "over the port", "over a port"], into: ["b goes into", "b inside", "into the hose"] } },
    lenB: { default: 40, min: 10, max: 120, unit: "mm", label: "end B sleeve length", say: ["length"] },
    neck: { default: 10, min: 0, max: 80, unit: "mm", label: "extra length between the ends", say: ["neck", "between"] },
    wall: { default: 2.4, min: 1.6, max: 6, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["stronger"] },
    fit: { default: 0.3, min: 0, max: 1.5, unit: "mm", label: "clearance per side", say: ["fit", "clearance", "loose"] },
    taper: { default: 1, min: 0, max: 4, unit: "deg", label: "friction taper on each sleeve", say: ["taper", "degree"] },
  },
  things: [
    { names: ["shop vac to 4 inch adapter", "shop vac to dust collector adapter"], title: "Shop vac to 4 inch hose" },
    { names: ["dust port adapter", "tool dust port adapter", "sander dust adapter", "sander hose adapter", "sander vacuum adapter", "power tool vacuum adapter"],
      title: "Dust port adapter", params: { dA: 57.2, fitA: "over", dB: 35, fitB: "over", lenB: 30 } },
    { names: ["vacuum hose connector", "hose coupler", "hose joiner", "shop vac hose coupler", "vacuum hose extension"],
      title: "Hose coupler", params: { dA: 57.2, fitA: "over", dB: 57.2, fitB: "over", neck: 4 } },
    { names: ["table saw dust adapter", "table saw dust port adapter", "4 inch port adapter"], title: "Table saw dust adapter",
      spec: "dust-port-4in", params: { dB: 57.2, fitB: "over" } },
    { names: ["dust collection reducer", "4 inch to 2.5 inch reducer", "dust hose reducer"], title: "Dust collection reducer",
      spec: "dust-hose-4in", params: { dB: 63.5, fitB: "into" } },
    { names: ["pvc dust adapter", "pvc vacuum adapter", "pvc pipe adapter"], title: "PVC to shop vac adapter",
      spec: "pvc-2in", params: { dB: 57.2, fitB: "over" } },
  ],
  body: `
const t = Math.tan(taper * Math.PI / 180);
// each sleeve as [inner, outer] radii at its free end and at its root
const sleeve = (d, mode, len) => {
  const grow = len * t / 2;
  if (mode === "over") {                        // its bore takes the thing: loose at the mouth, tight at the root
    const free = d / 2 + fit + grow, root = d / 2 + fit - grow;
    return { free: [free, free + wall], root: [root, root + wall] };
  }
  const free = d / 2 - fit - grow, root = d / 2 - fit + grow;   // it goes in: small at the tip
  // a small insert keeps at least a 1 mm bore
  return { free: [Math.max(1, free - wall), Math.max(1.8, free)], root: [Math.max(1, root - wall), Math.max(1.8, root)] };
};
const A = sleeve(dA, fitA, lenA), B = sleeve(dB, fitB, lenB);
// the cone between them stays steeper than 45 degrees, so it needs no support
const rise = Math.max(Math.abs(B.root[0] - A.root[0]), Math.abs(B.root[1] - A.root[1])) * 1.1 + neck;
const z1 = lenA, z2 = lenA + rise, z3 = z2 + lenB;
// revolve() spins a profile that sits on the axis: the outside, less the bore
// (the bore runs a millimetre past each end so the cut is clean)
const outside = polygon([[0, 0], [A.free[1], 0], [A.root[1], z1], [B.root[1], z2], [B.free[1], z3], [0, z3]]);
const bore = polygon([[0, -1], [A.free[0], -1], [A.free[0], 0], [A.root[0], z1], [B.root[0], z2], [B.free[0], z3],
  [B.free[0], z3 + 1], [0, z3 + 1]]);
return difference(revolve({ angle: 360, $fn: 96 }, outside), revolve({ angle: 360, $fn: 96 }, bore));
`,
};
