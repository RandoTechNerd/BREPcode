const part = importedSolid("input.step");
const cx = 0.1, cy = 4.58;          // flange / bolt-circle centre
const zBot = 25.68, zTop = 40.68;   // flange faces
const zMid = (zBot + zTop) / 2;     // 33.18, mirror plane
const rOut = 140;                   // well outside the flange outline
const rIn = 113.5;                  // inside the lugs, outside every feature above/below the flange
const z0 = 37.5, z1 = 42;           // band holding the top outer edge

// the part flipped about the flange mid-plane: its filleted underside edge now sits on top
const flipped = translate([0, 0, 2 * zMid], mirror([0, 0, 1], part));

const ring = (ri, za, zb) => translate([cx, cy, za], difference(
  cylinder({ r: rOut, h: zb - za, $fn: 128 }),
  translate([0, 0, -1], cylinder({ r: ri, h: zb - za + 2, $fn: 128 })),
));

const keep = difference(part, ring(rIn, z0, z1));
const newEdge = intersection(flipped, ring(rIn - 0.2, z0 - 0.2, z1));   // overlaps 0.2 mm into the kept material

return union(keep, newEdge);