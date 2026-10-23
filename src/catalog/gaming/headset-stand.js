// A desk stand for headphones: a stem on a wide base plate, topped by a
// curved saddle the headband rests on. The saddle's arms are braced down to
// the stem at 55 degrees, so it prints standing up with nothing hanging, and
// the base plate is wider than the stem both ways so it does not tip.

export default {
  id: "headset-stand",
  category: "gaming",
  title: "Headphone stand",
  summary: "a desk stand with a curved saddle for a headband, on a wide base plate.",
  print: "upright as shown, no supports.",
  names: ["headphone stand", "headset stand", "gaming headset stand", "headphone display stand", "desk headphone stand",
    "headphones stand", "over ear headphone stand", "headphone tree"],
  nouns: ["stand"],
  keywords: ["headphone", "headphones", "headset", "gaming", "desk", "audio"],
  tips: ["250 mm tall", "wider saddle", "bigger base"],
  examples: ["I want a headphone stand", "gaming headset stand 250mm tall",
    "a stand for my vr headset", "headphone display stand with a big base"],
  params: {
    height: { default: 230, min: 120, max: 300, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["shorter", "lower"] },
    saddleR: { default: 70, min: 30, max: 150, unit: "mm", label: "saddle curve radius", say: ["saddle", "radius", "curve"], more: ["flatter"], less: ["rounder"] },
    span: { default: 110, min: 60, max: 160, unit: "deg", label: "how far round the saddle reaches", say: ["span", "degree", "angle"] },
    stemW: { default: 24, min: 12, max: 60, unit: "mm", label: "stem width", say: ["stem", "post"], more: ["thicker", "sturdier"] },
    depth: { default: 50, min: 25, max: 120, unit: "mm", label: "saddle depth (headband width)", say: ["deep", "depth", "band", "headband"], more: ["deeper"] },
    baseW: { default: 120, min: 60, max: 220, unit: "mm", label: "base width", say: ["base", "wide", "width"], more: ["wider", "bigger"] },
    baseD: { default: 110, min: 60, max: 220, unit: "mm", label: "base depth", say: ["footprint"] },
    baseT: { default: 6, min: 3, max: 15, unit: "mm", label: "base thickness", say: ["thick", "thickness", "heavy"], more: ["heavier"] },
  },
  things: [
    { names: ["airpods max stand", "airpods max holder", "airpod max stand"], title: "AirPods Max stand", params: { height: 200, saddleR: 60, depth: 60 } },
    { names: ["vr headset stand", "quest 3 stand", "meta quest stand", "oculus quest stand", "oculus stand", "vr stand", "quest stand"],
      title: "VR headset stand", params: { height: 190, saddleR: 55, span: 140, stemW: 36, depth: 70, baseW: 170, baseD: 170, baseT: 8 } },
    { names: ["kids headphone stand", "small headphone stand", "mini headphone stand"], title: "Small headphone stand",
      params: { height: 160, saddleR: 50, stemW: 20, depth: 40, baseW: 100, baseD: 100 } },
    { names: ["studio headphone stand", "tall headphone stand", "dj headphone stand"], title: "Tall headphone stand",
      params: { height: 280, stemW: 28, baseW: 140, baseD: 140, baseT: 8 } },
    { names: ["earmuff stand", "ear defender stand", "hearing protection stand"], title: "Earmuff stand",
      params: { height: 170, saddleR: 55, depth: 40, baseW: 110, baseD: 100 } },
  ],
  body: `
// end profile across the headband: x runs across, y runs up; pushed \`depth\` deep
const s = stemW / 2;
const th = span / 2 * Math.PI / 180;
const R = Math.min(saddleR, height * 0.6);
const cy = height - R;
const E = [R * Math.sin(th), cy + R * Math.cos(th)];   // the saddle's right tip
const sT = Math.max(6, stemW * 0.35);
const rise = Math.tan(55 * Math.PI / 180);
const Jy = Math.max(baseT + 4, E[1] - sT - Math.max(0, E[0] - s) * rise);
const tipY = Math.max(Jy + 1, E[1] - sT);
const arc = Array.from({ length: 33 }, (_, i) => {
  const t = Math.PI / 2 - th + (2 * th) * i / 32;
  return [R * Math.cos(t), cy + R * Math.sin(t)];
});
const outline = [[-s, baseT - 1], [s, baseT - 1], [s, Jy], [E[0], tipY], ...arc, [-E[0], tipY], [-s, Jy]];
const upright = translate([0, depth / 2, 0], rotate([90, 0, 0], linearExtrude({ h: depth }, polygon(outline))));
const r = Math.min(15, baseW / 4, baseD / 4);
const base = hull(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) =>
  translate([i * (baseW / 2 - r), j * (baseD / 2 - r), 0], cylinder({ r, h: baseT, $fn: 32 }))));
return union(base, upright);
`,
};
