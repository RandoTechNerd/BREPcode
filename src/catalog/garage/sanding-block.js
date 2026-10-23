// A hand sanding block: a flat sole with a rounded grip on top and a slanted
// slot at each end that the sandpaper's edges tuck into. One side profile
// extruded across the width. The slots lean only 20 degrees off vertical, so
// their upper face prints without support.

export default {
  id: "sanding-block",
  category: "garage",
  title: "Sanding block",
  summary: "a hand sanding block with a rounded grip and end slots that clamp the sandpaper.",
  print: "flat side down as shown, no supports.",
  names: ["sanding block", "hand sanding block", "sandpaper holder", "sanding pad holder", "hand sander", "sanding grip",
    "sandpaper block", "manual sanding block"],
  nouns: ["block", "sander"],
  keywords: ["sanding", "sandpaper", "sand", "woodworking", "grit", "smooth"],
  triple: ["length", "width", "baseH"],
  tips: ["90 mm wide", "taller grip", "no paper slots"],
  examples: ["I want a sanding block", "make me a sanding block 150 x 70",
    "a sanding stick for models", "hand sanding block with a taller grip"],
  params: {
    length: { default: 120, min: 40, max: 230, unit: "mm", label: "sole length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    width: { default: 70, min: 12, max: 120, unit: "mm", label: "sole width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    baseH: { default: 14, min: 6, max: 40, unit: "mm", label: "sole thickness", say: ["thick", "base"] },
    grip: { default: 22, min: 0, max: 50, unit: "mm", label: "grip height above the sole (0 = flat)", say: ["grip", "tall", "high"], more: ["taller"], less: ["lower"] },
    slotDepth: { default: 9, min: 0, max: 30, unit: "mm", label: "paper slot depth (0 = none)", say: ["slot", "deep"] },
    slotW: { default: 1.6, min: 0.8, max: 4, unit: "mm", label: "paper slot width", say: ["paper", "gap"] },
  },
  things: [
    { names: ["quarter sheet sanding block", "1/4 sheet sanding block"], title: "1/4 sheet sanding block", params: { length: 115, width: 70 } },
    { names: ["third sheet sanding block", "1/3 sheet sanding block", "long sanding block"], title: "1/3 sheet sanding block",
      params: { length: 190, width: 90, baseH: 16, grip: 28 } },
    { names: ["sanding stick", "model sanding stick", "detail sanding stick", "hobby sanding stick"], title: "Sanding stick",
      params: { length: 160, width: 20, baseH: 10, grip: 0, slotDepth: 6, slotW: 1.2 } },
    { names: ["detail sanding block", "small sanding block", "mini sanding block"], title: "Detail sanding block",
      params: { length: 80, width: 35, baseH: 12, grip: 14, slotDepth: 7 } },
    { names: ["drywall sanding block", "drywall sander"], title: "Drywall sanding block", params: { length: 230, width: 85, baseH: 16, grip: 30 } },
  ],
  body: `
// side profile: x along the sole, y up; extruded across the width
const e = Math.min(18, length / 5);              // flat zone at each end for the paper slot
const sd = Math.min(slotDepth, baseH - 3);       // a slot never goes through the sole
const span = length - 2 * e;
const steps = grip > 0 ? Array.from({ length: 33 }, (_, i) => {
  const x = length - e - span * i / 32;          // back across the top, end to end
  return [x, baseH + grip * Math.pow(Math.sin(Math.PI * i / 32), 0.7)];
}) : [];
const outline = [[0, 0], [length, 0], [length, baseH], ...steps, [0, baseH]];
const across = (pts) => translate([0, width / 2, 0], rotate([90, 0, 0], linearExtrude({ h: width }, polygon(pts))));
const across2 = (pts) => translate([0, width / 2 + 1, 0], rotate([90, 0, 0], linearExtrude({ h: width + 2 }, polygon(pts))));
const sole = across(outline);
if (sd <= 0) return translate([-length / 2, 0, 0], sole);
// each slot leans 20 degrees in toward the middle as it goes down
const lean = Math.tan(20 * Math.PI / 180);
const slotAt = (x0, dir) => across2([
  [x0 - slotW / 2, baseH + 1], [x0 + slotW / 2, baseH + 1],
  [x0 + slotW / 2 + dir * lean * (sd + 1), baseH - sd], [x0 - slotW / 2 + dir * lean * (sd + 1), baseH - sd],
]);
return translate([-length / 2, 0, 0], difference(sole, slotAt(e * 0.45, 1), slotAt(length - e * 0.45, -1)));
`,
};
