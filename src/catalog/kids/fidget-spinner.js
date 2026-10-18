// A fidget spinner: a flat body of rounded arms round a 608 skate bearing,
// with weight pockets in the lobes (more bearings, coins or nuts) or open
// rings. Every arm is one stadium outline; they are extruded and joined,
// and the pockets go straight through, so it prints flat in minutes.

export default {
  id: "fidget-spinner",
  category: "kids",
  title: "Fidget spinner",
  summary: "a flat spinner body for a 608 bearing, with 2 to 6 arms and weight pockets in the lobes.",
  print: "flat as shown, no supports. Press a 608 bearing into the middle (and more, or coins, into the lobes). Bearings and coins are small parts: not for children under 3.",
  names: ["fidget spinner", "hand spinner", "finger spinner", "spinner toy", "fidget toy spinner", "desk spinner",
    "bearing spinner", "edc spinner"],
  nouns: ["spinner"],
  keywords: ["fidget", "bearing", "608", "hand", "finger", "spin", "adhd", "toy"],
  fits: ["bearing", "coin"],
  fromSpec: (s) => s.kind === "bearing" ? { centerD: s.dims.od + 0.1, thick: s.dims.w } : { weightD: s.dims.d + 0.2 },
  tips: ["4 arms", "for quarters", "open rings"],
  examples: ["I want a fidget spinner", "make me a fidget spinner with 4 arms", "a hand spinner weighted with quarters",
    "tri spinner for 608 bearings"],
  params: {
    arms: { default: 3, min: 2, max: 6, unit: "count", label: "arms", say: ["arm", "lobe", "blade", "prong"] },
    armR: { default: 34, min: 20, max: 60, unit: "mm", label: "centre to lobe centre", say: ["long", "reach", "size"], more: ["bigger", "longer"], less: ["smaller", "shorter"] },
    centerD: { default: 22.1, min: 12, max: 30, unit: "mm", label: "centre bearing pocket", say: ["centre", "center", "hub"] },
    weightD: { default: 22.1, min: 0, max: 30, unit: "mm", label: "lobe pocket (0 = solid lobes)", say: ["weight", "coin", "pocket"] },
    thick: { default: 7, min: 4, max: 12, unit: "mm", label: "thickness", say: ["thick", "thickness"], more: ["thicker"], less: ["thinner"] },
    lobeW: { default: 4.5, min: 2.5, max: 10, unit: "mm", label: "rim round each pocket", say: ["rim", "wall"] },
  },
  things: [
    { names: ["tri spinner", "three arm spinner", "triple spinner"], title: "Tri spinner" },
    { names: ["bar spinner", "two arm spinner", "dual spinner"], title: "Bar spinner", params: { arms: 2, armR: 36 } },
    { names: ["quad spinner", "four arm spinner"], title: "Quad spinner", params: { arms: 4, armR: 32 } },
    { names: ["six arm spinner", "flower spinner", "hex spinner"], title: "Flower spinner", params: { arms: 6, armR: 30, weightD: 16, lobeW: 3 } },
    { names: ["coin spinner", "quarter spinner", "coin weighted spinner"], title: "Coin spinner", spec: "us-quarter" },
    { names: ["open ring spinner", "ring spinner", "light spinner"], title: "Open ring spinner", params: { weightD: 26, lobeW: 3 } },
    { names: ["mini spinner", "small fidget spinner", "keychain spinner"], title: "Mini spinner", spec: "r188-bearing", params: { arms: 3, armR: 22, weightD: 0 } },
  ],
  body: `
const rc = centerD / 2 + lobeW;                            // hub radius
const rl = (weightD > 0 ? weightD / 2 : 6) + lobeW;        // lobe radius
const R = Math.max(armR, rc + rl - 2);                     // lobes never swallow the hub
// one arm: a stadium from inside the hub out to a lobe (tangent lines between two circles);
// its hub end sits inside the hub disc, so the arms never share an edge
const ra = rc * 0.7;
const stadium = (a, n = 24) => {
  const d = R, s = (ra - rl) / d, w = Math.acos(Math.max(-1, Math.min(1, s)));
  const pts = [];
  for (let i = 0; i <= n; i++) { const t = a + w + (2 * Math.PI - 2 * w) * i / n; pts.push([ra * Math.cos(t), ra * Math.sin(t)]); }
  for (let i = 0; i <= n; i++) { const t = a - w + 2 * w * i / n; pts.push([d * Math.cos(a) + rl * Math.cos(t), d * Math.sin(a) + rl * Math.sin(t)]); }
  return linearExtrude({ h: thick }, polygon(pts));
};
const angles = Array.from({ length: arms }, (_, i) => 2 * Math.PI * i / arms);
const body = union(cylinder({ r: rc, h: thick, $fn: 64 }), ...angles.map((a) => stadium(a)));
// pockets turned a few degrees off the hub's corners, so no two outlines line up
const pocket = (x, y, d) => translate([x, y, -1], rotate([0, 0, 3.7], cylinder({ r: d / 2, h: thick + 2, $fn: 48 })));
const pockets = [pocket(0, 0, centerD)];
if (weightD > 0) for (const a of angles) pockets.push(pocket(R * Math.cos(a), R * Math.sin(a), weightD));
return difference(body, ...pockets);
`,
};
