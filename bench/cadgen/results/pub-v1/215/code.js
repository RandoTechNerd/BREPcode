const axisX = -4.23, axisZ = 0;
const discR = 27.71 / 2;
const newFront = -33.02;   // was -32.02: disc now 2 mm thick (to -31.02)
const overlap = 0.5;
const len = 1 + overlap;

// cylinder stands along +Z; rotate -90 about X turns +Z into +Y
const extension = translate([axisX, newFront, axisZ],
  rotate([-90, 0, 0], cylinder({ r: discR, h: len, $fn: 96 })));

return union(importedSolid("input.step"), extension);