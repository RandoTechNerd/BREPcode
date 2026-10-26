const yc = 0.59, zc = -5.5;
const boreR = 14.25, fillR = 15.7;
const part = importedSolid("input.step");

// solid plug filling the groove (and the bore locally)
const plug = translate([4.9, yc, zc], rotate([0, 90, 0], cylinder({ r: fillR, h: 5.2, $fn: 128 })));
// re-cut the bore at its nominal diameter over the plugged span
const bore = translate([3, yc, zc], rotate([0, 90, 0], cylinder({ r: boreR, h: 9, $fn: 128 })));
// restore the vertical Ø3.35 hole where it breaks into the bore
const vHole = translate([8.68, 8.75, 4], cylinder({ d: 3.35, h: 6, $fn: 32 }));

return difference(difference(union(part, plug), bore), vHole);