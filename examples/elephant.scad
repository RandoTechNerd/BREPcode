// A stylised elephant from primitives only — the kind of model an LLM produces
// when asked for an organic shape. Build:  brepscript elephant.scad -o elephant.stl
$fn = 40;

module ellipsoid(rx, ry, rz) { scale([rx, ry, rz]) sphere(r = 1); }

// ---- body & head -----------------------------------------------------------
module body()  { translate([0, 0, 40]) ellipsoid(20, 27, 17); }
module head()  { translate([0, 30, 52]) sphere(r = 13); }

// ---- trunk: a chain of shrinking, drooping spheres -------------------------
module trunk() {
  for (i = [0 : 8]) {
    translate([0, 41 + i * 3.6, 46 - i * i * 0.55])
      sphere(r = 4.6 - i * 0.35);
  }
}

// ---- ears: flattened, tilted spheres, mirrored -----------------------------
module ear() {
  translate([13, 27, 58]) rotate([0, -18, 12]) scale([0.35, 1.5, 1.9]) sphere(r = 7);
}

// ---- legs: cylinders with slightly wider feet ------------------------------
module leg(x, y) {
  translate([x, y, 0]) cylinder(h = 30, r = 5.5);
  translate([x, y, 0]) cylinder(h = 4.5, r = 6.5);
}

// ---- tusks: thin tapered cones angled out of the head ----------------------
module tusk() {
  translate([6, 38, 45]) rotate([55, 0, -8]) cylinder(h = 12, r1 = 1.6, r2 = 0.4);
}

// ---- tail ------------------------------------------------------------------
module tail() {
  translate([0, -26, 46]) rotate([115, 0, 0]) cylinder(h = 16, r1 = 1.8, r2 = 0.8);
  translate([0, -27.5, 31]) sphere(r = 2.2);
}

union() {
  body();
  head();
  trunk();
  ear();  mirror([1, 0, 0]) ear();
  tusk(); mirror([1, 0, 0]) tusk();
  leg(10, 14);  leg(-10, 14);  leg(10, -14);  leg(-10, -14);
  tail();
}
