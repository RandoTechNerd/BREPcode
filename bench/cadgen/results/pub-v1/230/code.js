const part = importedSolid("input.step");
const rNew = 30, rOut = 40, gap = 0.02;
const ring = (x0, x1, y, z) => {
  const L = x1 - x0 - 2 * gap;
  const along = (r, h) => translate([x0 + gap, y, z], rotate([0, 90, 0], cylinder({ r, h, $fn: 96 })));
  return difference(
    along(rOut, L),
    translate([-1, 0, 0], along(rNew, L + 2)),
  );
};
let s = part;
s = difference(s, ring(118.73, 173.35, -54.87, 42.15));
s = difference(s, ring(-27.39, 27.23, 54.87, 42.15));
s = difference(s, ring(-173.51, -118.89, 0, -52.9));
return s;