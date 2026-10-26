const part = importedSolid("input.step");

const zBot = -45.17;      // current bottom face of the block (30 mm tall, top at -15.17)
const add = 10;           // 30 -> 40 mm
const overlap = 0.3;      // run into the block's material, never flush

// rotated-square footprint of the block (corners from its bottom-face extent)
const foot = polygon([
  [99.11, -104.27],
  [200.42, -73.97],
  [170.12, 27.39],
  [68.81, -2.91],
]);

const ext = translate([0, 0, zBot - add],
  linearExtrude({ h: add + overlap }, foot));

return union(part, ext);