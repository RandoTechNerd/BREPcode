// A spacer, washer or bushing: a ring of any outside diameter, bore and
// thickness, round, hex or square, and as many as you need laid out on the
// bed. Size the bore from the bolt it goes on ("for an M5 bolt").

export default {
  id: "spacer",
  category: "home",
  title: "Spacer",
  summary: "a round, hex or square spacer, washer or bushing, sized to its bolt.",
  print: "flat as shown, no supports.",
  names: ["spacer", "spacers", "round spacer", "spacer washer", "plastic spacer", "spacer ring", "flat washer", "plastic washer",
    "nylon washer", "shim washer", "bolt spacer", "screw spacer"],
  nouns: ["spacer", "washer", "bushing", "shim"],
  keywords: ["bolt", "screw", "gap", "space", "ring", "hole", "m3", "m4", "m5", "m6", "m8"],
  fits: ["screw"],
  fromSpec: (s) => ({ innerD: s.dims.d + 0.4, outerD: Math.round(s.dims.d * 2 + 2) }),
  specNote: "the bore clears the bolt by 0.4 mm",
  primary: "height",
  tips: ["10 mm thick", "for an M5 bolt", "6 pieces", "hex"],
  examples: ["I want a spacer washer", "make me a 10mm thick spacer for an m5 bolt",
    "plastic washers, 4 pieces", "a bushing 12mm outside 8mm inside 15mm long"],
  params: {
    outerD: { default: 12, min: 3, max: 100, unit: "mm", label: "outside diameter", say: ["outside", "outer", "od", "across", "diameter"], more: ["wider", "bigger"], less: ["smaller"] },
    innerD: { default: 5.3, min: 0, max: 90, unit: "mm", label: "bore (0 = solid)", say: ["inside", "inner", "id", "bore"] },
    height: { default: 5, min: 0.4, max: 100, unit: "mm", label: "thickness", say: ["height"], more: ["thicker", "longer"], less: ["thinner", "shorter"] },
    shape: { default: "round", unit: "choice", choices: ["round", "hex", "square"], label: "outside shape",
      words: { hex: ["hex", "hexagon", "hexagonal"], square: ["square"], round: ["round", "circular"] } },
    count: { default: 1, min: 1, max: 24, unit: "count", label: "how many", say: ["piece", "pieces", "pc", "pcs", "copies"] },
  },
  things: [
    { names: ["plastic washers", "flat washers", "plastic flat washer"], title: "Washer", params: { height: 1.6 } },
    { names: ["m4 spacer", "m4 washer"], title: "M4 spacer", spec: "screw-m4", params: { height: 5 } },
    { names: ["m5 spacer", "m5 washer"], title: "M5 spacer", spec: "screw-m5", params: { height: 5 } },
    { names: ["m6 spacer", "m6 washer"], title: "M6 spacer", spec: "screw-m6", params: { height: 6 } },
    { names: ["m8 spacer", "m8 washer"], title: "M8 spacer", spec: "screw-m8", params: { height: 8 } },
    { names: ["bushing", "sleeve bushing", "plastic bushing", "bushing sleeve", "pivot bushing"], title: "Bushing",
      params: { outerD: 12, innerD: 8.2, height: 15 } },
    { names: ["fender washer", "large washer", "wide washer"], title: "Fender washer", params: { outerD: 30, innerD: 6.6, height: 1.6 } },
    { names: ["thin shim", "thin washer", "shim ring"], title: "Shim washer", params: { height: 0.6 } },
    { names: ["hex spacer", "hexagon spacer", "hex standoff spacer"], title: "Hex spacer", params: { shape: "hex", height: 10 } },
  ],
  body: `
const od = Math.max(outerD, innerD + 2.4);              // at least 1.2 mm of ring each side
const outline = shape === "hex"
  ? polygon(Array.from({ length: 6 }, (_, i) => [od / Math.sqrt(3) * Math.cos(Math.PI * i / 3), od / Math.sqrt(3) * Math.sin(Math.PI * i / 3)]))
  : null;
const one = () => {
  const solid = shape === "hex" ? linearExtrude({ h: height }, outline)
    : shape === "square" ? translate([-od / 2, -od / 2, 0], cube([od, od, height]))
    : cylinder({ r: od / 2, h: height, $fn: 64 });
  return innerD > 0 ? difference(solid, translate([0, 0, -1], cylinder({ r: innerD / 2, h: height + 2, $fn: 48 }))) : solid;
};
// lay them out in a grid, a few millimetres apart
const cols = Math.ceil(Math.sqrt(count));
const step = (shape === "hex" ? od * 1.16 : od) + 4;
const pieces = Array.from({ length: count }, (_, i) => translate([(i % cols) * step, Math.floor(i / cols) * step, 0], one()));
return pieces.length > 1 ? group(...pieces) : pieces[0];
`,
};
