// Plain OpenSCAD — build it directly:  brepscript knob.scad -o knob.stl
// A knurled-ish knob: a disc with grip cuts around the rim and a D-shaft bore.

$fn = 64;

knob_d   = 34;
knob_h   = 14;
shaft_d  = 6.2;
grips    = 12;
grip_d   = 4;

module grip_ring(count, ring_r, cut_d, h) {
  for (i = [0 : count - 1]) {
    angle = i * 360 / count;
    translate([ring_r * cos(angle), ring_r * sin(angle), -1])
      cylinder(h = h + 2, d = cut_d);
  }
}

difference() {
  cylinder(h = knob_h, d = knob_d);

  // grip cuts around the outside
  grip_ring(grips, knob_d / 2, grip_d, knob_h);

  // D-shaped shaft bore
  translate([0, 0, -1]) cylinder(h = knob_h + 2, d = shaft_d);
  translate([shaft_d / 2 - 0.8, -shaft_d / 2, -1])
    cube([shaft_d, shaft_d, knob_h + 2]);

  // recessed top
  translate([0, 0, knob_h - 2]) cylinder(h = 3, d = knob_d - 8);
}
