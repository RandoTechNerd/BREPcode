// A wall rack of angled pegs for sports gear: a row of thin pegs hangs
// race medals and belts, two chunky pegs with a gap between them hold a
// racket or paddle by its handle, one long peg takes a skateboard under
// its truck. It prints lying on its back: every peg is a fin standing up
// off the plate, leaning at its angle (no steeper than 50 degrees from the
// plate, so nothing hangs), which on the wall tilts it up to keep things on.

export default {
  id: "sports-wall-rack",
  category: "fitness",
  title: "Sports wall rack",
  summary: "a wall plate with angled pegs: medals and belts on a row of pegs, rackets and paddles in a two-peg fork.",
  print: "lying on its back as shown, no supports. Countersunk screws through the plate; into a stud for anything heavy.",
  names: ["sports wall rack", "sports gear wall mount", "sports equipment rack", "gear wall mount", "sports gear rack",
    "sports equipment wall mount", "wall peg rack for sports"],
  nouns: ["rack", "hanger", "holder", "mount", "display", "hook"],
  keywords: ["wall", "medal", "medals", "racket", "racquet", "paddle", "skateboard", "belt", "sports"],
  fits: ["grip"],
  fromSpec: (s) => ({ pegs: 2, gap: s.dims.d + 6, pegL: 55, pegT: 12, pegW: 16 }),
  tips: ["10 pegs", "for a tennis racket", "longer pegs"],
  examples: ["I want a sports wall rack", "make me a medal hanger with 10 pegs", "a wall mount for my tennis racket",
    "pickleball paddle holder for the wall"],
  params: {
    pegs: { default: 6, min: 1, max: 15, unit: "count", label: "how many pegs", say: ["peg", "hook", "medal"] },
    gap: { default: 28, min: 10, max: 80, unit: "mm", label: "gap between pegs", say: ["gap", "between", "spacing", "apart"] },
    pegL: { default: 35, min: 15, max: 80, unit: "mm", label: "peg length", say: ["long", "length", "deep"], more: ["longer", "deeper"], less: ["shorter"] },
    tilt: { default: 60, min: 50, max: 90, unit: "deg", label: "peg angle from the wall (90 = straight out)", say: ["angle", "tilt", "degree"] },
    pegT: { default: 8, min: 5, max: 16, unit: "mm", label: "peg thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"] },
    pegW: { default: 10, min: 6, max: 24, unit: "mm", label: "peg depth at the plate", say: ["peg"] },
    plateH: { default: 45, min: 30, max: 120, unit: "mm", label: "plate height", say: ["plate", "tall", "high"] },
    plateT: { default: 5, min: 3, max: 10, unit: "mm", label: "plate thickness", say: ["plate"] },
  },
  things: [
    { names: ["medal hanger", "race medal hanger", "medal holder", "medal rack", "medal display hanger"], title: "Medal hanger", keywords: ["medal", "medals", "race"] },
    { names: ["running medal display", "marathon medal hanger", "race bib and medal hanger", "running medal hanger"], title: "Running medal hanger", params: { pegs: 10, gap: 26, pegL: 40 } },
    { names: ["martial arts belt display", "karate belt rack", "belt display rack", "taekwondo belt holder"], title: "Belt display rack", params: { pegs: 8, gap: 22, pegL: 45, tilt: 55 } },
    { names: ["ribbon display hanger", "award ribbon hanger", "horse show ribbon hanger"], title: "Ribbon hanger", params: { pegs: 8, gap: 30, pegL: 30 } },
    { names: ["tennis racket holder", "tennis racket wall mount", "racket holder", "racquet holder", "racket wall mount"], title: "Tennis racket holder", spec: "tennis-racket" },
    { names: ["pickleball paddle holder", "pickleball paddle wall mount", "paddle holder"], title: "Pickleball paddle holder", spec: "pickleball-paddle" },
    { names: ["table tennis paddle holder", "table tennis bat holder"], title: "Table tennis paddle holder", spec: "table-tennis-paddle", params: { pegL: 45 } },
    { names: ["badminton racket holder", "badminton racket wall mount"], title: "Badminton racket holder", spec: "badminton-racket", params: { pegL: 45, pegT: 10 } },
    { names: ["squash racket holder", "squash racquet holder"], title: "Squash racket holder", spec: "squash-racket" },
    { names: ["lacrosse stick holder", "lacrosse stick wall mount"], title: "Lacrosse stick holder", spec: "lacrosse-stick", params: { pegL: 60, pegT: 14 } },
    { names: ["skateboard wall mount", "skateboard hanger", "skateboard wall hook", "skateboard display hook"], title: "Skateboard hook",
      params: { pegs: 1, pegL: 55, pegT: 14, pegW: 18, plateH: 60, tilt: 70 } },
    { names: ["longboard wall mount", "longboard hanger"], title: "Longboard hook", params: { pegs: 1, pegL: 65, pegT: 16, pegW: 20, plateH: 65, tilt: 70 } },
    { names: ["snowboard wall mount", "snowboard hanger"], title: "Snowboard hook", params: { pegs: 1, pegL: 70, pegT: 16, pegW: 22, plateH: 70, tilt: 65 } },
    { names: ["boxing glove hanger", "boxing gloves hook"], title: "Boxing glove hanger", params: { pegs: 2, gap: 60, pegL: 60, pegT: 14, pegW: 18, plateH: 60 } },
  ],
  body: `
const pitch = gap + pegT;
const len = (pegs - 1) * pitch + pegT + 36;               // plate length along the wall, room for a screw at each end
const H = Math.max(plateH, pegW + 30);
const r = Math.min(6, H / 4);
// the plate: a rounded rectangle lying flat (x along the wall, y up the wall)
const arc = (cx, cy, a0, n = 6) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + Math.PI / 2 * i / n;
  return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
});
const outline = [...arc(len / 2 - r, r, -Math.PI / 2), ...arc(len / 2 - r, H - r, 0), ...arc(-len / 2 + r, H - r, Math.PI / 2), ...arc(-len / 2 + r, r, Math.PI)];
// screws near the top, countersunk on the face
const sx = len / 2 - 8, sy = H - 10;                      // 10 mm clear of the end pegs
const screwCut = (x) => [translate([x, sy, -1], cylinder({ r: 2.3, h: plateT + 2, $fn: 16 })), translate([x, sy, plateT - 2.3], cylinder({ r1: 2.3, r2: 4.7, h: 2.31, $fn: 16 }))];
const holes = [...screwCut(-sx), ...screwCut(sx)];
const plate = difference(linearExtrude({ h: plateT }, polygon(outline)), ...holes);
// a peg: a parallelogram fin in the y-z plane, leaning up the wall at its angle, pegT thick along x
const a = tilt * Math.PI / 180;
const y0 = plateT + 3;                                    // the pegs start just above the bottom edge
const fin = polygon([[y0, plateT - 0.5], [y0 + pegW, plateT - 0.5], [y0 + pegW + pegL * Math.cos(a), plateT + pegL * Math.sin(a)], [y0 + pegL * Math.cos(a), plateT + pegL * Math.sin(a)]]);
const peg = rotate([90, 90, 0], linearExtrude({ h: pegT }, fin));
const all = Array.from({ length: pegs }, (_, i) => translate([-((pegs - 1) * pitch + pegT) / 2 + i * pitch, 0, 0], peg));
return union(plate, ...all);
`,
};
