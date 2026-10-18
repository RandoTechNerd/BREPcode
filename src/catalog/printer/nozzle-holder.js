// A block of threaded-nozzle seats: each hole is a little under the M6
// thread, so a nozzle screws in and stays put. Rows can step up toward the
// back so the sizes stamped on the hex are all in view; each step is a plain
// vertical face.

export default {
  id: "nozzle-holder",
  category: "printer",
  title: "Nozzle holder",
  summary: "a block that spare 3D printer nozzles screw into, in rows that can step up so every one is in view.",
  print: "upright as shown, no supports.",
  names: ["nozzle holder", "nozzle storage", "nozzle organizer", "nozzle stand", "nozzle box", "nozzle rack",
    "nozzle block", "spare nozzle holder", "printer nozzle holder", "nozzle caddy"],
  nouns: ["holder", "organizer", "rack", "stand"],
  keywords: ["nozzle", "nozzles", "hotend", "printer", "m6", "brass"],
  tips: ["8 across", "3 rows", "stepped"],
  examples: ["make me a nozzle holder", "nozzle holder with 3 rows of 8",
    "a stepped nozzle organizer", "nozzle storage for volcano nozzles"],
  params: {
    threadD: { default: 5.6, min: 3, max: 10, unit: "mm", label: "hole for the thread (M6 nozzles: 5.6)", say: ["thread", "hole"] },
    holeDepth: { default: 7, min: 3, max: 15, unit: "mm", label: "hole depth", say: ["deep", "depth"] },
    pitch: { default: 12, min: 8, max: 30, unit: "mm", label: "spacing between nozzles", say: ["spacing", "pitch", "apart"] },
    cols: { default: 6, min: 1, max: 12, unit: "count", label: "nozzles per row", say: ["across", "nozzle", "column", "hole"] },
    rows: { default: 2, min: 1, max: 8, unit: "count", label: "rows", say: ["row", "rows"] },
    blockH: { default: 10, min: 5, max: 25, unit: "mm", label: "front row height", say: ["tall", "high", "height"] },
    arrange: { default: "flat", unit: "choice", choices: ["flat", "stepped"], label: "rows level or stepped",
      words: { stepped: ["stepped", "steps", "tiered", "stadium", "angled"], flat: ["flat", "level"] } },
  },
  things: [
    { names: ["e3d v6 nozzle holder", "v6 nozzle holder", "mk8 nozzle holder", "m6 nozzle holder"], title: "V6 nozzle holder", params: { threadD: 5.6 } },
    { names: ["volcano nozzle holder", "long nozzle holder"], title: "Volcano nozzle holder", params: { holeDepth: 12, blockH: 15 } },
    { names: ["mk10 nozzle holder", "m7 nozzle holder"], title: "MK10 nozzle holder", params: { threadD: 6.6 } },
    { names: ["stepped nozzle holder", "tiered nozzle holder", "nozzle display stand"], title: "Stepped nozzle holder", params: { arrange: "stepped", rows: 3, cols: 8 } },
    { names: ["big nozzle holder", "nozzle collection holder", "large nozzle organizer"], title: "Big nozzle holder", params: { rows: 4, cols: 10, arrange: "stepped" } },
  ],
  body: `
const H = Math.max(blockH, holeDepth + 2);           // the hole never breaks through the floor
const rise = arrange === "stepped" ? Math.max(3, pitch * 0.5) : 0;
const W = cols * pitch, D = pitch;
const rowBlocks = Array.from({ length: rows }, (_, j) =>
  translate([-W / 2, -rows * D / 2 + j * D, 0], cube([W, D + (j < rows - 1 ? 0.01 : 0), H + j * rise])));
const holes = [];
for (let j = 0; j < rows; j++) {
  for (let i = 0; i < cols; i++) {
    holes.push(translate([-W / 2 + (i + 0.5) * pitch, -rows * D / 2 + (j + 0.5) * D, H + j * rise - holeDepth],
      cylinder({ d: threadD, h: holeDepth + 1, $fn: 24 })));
  }
}
return difference(rows > 1 ? union(...rowBlocks) : rowBlocks[0], ...holes);
`,
};
