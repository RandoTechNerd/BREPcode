// A wheel chock: a wedge whose front face is hollowed to the tire's own
// curve, with teeth along the sole and a rope hole to pull it out by. The
// side view is one profile, printed lying on its side, so the teeth and the
// curve are just its outline.

export default {
  id: "wheel-chock",
  category: "vehicle",
  title: "Wheel chock",
  summary: "a wedge chock with its face curved to the tire, a toothed sole and a rope hole.",
  print: "on its side as shown, no supports; 40%+ infill. Not load-rated: a printed chock is a convenience, never your only brake. Set the parking brake.",
  names: ["wheel chock", "tire chock", "tyre chock", "car wheel chock", "wheel stopper", "wheel wedge", "tire stopper"],
  nouns: ["chock", "wedge", "stopper"],
  keywords: ["wheel", "tire", "tyre", "car", "trailer", "rv", "camper", "parking"],
  tips: ["for a 760 mm tire", "taller", "no teeth"],
  examples: ["I want a wheel chock", "make me a wheel chock for my trailer",
    "tire chock 120mm tall", "rv wheel chock"],
  params: {
    tireD: { default: 650, min: 300, max: 900, unit: "mm", label: "tire outside diameter", say: ["tire", "tyre", "wheel", "diameter"] },
    height: { default: 90, min: 40, max: 160, unit: "mm", label: "height", say: ["tall", "high", "height"], more: ["taller"], less: ["lower", "shorter"] },
    angle: { default: 45, min: 30, max: 60, unit: "deg", label: "face angle", say: ["angle", "steep", "degree"] },
    topW: { default: 20, min: 5, max: 60, unit: "mm", label: "flat top length", say: ["top"] },
    length: { default: 200, min: 80, max: 250, unit: "mm", label: "overall length", say: ["long", "length"], more: ["longer"] },
    width: { default: 120, min: 40, max: 200, unit: "mm", label: "width across the tire", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    teeth: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "toothed sole",
      words: { no: ["no teeth", "smooth", "flat bottom"], yes: ["teeth", "toothed", "grip"] } },
    ropeD: { default: 12, min: 0, max: 25, unit: "mm", label: "rope hole (0 = none)", say: ["rope", "hole", "cord"] },
  },
  things: [
    { names: ["rv wheel chock", "camper wheel chock", "motorhome wheel chock"], title: "RV wheel chock", params: { tireD: 760, height: 120, length: 240, width: 140 } },
    { names: ["trailer wheel chock", "trailer chock", "boat trailer chock"], title: "Trailer wheel chock", params: { tireD: 700, height: 110, length: 230 } },
    { names: ["garage parking stop", "parking stop", "parking bump", "garage wheel stop"], title: "Garage parking stop",
      params: { height: 45, angle: 35, topW: 40, length: 180, width: 160, teeth: "no", ropeD: 0 } },
  ],
  body: `
// side profile: x runs back from the toe, y up; printed lying on it
const R = tireD / 2;
const H = height;
const a = angle * Math.PI / 180;
const toe = Math.min(4, H / 10);                 // a blunt toe, not a knife edge
const xt = (H - toe) / Math.tan(a);              // the face's run, toe to top
const L = Math.max(length, xt + topW + H / Math.tan(60 * Math.PI / 180) + 4);
// the face: an arc of the tire's radius from the toe to the top, hollowed toward the tire
const P1 = [0, toe], P2 = [xt, H];
const dx = P2[0] - P1[0], dy = P2[1] - P1[1], c = Math.hypot(dx, dy);
const off = Math.sqrt(Math.max(0, R * R - c * c / 4));
const C = [(P1[0] + P2[0]) / 2 - dy / c * off, (P1[1] + P2[1]) / 2 + dx / c * off];
const a1 = Math.atan2(P1[1] - C[1], P1[0] - C[0]), a2 = Math.atan2(P2[1] - C[1], P2[0] - C[0]);
const face = Array.from({ length: 17 }, (_, i) => {
  const t = a1 + (a2 - a1) * i / 16;
  return [C[0] + R * Math.cos(t), C[1] + R * Math.sin(t)];
});
// the sole: teeth that bite, pointing back toward the toe
const sole = [];
if (teeth === "yes") {
  const n = Math.floor((L - 30) / 12);
  for (let i = n - 1; i >= 0; i--) { const x = 15 + i * 12; sole.push([x + 12, 0], [x + 3, -3], [x, 0]); }
}
const outline = [[0, 0], ...[...sole].reverse(), [L, 0], [xt + topW, H], ...face.slice().reverse()];
const body = linearExtrude({ h: width }, polygon(outline.filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1])));
if (ropeD <= 0) return translate([-L / 2, 0, 0], body);
const hx = xt + topW / 2 + 6, hy = H * 0.42;
return translate([-L / 2, 0, 0], difference(body, translate([hx, hy, -1], cylinder({ r: ropeD / 2, h: width + 2, $fn: 32 }))));
`,
};
