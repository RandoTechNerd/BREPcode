// A self-watering planter: an outer water reservoir and an inner pot that
// hangs from the reservoir rim on a 45 degree collar, its floor held above
// the water. A cotton cord through the wick hole draws water up into the
// soil, and a notch in the collar is where you pour. Both parts are
// lathed profiles, printed upright side by side (diagonally, so the pair
// fits a smaller bed).

export default {
  id: "self-watering-planter",
  category: "garden",
  title: "Self-watering planter",
  summary: "an outer water reservoir and an inner pot with a wick hole and a notch to pour water through.",
  print: "both parts upright as shown, no supports. PETG for anything that holds water; thread a cotton cord through the wick hole.",
  names: ["self watering planter", "self watering pot", "self watering plant pot", "self watering flower pot",
    "reservoir planter", "wicking planter", "wick planter", "sub irrigated planter", "self watering container"],
  nouns: ["planter", "pot"],
  keywords: ["self", "watering", "reservoir", "wick", "wicking", "plant", "herb"],
  primary: "potD",
  tips: ["150 mm across", "deeper reservoir", "no fill notch"],
  examples: ["I want a self watering planter", "make me a self-watering pot 150mm across",
    "self watering planter with a 50 mm deep reservoir", "a wicking planter for herbs"],
  params: {
    potD: { default: 120, min: 70, max: 220, unit: "mm", label: "outside diameter", say: ["across", "diameter", "wide"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    height: { default: 110, min: 60, max: 220, unit: "mm", label: "reservoir height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    waterH: { default: 35, min: 15, max: 90, unit: "mm", label: "water depth under the inner pot", say: ["reservoir", "water", "deep"], more: ["deeper"], less: ["shallower"] },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    gap: { default: 1.5, min: 0.5, max: 4, unit: "mm", label: "room between the pots", say: ["gap", "clearance"] },
    wickD: { default: 8, min: 0, max: 20, unit: "mm", label: "wick hole (0 = none)", say: ["wick", "cord"] },
    holes: { default: 6, min: 0, max: 16, unit: "count", label: "small root holes in the inner floor", say: ["hole", "drain"] },
    fillW: { default: 18, min: 0, max: 40, unit: "mm", label: "fill notch width (0 = none)", say: ["notch", "fill"] },
  },
  things: [
    { names: ["self watering herb planter", "self watering herb pot"], title: "Self-watering herb planter", keywords: ["herb", "basil", "mint"],
      params: { potD: 130, height: 120 } },
    { names: ["self watering succulent pot", "small self watering pot"], title: "Small self-watering pot",
      params: { potD: 80, height: 70, waterH: 20, holes: 4, fillW: 12 } },
    { names: ["african violet pot", "african violet planter", "violet pot"], title: "African violet pot",
      params: { potD: 110, height: 95, waterH: 30 } },
    { names: ["large self watering planter", "big self watering pot"], title: "Large self-watering planter",
      params: { potD: 200, height: 180, waterH: 50, wall: 2.4, holes: 10, fillW: 26 } },
    { names: ["self watering seed starter", "self watering seedling pot"], title: "Self-watering seed starter",
      params: { potD: 80, height: 80, waterH: 25, holes: 0, fillW: 12 } },
    { names: ["self watering pot for tomatoes", "self watering tomato planter"], title: "Self-watering tomato planter",
      params: { potD: 220, height: 220, waterH: 70, wall: 2.6, holes: 12, fillW: 30 } },
  ],
  body: `
const R = potD / 2;
const fl = Math.max(1.6, wall);                         // floors
const water = Math.min(waterH, height * 0.6);           // keep some pot above the water
// the reservoir: a plain cup
const outer = revolve(360, polygon([[0, 0], [R, 0], [R, height], [R - wall, height], [R - wall, fl], [0, fl]]));

// the inner pot, in its own coordinates (z = 0 is its floor, fl + water up in the reservoir)
const ri = R - wall - gap;                               // its outside at the collar
const z0 = height - water - fl - gap;                    // where the 45 degree collar starts
const rb = ri - 0.1 * z0;                                // a gentle taper to the floor
const z1 = z0 + R - ri;                                  // collar reaches the outside, resting on the rim edge
const top = z1 + 1.5;
const pot = revolve(360, polygon([
  [0, 0], [rb, 0], [ri, z0], [R, z1], [R, top],
  [ri - wall, top], [rb - wall, fl], [0, fl],
]));
const cuts = [];
if (wickD > 0) cuts.push(translate([0, 0, -1], cylinder({ r: wickD / 2, h: fl + 2, $fn: 24 })));
for (let i = 0; i < holes; i++) {
  const a = 2 * Math.PI * i / holes, rr = (rb - wall) * 0.62;
  cuts.push(translate([rr * Math.cos(a), rr * Math.sin(a), -1], cylinder({ r: 2, h: fl + 2, $fn: 16 })));
}
// the fill notch: a gap in the collar, outside the pot wall, to pour water through
if (fillW > 0) cuts.push(translate([ri + 0.3, -fillW / 2, z0 - 1], cube([R - ri + 2, fillW, top - z0 + 2])));
const inner = cuts.length ? difference(pot, ...cuts) : pot;

// side by side on the diagonal, so the pair fits a smaller bed
const d = (2 * R + 6) / (2 * Math.SQRT2);
return group(translate([-d, -d, 0], outer), translate([d, d, 0], inner));
`,
};
