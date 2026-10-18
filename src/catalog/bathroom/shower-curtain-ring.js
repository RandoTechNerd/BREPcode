// A shower curtain hook: a C-shaped ring that snaps over the rod (or a
// closed ring you thread on), a short stem, and a J-hook below it that the
// curtain's grommet hangs on; double, it carries the curtain and the liner
// on separate hooks. It is one flat profile, extruded, so it prints flat in
// minutes with every layer running round the ring and the hook.

export default {
  id: "shower-curtain-ring",
  category: "bathroom",
  title: "Shower curtain hook",
  summary: "a snap-on shower curtain ring with a J-hook for the curtain, single or double, sized to the rod.",
  print: "flat as shown, no supports. PETG springs back best; print a dozen (most curtains have 12 holes).",
  names: ["shower curtain hook", "shower hook", "shower curtain hanger", "shower curtain clip", "snap on shower hook",
    "c shower hook", "shower curtain rod hook", "shower curtain holder hook"],
  nouns: ["hook", "ring", "hanger"],
  keywords: ["shower", "curtain", "rod", "liner", "bath", "grommet"],
  fits: ["rod"],
  fromSpec: (s) => ({ rodD: s.dims.d }),
  specNote: "the ring leaves room to slide",
  primary: "rodD",
  tips: ["double", "closed ring", "for a 32 mm rod", "thicker"],
  examples: ["I want a shower curtain hook", "make me a double shower curtain hook",
    "shower hook for a 25 mm rod", "shower curtain hook for my shower rod"],
  params: {
    rodD: { default: 25.4, min: 12, max: 45, unit: "mm", label: "rod diameter", say: ["rod", "diameter", "pole", "bar"], more: ["bigger"], less: ["smaller"] },
    clear: { default: 1.5, min: 0.3, max: 4, unit: "mm", label: "room round the rod", say: ["clearance", "room", "loose"] },
    ringT: { default: 4, min: 2.5, max: 8, unit: "mm", label: "ring and hook band width", say: ["band", "strong"], more: ["stronger"] },
    thick: { default: 5, min: 3, max: 10, unit: "mm", label: "thickness (printed height)", say: ["thick", "thickness"], more: ["thicker"], less: ["thinner"] },
    snap: { default: 0.85, min: 0, max: 0.95, unit: "ratio", label: "snap opening as a share of the rod (0 = closed ring)" },
    hookD: { default: 12, min: 6, max: 40, unit: "mm", label: "curtain hook inside diameter", say: ["hook", "grommet", "eyelet"] },
    drop: { default: 10, min: 2, max: 60, unit: "mm", label: "stem between the ring and the hook", say: ["drop", "stem", "long", "lower"], more: ["longer", "lower"], less: ["shorter"] },
    hooks: { default: 1, min: 1, max: 2, unit: "count", label: "hooks (2 = curtain and liner)", say: ["hook"] },
  },
  things: [
    { names: ["shower curtain ring", "shower ring", "bath curtain ring", "closed shower ring", "shower curtain loop"],
      title: "Shower curtain ring (closed, threads onto the rod)", params: { snap: 0 } },
    { names: ["double shower curtain hook", "double shower hook", "shower curtain and liner hook", "double curtain hook", "two hook shower ring"],
      title: "Double shower curtain hook", params: { hooks: 2, drop: 8 } },
    { names: ["shower liner hook", "liner hook", "shower liner ring", "curtain liner hook"],
      title: "Shower liner hook", params: { hookD: 9, drop: 5, ringT: 3.5, thick: 4 } },
    { names: ["shower rod hook", "loofah hook", "shower rod towel hook", "shower caddy hook", "shower rod hanger", "bath rod hook"],
      title: "Shower rod hook", spec: "bath-shower-rod", params: { hookD: 30, drop: 18, ringT: 5, thick: 7 } },
    { names: ["large rod shower hook", "wide rod shower hook", "big rod shower curtain hook", "thick rod shower hook"],
      title: "Shower hook for a 1-1/4 in rod", params: { rodD: 32 } },
  ],
  body: `
// flat profile in x, y (the rod runs along z through the ring); extruded \`thick\`
const ri = rodD / 2 + clear, ro = ri + ringT;
const arc = (cx, cy, r, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
});
const prism = (pts) => linearExtrude({ h: thick }, polygon(pts));
const deg = Math.PI / 180;

// the ring: a C open toward the upper right (a parallel-sided gap), or two halves of a closed ring
const parts = [];
const w = snap * rodD;
if (w > 0.5) {
  const g = 20 * deg;                                     // where the opening faces
  const ao = Math.asin(Math.min(0.99, w / 2 / ro)), ai = Math.asin(Math.min(0.99, w / 2 / ri));
  parts.push(prism([...arc(0, 0, ro, g + ao, g + 2 * Math.PI - ao, 40), ...arc(0, 0, ri, g + 2 * Math.PI - ai, g + ai, 40)]));
} else {
  parts.push(prism([...arc(0, 0, ro, -0.02, Math.PI + 0.02, 24), ...arc(0, 0, ri, Math.PI + 0.02, -0.02, 24)]));
  parts.push(prism([...arc(0, 0, ro, Math.PI, 2 * Math.PI, 24), ...arc(0, 0, ri, 2 * Math.PI, Math.PI, 24)]));
}

// the stem and the J-hook(s): the hook's band meets the stem at its side, then curls down and up
const hr = hookD / 2, rm = hr + ringT / 2;
const cy = -(ro + drop + hr * 0.3);
parts.push(prism([[-ringT / 2, cy - ringT / 2], [ringT / 2, cy - ringT / 2], [ringT / 2, -ri - 0.5], [-ringT / 2, -ri - 0.5]]));
const tipA = 30 * deg;
for (const sx of hooks > 1 ? [1, -1] : [1]) {
  const band = [...arc(rm, cy, hr + ringT, Math.PI, 2 * Math.PI + tipA, 28), ...arc(rm, cy, hr, 2 * Math.PI + tipA, Math.PI, 28)];
  const tip = arc(rm + rm * Math.cos(tipA), cy + rm * Math.sin(tipA), ringT / 2, 0, 2 * Math.PI - 0.2, 16);
  parts.push(prism(band.map(([x, y]) => [sx * x, y])));
  parts.push(prism(tip.map(([x, y]) => [sx * x, y])));
}
return translate([0, -cy / 2, 0], union(...parts));
`,
};
