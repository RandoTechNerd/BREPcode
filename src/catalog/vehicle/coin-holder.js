// A coin holder for the car: one tube per coin, each a little wider than its
// coin, with a slot up the front to see how many are left and a hole in the
// floor to push the stack up from below. In a row, or round to drop into a
// cup holder. The coin sizes are each mint's published diameters.

export default {
  id: "coin-holder",
  category: "vehicle",
  title: "Coin holder",
  summary: "a tube per coin, in a row or round to fit a cup holder, with a push-up hole under each stack.",
  print: "upright as shown, no supports.",
  names: ["car coin holder", "coin dispenser", "car coin dispenser", "change holder", "car change holder", "coin caddy",
    "coin stacker", "loose change holder", "coin organizer", "multi coin holder"],
  nouns: ["holder", "dispenser", "organizer", "caddy"],
  keywords: ["coin", "coins", "change", "quarter", "car", "toll", "parking", "laundry", "euro", "pence"],
  tips: ["euro coins", "round for the cup holder", "taller"],
  examples: ["I want a car coin holder", "make me a car coin holder for euro coins",
    "coin dispenser that fits a cup holder", "a laundry quarter dispenser"],
  params: {
    coins: { default: "us", unit: "choice", choices: ["us", "euro", "uk", "canada"], label: "which coins",
      words: { euro: ["euro", "euros", "eur", "cent coins"], uk: ["uk", "british", "pound", "pounds", "pence", "sterling", "gbp"],
        canada: ["canada", "canadian", "loonie", "loonies", "toonie", "toonies"], us: ["us", "usa", "american", "quarters", "dimes", "nickels", "pennies"] } },
    which: { default: "all", unit: "choice", choices: ["all", "first"], label: "every coin, or just the biggest",
      words: { first: ["just quarters", "only quarters", "single tube", "one tube"], all: ["all coins", "every coin"] } },
    arrange: { default: "row", unit: "choice", choices: ["row", "round"], label: "in a row, or round for a cup holder",
      words: { round: ["cup holder", "cupholder", "round", "circle"], row: ["row", "in a row", "flat", "inline"] } },
    height: { default: 60, min: 20, max: 140, unit: "mm", label: "tube height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    wall: { default: 2, min: 1.2, max: 4, unit: "mm", label: "wall thickness", say: ["wall"] },
    fit: { default: 0.8, min: 0.2, max: 2, unit: "mm", label: "room around each coin (total)", say: ["fit", "clearance", "loose"] },
    holderD: { default: 76, min: 55, max: 100, unit: "mm", label: "cup holder size (round arrangement)", say: ["across", "diameter"] },
    slotW: { default: 8, min: 0, max: 14, unit: "mm", label: "front slot width (0 = none)", say: ["slot", "window"] },
  },
  things: [
    { names: ["cup holder coin holder", "cupholder coin holder", "round coin holder"], title: "Cup holder coin holder", params: { arrange: "round" } },
    { names: ["quarter dispenser", "laundry quarter holder", "laundry quarter dispenser", "car quarter holder"], title: "Quarter dispenser",
      params: { coins: "us", which: "first", height: 100 } },
    { names: ["euro coin dispenser", "euro coin organizer", "car euro coin holder"], title: "Euro coin holder", params: { coins: "euro" } },
    { names: ["pound coin dispenser", "uk coin holder", "british coin holder"], title: "UK coin holder", params: { coins: "uk" } },
    { names: ["canadian coin holder", "loonie holder", "toonie holder"], title: "Canadian coin holder", params: { coins: "canada" } },
    { names: ["parking coin holder", "toll coin holder", "meter coin holder"], title: "Parking coin holder", params: { height: 45 } },
  ],
  body: `
// published diameters, mm: US Mint, ECB, Royal Mint, Royal Canadian Mint (largest first)
const sets = {
  us: [24.26, 21.21, 19.05, 17.91],                        // quarter, nickel, penny, dime
  euro: [25.75, 24.25, 23.25, 22.25, 21.25, 19.75],        // 2 euro, 50c, 1 euro, 20c, 5c, 10c
  uk: [28.4, 27.3, 24.5, 23.43, 21.4, 18],                 // 2 pound, 50p, 10p, 1 pound, 20p, 5p
  canada: [28, 26.5, 23.88, 21.2, 18.03],                  // toonie, loonie, quarter, nickel, dime
};
const ds = (which === "first" ? sets[coins].slice(0, 1) : sets[coins]).map((d) => d + fit);
const dmax = Math.max(...ds);
const floor = Math.max(2, wall);
let at;                                                     // [x, y] of each tube
if (arrange === "round" && ds.length > 1) {
  const n = ds.length;
  // far enough out that neighbours clear each other, and as far as the holder allows
  const need = (dmax + wall) / (2 * Math.sin(Math.PI / n));
  const Rc = Math.max(holderD / 2 - wall - dmax / 2, need);
  at = ds.map((_, i) => [Rc * Math.cos(2 * Math.PI * i / n), Rc * Math.sin(2 * Math.PI * i / n)]);
} else {
  let x = 0;
  at = ds.map((d, i) => { if (i) x += (ds[i - 1] + d) / 2 + wall; return [x, 0]; });
  at = at.map(([x0, y]) => [x0 - x / 2, y]);
}
const outer = arrange === "round" && ds.length > 1
  ? cylinder({ r: Math.hypot(...at[0]) + dmax / 2 + wall, h: height, $fn: 96 })
  : hull(...ds.map((d, i) => translate([at[i][0], at[i][1], 0], cylinder({ r: d / 2 + wall, h: height, $fn: 64 }))));
const cuts = ds.flatMap((d, i) => {
  const [x, y] = at[i];
  const out = Math.atan2(y, x) * 180 / Math.PI;           // the slot faces outward (front, in a row)
  const face = arrange === "round" && ds.length > 1 ? out : -90;
  const c = [
    translate([x, y, floor], cylinder({ r: d / 2, h: height, $fn: 64 })),
    translate([x, y, -1], cylinder({ r: d * 0.3, h: floor + 2, $fn: 32 })),     // push the stack up from below
  ];
  if (slotW > 0) c.push(translate([x, y, floor + 4], rotate([0, 0, face], translate([0, -slotW / 2, 0], cube([d / 2 + wall + 2, slotW, height])))));
  return c;
});
return difference(outer, ...cuts);
`,
};
