// A pair of jump rope handles: lathed grips with the rope threaded down a
// bore and knotted in a cone at the foot, so the knot pulls in snug. The
// option is a pocket for a 608 skate bearing up top for a smooth spin.
// Printed standing on their flared ends.

export default {
  id: "jump-rope-handles",
  category: "fitness",
  title: "Jump rope handles",
  summary: "a pair of lathed jump rope handles with a rope bore and a knot pocket, optionally for a 608 bearing.",
  print: "standing upright as shown, no supports. Thread the rope down through the top and knot it in the cone at the foot.",
  names: ["jump rope handles", "jump rope handle", "skipping rope handles", "skip rope handles", "speed rope handles",
    "jump rope grips", "skipping rope handle", "jump rope", "skipping rope"],
  nouns: ["handles", "handle", "grips"],
  keywords: ["jump", "rope", "skipping", "skip", "speed", "cardio", "boxing", "crossfit"],
  primary: "gripD",
  tips: ["with a bearing", "for a 3 mm cable", "thicker grip"],
  examples: ["I want jump rope handles", "make me skipping rope handles for a 5mm rope", "speed rope handles with a bearing",
    "jump rope handles 160mm long"],
  params: {
    length: { default: 140, min: 90, max: 200, unit: "mm", label: "handle length", say: ["long", "length", "tall"], more: ["longer"], less: ["shorter"] },
    gripD: { default: 26, min: 18, max: 40, unit: "mm", label: "grip diameter", say: ["grip", "thick", "diameter"], more: ["thicker"], less: ["thinner", "slimmer"] },
    ropeD: { default: 5, min: 2, max: 10, unit: "mm", label: "rope diameter", say: ["rope", "cable", "cord"] },
    knotD: { default: 12, min: 6, max: 20, unit: "mm", label: "knot pocket diameter", say: ["knot"] },
    flare: { default: 3, min: 0, max: 8, unit: "mm", label: "end flare", say: ["flare", "end"] },
    topBearing: { default: "none", unit: "choice", choices: ["none", "608"], label: "608 bearing pocket on top",
      words: { none: ["no bearing", "without bearing", "without a bearing"], "608": ["bearing", "608", "ball bearing", "skate bearing"] } },
  },
  things: [
    { names: ["speed rope handles", "speed jump rope handles", "cable jump rope handles"], title: "Speed rope handles", params: { gripD: 22, length: 150, ropeD: 3, knotD: 8, topBearing: "608" } },
    { names: ["weighted jump rope handles", "heavy jump rope handles"], title: "Weighted jump rope handles", params: { gripD: 32, length: 170, ropeD: 8, knotD: 16, flare: 4 } },
    { names: ["kids jump rope handles", "children skipping rope handles"], title: "Kids jump rope handles", params: { gripD: 22, length: 110, ropeD: 5, knotD: 11 } },
    { names: ["bearing jump rope handles", "ball bearing jump rope handles"], title: "Bearing jump rope handles", params: { topBearing: "608", gripD: 28 } },
    { names: ["beaded jump rope handles", "beaded rope handles"], title: "Beaded rope handles", params: { gripD: 26, ropeD: 6, knotD: 14 } },
    { names: ["boxing jump rope handles", "boxer skipping rope handles"], title: "Boxing rope handles", params: { gripD: 24, length: 160, ropeD: 4, knotD: 10, topBearing: "608" } },
  ],
  body: `
const R = gripD / 2, rb = ropeD / 2 + 0.3;               // grip, and the rope bore with a little room
const withBearing = topBearing === "608";
const rTop = withBearing ? Math.max(R * 0.9, 11.05 + 2.4) : R * 0.85;
const rEnd = R + flare;
const foot = flare > 0.2 ? [[rEnd, 0], [rEnd, 2], [R, 2 + flare * 1.2]] : [[R, 0]];
const neck = Math.max(10, (rTop > R ? (rTop - R) * 1.2 : 0) + 8);   // widening up stays under 40 degrees
const one = revolve(360, polygon([[0, 0], ...foot, [R * 1.06, length * 0.45], [R, length - neck], [rTop, length], [0, length]]));
// the knot sits in a steep cone at the foot (no flat ceiling), the rope runs up the bore
const kr = Math.min(knotD / 2, rEnd - 2);
const cuts = [
  translate([0, 0, -1], cylinder({ r: rb, h: length + 2, $fn: 20 })),
  translate([0, 0, -0.01], cylinder({ r1: kr, r2: rb + 0.4, h: (kr - rb - 0.4) * 1.43 + 0.01, $fn: 24 })),
];
if (withBearing) cuts.push(translate([0, 0, length - 7.2], cylinder({ r: 11.05, h: 8, $fn: 48 })));
const grip = difference(one, ...cuts);
const sep = rEnd + 4;
return group(translate([-sep, 0, 0], grip), translate([sep, 0, 0], grip));
`,
};
