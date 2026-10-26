const part = importedSolid("input.step");
const dz = 1;                       // lower the hex boss by 1 mm
const zCut = 29.4;                  // inside the plain hex-prism band (29.19..30.71)
const region = translate([-8, -78, zCut], cube([16, 17, 33 - zCut]));
const top = intersection(part, region);
const base = difference(part, translate([-8, -78, zCut], cube([16, 17, 34 - zCut])));
return union(base, translate([0, 0, -dz], top));