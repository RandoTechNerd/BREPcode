const part = importedSolid("input.step");

// old pocket wall (faces -X) and the 6 mm move inward
const wallX = 166.24, move = 6, into = 0.5;
const x0 = wallX - move;            // new wall position 160.24
const yMin = -67.64 - 3, yMax = 45.81 + 3;   // both pockets + the rib between them
const zBot = -44.18, zTop = 9.96 + 0.3;      // bottom face up into the ceiling

const fill = translate([x0, yMin, zBot],
  cube([wallX + into - x0, yMax - yMin, zTop - zBot]));

return union(part, fill);