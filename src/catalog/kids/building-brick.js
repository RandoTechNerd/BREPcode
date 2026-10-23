// Building bricks on the common stud system: studs 4.8 mm across on an
// 8 mm pitch, a brick three 3.2 mm plates tall, hollow underneath with tubes
// between the studs (pins on a one-wide brick) so they clutch any brick of
// the same system. The cavity's ceiling is a short bridge, the only one.
// Stud and tube sizes are dials because every printer's holes come out a
// little different: nudge them until the clutch feels right.

export default {
  id: "building-brick",
  category: "kids",
  title: "Building brick",
  summary: "a stud-compatible building brick, plate or tile of any size (8 mm stud pitch).",
  print: "upright as shown; the inside ceiling bridges, no supports. Small bricks are small parts: ages 3 and up.",
  names: ["building brick", "building bricks", "toy brick", "stud brick", "interlocking brick", "compatible brick",
    "construction brick", "building block", "building blocks", "brick compatible block", "studded brick"],
  nouns: ["brick", "bricks", "block", "plate", "tile"],
  keywords: ["building", "studs", "stud", "interlocking", "construction", "toy", "kids", "compatible"],
  bridgeArea: (v) => v.bottom === "solid" ? 0 : Math.max(0, (v.studsX * 8 - 2 * v.fit - 2 * v.wall) * (v.studsY * 8 - 2 * v.fit - 2 * v.wall)),
  tips: ["2 x 2", "a 2x4 plate", "no studs (a tile)"],
  examples: ["I want a building brick", "make me a 2x4 building brick", "a toy brick 6 studs long",
    "stud compatible brick plate 4 x 4"],
  params: {
    studsX: { default: 4, min: 1, max: 16, unit: "count", label: "studs long", say: ["stud", "long"] },
    studsY: { default: 2, min: 1, max: 16, unit: "count", label: "studs wide", say: ["wide"] },
    plates: { default: 3, min: 1, max: 6, unit: "count", label: "height in plates (3 = a brick)", say: ["plate", "high", "tall"] },
    studs: { default: "yes", unit: "choice", choices: ["yes", "no"], label: "studs on top (no = a tile)",
      words: { no: ["tile", "no studs", "smooth top", "without studs"], yes: ["studs"] } },
    bottom: { default: "hollow", unit: "choice", choices: ["hollow", "solid"], label: "hollow with tubes, or solid (a base plate)",
      words: { solid: ["solid", "base plate", "baseplate", "flat bottom"], hollow: ["hollow"] } },
    studD: { default: 4.8, min: 4.5, max: 5.1, unit: "mm", label: "stud diameter (nudge for clutch)", say: ["stud"] },
    tubeD: { default: 6.51, min: 6.2, max: 6.8, unit: "mm", label: "underside tube diameter", say: ["tube"] },
    wall: { default: 1.2, min: 1, max: 2, unit: "mm", label: "wall thickness", say: ["wall"] },
    fit: { default: 0.1, min: 0, max: 0.3, unit: "mm", label: "outside trim per side", say: ["fit", "tolerance", "clearance"] },
  },
  triple: ["studsX", "studsY", "plates"],
  things: [
    { names: ["2x4 brick", "2 by 4 brick", "two by four brick"], title: "2 x 4 brick", params: { studsX: 4, studsY: 2 } },
    { names: ["2x2 brick", "2 by 2 brick"], title: "2 x 2 brick", params: { studsX: 2, studsY: 2 } },
    { names: ["1x2 brick", "1 by 2 brick"], title: "1 x 2 brick", params: { studsX: 2, studsY: 1 } },
    { names: ["1x4 brick", "1 by 4 brick"], title: "1 x 4 brick", params: { studsX: 4, studsY: 1 } },
    { names: ["1x1 brick", "1 by 1 brick", "single stud brick"], title: "1 x 1 brick", params: { studsX: 1, studsY: 1 } },
    { names: ["2x6 brick", "2 by 6 brick"], title: "2 x 6 brick", params: { studsX: 6, studsY: 2 } },
    { names: ["1x6 brick", "1x8 brick", "long thin brick"], title: "1 x 8 brick", params: { studsX: 8, studsY: 1 } },
    { names: ["2x8 brick", "2 by 8 brick"], title: "2 x 8 brick", params: { studsX: 8, studsY: 2 } },
    { names: ["2x4 plate", "thin brick plate", "flat brick plate"], title: "2 x 4 plate", params: { studsX: 4, studsY: 2, plates: 1 } },
    { names: ["4x4 plate", "square brick plate"], title: "4 x 4 plate", params: { studsX: 4, studsY: 4, plates: 1 } },
    { names: ["2x2 tile", "smooth tile", "flat tile brick"], title: "2 x 2 tile", params: { studsX: 2, studsY: 2, plates: 1, studs: "no" } },
    { names: ["brick baseplate", "small baseplate", "building base plate", "8x8 baseplate"], title: "8 x 8 base plate", params: { studsX: 8, studsY: 8, plates: 1, bottom: "solid" } },
    { names: ["large building brick", "tall brick", "double height brick"], title: "Double-height brick", params: { studsX: 4, studsY: 2, plates: 6 } },
    { names: ["long building plate", "2x12 plate"], title: "2 x 12 plate", params: { studsX: 12, studsY: 2, plates: 1 } },
  ],
  body: `
// the system's fixed sizes are the helper's defaults: an 8 mm pitch, 3.2 mm plates, a 1 mm top, 1.8 mm studs
// many small parts that never touch are cheap to join to each other, and then to the brick in one go
const join = (list) => (list.length > 1 ? union(...list) : list[0]);
const brick = (P = 8, plateH = 3.2, top = 1, studH = 1.8) => {
  const W = studsX * P - 2 * fit, D = studsY * P - 2 * fit, H = plates * plateH;
  const ceiling = H - top;
  const parts = [bottom === "solid" ? cube([W, D, H]) : difference(cube([W, D, H]), translate([wall, wall, -1], cube([W - 2 * wall, D - 2 * wall, ceiling + 1])))];
  const under = [];
  if (bottom !== "solid" && studsX > 1 && studsY > 1) {
    // tubes where four studs meet, from the floor up into the ceiling
    for (let i = 1; i < studsX; i++) for (let j = 1; j < studsY; j++)
      under.push(translate([i * P - fit, j * P - fit, 0], difference(cylinder({ r: tubeD / 2, h: ceiling + 0.5, $fn: 24 }), translate([0, 0, -1], cylinder({ r: studD / 2, h: ceiling + 1, $fn: 24 })))));
  } else if (bottom !== "solid" && (studsX > 1 || studsY > 1)) {
    // a one-wide brick has thin pins between its studs instead
    for (let i = 1; i < Math.max(studsX, studsY); i++)
      under.push(translate(studsX > 1 ? [i * P - fit, D / 2, 0] : [W / 2, i * P - fit, 0], cylinder({ r: 1.6, h: ceiling + 0.5, $fn: 16 })));
  }
  if (under.length) parts.push(join(under));
  if (studs === "yes") {
    const tops = [];
    for (let i = 0; i < studsX; i++) for (let j = 0; j < studsY; j++)
      tops.push(translate([P / 2 - fit + i * P, P / 2 - fit + j * P, H - 0.5], cylinder({ r: studD / 2, h: studH + 0.5, $fn: 24 })));
    parts.push(join(tops));
  }
  return translate([-W / 2, -D / 2, 0], join(parts));
};
return brick();
`,
};
