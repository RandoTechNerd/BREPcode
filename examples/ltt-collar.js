// LTT Screwdriver collar — printable "balloony" wall-mount version.
//
// A short C-clip band that snaps onto the handle waist. This version is
// arranged for easy FDM printing and screw mounting instead of magnets:
//   * FLAT BOTTOM  — sits on the bed, no supports, clean first layer;
//   * BALLOONY body — convex barrel sides + a rounded-over top, and the bore's
//     inward mid-band "squeeze" is gone, so there are no inward curves;
//   * DRILL HOLES FROM THE INSIDE — two countersunk screw holes are driven from
//     inside the bore, out through the flat back, so you mount it to a wall or
//     pegboard and the screw heads sit recessed inside the ring.
//
//   node src/cli.js examples/ltt-collar.js -o collar.stl
//   node src/cli.js examples/ltt-collar.js -D waistD=30.2 -D screwD=4.2
//
// waistD is an ESTIMATE (LTT handle is three-lobed; 213 x 35 mm overall, 82.2 mm
// shaft are the verified numbers). Measure the narrowest part of the grip and
// override. Print UPRIGHT (axis vertical) in TPU: flat bottom on the bed,
// C-opening to the front — perimeters wrap the flex arms for a strong snap. The
// two side holes print horizontally; clean them with a drill to final size.

import {
  polygon, linearExtrude, cylinder, torus,
  union, difference, intersection, translate, rotate,
} from "brepscript";

