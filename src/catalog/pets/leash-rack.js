// A wall rack for leashes, collars and harnesses: a plate with round pegs
// that angle up from the wall so a loop cannot slide off. It prints lying on
// the plate's back, with the pegs rising from it leaning no more than 40
// degrees from vertical, so their undersides are walls, not ceilings, and
// their domed tips are no wider than the pegs. The optional tray above the
// pegs (poop bags, treats, keys) is an open box whose walls all rise straight
// off the plate, with a 50 degree lip along its bottom edge.

export default {
  id: "leash-rack",
  category: "pets",
  title: "Leash rack",
  summary: "a wall plate with upward-angled pegs for leashes, collars and harnesses, and an optional tray for bags and treats.",
  print: "lying on its back as shown, no supports. Screw it to the wall (countersunk holes) or use mounting tape for light leashes.",
  names: ["leash rack", "leash holder", "dog leash holder", "leash hanger", "dog leash hanger", "dog leash rack",
    "pet leash rack", "leash organizer", "leash wall mount", "wall leash holder"],
  nouns: ["rack", "hanger", "hook"],
  keywords: ["leash", "lead", "collar", "harness", "dog", "entryway"],
  primary: "pegL",
  tips: ["4 pegs", "with a tray", "longer pegs", "tape instead of screws"],
  examples: ["I want a leash holder", "make me a dog leash rack with 4 pegs",
    "a leash hanger with a tray for poop bags", "leash rack with mounting tape"],
  params: {
    pegs: { default: 3, min: 1, max: 8, unit: "count", label: "number of pegs", say: ["peg", "pegs", "leash", "leashes", "hook", "hooks"] },
    pegL: { default: 55, min: 25, max: 120, unit: "mm", label: "peg length", say: ["long", "length", "deep"], more: ["longer"], less: ["shorter"] },
    pegD: { default: 12, min: 6, max: 25, unit: "mm", label: "peg diameter", say: ["thick", "peg", "diameter"], more: ["thicker", "stronger"], less: ["thinner"] },
    tilt: { default: 30, min: 0, max: 40, unit: "deg", label: "how far the pegs angle up", say: ["angle", "tilt", "degree", "up"] },
    spacing: { default: 60, min: 25, max: 120, unit: "mm", label: "space between pegs", say: ["apart", "spacing", "gap", "between"] },
    plateH: { default: 70, min: 30, max: 200, unit: "mm", label: "plate height (below any tray)", say: ["tall", "high", "height", "plate"] },
    plateT: { default: 5, min: 3, max: 10, unit: "mm", label: "plate thickness", say: ["thickness"] },
    tray: { default: "none", unit: "choice", choices: ["none", "tray"], label: "a tray above the pegs",
      words: { none: ["no tray", "without a tray", "without tray", "no shelf"], tray: ["tray", "pocket", "bag holder", "poop bags", "cubby", "treat holder", "key tray"] } },
    trayD: { default: 40, min: 20, max: 80, unit: "mm", label: "tray depth out from the wall", say: ["tray"] },
    mount: { default: "screws", unit: "choice", choices: ["screws", "tape"], label: "screw holes, or a flat back for mounting tape",
      words: { tape: ["tape", "mounting tape", "adhesive", "command strip", "no screws", "no holes"], screws: ["screw", "screws", "screwed"] } },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["leash hook", "single leash hook", "dog leash hook", "lead hook"], title: "Leash hook",
      params: { pegs: 1, pegL: 60, pegD: 14 } },
    { names: ["collar hanger", "collar rack", "dog collar holder", "collar holder", "dog collar rack", "collar hook"], title: "Collar hanger",
      params: { pegs: 6, pegL: 40, pegD: 8, spacing: 35, plateH: 50 } },
    { names: ["harness hook", "harness hanger", "dog harness holder", "harness holder", "harness rack", "dog harness hook"], title: "Harness hook",
      params: { pegs: 2, pegL: 85, pegD: 20, spacing: 90, plateH: 90, plateT: 6 } },
    { names: ["leash rack with tray", "leash holder with tray", "leash and treat holder", "dog walk station", "leash station", "leash rack with shelf"],
      title: "Leash rack with tray", params: { tray: "tray", pegs: 3, trayD: 45 } },
    { names: ["multi leash rack", "family leash rack", "large leash rack", "big leash holder"], title: "Large leash rack",
      params: { pegs: 5, spacing: 55, pegL: 65 } },
    { names: ["halter hook", "bridle hook", "horse halter hanger", "halter holder", "tack hook"], title: "Halter hook",
      params: { pegs: 1, pegL: 110, pegD: 24, plateH: 110, plateT: 7, tilt: 35, screwD: 5 } },
  ],
  body: `
// print orientation: the plate lies on the bed (its back goes on the wall);
// x along the wall, y up the wall, pegs rise in z leaning toward +y
const margin = Math.max(28, pegD + 16);
const Wp = Math.max(80, (pegs - 1) * spacing + 2 * margin);
const r = pegD / 2;
const rC = Math.min(1.6 * r, r + 6);                       // the flared collar at each peg's foot
const pH = Math.max(plateH, 2 * rC + 16);
const withTray = tray === "tray";
const trayH = withTray ? Math.max(45, trayD) : 0;          // tray height up the wall
const Hp = pH + trayH;
const rc = Math.min(8, Hp / 2 - 0.5, Wp / 2 - 0.5);
const plate = hull(...[[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sy]) =>
  translate([sx * (Wp / 2 - rc), sy ? Hp - rc : rc, 0], cylinder({ r: rc, h: plateT, $fn: 32 }))));
const yPeg = pH / 2;
// a peg: started below the bed, tipped up the wall, flared at its foot and
// domed at its end; the part below 0.5 mm is trimmed off, so its foot is
// buried in the plate
const sink = (rC + plateT) * 2 + 2;
const pegAt = (x) => translate([x, yPeg, plateT], rotate([-tilt, 0, 0],
  translate([0, 0, -sink], cylinder({ r, h: pegL + sink, $fn: 40 })),
  translate([0, 0, -sink], cylinder({ r: rC, h: sink, $fn: 40 })),
  cylinder({ r1: rC, r2: r, h: 2 * (rC - r) + 0.01, $fn: 40 }),
  translate([0, 0, pegL], sphere({ r, $fn: 40 }))));
const pegList = Array.from({ length: pegs }, (_, i) => pegAt((i - (pegs - 1) / 2) * spacing));
const reach = pegL + r + 2;
const parts = [plate, intersection(union(...pegList), translate([-Wp, -reach, 0.5], cube([2 * Wp, Hp + 2 * reach, 2 * reach])))];
const holes = [];
if (withTray) {
  // an open box above the pegs, walls straight up off the plate
  const tw = 2.4;
  const Wi = Wp - 12, y1 = pH, y2 = Hp - 4, zt = plateT + trayD;
  parts.push(difference(
    translate([-Wi / 2, y1, plateT - 0.01], cube([Wi, y2 - y1, trayD + 0.01])),
    translate([-Wi / 2 + tw, y1 + tw, plateT], cube([Wi - 2 * tw, y2 - y1 - 2 * tw, trayD + 1])),
  ));
  // a lip on the bottom wall's edge, leaning up into the tray at 50 degrees
  const lipH = Math.min(8, trayH * 0.2), yw = y1 + tw - 0.01;
  parts.push(translate([-Wi / 2 + tw - 0.01, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0],
    linearExtrude({ h: Wi - 2 * tw + 0.02 }, polygon([[yw, zt - lipH * 1.2], [yw + lipH, zt], [yw, zt]]))))));
  if (mount === "screws") holes.push([-Wi / 4, (y1 + y2) / 2], [Wi / 4, (y1 + y2) / 2]);
}
if (mount === "screws") {
  const xh = Wp / 2 - Math.max(12, screwD * 2.5);
  holes.push([-xh, yPeg], [xh, yPeg]);
}
const k = Math.min(screwD / 2 + 0.5, plateT - 1.2);           // countersink depth
const cuts = holes.flatMap(([x, y]) => [
  translate([x, y, -1], cylinder({ r: screwD / 2, h: plateT + 2, $fn: 24 })),
  translate([x, y, plateT - k], cylinder({ r1: screwD / 2, r2: screwD / 2 + k + 0.02, h: k + 0.02, $fn: 24 })),
]);
const board = cuts.length ? difference(union(...parts), ...cuts) : union(...parts);
return translate([0, -Hp / 2, 0], board);
`,
};
