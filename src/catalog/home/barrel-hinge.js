// A printed barrel hinge: two flat leaves whose knuckles interleave, and a
// separate pin. The pin is glued into the outer knuckles of one leaf and the
// other leaf turns on it, so it never drifts out. Countersunk screw holes in
// each leaf. Everything prints flat with no supports: the pin holes are
// teardrops pointing up and the pin is an octagon lying on a flat, so nothing
// rounds over into thin air.

export default {
  id: "barrel-hinge",
  category: "home",
  title: "Barrel hinge",
  summary: "a two-leaf printed hinge with interleaved knuckles, a glue-in pin and countersunk screw holes.",
  print: "flat as shown (countersinks up), pin lying on its flat, no supports. Push the pin through and put a drop of CA glue in the orange leaf's outer knuckles; the blue leaf turns on it. A 3 mm steel rod works as the pin too.",
  names: ["printable hinge", "3d printable hinge", "barrel hinge", "butt hinge",
    "knuckle hinge", "pin hinge", "hinge for a box lid", "box lid hinge", "lid hinge", "door hinge",
    "cabinet door hinge", "cupboard hinge", "gate hinge"],
  nouns: ["hinge"],
  keywords: ["lid", "box", "door", "cabinet", "pin", "knuckle", "leaf", "swing", "fold"],
  primary: "length",
  tips: ["80 mm long", "4 screws per leaf", "pin 4 mm", "looser"],
  examples: ["a 3d printable hinge", "hinge for a box lid", "make me a pin hinge 80mm long",
    "a barrel hinge with a 4 mm pin"],
  params: {
    length: { default: 60, min: 20, max: 200, unit: "mm", label: "hinge length along the pin", say: ["long", "length", "tall"], more: ["longer"], less: ["shorter"] },
    width: { default: 24, min: 10, max: 60, unit: "mm", label: "each leaf, from the pin outwards", say: ["wide", "width", "leaf"], more: ["wider"], less: ["narrower"] },
    thick: { default: 3, min: 2, max: 6, unit: "mm", label: "leaf thickness", say: ["thick", "thickness", "sturdy"], more: ["thicker", "sturdier"], less: ["thinner"] },
    knuckleR: { default: 4, min: 2.5, max: 8, unit: "mm", label: "barrel radius", say: ["barrel", "knuckle"] },
    knuckles: { default: 5, min: 3, max: 11, unit: "count", label: "knuckles (made odd)", say: ["knuckle", "knuckles"] },
    gap: { default: 0.5, min: 0.2, max: 1, unit: "mm", label: "gap between knuckles", say: ["gap"] },
    pinD: { default: 3, min: 1.5, max: 6, unit: "mm", label: "pin diameter", say: ["pin", "rod", "axle"], fixed: true },
    turnFit: { default: 0.45, min: 0.1, max: 1, unit: "mm", label: "clearance where the pin turns", say: ["clearance", "play"], more: ["looser"], less: ["tighter"] },
    glueFit: { default: 0.15, min: 0, max: 0.5, unit: "mm", label: "clearance where the pin is glued", say: ["glue"] },
    sweep: { default: 0.6, min: 0.3, max: 1.5, unit: "mm", label: "clearance round each knuckle", say: ["sweep"] },
    screws: { default: 2, min: 0, max: 6, unit: "count", label: "screw holes per leaf", say: ["screw", "screws", "hole", "holes"], role: "holes" },
    screwD: { default: 3.4, min: 2, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
    headD: { default: 6.5, min: 4, max: 12, unit: "mm", label: "countersink diameter", say: ["head", "countersink"], fixed: true },
  },
  things: [
    { names: ["small hinge", "mini hinge", "jewelry box hinge", "small box hinge", "tiny hinge"], title: "Small hinge",
      params: { length: 30, width: 12, thick: 2, knuckleR: 3, pinD: 2, screwD: 2.4, headD: 4.5 } },
    { names: ["large hinge", "heavy duty hinge", "big hinge", "strong hinge"], title: "Heavy hinge",
      params: { length: 120, width: 40, thick: 5, knuckleR: 6, knuckles: 7, pinD: 5, screws: 3, screwD: 4.5, headD: 9 } },
    { names: ["piano hinge", "continuous hinge", "long hinge"], title: "Piano hinge",
      params: { length: 200, width: 15, thick: 2.5, knuckleR: 3.5, knuckles: 11, screws: 5 } },
  ],
  body: `
const nK = knuckles % 2 ? knuckles : knuckles + 1;        // odd: orange gets both ends and the middle
const kr = Math.max(knuckleR, pinD / 2 + turnFit + 1, thick / 2 + 0.5);   // barrel radius it can hold
const seg = (length - (nK - 1) * gap) / nK;               // one knuckle's length
const x0 = (i) => i * (seg + gap);                        // knuckle i starts here
const flatX = (s) => rotate([90, 90, 0], s);              // a YZ profile pushed along +X
const pts = (r, a0, a1, n) => [...Array(n + 1).keys()].map((k) => {
  const a = a0 + (a1 - a0) * k / n; return [r * Math.cos(a), r * Math.sin(a)];
});
// a barrel is round on top and an octagon's 45 degree chamfers underneath, so it
// rests on a flat and never sticks out past its radius
const zc = kr * Math.cos(Math.PI / 8);                    // pin axis height: the barrel's flat is on the bed
const barrelShape = (r) => polygon([...pts(r, -Math.PI / 8, Math.PI * 9 / 8, 10), ...pts(r, Math.PI * 11 / 8, Math.PI * 13 / 8, 1)]);
const barrel = (i) => translate([x0(i), 0, zc], flatX(linearExtrude({ h: seg }, barrelShape(kr))));
const sweepCut = (i) => translate([x0(i) - gap, 0, zc], rotate([0, 90, 0], cylinder({ r: kr + sweep, h: seg + 2 * gap })));
// the pin hole is a teardrop pointing up, so its roof prints at 45 degrees
const tear = (r) => polygon([...pts(r, Math.PI * 0.75, Math.PI * 2.25, 12), [0, r * Math.SQRT2]]);
const pinHole = (r) => translate([-1, 0, zc], flatX(linearExtrude({ h: length + 2 }, tear(r))));

// a countersunk screw hole through a leaf: two cutters, the shaft and the cone
const csk = (x, y) => [
  translate([x, y, -1], cylinder({ r: screwD / 2, h: thick + 2 })),
  translate([x, y, thick - (headD - screwD) / 2], cylinder({ r1: screwD / 2, r2: headD / 2 + 0.01, h: (headD - screwD) / 2 + 0.01 })),
];
const holeXs = [...Array(screws).keys()].map((k) => length * (screws > 1 ? 0.15 + 0.7 * k / (screws - 1) : 0.5));

// a leaf plate with round corners
const rc = Math.min(3, width / 4);
const rounded = (w, d) => linearExtrude({ h: thick }, polygon([[w - rc, rc], [w - rc, d - rc], [rc, d - rc], [rc, rc]]
  .flatMap(([x, y], k) => pts(rc, Math.PI * (k / 2 - 0.5), Math.PI * k / 2, 4).map(([u, v]) => [x + u, y + v]))));

// a leaf on one side of the pin (side -1 or +1), owning knuckles \`mine\`. The
// cuts go into the plain plate and each knuckle on its own, which is far
// cheaper than cutting the finished leaf.
function leaf(side, mine) {
  const others = [...Array(nK).keys()].filter((i) => !mine.includes(i));
  const hole = pinHole(pinD / 2 + (side < 0 ? glueFit : turnFit) / 2);
  const plate = difference(
    translate([0, side < 0 ? -width : 0, 0], rounded(length, width)),
    ...others.map(sweepCut),                     // room for the other leaf's knuckles
    hole,
    ...holeXs.flatMap((x) => csk(x, side * (width * 0.62))),
  );
  return union(plate, difference(union(...mine.map(barrel)), hole));
}

const evens = [...Array(nK).keys()].filter((i) => i % 2 === 0);
const odds = [...Array(nK).keys()].filter((i) => i % 2 === 1);
const glued = leaf(-1, evens);      // orange: the pin is glued in here
const turning = leaf(1, odds);      // blue: turns on the pin

// the pin: an octagon inside the pin circle, lying on a flat beside the hinge
const oct = polygon(pts(pinD / 2, Math.PI / 8, Math.PI * 15 / 8, 7));
const pin = translate([0, width + 8, pinD / 2 * Math.cos(Math.PI / 8)], flatX(linearExtrude({ h: length - 1 }, oct)));

return group(colorize("#e8902a", glued), colorize("#3b82f6", turning), colorize("#9aa4b2", pin));
`,
};
