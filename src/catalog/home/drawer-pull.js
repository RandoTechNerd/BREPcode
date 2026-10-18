// A drawer or cabinet pull for two screws at a standard spacing (76 mm / 3
// inch, 96, 128, 160 mm...): a straight bar on two posts, an arch, or a
// square D. The view from above is one outline extruded to the pull's height,
// printed on its side, so the bar's layers run along it and it cannot snap
// across. The screw holes go into the post ends as teardrops (pointed on
// top) so they print round.

export default {
  id: "drawer-pull",
  category: "home",
  title: "Drawer pull",
  summary: "a bar, arch or D pull for two screws at the usual cabinet hole spacings.",
  print: "on its side as shown, no supports. PETG or PLA, 100% infill round the posts.",
  names: ["drawer pull", "cabinet hardware pull", "furniture handle", "furniture pull", "pull handle",
    "replacement handle", "replacement pull", "drawer pulls", "cabinet pulls"],
  nouns: ["pull", "handle"],
  keywords: ["drawer", "cabinet", "dresser", "kitchen", "furniture", "wardrobe", "cupboard", "door"],
  fits: ["screw"],
  fromSpec: (s) => ({ holeD: Math.round(s.dims.d * 0.85 * 10) / 10 }),
  specNote: "pilot holes the screws cut their own thread in",
  primary: "spacing",
  tips: ["128 mm spacing", "an arch", "3 inch", "longer bar"],
  examples: ["I want a drawer pull", "make me a cabinet handle with 128mm hole spacing",
    "a 3 inch drawer pull", "arch pull 96mm"],
  params: {
    spacing: { default: 96, min: 32, max: 256, unit: "mm", label: "hole spacing, centre to centre", say: ["spacing", "centre", "center", "centers", "centres", "apart", "cc"] },
    overhang: { default: 20, min: 0, max: 60, unit: "mm", label: "bar past each hole", say: ["overhang", "past", "extra"] },
    gap: { default: 25, min: 12, max: 50, unit: "mm", label: "finger gap behind the bar", say: ["gap", "finger", "clearance", "deep", "depth", "out"], more: ["deeper"], less: ["shallower"] },
    barT: { default: 10, min: 6, max: 20, unit: "mm", label: "bar thickness", say: ["thick", "thickness"], more: ["thicker", "chunkier"], less: ["thinner", "slimmer"] },
    barH: { default: 12, min: 8, max: 30, unit: "mm", label: "bar height", say: ["tall", "high", "height"] },
    postW: { default: 10, min: 6, max: 20, unit: "mm", label: "post width", say: ["post"] },
    style: { default: "bar", unit: "choice", choices: ["bar", "arch", "square"], label: "style",
      words: { arch: ["arch", "arched", "bow", "curved"], square: ["square", "square pull", "u shaped", "box pull"], bar: ["bar", "t bar", "straight"] } },
    holeD: { default: 3.4, min: 2.5, max: 5, unit: "mm", label: "pilot holes", say: ["hole", "pilot"] },
  },
  things: [
    { names: ["cabinet pull", "cabinet handle", "kitchen cabinet handle", "kitchen cabinet pull", "cupboard handle"], title: "Cabinet pull" },
    { names: ["dresser pull", "dresser handle", "drawer handle", "chest of drawers handle"], title: "Dresser pull", params: { spacing: 76.2, overhang: 15 } },
    { names: ["bar pull", "bar handle", "t bar pull", "t bar handle"], title: "Bar pull", params: { style: "bar", spacing: 128, overhang: 25 } },
    { names: ["arch pull", "arched handle", "bow handle", "arch handle"], title: "Arch pull", params: { style: "arch" } },
    { names: ["square pull", "square handle", "u shaped pull", "box pull", "u pull"], title: "Square pull", params: { style: "square" } },
    { names: ["wardrobe handle", "closet door handle", "long cabinet handle", "pantry door pull"], title: "Wardrobe handle",
      params: { spacing: 192, overhang: 20, barT: 12, barH: 14 } },
    { names: ["small drawer pull", "mini drawer pull", "jewelry box pull"], title: "Small drawer pull",
      params: { spacing: 64, overhang: 10, gap: 18, barT: 8, barH: 10, postW: 8, holeD: 2.8 } },
  ],
  body: `
// the view from above: x along the pull, y out from the door; extruded up
// by the bar height and printed lying that way
const c = spacing / 2;
const pw = postW;
const H = Math.max(barH, holeD * 1.42 + 4);
const top = gap + barT;
const arcAt = (cx, cy, r, a0, a1, n = 16) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + (a1 - a0) * i / n;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
});
const parts = [];
let deep = Math.min(top - 2.5, 15);
if (style === "arch") {
  const yS = gap * 0.35;
  // a circle through (-w, yS), (0, apex) and (w, yS): its centre height and radius
  const circle = (w, apex) => { const k = (apex * apex - yS * yS - w * w) / (2 * (apex - yS)); return [k, apex - k]; };
  const over = (w, apex) => {
    const [k, r] = circle(w, apex);
    return arcAt(0, k, r, Math.atan2(yS - k, -w), Math.atan2(yS - k, w), 32);
  };
  const a = c + pw / 2, b = c - pw / 2;
  parts.push(polygon([[-a, 0], ...over(a, top), [a, 0], [b, 0], ...over(b, gap).reverse(), [-b, 0]]));
  // the post is only as tall as the arch above it
  const [k, r] = circle(a, top);
  deep = Math.min(deep, k + Math.sqrt(r * r - c * c) - 2.5);
} else if (style === "square") {
  const a = c + pw / 2, b = c - pw / 2;
  const rr = Math.min(barT, gap / 2, pw);
  parts.push(polygon([[-a, 0], ...arcAt(-a + rr, top - rr, rr, Math.PI, Math.PI / 2), ...arcAt(a - rr, top - rr, rr, Math.PI / 2, 0),
    [a, 0], [b, 0], [b, gap], [-b, gap], [-b, 0]]));
} else {
  // a straight bar with round ends on two posts, braced where they meet
  const f = Math.min(4, gap * 0.3);
  const rt = barT / 2;
  const half = Math.max(c + pw / 2 + f + rt, c + overhang);
  parts.push(polygon([...arcAt(half - rt, gap + rt, rt, -Math.PI / 2, Math.PI / 2), ...arcAt(-half + rt, gap + rt, rt, Math.PI / 2, 3 * Math.PI / 2)]));
  for (const sx of [-1, 1]) {
    const x0 = sx * c;
    parts.push(polygon([[x0 - pw / 2, 0], [x0 + pw / 2, 0], [x0 + pw / 2, gap - f], [x0 + pw / 2 + f, gap + 0.2], [x0 - pw / 2 - f, gap + 0.2], [x0 - pw / 2, gap - f]]));
  }
}
const pull = parts.length > 1 ? union(...parts.map((p) => linearExtrude({ h: H }, p))) : linearExtrude({ h: H }, parts[0]);
// teardrop pilot holes up each post from the door face
const r = holeD / 2;
const tear = polygon([[0, r * Math.SQRT2], ...Array.from({ length: 19 }, (_, i) => {
  const a = Math.PI / 4 - i * (3 * Math.PI / 2) / 18;
  return [r * Math.cos(a), r * Math.sin(a)];
})]);
const holes = [-c, c].map((x) => translate([x, deep, H / 2], rotate([90, 0, 0], linearExtrude({ h: deep + 1 }, tear))));
return difference(pull, ...holes);
`,
};
