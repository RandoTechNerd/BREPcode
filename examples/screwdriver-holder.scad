/*
  TPU Snap-Fit Screwdriver Holder (Magnetic)
  Optimized for the "neck" of the LTT Screwdriver.
*/

$fn = 100;

// --- Parameters ---
shaft_diameter = 11.0;      // Diameter of the screwdriver neck/shaft
snap_opening = 8.5;         // Narrowest part of the opening (must be < shaft to hold it)
holder_height = 25.0;       // Length of the holder (Y-axis)
wall_thickness = 4.0;       // Thickness of the flexible TPU arms

magnet_diameter = 10.2;     // Magnet diameter (includes ~0.2mm clearance)
magnet_thickness = 3.2;     // Magnet depth (includes ~0.2mm clearance)

// --- Calculated Values ---
outer_diameter = shaft_diameter + (wall_thickness * 2);
backplate_width = outer_diameter;
// Ensure there is 2mm of solid TPU separating the magnet from the screwdriver
backplate_thickness = magnet_thickness + 2.0;

module tpu_screwdriver_holder() {
    difference() {
        // --- MAIN SOLID BODY ---
        union() {
            // The outer round part of the C-clamp
            translate([0, 0, backplate_thickness + (shaft_diameter / 2)])
                cylinder(h=holder_height, d=outer_diameter, center=true);

            // The solid back block connecting the cylinder to the flat backplate
            translate([0, 0, (backplate_thickness + (shaft_diameter / 2)) / 2])
                cube([backplate_width, holder_height, backplate_thickness + (shaft_diameter / 2)], center=true);
        }

        // --- CUTOUTS (The negative space) ---

        // 1. Screwdriver Shaft Rest
        translate([0, 0, backplate_thickness + (shaft_diameter / 2)])
            cylinder(h=holder_height + 2, d=shaft_diameter, center=true);

        // 2. Flared Entry Channel (V-Cut for easier push-in)
        translate([0, -(holder_height + 2) / 2, backplate_thickness + (shaft_diameter / 2)])
            rotate([-90, 0, 0]) // Orient polygon to cut upward along Z, extruded across Y
            linear_extrude(height=holder_height + 2)
            polygon([
                [-snap_opening / 2, 0],
                [snap_opening / 2, 0],
                [outer_diameter / 2, outer_diameter],
                [-outer_diameter / 2, outer_diameter]
            ]);

        // 3. Top Magnet Hole
        // Positioned at the back (Z=0), cutting upward into the backplate
        translate([0, holder_height / 4, magnet_thickness / 2 - 0.1])
            cylinder(h=magnet_thickness + 0.2, d=magnet_diameter, center=true);

        // 4. Bottom Magnet Hole
        translate([0, -holder_height / 4, magnet_thickness / 2 - 0.1])
            cylinder(h=magnet_thickness + 0.2, d=magnet_diameter, center=true);
    }
}

// Render the final object
tpu_screwdriver_holder();
