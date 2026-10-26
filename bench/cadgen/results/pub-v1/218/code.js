const cx = 70, cy = 0;
const bossR = 95;          // Ø190 boss outer wall
const floorZ = -10;        // recess floor the boss stands on
const bossBot = -15;       // boss bottom face
const part = importedSolid("input.step");

// remove the outer band of the boss together with its fillet
const cut = translate([cx, cy, bossBot - 1], difference(
  cylinder({ r: bossR + 3, h: floorZ - (bossBot - 1), $fn: 128 }),
  translate([0, 0, -1], cylinder({ r: bossR - 5, h: 20, $fn: 128 })),
));

// rebuild the band with a straight wall, sharp at the floor
const band = translate([cx, cy, bossBot], difference(
  cylinder({ r: bossR, h: (floorZ + 0.5) - bossBot, $fn: 128 }),
  translate([0, 0, -1], cylinder({ r: bossR - 5.5, h: 20, $fn: 128 })),
));

return union(difference(part, cut), band);