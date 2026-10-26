const part = importedSolid("input.step");
const holeX = 57.69, holeZ = 10, fillR = 2.8;
const y0 = -85, y1 = -55;
const plug = (z) => translate([holeX, y0, z],
  rotate([-90, 0, 0], cylinder({ r: fillR, h: y1 - y0, $fn: 48 })));
return union(part, plug(holeZ), plug(-holeZ));