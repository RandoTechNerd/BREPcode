// A bubble wand: a flat handle and a ring (or a cluster of rings) with
// notches round the inside edge that hold a film of bubble mix. One flat
// piece, printed lying down, with no small parts.

export default {
  id: "bubble-wand",
  category: "kids",
  title: "Bubble wand",
  summary: "a flat bubble wand: one notched ring or a cluster of them on a handle.",
  print: "flat as shown, no supports. One piece with no small parts.",
  names: ["bubble wand", "bubble wands", "bubble blower wand", "bubble ring wand", "soap bubble wand", "bubble maker wand",
    "bubble stick", "bubble blowing wand"],
  nouns: ["wand"],
  keywords: ["bubble", "bubbles", "soap", "kids", "outdoor", "summer", "blow"],
  primary: "ringD",
  tips: ["big ring", "7 rings", "longer handle"],
  examples: ["I want a bubble wand", "make me a bubble wand with a 100mm ring", "a big bubble wand", "multi ring bubble wand"],
  params: {
    ringD: { default: 70, min: 25, max: 180, unit: "mm", label: "ring inside diameter", say: ["ring", "across", "diameter", "hole"], more: ["bigger"], less: ["smaller"] },
    band: { default: 6, min: 3, max: 12, unit: "mm", label: "ring band width", say: ["band", "rim"] },
    rings: { default: 1, min: 1, max: 7, unit: "count", label: "rings (1, or a cluster up to 7)", say: ["ring", "hole"] },
    handleL: { default: 110, min: 40, max: 200, unit: "mm", label: "handle length", say: ["handle", "long", "length"], more: ["longer"], less: ["shorter"] },
    handleW: { default: 14, min: 8, max: 25, unit: "mm", label: "handle width", say: ["grip", "wide"] },
    thick: { default: 4, min: 2, max: 8, unit: "mm", label: "thickness", say: ["thick", "thickness"] },
    notches: { default: 24, min: 0, max: 48, unit: "count", label: "notches round each ring", say: ["notch", "teeth"] },
  },
  things: [
    { names: ["big bubble wand", "giant bubble wand", "large bubble wand"], title: "Big bubble wand", params: { ringD: 170, band: 8, handleL: 70, handleW: 18, thick: 5, notches: 40 } },
    { names: ["multi bubble wand", "multi ring bubble wand", "honeycomb bubble wand", "bubble cluster wand"], title: "Multi-ring bubble wand", params: { rings: 7, ringD: 26, band: 4, notches: 12 } },
    { names: ["mini bubble wand", "small bubble wand", "party favor bubble wand"], title: "Mini bubble wand", params: { ringD: 35, band: 4, handleL: 80, handleW: 10, thick: 3, notches: 16 } },
    { names: ["bubble ring", "hand bubble ring", "bubble loop"], title: "Bubble ring", params: { ringD: 90, band: 10, handleL: 40, handleW: 22 } },
  ],
  body: `
const ri = ringD / 2, ro = ri + band;
// the cluster: one ring, or a ring with up to six round it, bands overlapping so they join
const centres = [[0, 0]];
for (let i = 0; i < rings - 1; i++) centres.push([(ringD + band) * Math.cos(Math.PI / 2 + i * Math.PI / 3), (ringD + band) * Math.sin(Math.PI / 2 + i * Math.PI / 3)]);
const ext = rings > 1 ? ringD + band + ro : ro;          // how far the cluster reaches down
// a ring's hole, its edge zig-zagged into notches that hold the bubble film
const hole = (n = Math.max(notches, 0)) => {
  if (n < 6) return cylinder({ r: ri, h: thick + 2, $fn: 64 });
  const pts = [];
  for (let i = 0; i < 2 * n; i++) { const t = Math.PI * i / n, r = i % 2 ? ri + Math.min(1.2, band / 3) : ri; pts.push([r * Math.cos(t), r * Math.sin(t)]); }
  return linearExtrude({ h: thick + 2 }, polygon(pts));
};
const discs = centres.map(([x, y]) => translate([x, y, 0], cylinder({ r: ro, h: thick, $fn: 64 })));
const handleBar = translate([-handleW / 2, -ext - handleL + band, 0], cube([handleW, handleL, thick]));
const end = translate([0, -ext - handleL + band, 0], cylinder({ r: handleW * 0.75, h: thick, $fn: 32 }));
const holes = centres.map(([x, y]) => translate([x, y, -1], hole()));
const wand = difference(union(...discs, handleBar, end), ...holes);
return translate([0, (handleL + ext) / 2 - ro / 2, 0], wand);
`,
};
