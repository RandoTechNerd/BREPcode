const part = importedSolid("input.step");
const bosses = [
  { x: -15.76, y: -28.5, R: 56.87 / 2, r: 42.87 / 2 },
  { x: -72.49, y: 0,     R: 65.07 / 2, r: 51 / 2 },
];
const FR = 3;          // top / ceiling rounding
const TOP = 24;        // was 29
const CEIL = 17;       // was 22
const BASE = 15.5;     // overlaps plate top (z = 16)

let out = part;
for (const b of bosses) {
  out = difference(out,
    translate([b.x, b.y, 17], cylinder({ r: b.R + 1, h: 14, $fn: 128 })));
}
for (const b of bosses) {
  const outer = fillet({ r: FR, edges: "top" },
    translate([b.x, b.y, BASE], cylinder({ r: b.R, h: TOP - BASE, $fn: 128 })));
  const cutter = fillet({ r: FR, edges: "top" },
    translate([b.x, b.y, 8], cylinder({ r: b.r, h: CEIL - 8, $fn: 128 })));
  out = union(out, difference(outer, cutter));
}
return out;