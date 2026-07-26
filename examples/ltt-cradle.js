// LTT Screwdriver cradle — a rounded TPU snap-fit holder that nests the
// handle's coke-bottle waist.
//
//   node src/cli.js examples/ltt-cradle.js -o cradle.stl
//   node src/cli.js examples/ltt-cradle.js -D waistD=30 -D bulgeD=34   // after measuring
//   node src/cli.js examples/ltt-cradle.js -D flatEnd=1 -o cradle.stl  // print standing on end
//
// Printing rotated (standing on one end, handle axis vertical) is actually the
// STRONGER orientation for TPU: the flexing arms become continuous perimeter
// loops instead of stacked layer boundaries, so the snap can't delaminate.
// flatEnd=1 skips the rounding on the -Y end to give it a flat face to stand on.
//
// Verified dimensions (bigl.es review / lttstore): overall 213 x 35 mm, shaft 82.2 mm.
// The handle is three-lobed, so its "diameter" depends on where you measure —
// waistD and bulgeD below are ESTIMATES. Measure your driver with calipers at
// the narrowest point of the grip and at the swell, then pass -D overrides.
// Print in TPU: the arms flex open over the waist and the lips click home.
//
// Rounding without a fillet feature:
//  * the gripping lips are round cylinders unioned onto the arm ends — the
//    bump that makes the "pop" IS the rounding;
//  * the holder's ends are rounded by intersecting the body with a capsule;
//  * the cavity is a lathe approximation of the handle (stacked discs), narrow
//    at the waist and flared at both ends, so the curvy grip nests axially.

import {
  polygon, linearExtrude, cube, cylinder, sphere,
  union, difference, intersection, translate, rotate,
} from "brepscript";

export default (params = {}) => {
  // ---- tune these two after measuring your screwdriver -----------------
  const waistD = params.waistD ?? 31.0;  // ESTIMATE: narrowest grip diameter
  const bulgeD = params.bulgeD ?? 34.5;  // ESTIMATE: widest swell (35 max verified)

  // ---- holder parameters ----------------------------------------------
  const L = params.length ?? 42;         // holder length along the handle
  const wall = params.wall ?? 3.4;       // TPU arm thickness
  const snapDepth = params.snap ?? 2.4;  // lip overhang past the waist (the "pop")
  const clearance = params.clearance ?? 0.3;
  const backT = params.backT ?? 5.4;     // backplate: magnet depth + 2mm TPU
  const magnetD = params.magnetD ?? 10.2;
  const magnetT = params.magnetT ?? 3.2;
  const FN = params.$fn ?? 64;

  const gripD = waistD + clearance;
  const Rin = gripD / 2;
  const Rout = Rin + wall;
  const lipR = wall / 2;
  const Rmid = (Rin + Rout) / 2;
  const hc = backT + Rout;               // handle centre height above the wall

  const opening = gripD - 2 * snapDepth; // narrowest gap between the lips
  const lipX = opening / 2 + lipR;       // lip cylinder centres, +-x
  const lipY = hc + Math.sqrt(Math.max(Rmid * Rmid - lipX * lipX, 1));

  // extrude a profile drawn in the XZ sense: profile XY -> stand up so the
  // extrusion runs along Y and the profile's +y becomes world +Z.
  const alongY = (h, profile) =>
    translate([0, h / 2, 0], rotate([90, 0, 0], linearExtrude({ h }, profile)));
  const yCyl = (r, h, fn = FN) =>
    translate([0, -h / 2, 0], rotate([-90, 0, 0], cylinder({ r, h, $fn: fn })));

  // ---- body: outer barrel + backplate, opening cut, round lips added ----
  const outer = translate([0, 0, hc], yCyl(Rout, L));
  const plate = translate([-Rout, -L / 2, 0], cube([2 * Rout, L, backT + wall]));

  // V-flared entry: gap `opening + 2*lipR` at the lips (the lips win it back),
  // widening upward for an easy push-in.
  const wedge = alongY(L + 2, polygon([
    [-lipX, lipY],
    [lipX, lipY],
    [Rout + 2, hc + Rout + 4],
    [-(Rout + 2), hc + Rout + 4],
  ]));

  const lip = (sx) => translate([sx * lipX, 0, lipY], yCyl(lipR, L, 32));

  const opened = union(
    difference(union(outer, plate), wedge),
    lip(1),
    lip(-1),
  );

  // ---- rounded ends and softened edges: intersect with a capsule --------
  // Sized so the arms and lips sit fully inside, the backplate's long bottom
  // edges get a gentle roll, and the four end corners get a real ~2-3mm round.
  const capC = 18;                                     // capsule axis height
  const capR = 24;
  const capIn = 7;                                     // sphere centres pulled in per end
  const flatEnd = !!params.flatEnd;                    // flat -Y face to stand on when printing rotated
  const cylLen = flatEnd ? (L / 2 - capIn) + L / 2 + 1 : L - 2 * capIn;
  const cylMid = flatEnd ? (L / 2 - capIn - (L / 2 + 1)) / 2 : 0;
  const capsule = union(
    translate([0, cylMid, capC], yCyl(capR, cylLen, FN)),
    ...(flatEnd ? [] : [translate([0, -(L / 2 - capIn), capC], sphere({ r: capR, $fn: FN }))]),
    translate([0, L / 2 - capIn, capC], sphere({ r: capR, $fn: FN })),
  );

  const body = intersection(opened, capsule);

  // ---- the cradle: lathe-approximated handle, waist centred -------------
  // narrow in the middle, flaring toward the ends on a cosine — the curvy
  // grip nests here and the flare lets it click past the lips.
  const slices = [];
  const nSlices = 11;
  const span = L + 2;
  for (let i = 0; i < nSlices; i++) {
    // yCyl() is centred, so place each slice by its centre, not its start —
    // getting this wrong shifts the lathe and leaves one end of the cavity blind.
    const yMid = -span / 2 + (span / nSlices) * (i + 0.5);
    const t = Math.abs(yMid) / (span / 2);
    const d = gripD + (bulgeD + clearance - gripD) * (1 - Math.cos(Math.PI * Math.min(t, 1))) / 2;
    slices.push(translate([0, yMid, hc], yCyl(d / 2, span / nSlices + 0.02, FN)));
  }

  // ---- magnet pockets ---------------------------------------------------
  const magnet = (y) => translate([0, y, -1],
    cylinder({ r: magnetD / 2, h: magnetT + 1, $fn: 48 }));

  return difference(
    body,
    union(slices),
    magnet(L / 4),
    magnet(-L / 4),
  );
};
