// Orca bobble — SPLIT FOR PRINTING
//
// The same v19 model, cut into the four pieces it wants to be printed as, with
// the joinery that makes them go back together in the right place:
//
//   bottom dome (black)   ─┐ three dowels on the sash's lower face
//   teal sash (teal)      ─┘ three dowels on the sash's upper face
//   cap + fin (black)     ─┘
//   two eyes (white)        each glued into a socket in the cap
//
// The dowel holes for each joint come from ONE dowelsOnPlane() call and are
// subtracted from BOTH parts, so the two bores are the same bore. Placing them
// twice by hand is how a seam ends up a few tenths out with nothing to show why.
//
// SHOW = "assembled" to check the fit, "plate" to lay them out for printing.
SHOW = "plate";

$fn = 64;

ballR   = 25;
centerZ = 25;
highAng = 34;
slide   = [14, 0, 5];
lowAng  = 22;
wedgeP  = [-21.97, 0, 13.06];
seamLap = 0.05;

// --- joinery ---------------------------------------------------------------
pinD    = 4;      // 4mm printed dowels
pinDep  = 5;      // bored 5mm into each side, so a 9mm pin spans both
// Three per joint: three points fix a plane, so the parts cannot rotate or
// rock. Spread wide, and NOT in a line — collinear holes still let it pivot.
lowAt   = [[22, 0], [34, -9], [34, 9]];
capAt   = [[18, 0], [28, -8], [28, 8]];

darkCol = [0.13, 0.13, 0.15];
tealCol = [0.32, 0.55, 0.50];

module halfBelow(p, ang) { translate(p) rotate([0, -ang, 0]) translate([0, 0, -400]) cube([800, 800, 800], center = true); }
module halfAbove(p, ang) { translate(p) rotate([0, -ang, 0]) translate([0, 0,  400]) cube([800, 800, 800], center = true); }

module ball() { translate([0, 0, centerZ]) sphere(ballR); }
module capUnderBelow() { translate(slide) halfBelow([-24.2, 0, 16], highAng); }

// the two split faces, as hole sets — each subtracted from the parts on BOTH
// sides of it
module lowJoint() {
  dowelsOnPlane(p = wedgeP, ang = lowAng, at = lowAt, d = pinD, depth = pinDep, fit = "snug");
}
module capJoint() {
  dowelsOnPlane(p = [-24.2 + slide[0], 0, 16 + slide[2]], ang = highAng,
                at = capAt, d = pinD, depth = pinDep, fit = "snug");
}

module rawBottom() { intersection() { ball(); halfBelow([wedgeP[0], 0, wedgeP[2] + seamLap], lowAng); } }
module rawBand()   { intersection() { ball(); halfAbove([wedgeP[0], 0, wedgeP[2] - seamLap], lowAng); capUnderBelow(); } }
module rawCap()    { intersection() { ball(); halfAbove([-24.2, 0, 16], highAng); } }

module blob(p, r) { translate(p) sphere(r, $fn = 40); }
module finFlick() {
  scale([1, 0.8, 1]) union() {
    hull() { blob([-8, 0, 42], 8);      blob([-12, 0, 47.5], 5.8); }
    hull() { blob([-12, 0, 47.5], 5.8); blob([-16, 0, 52], 3.6); }
    hull() { blob([-16, 0, 52], 3.6);   blob([-20, 0, 55], 1.9); }
    hull() { blob([-20, 0, 55], 1.9);   blob([-23, 0, 56.5], 0.8); }
  }
}

module shell() {
  difference() {
    translate([1, 0, centerZ]) sphere(ballR + 0.6);
    translate([0, 0, centerZ]) sphere(ballR);
  }
}
eyeAt = [ballR * 0.20, ballR * 0.62, centerZ + ballR * 0.76];
module eyeBlank(g) {
  intersection() {
    shell();
    translate(eyeAt) rotate([0, -22, 0]) scale([1.5, 1, 1]) sphere(4.8 + g, $fn = 48);
  }
}
module eyeOne()   { eyeBlank(0); }
// The socket is the eye rebuilt from a LARGER ellipsoid rather than the finished
// patch grown — same shape, a fraction of the cost, because the patch is an
// intersection and growing one of its inputs grows the result.
module eyeSocket() { eyeBlank(0.30); }

// --- the four printed parts ------------------------------------------------
module partBottom() { difference() { rawBottom(); lowJoint(); } }
module partBand()   { difference() { rawBand();   lowJoint(); capJoint(); } }
module partCap() {
  difference() {
    translate(slide) union() { rawCap(); finFlick(); }
    capJoint();
    translate(slide) eyeSocket();
    translate(slide) mirror([0, 1, 0]) eyeSocket();
  }
}
module partEyes() { translate(slide) union() { eyeOne(); mirror([0, 1, 0]) eyeOne(); } }
// Siblings, not union(): dowelPinsFor returns a group() so the pins stay
// separate solids, and unioning two groups is not a thing.
module partPins() {
  dowelPinsFor(at = lowAt, d = pinD, depth = pinDep);
  translate([0, 18, 0]) dowelPinsFor(at = capAt, d = pinD, depth = pinDep);
}

module assembled() {
  color(darkCol) partBottom();
  color(tealCol) partBand();
  color(darkCol) partCap();
  color("white")  partEyes();
}

// Laid out flat on the bed, each piece on its own patch of plate. The sash and
// the cap are turned so their big flat split face is DOWN — a flat face on the
// bed needs no supports and prints the seam crisp, which is the whole point of
// cutting there.
module plate() {
  color(darkCol) partBottom();
  color(tealCol) translate([70, 0, 0]) rotate([0, -lowAng, 0]) partBand();
  color(darkCol) translate([150, 0, 0]) partCap();
  color("white")  translate([215, 0, 0]) partEyes();
  color(darkCol) translate([215, -40, 0]) rotate([0, 90, 0]) partPins();
}

if (SHOW == "plate") plate(); else assembled();
