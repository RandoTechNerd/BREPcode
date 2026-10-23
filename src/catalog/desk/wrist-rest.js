// A keyboard (or mouse) wrist rest: one rounded cross-section run the length
// of the keyboard. A full-size keyboard is longer than most beds, so a long
// rest comes in pieces that lock end to end with a dovetail: each piece is
// the cross-section extruded, trimmed to its outline seen from above (tab on
// one end, socket on the other). Every face is vertical or looks up.

export default {
  id: "wrist-rest",
  category: "desk",
  title: "Keyboard wrist rest",
  summary: "a rounded wrist rest the length of your keyboard, in dovetailed pieces when it is longer than the bed.",
  print: "flat side down as shown, no supports. The pieces slide together on their dovetails (a drop of glue makes it permanent).",
  names: ["wrist rest", "keyboard wrist rest", "palm rest", "keyboard palm rest", "wrist support", "keyboard rest",
    "wrist pad", "ergonomic wrist rest"],
  nouns: ["rest", "support"],
  keywords: ["wrist", "palm", "keyboard", "typing", "ergonomic", "mouse"],
  fits: ["keyboard"],
  primary: "length",
  fromSpec: (s) => ({ length: s.dims.w, pieces: s.dims.w > 480 ? 3 : s.dims.w > 240 ? 2 : 1 }),
  ask: { unless: ["length"], text: "How wide is your keyboard? Say “for a TKL keyboard” or give the length; I made it 440 mm for a full-size board, in two pieces." },
  tips: ["for a TKL keyboard", "25 mm tall", "100 mm deep", "3 pieces"],
  examples: ["I want a keyboard wrist rest", "wrist rest for my tkl keyboard",
    "a palm rest 360mm long and 20mm tall", "mouse wrist rest"],
  params: {
    length: { default: 440, min: 60, max: 600, unit: "mm", label: "total length", say: ["long", "length", "wide", "width"], more: ["longer"], less: ["shorter"] },
    depth: { default: 80, min: 40, max: 140, unit: "mm", label: "depth front to back", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    height: { default: 20, min: 8, max: 45, unit: "mm", label: "height at the crown", say: ["tall", "high", "height", "thick"], more: ["taller", "higher", "thicker"], less: ["lower", "thinner", "flatter"] },
    edgeH: { default: 6, min: 2, max: 20, unit: "mm", label: "height at the front and back edges", say: ["edge"] },
    pieces: { default: 2, min: 1, max: 4, unit: "count", label: "pieces", say: ["piece", "part", "section"] },
  },
  things: [
    { names: ["tkl wrist rest", "tenkeyless wrist rest", "tkl palm rest"], title: "TKL wrist rest", spec: "keyboard-tkl" },
    { names: ["75 percent wrist rest", "75 wrist rest", "compact keyboard wrist rest"], title: "75% keyboard wrist rest", spec: "keyboard-75" },
    { names: ["60 percent wrist rest", "60 wrist rest", "65 percent wrist rest", "small keyboard wrist rest"], title: "60% keyboard wrist rest", spec: "keyboard-60",
      params: { depth: 70 } },
    { names: ["mouse wrist rest", "mouse pad wrist rest", "mouse palm rest", "mouse wrist support"], title: "Mouse wrist rest",
      params: { length: 100, depth: 70, height: 18, edgeH: 5, pieces: 1 } },
    { names: ["magic keyboard wrist rest", "apple keyboard wrist rest"], title: "Magic Keyboard wrist rest", spec: "keyboard-magic",
      params: { height: 12, edgeH: 4, depth: 70 } },
    { names: ["laptop wrist rest", "laptop palm rest"], title: "Laptop wrist rest", params: { length: 300, height: 14, edgeH: 4, depth: 70, pieces: 2 } },
    { names: ["gaming wrist rest", "tall wrist rest", "mechanical keyboard wrist rest"], title: "Tall wrist rest", params: { height: 30, edgeH: 10, depth: 90 } },
  ],
  body: `
// cross-section: x runs front to back, y runs up
const crown = (t) => edgeH + (height - edgeH) * Math.pow(Math.sin(Math.PI * t), 0.6);
const section = (n = 28) => [[0, 0], [depth, 0], ...Array.from({ length: n + 1 }, (_, i) => [depth * (1 - i / n), crown(1 - i / n)])];
// the section pushed along x from x0 to x1
const run = (x0, x1) => translate([x0, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h: x1 - x0 }, polygon(section())))));
const Lp = length / pieces;
const yc = depth / 2, nw = depth * 0.22, hw = depth * 0.32, tl = Math.min(12, Lp * 0.15), cl = 0.25;
const piece = (i) => {
  const x0 = i * Lp, x1 = x0 + Lp, first = i === 0, last = i === pieces - 1;
  if (first && last) return run(x0, x1);
  const plan = [[x0, -1], [x1, -1]];
  if (!last) plan.push([x1, yc - nw / 2], [x1 + tl, yc - hw / 2], [x1 + tl, yc + hw / 2], [x1, yc + nw / 2]);
  plan.push([x1, depth + 1], [x0, depth + 1]);
  if (!first) plan.push([x0, yc + nw / 2 + cl], [x0 + tl + cl, yc + hw / 2 + cl], [x0 + tl + cl, yc - hw / 2 - cl], [x0, yc - nw / 2 - cl]);
  return intersection(run(x0 - 1, x1 + tl + 1), translate([0, 0, -1], linearExtrude({ h: height + 2 }, polygon(plan))));
};
const parts = Array.from({ length: pieces }, (_, i) => translate([-i * Lp, i * (depth + 8), 0], piece(i)));
return translate([-Lp / 2, -(pieces * (depth + 8) - 8) / 2, 0], group(...parts));
`,
};