export default (params = {}) => {
  // ---- calibrate to your screwdriver -----------------------------------
  const waistD = params.waistD ?? 31.0;   // ESTIMATE — measure and override
  const clearance = params.clearance ?? 0.3;
  const snap = params.snap ?? 2.2;        // lip overhang per side (pop strength)

  // ---- collar proportions ----------------------------------------------
  const H = params.height ?? 17;          // band height — the "finger collar"
  const wall = params.wall ?? 4.5;        // thick wall => room for a full outward curve
  const backX = params.backX ?? 22;       // flat mounting back sits at x = -backX
  const off = 2.5;                        // outer barrel centre, shifted back
  const lipR = params.lipR ?? 2.0;
  const rr = params.round ?? 5.5;         // TOP rim roll radius — bigger = balloonier
  const cornerR = 3.0;                    // fillet where flat back meets barrel
  const FN = params.$fn ?? 96;

  // ---- screw mount: driven from inside the bore, out through the back ---
  const screwD = params.screwD ?? 4.0;    // shank clearance dia (M4 / #8)
  const headD  = params.headD  ?? 7.0;    // recessed head counterbore dia
  const screwY = params.screwY ?? 5.0;    // hole spacing above/below centre

  const gripD = waistD + clearance;
  const Rin = gripD / 2;
  const Rout = Rin + wall + off + 0.35;   // thin flexible front arms, meaty back

  // ---- outer outline: barrel + flat back, blended with tangent fillets --
  const filletCy = Math.sqrt((Rout - cornerR) ** 2 - (backX - off - cornerR) ** 2);
  const filletC = [-(backX - cornerR), filletCy];         // upper fillet centre
  // tangent point on the barrel lies along centre -> fillet centre
  const tAng = Math.atan2(filletCy, filletC[0] + off);

  const pts = [];
  const arc = (cx, cy, r, a0, a1, n) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  pts.push([-backX, -filletCy]);                          // up the flat back
  pts.push([-backX, filletCy]);
  // upper fillet: from the flat (pointing -x) to the barrel tangent
  arc(filletC[0], filletC[1], cornerR, Math.PI, tAng, 10);
  // the barrel, the long way around the front
  arc(-off, 0, Rout, tAng, -tAng, FN);
  // lower fillet back to the flat — sweep to -PI, NOT +PI (see history note):
  // going to +PI runs the arc the wrong way through the front, self-intersecting.
  arc(filletC[0], -filletC[1], cornerR, -tAng, -Math.PI, 10);

  const outline = translate([0, 0, -H / 2], linearExtrude({ h: H }, polygon(pts)));

  // ---- the C opening: wedge cut + round lips + tangent entry flares -----
  const opening = gripD - 2 * snap;
  const RmidB = Rin + lipR;                                // lips ride this circle
  const g = opening / 2 + lipR;
  const lipX = Math.sqrt(Math.max(RmidB * RmidB - g * g, 1));

  const wedge = translate([0, 0, -(H + 2) / 2], linearExtrude({ h: H + 2 }, polygon([
    [lipX, g],
    [Rout + 4, g + 10],
    [Rout + 4, -(g + 10)],
    [lipX, -g],
  ])));

  const lip = (sy) => translate([lipX, sy * g, -H / 2 - 0.5],
    cylinder({ r: lipR, h: H + 1, $fn: 40 }));

  // Entry flares: big vertical cylinders externally TANGENT to each lip post,
  // so the funnel wall blends smoothly (G1) into the lip instead of meeting it
  // as a flat V-wall crease.
  const flareR = 8;
  const u = Math.SQRT1_2;                                  // 45 deg, front-outward
  const flare = (sy) => translate(
    [lipX + (lipR + flareR) * u, sy * (g + (lipR + flareR) * u), -(H + 2) / 2],
    cylinder({ r: flareR, h: H + 2, $fn: 64 }));

  const opened = union(
    difference(outline, wedge, flare(1), flare(-1)),
    lip(1), lip(-1),
  );

  // ---- balloony envelope: straight sides, FLAT bottom, rounded top ------
  // Full-radius cylinder from the bed up to H/2-rr (crisp flat bottom + straight
  // barrel sides), an inset core that defines the domed top, and ONE top rim
  // roll. No bottom roll, so the print sits flat with no supports; the top rolls
  // over convex for the balloon look. Nothing curves inward.
  const envelope = union(
    translate([-off, 0, -H / 2], cylinder({ r: Rout, h: H - rr, $fn: FN })),
    translate([-off, 0, -H / 2], cylinder({ r: Rout - rr, h: H, $fn: FN })),
    translate([-off, 0, H / 2 - rr], torus({ r: Rout - rr, tube: rr, $fn: FN })),
  );

  const body = intersection(opened, envelope);

  // ---- straight bore (no inward squeeze) with softly rolled mouths ------
  const bore = translate([0, 0, -(H + 2) / 2], cylinder({ r: Rin, h: H + 2, $fn: FN }));
  const mouth = (sz) => translate([0, 0, sz * (H / 2)], torus({ r: Rin + 0.4, tube: 1.4, $fn: FN }));

  // ---- countersunk screw holes, DRILLED FROM THE INSIDE -----------------
  // Each hole runs along -X: a small shank clean through the back wall, plus a
  // wider counterbore that opens into the bore so a flat/pan head seats recessed
  // inside the ring (won't scrape the handle). rotate([0,90,0]) lays the
  // cylinder along +X; it starts inside the bore void (harmless) and exits out
  // the back. Mount: push screws in from the bore side into the wall behind.
  const shank = (y) => translate([-(backX + 3), y, 0],
    rotate([0, 90, 0], cylinder({ r: screwD / 2, h: backX + 8, $fn: 32 })));
  const head = (y) => translate([-(Rin + 3), y, 0],
    rotate([0, 90, 0], cylinder({ r: headD / 2, h: Rin + 8, $fn: 40 })));
  const screw = (y) => union(shank(y), head(y));

  const solid = difference(
    body,
    bore,
    mouth(1),
    mouth(-1),
    screw(screwY),
    screw(-screwY),
  );

  // ---- optional grip ridges: -D ridges=7 --------------------------------
  // Round vertical ribs around the back of the bore for extra bite on the smooth
  // handle. Off by default (they protrude slightly into the bore).
  const nR = params.ridges ?? 0;
  if (!nR) return solid;
  const ribs = [];
  for (let i = 0; i < nR; i++) {
    const a = (80 + (200 / (nR - 1)) * i) * Math.PI / 180;  // 80..280 deg, clear of the lips
    const rr2 = Rin + 0.15;                                 // rib centre radius
    ribs.push(translate([rr2 * Math.cos(a), rr2 * Math.sin(a), -(H - 7) / 2],
      cylinder({ r: 1.0, h: H - 7, $fn: 24 })));
  }
  return union(solid, ribs);
};
