// An anchor for resistance bands. On the wall: a plate with a pointed-arch
// loop standing off it, the band threaded through; the arch's roof is
// steep inside and out, so it prints lying on its back with no ceiling to
// bridge. For a door: a thick puck with a webbing slot, shut behind the
// door with the strap through the gap.

export default {
  id: "band-anchor",
  category: "fitness",
  title: "Resistance band anchor",
  summary: "a wall loop or a behind-the-door puck to anchor resistance bands.",
  print: "flat as shown, no supports. For resistance bands only, never body weight. Screw the wall loop into a stud.",
  names: ["resistance band anchor", "band anchor", "exercise band anchor", "band wall anchor", "resistance band wall mount",
    "band door anchor", "resistance band door anchor", "workout band anchor"],
  nouns: ["anchor"],
  keywords: ["band", "bands", "resistance", "exercise", "physio", "therapy", "door", "wall", "workout"],
  tips: ["door anchor", "bigger loop", "40 mm strap"],
  examples: ["I want a resistance band anchor", "make me a wall anchor for my exercise bands",
    "a door anchor for resistance bands", "band anchor with a 40mm opening"],
  params: {
    style: { default: "wall", unit: "choice", choices: ["wall", "door"], label: "wall loop or door puck",
      words: { door: ["door"], wall: ["wall", "screw"] } },
    loopW: { default: 30, min: 15, max: 60, unit: "mm", label: "loop opening width", say: ["opening", "loop", "wide"], more: ["bigger", "wider"] },
    loopH: { default: 30, min: 15, max: 60, unit: "mm", label: "loop opening height", say: ["tall", "high"] },
    loopT: { default: 14, min: 8, max: 30, unit: "mm", label: "loop thickness along the band", say: ["thick"], more: ["stronger"] },
    wallT: { default: 7, min: 4, max: 14, unit: "mm", label: "loop wall thickness", say: ["wall"] },
    puckD: { default: 45, min: 30, max: 80, unit: "mm", label: "door puck diameter", say: ["puck", "diameter"] },
    strapW: { default: 26, min: 15, max: 52, unit: "mm", label: "webbing strap width", say: ["strap", "webbing"] },
  },
  things: [
    { names: ["door anchor for resistance bands", "door anchor", "resistance band door stopper", "band door stopper"], title: "Band door anchor", params: { style: "door" } },
    { names: ["physio band anchor", "therapy band anchor", "rehab band anchor"], title: "Physio band anchor", params: { loopW: 25, loopH: 25 } },
    { names: ["tube band anchor", "resistance tube anchor", "exercise tube anchor"], title: "Resistance tube anchor", params: { loopW: 22, loopH: 24, loopT: 12 } },
    { names: ["heavy band anchor", "power band anchor", "loop band anchor"], title: "Heavy band anchor", params: { loopW: 45, loopH: 45, loopT: 20, wallT: 10 } },
    { names: ["wide strap door anchor", "door anchor for straps"], title: "Wide strap door anchor", params: { style: "door", puckD: 60, strapW: 40 } },
  ],
  body: `
if (style === "door") {
  // a puck that sits behind the shut door, the strap through a slot in it
  const h = Math.max(18, strapW * 0.6);
  const sw = Math.min(strapW + 1, puckD - 8);
  return difference(cylinder({ r: puckD / 2, h, $fn: 64 }), translate([-sw / 2, -2.5, -1], cube([sw, 5, h + 2])));
}
const k = Math.tan(55 * Math.PI / 180);
const hi = Math.max(2, loopH - loopW / 2 * k);           // where the inside roof starts
const apexIn = hi + loopW / 2 * k;
const W = loopW + 2 * wallT;
const v = wallT / Math.cos(55 * Math.PI / 180);           // the roof offset straight up for a wall thickness
const apexOut = apexIn + v, ho = apexOut - W / 2 * k;
// the loop's profile: x across, y up off the plate; lying on the plate, running along x
const outerArch = polygon([[-W / 2, 0], [W / 2, 0], [W / 2, ho], [0, apexOut], [-W / 2, ho]]);
const innerArch = polygon([[-loopW / 2, -1], [loopW / 2, -1], [loopW / 2, hi], [0, apexIn], [-loopW / 2, hi]]);
const run = (prof, L) => translate([-L / 2, 0, 0], rotate([90, 90, 0], linearExtrude({ h: L }, prof)));
const pt = Math.max(5, wallT - 1);                        // plate thickness
const loop = translate([0, 0, pt - 0.5], difference(run(outerArch, loopT), run(innerArch, loopT + 2)));
// the plate, screws either side of the loop, countersunk
const PL = loopT + 44, PW = W + 12;
const screwCut = (x) => [translate([x, 0, -1], cylinder({ r: 2.6, h: pt + 2, $fn: 16 })), translate([x, 0, pt - 2.6], cylinder({ r1: 2.6, r2: 5.3, h: 2.61, $fn: 16 }))];
const plate = difference(translate([-PL / 2, -PW / 2, 0], cube([PL, PW, pt])), ...screwCut(-(loopT / 2 + 11)), ...screwCut(loopT / 2 + 11));
return union(plate, loop);
`,
};
