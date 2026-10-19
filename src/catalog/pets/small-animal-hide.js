// A hide or hideout for small animals, reptiles and fish: a tunnel whose
// cross-section is a gothic tent (straight walls, a curve, then a roof at
// 52 degrees to a ridge) or a plain A-frame, extruded along its length, with
// pointed doorways in its end walls, open ends, or one closed end (a cave).
//
// Every inside surface stays at least 46 degrees from horizontal: the roof
// lines are never flatter than that, the doorways have the same pointed top,
// and the side windows are tall diamonds. So it prints standing as used,
// with no support inside, and no floor (it sits on the substrate).

export default {
  id: "small-animal-hide",
  category: "pets",
  title: "Small animal hide",
  summary: "a tunnel hideout with a pointed roof and doorways, for hamsters, mice, reptiles, shrimp and fish.",
  print: "upright as shown, no supports. PETG for anything that sits in water or a humid tank; sand the door edges smooth.",
  names: ["small animal hide", "small animal hideout", "hamster hideout", "pet hideout", "animal hide", "hide house",
    "hideout house", "pet cave", "critter hideout", "small pet hideout"],
  nouns: ["hide", "hideout", "cave", "house", "hut"],
  keywords: ["hamster", "gecko", "reptile", "mouse", "rat", "terrarium", "aquarium", "enclosure", "cage"],
  primary: "width",
  tips: ["200 mm long", "one door", "A-frame roof", "more windows"],
  examples: ["I want a hamster hideout", "make me a gecko hide 150mm long",
    "a reptile cave with a closed back", "small animal hide with open ends"],
  params: {
    width: { default: 110, min: 30, max: 250, unit: "mm", label: "outside width", say: ["wide", "width", "across"], more: ["wider", "bigger"], less: ["narrower", "smaller"] },
    height: { default: 90, min: 25, max: 200, unit: "mm", label: "height (raised if the roof would be too flat)", say: ["tall", "high", "height"], more: ["taller", "higher"], less: ["lower", "shorter"] },
    length: { default: 150, min: 40, max: 250, unit: "mm", label: "length", say: ["long", "length", "deep"], more: ["longer"], less: ["shorter"] },
    wall: { default: 3, min: 1.6, max: 6, unit: "mm", label: "wall thickness", say: ["wall", "thick"], more: ["stronger", "thicker"] },
    roof: { default: "arch", unit: "choice", choices: ["arch", "a-frame"], label: "pointed arch, or a straight A-frame",
      words: { "a-frame": ["a frame", "a-frame", "triangle", "triangular", "tent"], arch: ["arch", "arched", "gothic", "pointed"] } },
    ends: { default: "doors", unit: "choice", choices: ["doors", "open", "cave"], label: "a doorway at each end, open ends, or one door (a cave)",
      words: { cave: ["single door", "single entrance", "one door", "one doorway", "one entrance", "closed back", "closed end", "back wall"], open: ["open ends", "open ended", "open end", "tunnel", "no ends"], doors: ["two doors", "doorways", "two entrances", "both ends"] } },
    door: { default: 0.6, min: 0.3, max: 0.85, unit: "ratio", label: "doorway size as a share of the inside" },
    windows: { default: 2, min: 0, max: 6, unit: "count", label: "diamond windows along each side", say: ["window", "windows"] },
  },
  things: [
    { names: ["hamster house", "hamster hut", "gerbil house", "hamster home", "dwarf hamster house"], title: "Hamster house",
      params: { roof: "a-frame", width: 120, height: 100, length: 140, windows: 1 } },
    { names: ["hamster tunnel", "small animal tunnel", "gerbil tunnel", "hamster play tunnel"], title: "Hamster tunnel",
      params: { ends: "open", width: 80, height: 75, length: 200, windows: 3 } },
    { names: ["mouse house", "mouse hide", "mouse hideout", "mice house", "mouse hut"], title: "Mouse house",
      params: { width: 70, height: 65, length: 90, windows: 1, wall: 2.4 } },
    { names: ["rat hide", "rat house", "rat hideout", "degu house", "rat hut"], title: "Rat hide",
      params: { width: 150, height: 130, length: 200, windows: 2, wall: 3.5 } },
    { names: ["guinea pig hideout", "guinea pig house", "guinea pig hide", "rabbit hideout", "chinchilla house", "bunny hideout"],
      title: "Guinea pig hideout", params: { ends: "open", width: 200, height: 160, length: 250, windows: 2, wall: 4 } },
    { names: ["gecko hide", "leopard gecko hide", "gecko cave", "leopard gecko cave", "gecko house", "gecko hideout"], title: "Gecko hide",
      params: { ends: "cave", width: 120, height: 85, length: 150, windows: 0, door: 0.45 } },
    { names: ["reptile cave", "reptile hide", "reptile hideout", "reptile house", "bearded dragon hide", "skink hide", "lizard hide"], title: "Reptile cave",
      params: { ends: "cave", width: 180, height: 130, length: 220, windows: 0, door: 0.5, wall: 3.5 } },
    { names: ["snake hide", "ball python hide", "snake cave", "corn snake hide", "python hide", "snake hideout"], title: "Snake hide",
      params: { ends: "cave", roof: "a-frame", width: 200, height: 140, length: 240, windows: 0, door: 0.4, wall: 3.5 } },
    { names: ["shrimp cave", "shrimp hide", "shrimp house", "shrimp tunnel", "shrimp hideout"], title: "Shrimp cave",
      params: { ends: "open", width: 40, height: 40, length: 60, windows: 2, wall: 2 } },
    { names: ["fish cave", "betta cave", "aquarium cave", "fish hide", "fish house", "cichlid cave", "fish tank cave"], title: "Fish cave",
      params: { width: 80, height: 75, length: 110, windows: 3, wall: 2.4 } },
    { names: ["pleco cave", "pleco tube", "spawning cave", "catfish cave", "breeding cave"], title: "Pleco cave",
      params: { ends: "cave", width: 50, height: 50, length: 130, windows: 0, door: 0.85, wall: 3 } },
  ],
  body: `
// cross-section in (x, z), extruded along y; the roof is never flatter than 52 degrees
const tanR = Math.tan(52 * Math.PI / 180);
const turn = (90 - 52) * Math.PI / 180;                    // the arc turns the wall this far from upright
const kArc = Math.sin(turn) - (1 - Math.cos(turn)) * tanR; // height an arc of radius 1 adds
// the right half of an outline, from (B, 0) up to the ridge (0, Hh)
const half = (B, Hh, N = 10) => {
  const flat = B * tanR;                                    // the plain 52 degree A-frame
  if (roof === "a-frame" || Hh <= flat + 0.5) return [[B, 0], [0, Math.max(Hh, flat)]];
  const rho = Math.min(B / (1 - Math.cos(turn)) * 0.98, (Hh - flat) / kArc);
  const zv = Hh - flat - rho * kArc;                       // any height left over: straight walls
  const pts = [[B, 0]];
  if (zv > 0.5) pts.push([B, zv]);
  for (let i = 1; i <= N; i++) {
    const t = turn * i / N;
    pts.push([B - rho + rho * Math.cos(t), Math.max(zv, 0) + rho * Math.sin(t)]);
  }
  pts.push([0, Hh]);
  return pts;
};
const both = (h) => [...h, ...h.slice(0, -1).reverse().map(([x, z]) => [-x, z])];  // mirror to a full outline
const B = width / 2;
const Ho = Math.max(height, B * tanR + 1);
const outerHalf = half(B, Ho);
const ridge = outerHalf[outerHalf.length - 1][1];
const pe = outerHalf[outerHalf.length - 2];
const ang = Math.atan2(ridge - pe[1], pe[0]);              // roof angle at the ridge
const Bi = B - wall;
const Hi = Math.min(ridge - 1.2, Math.max(ridge - wall / Math.cos(ang), Bi * Math.tan(48 * Math.PI / 180)));
const innerHalf = half(Bi, Hi);
// the band: outside up and over, inside back
const band = [...both(outerHalf), ...both(innerHalf).reverse()];
// a profile in (x, z) stood up and stretched along y from y0
const along = (pts, h, y0) => translate([0, y0 + h, 0], rotate([90, 0, 0], linearExtrude({ h }, polygon(pts))));
const parts = [along(band, length, 0)];
const cuts = [];
const solidEnd = both(outerHalf);
const doorway = () => both(half(Bi * door, Math.max(Hi * door, Bi * door * tanR + 1))).map(([x, z]) => [x, z - 1]);
if (ends !== "open") {
  parts.push(along(solidEnd, wall + 0.01, 0), along(solidEnd, wall + 0.01, length - wall - 0.01));
  cuts.push(along(doorway(), wall + 2, -1));
  if (ends === "doors") cuts.push(along(doorway(), wall + 2, length - wall - 1));
}
if (windows > 0) {
  // tall diamonds through both sides, low on the walls
  const y0 = wall + 4, span = length - 2 * y0;
  const a = Math.min(span / windows * 0.22, Hi * 0.1, 10);
  const b = a * 1.4, zw = Math.min(Hi * 0.35, Hi * 0.65 - b);
  if (a > 1.5 && zw > b + 2) for (let k = 0; k < windows; k++) {
    const y = y0 + span * (k + 0.5) / windows;
    cuts.push(translate([-B - 1, 0, 0], rotate([0, 0, 90], rotate([90, 0, 0],
      linearExtrude({ h: width + 2 }, polygon([[y - a, zw], [y, zw - b], [y + a, zw], [y, zw + b]]))))));
  }
}
const hide = cuts.length ? difference(union(...parts), ...cuts) : union(...parts);
return translate([0, -length / 2, 0], hide);
`,
};
