// Orca bobble v10 — v5's construction, pushed toward the logo
//
// The head is NOT a second smaller ball (that was v8/v9's mistake — it read as
// a snowman). It is the SAME 25mm sphere shifted forward and down, so the cap
// keeps the ball's own curvature and the whole thing reads as one form with an
// overhanging chin — which is exactly how the logo is drawn.
//
// v5 -> v10, per the logo:
//  · SHORTER: head centre dropped 33 -> 29, so the cap crests at 54 not 58.
//  · MORE OVERHANG: head centre forward 8 -> 12mm; the chin now juts 12mm past
//    the ball. The fin follows the lowered crown.
//  · EYES ON THE OVERHANG: moved forward to the hanging cheek, raked along the
//    chin edge, a touch smaller so the rake reads.
$fn = 64;

ballR   = 25;            // bottom ball, tangent to z=0, rolls free
centerZ = 25;
headR   = 25;            // SAME radius as the ball — the whole trick
headC   = [-12, 0, 29];  // forward for the overhang, low for the short crown

hingeP  = [-23.5, 0, 18];// wedge planes meet at the ball surface — pointed tip
lowAng  = 15;
highAng = 28;

darkCol = [0.13, 0.13, 0.15];
tealCol = [0.32, 0.55, 0.50];

module halfBelow(p, ang) { translate(p) rotate([0, -ang, 0]) translate([0, 0, -400]) cube([800, 800, 800], center = true); }
module halfAbove(p, ang) { translate(p) rotate([0, -ang, 0]) translate([0, 0,  400]) cube([800, 800, 800], center = true); }

module mainBall() { translate([0, 0, centerZ]) sphere(ballR); }

module bottomDome() {
  intersection() { mainBall(); halfBelow(hingeP, lowAng); }
}

module sphereWedge() {
  intersection() {
    mainBall();
    halfAbove(hingeP, lowAng);
    halfBelow(hingeP, highAng);
  }
}

module blob(p, r) { translate(p) sphere(r, $fn = 40); }

// dorsal flick: base on the (lowered) crown, tip curling up and forward,
// out over the overhang like the logo
module finFlick() {
  hull() { blob([-6, 0, 48], 8);     blob([-16, 0, 56], 5.5); }
  hull() { blob([-16, 0, 56], 5.5);  blob([-25, 0, 60.5], 3); }
  hull() { blob([-25, 0, 60.5], 3);  blob([-33, 0, 62.5], 1.2); }
}

module headCap() {
  intersection() {
    union() { translate(headC) sphere(headR); finFlick(); }
    halfAbove(hingeP, highAng);
  }
}

// eye patch wrapped on the head surface (+0.6mm proud), ON the overhanging
// cheek — near the chin edge, raked along it
module eyeOne() {
  intersection() {
    translate(headC) sphere(headR + 0.6);
    translate([-27, 13, 40]) rotate([18, -38, 22])
      scale([1.8, 1.05, 0.85]) sphere(6, $fn = 48);
  }
}

color(darkCol) bottomDome();
color(tealCol) sphereWedge();
color(darkCol) headCap();
color("white") { eyeOne(); mirror([0, 1, 0]) eyeOne(); }
