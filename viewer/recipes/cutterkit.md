---
tag: cutterkit
title: Cutter kits — stamp, twist knob, stencil sheet, rolling stamp
match: cutter and stamp, cutter + stamp, cookie stamp, dough stamp, fondant stamp, imprint stamp, embosser, cookie embosser, stencil sheet, cocoa stencil, dusting stencil, rolling stamp, rolling pin cutter, roller stamp, embossing roller, cutter set, cutter kit, twist knob, stamp handle
---

The four things people sell. Blade fundamentals — wall thickness, overlaps, why
an outline goes patchy — are in **#cookiecutter**. Every block below was built
before it was written; the times are measured.

## 1 · Cutter + stamp with a twist-in knob

Cutter, stamp, knob. **The knob is a bayonet, not a screw** — a printed thread
this size is fussy, slow to build and prints badly on a vertical wall. A
quarter-turn bayonet (two lugs drop through slots, turn under a shelf) prints
flat, needs no supports and holds hard.

```
$fn = 48;
POST = 6;      // post radius
LUG  = 2.2;    // how far each lug sticks out past the post
LUGH = 2.4;    // lug thickness
CLR  = 0.35;   // clearance per side — see the note below

module knob() {
  cylinder(h = 10, r = 11);                          // the grip
  translate([0,0,10]) cylinder(h = 12, r = POST);    // the post
  for (a = [0, 180]) rotate([0,0,a])
    translate([-(POST+LUG), -2.4, 19.5]) cube([POST+LUG, 4.8, LUGH]);
}
knob();
```

*472 facets, instant. 22 mm across, 22 mm tall.*

The socket goes on the BACK of the stamp plate. Three cuts, in this order: the
bore the post drops into, the slots the lugs pass through, and the chamber they
turn into under the shelf.

```
$fn = 48;
POST = 6; LUG = 2.2; LUGH = 2.4; CLR = 0.35;
BOSS_R = 11; BOSS_H = 14; PLATE = 3;

difference() {
  union() {
    cylinder(h = PLATE, r = 26);                     // the stamp plate
    translate([0,0,PLATE]) cylinder(h = BOSS_H, r = BOSS_R);
  }
  translate([0,0,PLATE+2]) cylinder(h = BOSS_H, r = POST+CLR);          // bore
  for (a = [0,180]) rotate([0,0,a])                                     // entry slots
    translate([-(POST+LUG+CLR), -(2.4+CLR), PLATE+BOSS_H-LUGH-1.2])
      cube([POST+LUG+CLR, (2.4+CLR)*2, LUGH+2]);
  translate([0,0,PLATE+BOSS_H-LUGH*2-1.2-CLR])                          // turn chamber
    cylinder(h = LUGH+2*CLR, r = POST+LUG+CLR);
}
```

*952 facets. Checked against the solid boss — 9,739 mm³ vs 11,660 — so 1,921 mm³
of cavity really is cut. A socket that failed to bore weighs the same as a solid
one, which is the check worth doing.*

**CLR = 0.35 per side is the whole game.** Under about 0.25 the knob will not
turn on an FDM print; over about 0.5 it rattles. Say the number in your reply so
the user can change it for their printer rather than reprinting blind.

## 2 · The stamp face

The stamp is a plate with the detail standing **proud** — raised lines press
*into* the dough. Depth 1.2–1.8 mm: deeper tears the dough, shallower vanishes
when it spreads in the oven.

```
$fn = 48; R = 26; PLATE = 3; LINE = 1.2; RELIEF = 1.6;
union() {
  cylinder(h = PLATE, r = R);
  translate([0,0,PLATE]) linear_extrude(RELIEF) union() {
    difference() { circle(r = R-4); circle(r = R-4-LINE); }
    for (a = [0:60:359]) rotate([0,0,a]) translate([-LINE/2, 0]) square([LINE, R-6]);
    circle(r = 3);
  }
}
```

*956 facets, 4.2 s.*

Rules that decide whether it reads in baked dough:

- **Lines no thinner than 1.0 mm.** Under that the dough closes over them.
- **Build the whole face as ONE 2D union, then extrude once.** A dozen separate
  raised pieces is a dozen booleans; one profile is one.
- The stamp plate is a hair SMALLER than the cutter's inside — 0.5 mm all round
  — so it drops in without wedging.

## 3 · Stencil sheet

A thin plate with the motif cut clean through, for cocoa or icing sugar.

```
$fn = 32; COLS = 6; ROWS = 4; PITCH = 22; T = 1.2;
module berry() { union() { circle(r = 6); translate([0,5]) circle(r = 3.6); } }
linear_extrude(T) difference() {
  translate([-PITCH*COLS/2, -PITCH*ROWS/2]) square([PITCH*COLS, PITCH*ROWS]);
  for (c = [0:COLS-1]) for (r = [0:ROWS-1])
    translate([-PITCH*COLS/2+PITCH*(c+0.5), -PITCH*ROWS/2+PITCH*(r+0.5)]) berry();
}
```

*4,332 facets. **43 s** for this 6 × 4 grid.*

**Say the wait, or shrink the grid.** The cost is the polygon boolean and scales
with motif count. One 2D difference plus a single extrude is NOT faster than 24
separate 3D cuts — both measured within ten seconds. Offer **4 × 3** if they want
it interactive.

- Sheet **1.0–1.5 mm**. Thinner warps off the bed; thicker lifts the powder edge
  and blurs the print.
- Every hole must be a hole. An island — the middle of a letter O, a berry's
  seed — needs a tab holding it, or it falls out. `stencil()` in BREPcode does
  the tabs for lettering; for artwork, leave the seeds as surface detail rather
  than holes.

## 4 · Rolling stamp

A roller that repeats the motif as it runs over the dough, on an axle.

```
$fn = 48; R = 18; LEN = 60; N = 4; RELIEF = 1.4; AXLE = 4.2;
difference() {
  union() {
    rotate([0,90,0]) cylinder(h = LEN, r = R);
    for (i = [0:N-1]) rotate([i*360/N, 0, 0])
      for (k = [0:2]) translate([12+k*18, 0, R-0.5])
        linear_extrude(RELIEF) circle(r = 5);
  }
  rotate([0,90,0]) translate([0,0,-1]) cylinder(h = LEN+2, r = AXLE/2);
}
```

*2,880 facets, 15.5 s for 4 rows × 3.*

- The motif sinks **0.5 mm into** the barrel (`R-0.5`), never sits on it. Resting
  it exactly on the surface is the coincident-face trap from #cookiecutter.
- **N × the motif's arc must equal the circumference**, or the pattern jumps
  where it wraps. Circumference is `2πR`; at R = 18 that is 113 mm, so four
  motifs every 28 mm.
- Axle **4.2 mm** for a 4 mm rod, or print it with stub ends and a separate
  fork. Print the barrel on its end — no supports, and the layer lines run round
  the roll rather than across the motif.

## Which one they meant

"cutter and stamp" = **1 + 2**, three parts side by side on the plate, not
stacked. "stencil" = 3 alone. "rolling"/"roller" = 4, no cutter needed.

No size given: cutters **70 mm** across, stamps to match, sheets **130 × 90**,
rollers **60 mm** at **R 18**. Say which you used. Print everything face-down,
no supports.
