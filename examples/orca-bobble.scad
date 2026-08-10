// Orca bobble v19
//
//  · SASH THINNED TO A SLIVER. The floor swings up about the wedge point, so
//    the band gets thinner without the point moving and without touching the
//    ceiling — which is still the cap's own underside, so the seam stays flush.
//  · THE EYE SITS WHOLLY ON THE CAP. It was straddling the cap's cut edge and
//    hanging over it. Moved up the flank and made a little smaller, so the whole
//    patch clears the cut with room to spare.
//  · THE HORN IS FATTER AND SHORTER. Radii up, height down, and thicker across
//    too — 0.8 rather than 0.7 — so it reads as a fin and not a spike.
$fn = 64;

ballR   = 25;              // the animal, tangent to z=0, rolls free
centerZ = 25;

highAng = 34;              // where the cap was cut from the ball — unchanged
slide   = [14, 0, 5];      // up and right, over the wedge's wide end — unchanged
lowAng  = 22;              // under-edge of the sash: raised, to thin the band

// Where the cap's underside leaves the ball on the lower left. Both sash edges
// meet here, so the band still comes to a point ON the silhouette.
wedgeP  = [-21.97, 0, 13.06];
seamLap = 0.05;

darkCol = [0.13, 0.13, 0.15];
tealCol = [0.32, 0.55, 0.50];

module halfBelow(p, ang) { translate(p) rotate([0, -ang, 0]) translate([0, 0, -400]) cube([800, 800, 800], center = true); }
module halfAbove(p, ang) { translate(p) rotate([0, -ang, 0]) translate([0, 0,  400]) cube([800, 800, 800], center = true); }

module ball() { translate([0, 0, centerZ]) sphere(ballR); }

// the cap's underside in its slid position — the sash's ceiling
module capUnderBelow() { translate(slide) halfBelow([-24.2, 0, 16], highAng); }

module bottomDome() {
  intersection() { ball(); halfBelow([wedgeP[0], 0, wedgeP[2] + seamLap], lowAng); }
}

module tealBand() {
  intersection() {
    ball();
    halfAbove([wedgeP[0], 0, wedgeP[2] - seamLap], lowAng);
    capUnderBelow();
  }
}

module capSlice() { intersection() { ball(); halfAbove([-24.2, 0, 16], highAng); } }

module blob(p, r) { translate(p) sphere(r, $fn = 40); }

// The horn: fatter and shorter. Same up-and-left sweep, tip leading.
module finFlick() {
  scale([1, 0.8, 1]) union() {
    hull() { blob([-8, 0, 42], 8);      blob([-12, 0, 47.5], 5.8); }
    hull() { blob([-12, 0, 47.5], 5.8); blob([-16, 0, 52], 3.6); }
    hull() { blob([-16, 0, 52], 3.6);   blob([-20, 0, 55], 1.9); }
    hull() { blob([-20, 0, 55], 1.9);   blob([-23, 0, 56.5], 0.8); }
  }
}

// The eye: 0.6mm of skin, and set high enough that the whole patch is on the
// cap rather than draped over its cut edge.
module shell() {
  difference() {
    translate([1, 0, centerZ]) sphere(ballR + 0.6);
    translate([0, 0, centerZ]) sphere(ballR);
  }
}
eyeAt = [ballR * 0.20, ballR * 0.62, centerZ + ballR * 0.76];

module eyeOne() {
  intersection() {
    shell();
    translate(eyeAt) rotate([0, -22, 0])
      scale([1.5, 1, 1]) sphere(4.8, $fn = 48);
  }
}

module topPart() { translate(slide) union() { capSlice(); finFlick(); } }
module eyePair() { translate(slide) union() { eyeOne(); mirror([0, 1, 0]) eyeOne(); } }

color(darkCol) bottomDome();
color(tealCol) tealBand();
color(darkCol) topPart();
color("white")  eyePair();
