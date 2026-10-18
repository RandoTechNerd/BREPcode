// A double clip that parks a cane (or a crutch) on something round and
// upright: a walker or rollator frame, a wheelchair tube, a bed rail or a
// table leg. Two C-shaped clips back to back, each with a mouth narrower
// than its tube so it snaps on. One flat shape, printed lying down.

export default {
  id: "cane-holder",
  category: "access",
  title: "Cane holder clip",
  summary: "two snap-on clips back to back that park a cane or crutch on a walker, wheelchair, bed rail or table leg.",
  print: "flat as shown, no supports. PETG snaps on and off better than PLA.",
  names: ["cane holder", "cane clip", "walking stick holder", "walking stick clip", "cane holder clip", "cane to walker clip",
    "cane parking clip", "cane caddy", "stick holder for walker"],
  nouns: ["clip", "holder"],
  keywords: ["cane", "walking", "stick", "crutch", "walker", "wheelchair", "rollator", "mobility"],
  fits: ["cane"],
  fromSpec: (s) => ({ caneD: s.dims.d }),
  tips: ["for a wooden walking stick", "for a 1 inch walker tube", "taller clip"],
  examples: ["I want a cane holder", "a cane holder for my walker",
    "clip to hold my walking stick on my wheelchair", "crutch holder clip"],
  params: {
    caneD: { default: 22.2, min: 12, max: 40, unit: "mm", label: "cane diameter", say: ["cane", "stick", "crutch", "diameter"] },
    tubeD: { default: 25.4, min: 12, max: 45, unit: "mm", label: "frame tube diameter", say: ["tube", "frame", "walker", "rail", "leg"] },
    height: { default: 20, min: 8, max: 40, unit: "mm", label: "clip height", say: ["tall", "high", "height"], more: ["taller"] },
    wall: { default: 3.5, min: 2.4, max: 6, unit: "mm", label: "clip wall", say: ["wall", "thick"], more: ["stiffer", "stronger"] },
    web: { default: 6, min: 2, max: 30, unit: "mm", label: "space between the clips", say: ["apart", "space", "web"] },
    mouth: { default: 0.75, min: 0.5, max: 0.9, unit: "ratio", label: "clip mouth as a share of the tube", say: ["mouth", "opening"] },
  },
  things: [
    { names: ["walker cane holder", "cane holder for walker", "rollator cane holder", "cane holder for rollator"], title: "Walker cane holder",
      spec: "cane-walker" },
    { names: ["wheelchair cane holder", "cane holder for wheelchair", "wheelchair crutch holder"], title: "Wheelchair cane holder",
      params: { tubeD: 22.2 } },
    { names: ["crutch holder", "crutch clip", "crutches holder", "crutch pair clip"], title: "Crutch holder", params: { caneD: 22.2, tubeD: 22.2, height: 25 } },
    { names: ["bed rail cane holder", "cane holder for bed", "grab bar cane holder"], title: "Bed rail cane holder", params: { tubeD: 31.8 } },
    { names: ["wooden walking stick clip", "walking stick holder for walker"], title: "Walking stick clip", spec: "cane-wooden" },
  ],
  body: `
// lying flat: the cane's clip on the left, the frame's on the right, mouths facing out
const ra = caneD / 2 + wall, rb = tubeD / 2 + wall;
const xa = -(ra + web / 2), xb = rb + web / 2;
const bw = Math.min(ra, rb) * 1.2;               // the web joining the two clips
const solid = union(translate([xa, 0, 0], cylinder({ r: ra, h: height, $fn: 48 })), translate([xb, 0, 0], cylinder({ r: rb, h: height, $fn: 48 })),
  translate([xa, -bw / 2, 0], cube([xb - xa, bw, height])));
// each bore, and a mouth narrower than its tube so the clip snaps on
const ma = caneD * mouth, mb = tubeD * mouth;
return difference(solid,
  translate([xa, 0, -1], cylinder({ r: caneD / 2, h: height + 2, $fn: 48 })),
  translate([xb, 0, -1], cylinder({ r: tubeD / 2, h: height + 2, $fn: 48 })),
  translate([xa - ra - 1, -ma / 2, -1], cube([ra + 1 - caneD * 0.15, ma, height + 2])),
  translate([xb + tubeD * 0.15, -mb / 2, -1], cube([rb + 1 - tubeD * 0.15, mb, height + 2])));
`,
};
