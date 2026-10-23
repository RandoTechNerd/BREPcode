// A clip that slides over a car sun visor and holds one small thing on its
// face: sunglasses by an arm, a pen, a parking card or a garage remote. The
// side view (a U over the visor, the holder on its outer arm) is one profile
// extruded along the visor's edge and printed lying on it, so it needs no
// support. The U's arms close in a little, so it springs onto the visor.

export default {
  id: "visor-clip",
  category: "vehicle",
  title: "Visor clip",
  summary: "a clip that slides over a car sun visor and holds sunglasses, a pen, a parking card or a garage remote.",
  print: "on its side as shown, no supports. PETG: PLA softens in a hot car.",
  names: ["visor clip", "sun visor clip", "sunglasses visor clip", "visor sunglasses holder", "car sunglasses holder",
    "car glasses holder", "visor holder", "sun visor holder", "visor organizer"],
  nouns: ["clip", "holder"],
  keywords: ["visor", "car", "sunglasses", "glasses", "sun", "windshield"],
  ask: {
    unless: ["visorT"],
    text: "How thick is your sun visor? Measure near the edge the clip slides onto; I used 24 mm.",
  },
  tips: ["for a 20 mm visor", "holds a pen", "wider"],
  examples: ["I want a sunglasses visor clip", "make me a visor clip for a pen",
    "garage door opener clip for my visor", "visor clip for a 20mm thick visor"],
  params: {
    holds: { default: "glasses", unit: "choice", choices: ["glasses", "pen", "card", "remote"], label: "what it holds",
      words: { pen: ["pen", "pencil"], card: ["card", "pass", "permit", "ticket", "toll"], remote: ["remote", "opener", "garage door", "clicker"],
        glasses: ["glasses", "sunglasses", "shades", "spectacles"] } },
    visorT: { default: 24, min: 10, max: 40, unit: "mm", label: "visor thickness", say: ["visor", "thick", "thickness"] },
    grip: { default: 1, min: 0, max: 3, unit: "mm", label: "how much the arms close in (grip)", say: ["grip", "tight"] },
    armL: { default: 30, min: 15, max: 60, unit: "mm", label: "how far it reaches onto the visor", say: ["deep", "reach", "long"] },
    width: { default: 25, min: 10, max: 80, unit: "mm", label: "clip width along the visor edge", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    wall: { default: 2.5, min: 1.8, max: 4, unit: "mm", label: "wall thickness", say: ["wall"], more: ["stiffer"] },
    itemT: { default: 3, min: 1, max: 30, unit: "mm", label: "what it holds: glasses-arm gap, pen diameter, card gap or remote thickness", say: ["pen", "remote", "gap", "card"] },
  },
  things: [
    { names: ["visor pen holder", "car pen holder", "visor pen clip"], title: "Visor pen holder", params: { holds: "pen", itemT: 11 } },
    { names: ["parking pass holder", "visor card holder", "parking permit holder", "toll pass holder", "visor ticket holder", "parking card holder"],
      title: "Visor card holder", params: { holds: "card", itemT: 1.4, width: 60 } },
    { names: ["garage door opener clip", "garage remote visor clip", "garage remote holder", "garage door opener holder", "gate remote clip"],
      title: "Garage remote visor clip", params: { holds: "remote", itemT: 18, armL: 45, width: 40 } },
    { names: ["eyeglasses visor clip", "reading glasses clip"], title: "Glasses visor clip", params: { holds: "glasses", width: 20 } },
  ],
  body: `
// side profile: x runs across the visor's thickness, y runs in from its edge; printed lying on it
const g = visorT;
const xi = -g / 2, xo = g / 2;                   // the visor's two faces
const box = (x0, y0, x1, y1) => linearExtrude({ h: width }, polygon([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]));
// an arm that leans in by grip at its tip, so the clip springs onto the visor
const arm = (x, dir) => linearExtrude({ h: width }, polygon([
  [x + dir * grip, 0], [x + dir * grip + (dir > 0 ? -wall : wall), 0],
  [x + (dir > 0 ? -wall : wall), armL], [x, armL],
]));
const parts = [
  arm(xi, 1),                                     // inner arm, its face at xi, leaning +x
  arm(xo, -1),                                    // outer arm
  box(xi - wall, armL - 0.01, xo + wall, armL + wall),   // the spine over the visor's edge
];
const x0 = xo + wall;                             // the outer face, where the holder goes
if (holds === "glasses" || holds === "card") {
  // a tongue beside the outer arm, joined at the spine: the glasses arm or the card slides in from the open end
  const gap = holds === "card" ? itemT : Math.max(2, itemT);
  parts.push(box(x0 - 0.01, armL - 0.01, x0 + gap + 0.01, armL + wall));
  parts.push(box(x0 + gap, armL * 0.25, x0 + gap + 2, armL + wall));
} else if (holds === "pen") {
  // a snap ring on the outer face, its mouth facing out
  const r = itemT / 2, rr = r + 1.8, cy = armL / 2;
  parts.push(translate([x0 + r + 0.6, cy, 0], difference(
    cylinder({ r: rr, h: width, $fn: 48 }),
    translate([0, 0, -1], cylinder({ r, h: width + 2, $fn: 48 })),
    translate([r * 0.55, -r * 0.8, -1], cube([rr, r * 1.6, width + 2])),
  )));
} else {
  // a channel the remote slides into from the side, lips over its face
  const d = itemT, H = armL + wall;
  // (the outer arm leans in by grip at its tip, so the walls reach back into it)
  parts.push(box(x0 - grip - 0.6, 0, x0 + d + 2, 2));
  parts.push(box(x0 - 0.6, H - 2, x0 + d + 2, H));
  parts.push(box(x0 + d, 0, x0 + d + 2, 5));
  parts.push(box(x0 + d, H - 5, x0 + d + 2, H));
}
return translate([0, -armL / 2, 0], union(...parts));
`,
};
