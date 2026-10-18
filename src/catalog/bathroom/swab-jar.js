// A round (or hex) lidded canister for the bathroom counter: cotton swabs,
// cotton balls, floss picks, hair ties, bath salts; bigger, it is a kitchen
// canister for sugar, coffee or tea. The push-fit lid prints upside down
// beside the jar with its insert ring pointing up, so its top comes off the
// bed smooth and nothing overhangs. A small notch in the rim gives a thumb
// somewhere to lift the lid from.

export default {
  id: "swab-jar",
  category: "bathroom",
  title: "Bathroom canister",
  summary: "a lidded canister for cotton swabs, cotton balls and floss picks, or sugar, coffee and tea, with an optional divider.",
  print: "as shown: jar upright, lid upside down beside it; no supports. Food: PETG or PLA from a food-safe spool, hand wash, and keep it out of the dishwasher.",
  names: ["bathroom canister", "bathroom jar", "lidded jar", "lidded canister", "counter canister",
    "cotton jar", "vanity canister", "apothecary jar", "kitchen canister"],
  nouns: ["jar", "canister", "holder"],
  keywords: ["lid", "cotton", "swab", "bathroom", "vanity", "kitchen", "pantry", "counter"],
  primary: "diameter",
  tips: ["hexagonal", "2 compartments", "no lid", "120 mm tall"],
  examples: ["I want a bathroom canister", "make me a bathroom jar 80mm across and 100mm tall",
    "a hexagonal bathroom jar with 2 compartments", "lidded canister for the kitchen"],
  params: {
    diameter: { default: 75, min: 30, max: 200, unit: "mm", label: "outside diameter", say: ["across", "diameter", "wide"], more: ["wider", "bigger"], less: ["smaller", "narrower"] },
    height: { default: 90, min: 25, max: 240, unit: "mm", label: "jar height (without the lid)", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    floor: { default: 2.4, min: 1.6, max: 6, unit: "mm", label: "floor thickness", say: ["floor"] },
    compartments: { default: 1, min: 1, max: 4, unit: "count", label: "compartments", say: ["compartment", "section", "divider"] },
    lipD: { default: 7, min: 3, max: 15, unit: "mm", label: "how far the lid's insert goes in", say: ["insert"] },
    fit: { default: 0.3, min: 0.1, max: 0.8, unit: "mm", label: "lid clearance per side", say: ["fit", "clearance", "tolerance"] },
    lid: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "lid",
      words: { no: ["no lid", "without lid", "without a lid", "open top", "lidless"], yes: ["with lid", "with a lid", "lid", "cover"] } },
    form: { default: "round", unit: "choice", choices: ["round", "hex", "octagon"], label: "outline",
      words: { hex: ["hex", "hexagon", "hexagonal"], octagon: ["octagon", "octagonal"], round: ["round", "circular", "cylinder"] } },
  },
  things: [
    { names: ["qtip holder", "q tip holder", "cotton swab holder", "q tip jar", "qtip jar", "cotton bud holder", "swab jar", "q tip container", "qtip dispenser"],
      title: "Q-tip holder", spec: "bath-cotton-swab", params: { diameter: 68, height: 84 } },
    { names: ["cotton ball jar", "cotton ball holder", "cotton ball container", "cotton wool jar"], title: "Cotton ball jar",
      params: { diameter: 92, height: 105 } },
    { names: ["q tip and cotton ball holder", "cotton swab and cotton ball holder", "swab and cotton ball jar"], title: "Swab and cotton ball jar",
      spec: "bath-cotton-swab", params: { diameter: 95, height: 84, compartments: 2 } },
    { names: ["floss pick holder", "floss pick jar", "flosser holder", "dental floss pick holder", "floss holder"], title: "Floss pick holder",
      params: { diameter: 62, height: 72 } },
    { names: ["hair tie jar", "hair tie container", "elastic jar", "bobby pin holder", "bobby pin jar", "hair clip jar"], title: "Hair tie jar",
      params: { diameter: 70, height: 55, lipD: 5 } },
    { names: ["bath salt jar", "bath salts jar", "bath bomb jar", "epsom salt jar"], title: "Bath salt jar",
      params: { diameter: 95, height: 120, wall: 2.4 } },
    { names: ["sugar canister", "sugar jar", "sugar container"], title: "Sugar canister",
      params: { diameter: 110, height: 140, wall: 2.4, floor: 3, lipD: 9 } },
    { names: ["coffee canister", "coffee jar", "coffee bean canister", "coffee container", "ground coffee canister"], title: "Coffee canister",
      params: { diameter: 115, height: 160, wall: 2.4, floor: 3, lipD: 9 } },
    { names: ["tea canister", "tea caddy", "loose leaf tea canister", "tea tin", "tea jar"], title: "Tea canister",
      params: { diameter: 90, height: 120, form: "hex", wall: 2.2 } },
    { names: ["dog treat jar", "dog treat canister", "pet treat jar", "cat treat jar", "treat canister"], title: "Treat jar",
      params: { diameter: 130, height: 150, wall: 2.6, floor: 3.2, lipD: 10 } },
    { names: ["toothpick holder", "toothpick jar", "toothpick dispenser"], title: "Toothpick holder",
      params: { diameter: 42, height: 60, wall: 1.8, lipD: 5 } },
  ],
  body: `
const sides = form === "hex" ? 6 : form === "octagon" ? 8 : 96;
const r = diameter / 2;
const flatR = r * Math.cos(Math.PI / sides);           // the outline's flats are this far out
const ri = Math.max(4, flatR - wall);                  // a round inside, so the lid fits any outline
const lipH = Math.min(lipD, height / 3);
const jarBody = difference(
  cylinder({ r, h: height, $fn: sides }),
  translate([0, 0, Math.min(floor, height - 5)], cylinder({ r: ri, h: height, $fn: 96 })),
);
const parts = [jarBody];
if (compartments > 1) {
  const divT = Math.max(1.2, wall * 0.8);
  const divH = height - (lid === "yes" ? lipH + 1 : 0);
  const fz = Math.min(floor, height - 5);
  for (let i = 0; i < compartments; i++) {
    parts.push(rotate([0, 0, i * 360 / compartments + 90], translate([-divT / 2, 0, fz - 0.1], cube([divT, ri + wall / 2, divH - fz + 0.1]))));
  }
  if (compartments > 2) parts.push(translate([0, 0, fz - 0.1], cylinder({ r: divT, h: divH - fz + 0.1, $fn: 16 })));
}
let jar = union(...parts);
if (lid !== "yes") return jar;

// a thumb notch in the front of the rim, under the lid's edge
const nW = Math.min(14, r * 0.5), nD = Math.min(2.5, lipH / 2);
jar = difference(jar, translate([-nW / 2, -r - 1, height - nD], cube([nW, r - ri + 1.5, nD + 1])));

// the lid, upside down: a cap the size of the jar, an insert ring standing up from it
const capT = Math.max(2, wall);
const ro = ri - fit;
const ring = Math.max(1.4, Math.min(2.4, ro / 6));
const cap = union(
  cylinder({ r, h: capT, $fn: sides }),
  difference(translate([0, 0, capT - 0.1], cylinder({ r: ro, h: lipH + 0.1, $fn: 96 })),
    translate([0, 0, capT - 0.2], cylinder({ r: ro - ring, h: lipH + 1, $fn: 96 }))),
);
return group(jar, translate([2 * r + 10, 0, 0], cap));
`,
};
