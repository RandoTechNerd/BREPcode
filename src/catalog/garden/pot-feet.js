// Pot feet: small curved risers that lift a pot off a deck or saucer so it
// drains and the floor underneath can breathe. Each foot is a slice of the
// ring under the pot's edge, with a lip on the outside that keeps the pot
// from sliding off. Plan outlines extruded straight up; a set prints in a row.

export default {
  id: "pot-feet",
  category: "garden",
  title: "Pot feet",
  summary: "a set of curved risers that lift a pot for drainage, each with a lip to keep the pot on.",
  print: "flat as shown, no supports. PETG or ASA outdoors; three under a pot, four under a square one.",
  names: ["pot feet", "pot foot", "planter feet", "pot risers", "pot toes", "plant pot feet", "pot lifters",
    "planter risers", "flower pot feet", "pot stand feet"],
  nouns: ["feet", "foot", "riser", "lifter", "toe"],
  keywords: ["pot", "planter", "plant", "deck", "patio", "drainage", "lift"],
  primary: "potD",
  tips: ["for a 300 mm pot", "20 mm lift", "4 feet"],
  examples: ["I want some pot feet", "make me 4 pot risers for a 250mm pot",
    "planter feet that lift 20mm", "pot toes for my patio planters"],
  params: {
    potD: { default: 150, min: 60, max: 400, unit: "mm", label: "pot base diameter", say: ["pot", "across", "diameter"] },
    lift: { default: 15, min: 5, max: 50, unit: "mm", label: "how far it lifts the pot", say: ["lift", "high", "tall", "raise"], more: ["taller", "higher"], less: ["lower", "shorter"] },
    footW: { default: 35, min: 15, max: 80, unit: "mm", label: "foot width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    footD: { default: 30, min: 15, max: 60, unit: "mm", label: "how far it reaches under the pot", say: ["deep", "under"] },
    lipH: { default: 4, min: 0, max: 12, unit: "mm", label: "outer lip height (0 = none)", say: ["lip"] },
    count: { default: 3, min: 1, max: 8, unit: "count", label: "how many feet", say: ["feet", "foot", "riser", "toe", "lifter"] },
  },
  things: [
    { names: ["invisible pot feet", "hidden pot risers", "low pot risers"], title: "Hidden pot risers", params: { lift: 8, lipH: 0, footW: 25, footD: 25 } },
    { names: ["large planter feet", "big pot feet", "heavy planter risers"], title: "Large planter feet", params: { potD: 350, lift: 25, footW: 60, footD: 45, lipH: 6 } },
    { names: ["deck protector feet", "deck pot risers", "patio pot risers"], title: "Deck protector feet", params: { lift: 12, lipH: 0, count: 4 } },
    { names: ["small pot feet", "mini pot feet", "succulent pot feet"], title: "Small pot feet", params: { potD: 90, lift: 8, footW: 20, footD: 18, lipH: 3 } },
    { names: ["square planter feet", "planter box feet"], title: "Square planter feet", params: { potD: 400, lift: 20, footW: 45, footD: 35, count: 4 } },
    { names: ["saucer risers", "drip tray risers"], title: "Saucer risers", params: { lift: 10, lipH: 3, footW: 30, footD: 25 } },
  ],
  body: `
const r = potD / 2;
const lipT = lipH > 0 ? 3 : 0;
const ro = r + 0.5 + lipT, ri = Math.max(ro - footD, ro * 0.3);   // the foot's outer and inner radius
const half = Math.min(1.2, footW / 2 / ro);              // its half angle round the pot
// a slice of a ring, from radius a to b
const slice = (a, b, n = 16) => polygon([
  ...Array.from({ length: n + 1 }, (_, i) => { const t = -half + 2 * half * i / n; return [b * Math.cos(t), b * Math.sin(t)]; }),
  ...Array.from({ length: n + 1 }, (_, i) => { const t = half - 2 * half * i / n; return [a * Math.cos(t), a * Math.sin(t)]; }),
]);
const pad = linearExtrude({ h: lift }, slice(ri, ro));
const one = lipH > 0 ? union(pad, linearExtrude({ h: lift + lipH }, slice(r + 0.5, ro))) : pad;
const pitch = footW + 8;
return group(...Array.from({ length: count }, (_, i) => translate([-(ri + ro) / 2, (i - (count - 1) / 2) * pitch, 0], one)));
`,
};
