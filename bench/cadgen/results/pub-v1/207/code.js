const part = importedSolid("input.step");
const zEnd = -0.5;          // inner roof z = 29.5, minus 30 mm boss length
const zBot = -33.5;         // overshoot past the open bottom at z = -32.5
const rCut = 9;             // boss r = 8, nearest wall at 12 from axis
const bosses = [
  [18.31, -7.67],
  [-19.54, -26.18],
  [57.71, -26.18],
];
let out = part;
for (const [x, y] of bosses) {
  out = difference(out,
    translate([x, y, zBot], cylinder({ r: rCut, h: zEnd - zBot, $fn: 64 })));
}
return out;