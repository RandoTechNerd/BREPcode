// Feet for a printer: a riser cup the printer's own foot sits in, or the
// squash-ball damper, where a soft ball between two cups soaks up the
// vibration. The ball's top cup holds it in a 45 degree cone cut up into the
// bottom, which needs no support where a round socket would.

export default {
  id: "printer-foot",
  category: "printer",
  title: "Printer feet",
  summary: "riser cups for a printer's feet, or squash-ball damper feet that quieten and steady it.",
  print: "upright as shown, no supports. Print four.",
  names: ["printer feet", "printer foot", "anti vibration feet", "anti vibration foot", "vibration dampening feet",
    "printer riser feet", "damper feet", "vibration damper", "printer foot cup", "printer riser", "noise dampening feet"],
  nouns: ["feet", "foot", "riser", "damper"],
  keywords: ["printer", "vibration", "noise", "squash", "ball", "quiet"],
  tips: ["squash ball", "40 mm tall", "for 30 mm feet"],
  examples: ["make me printer feet", "anti vibration feet with squash balls",
    "a printer riser 40mm tall for 30mm feet", "vibration dampening feet for my printer"],
  params: {
    footD: { default: 25, min: 10, max: 60, unit: "mm", label: "printer's foot diameter", say: ["foot", "feet", "diameter"] },
    pocketDepth: { default: 6, min: 2, max: 15, unit: "mm", label: "how deep the foot sits", say: ["pocket", "deep", "depth"] },
    height: { default: 20, min: 8, max: 60, unit: "mm", label: "riser height", say: ["tall", "high", "height", "riser", "lift"] },
    ballD: { default: 40, min: 20, max: 70, unit: "mm", label: "ball diameter (ball style)", say: ["ball"] },
    wall: { default: 4, min: 2.4, max: 8, unit: "mm", label: "wall thickness", say: ["wall"] },
    style: { default: "riser", unit: "choice", choices: ["riser", "ball"], label: "riser cup or squash-ball damper",
      words: { ball: ["squash ball", "squash", "ball", "tennis ball", "damper", "dampening", "anti vibration"], riser: ["riser", "cup", "plain"] } },
  },
  things: [
    { names: ["squash ball feet", "squash ball printer feet", "squash ball damper"], title: "Squash ball feet", params: { style: "ball", ballD: 40 } },
    { names: ["tennis ball feet", "tennis ball printer feet"], title: "Tennis ball feet", params: { style: "ball", ballD: 67, footD: 30, wall: 4 } },
    { names: ["tall printer riser", "printer riser block", "printer lift feet"], title: "Tall printer riser", params: { height: 45, footD: 30 } },
    { names: ["ender 3 feet", "ender feet", "ender 3 riser feet"], title: "Ender 3 feet", params: { footD: 22, height: 25 } },
    { names: ["enclosure feet", "printer table feet", "printer cart feet"], title: "Enclosure feet", params: { footD: 40, height: 20, pocketDepth: 5 } },
  ],
  body: `
const cupR = footD / 2 + 0.3;                         // the printer's foot drops in
if (style === "riser") {
  const top = cupR + wall, bot = top + Math.min(6, height / 3);
  return difference(
    cylinder({ r1: bot, r2: top, h: height, $fn: 64 }),
    translate([0, 0, height - Math.min(pocketDepth, height - 2)], cylinder({ r: cupR, h: pocketDepth + 1, $fn: 64 })),
  );
}
// ball style: a lower cup the ball sits in, and an upper cup that rests on it
const br = ballD / 2;
const lowR = br + 0.5 + wall, lowH = br * 0.6 + 2;
const lower = difference(
  cylinder({ r1: lowR + 2, r2: lowR, h: lowH, $fn: 64 }),
  translate([0, 0, 2], cylinder({ r: br + 0.5, h: lowH, $fn: 64 })),
);
const coneR = br * 0.8;                               // 45 degrees: as tall as it is wide
const upR = Math.max(coneR, cupR) + wall;
const upH = coneR + 2 + pocketDepth;
const upper = difference(
  cylinder({ r: upR, h: upH, $fn: 64 }),
  translate([0, 0, -0.01], cylinder({ r1: coneR, r2: 0.2, h: coneR - 0.2, $fn: 64 })),
  translate([0, 0, upH - pocketDepth], cylinder({ r: cupR, h: pocketDepth + 1, $fn: 64 })),
);
return group(translate([-lowR - 4, 0, 0], lower), translate([upR + 4, 0, 0], upper));
`,
};
