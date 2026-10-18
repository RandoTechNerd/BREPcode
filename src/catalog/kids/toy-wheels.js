// Toy car wheels: a tyre with grooves round the tread, a thin web and a
// hub, lathed in one profile and printed lying flat with the web on the bed.
// The hub's bore takes a bamboo skewer, a dowel or a printed axle; a tight
// bore grips the axle, a loose one spins on it. Printed axles (pins with a
// head) are an option.

export default {
  id: "toy-wheels",
  category: "kids",
  title: "Toy car wheels",
  summary: "a set of toy car wheels with tread grooves and an axle bore, and optional printed axles.",
  print: "flat as shown, no supports. No small parts at the default 40 mm; wheels under 32 mm and printed axles are small parts (ages 3+).",
  names: ["toy wheels", "toy car wheels", "toy wheel", "wheels for toy car", "replacement toy wheels", "kids car wheels",
    "wheel and axle set", "toy truck wheels", "cardboard car wheels"],
  nouns: ["wheel", "wheels", "axle"],
  keywords: ["toy", "car", "cardboard", "derby", "balloon", "kids", "truck", "skewer", "dowel"],
  fits: ["axle"],
  fromSpec: (s) => ({ axleD: s.dims.d }),
  primary: "wheelD",
  tips: ["for a bamboo skewer", "50 mm wheels", "with axles"],
  examples: ["I want some toy wheels", "make me 4 toy car wheels for a bamboo skewer", "toy wheels 50mm with axles",
    "wheels for my cardboard car"],
  params: {
    wheelD: { default: 40, min: 15, max: 100, unit: "mm", label: "wheel diameter", say: ["across", "diameter", "wheel", "big"], more: ["bigger"], less: ["smaller"] },
    width: { default: 12, min: 5, max: 40, unit: "mm", label: "tyre width", say: ["wide", "width", "tyre", "tire"] },
    axleD: { default: 3, min: 2, max: 10, unit: "mm", label: "axle diameter", say: ["axle", "skewer", "dowel", "rod"] },
    fit: { default: 0.3, min: -0.1, max: 1, unit: "mm", label: "bore allowance (more = spins freely)", say: ["fit", "clearance", "loose"] },
    hubD: { default: 10, min: 5, max: 30, unit: "mm", label: "hub diameter", say: ["hub"] },
    count: { default: 4, min: 1, max: 8, unit: "count", label: "how many wheels", say: ["wheel"] },
    treads: { default: 3, min: 0, max: 8, unit: "count", label: "tread grooves", say: ["tread", "groove"] },
    axles: { default: "no", unit: "choice", choices: ["no", "yes"], label: "printed axles",
      words: { no: ["no axles", "without axles"], yes: ["axle", "axles", "with axles"] } },
  },
  things: [
    { names: ["cardboard car wheels", "skewer wheels"], title: "Cardboard car wheels", spec: "bamboo-skewer" },
    { names: ["derby car wheels", "race car wheels", "derby wheels"], title: "Derby car wheels", params: { wheelD: 30, width: 8, treads: 0, fit: 0.5 } },
    { names: ["wooden toy wheels", "dowel wheels"], title: "Wooden toy wheels", spec: "quarter-inch-dowel", params: { wheelD: 45, width: 14 } },
    { names: ["balloon car wheels", "rubber band car wheels", "mousetrap car wheels"], title: "Balloon car wheels", params: { wheelD: 55, width: 6, treads: 0, axles: "yes", axleD: 4 } },
    { names: ["big toy wheels", "toy wagon wheels", "large toy wheels"], title: "Big toy wheels", spec: "quarter-inch-dowel", params: { wheelD: 80, width: 20, hubD: 18 } },
    { names: ["wheel and axle kit", "wheels with axles", "toy car wheel set"], title: "Wheels with axles", params: { axles: "yes", axleD: 4 } },
  ],
  body: `
const R = wheelD / 2, rh = Math.min(Math.max(hubD / 2, axleD / 2 + 2), R - 4);
const web = Math.max(1.6, width * 0.2), rim = Math.max(2, Math.min(R * 0.18, R - rh - 2));
// the tread, bottom to top, with V grooves (steep flanks, nothing hangs)
const edge = [];
for (let i = 1; i <= treads; i++) {
  const z = width * i / (treads + 1), gh = Math.min(1.6, width / (treads + 1) * 0.6), gd = Math.min(gh * 0.45, rim - 1);
  edge.push([R, z - gh / 2], [R - gd, z], [R, z + gh / 2]);
}
const hubH = Math.min(width, Math.max(web + 3, width * 0.8));
const tyre = revolve(360, polygon([[0, 0], [R, 0], ...edge, [R, width], [R - rim, width], [R - rim, web], [rh, web], [rh, hubH], [0, hubH]]));
// eight flats grip a round axle, and an 8-sided cutter is far cheaper than a round one here
const wheel = difference(tyre, translate([0, 0, -1], rotate([0, 0, 22.5], cylinder({ r: (axleD / 2 + fit / 2) / Math.cos(Math.PI / 8), h: width + 2, $fn: 8 }))));
// lay the wheels out in a grid, axles beside them
const per = Math.min(count, 4), pitch = wheelD + 6;
const parts = Array.from({ length: count }, (_, i) => translate([(i % per) * pitch, Math.floor(i / per) * pitch, 0], wheel));
if (axles === "yes") {
  // a pin with a head: long enough for two wheels and a car between them
  const len = Math.max(40, wheelD * 1.6) + 2 * width, ra = axleD / 2;
  const pin = revolve(360, polygon([[0, 0], [ra + 2.5, 0], [ra + 2.5, 2], [ra, 2], [ra, len], [0, len]]));
  for (let i = 0; i < Math.ceil(count / 2); i++) parts.push(translate([per * pitch + i * (2 * ra + 9), 0, 0], pin));
}
return translate([-(per - 1) * pitch / 2, -(Math.ceil(count / per) - 1) * pitch / 2, 0], group(...parts));
`,
};
