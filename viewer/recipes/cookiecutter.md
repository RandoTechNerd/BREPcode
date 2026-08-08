---
tag: cookiecutter
title: Cookie cutters (and why the shape goes patchy)
match: cookie cutter, cookiecutter, biscuit cutter, clay cutter, fondant cutter, pastry cutter, dough cutter, stamp cutter
---

A cookie cutter is **a thin wall standing on its outline**, not a solid shape.
Getting the wall is the whole job, and there is exactly one way that works here.

**WRITE CUTTERS AS OpenSCAD.** BREPcode translates pasted OpenSCAD, and
OpenSCAD's `offset()` is a real polygon offset — it handles concave outlines,
which is what traced artwork always is. BREPcode's own vocabulary has **no
offset at all**, and the obvious workarounds both fail:

- Insetting the points yourself in JavaScript self-intersects the moment the
  outline turns inward — a fish's tail notch is enough. The result extrudes into
  a shape with **holes and missing patches in the middle** while the outline
  still looks perfect. That is the classic symptom, and that is the cause.
- `roundedShrink()` is a 3D offset and does work in principle, but on a
  many-sided extruded outline it does not finish — measured past ten minutes on
  a nine-sided fish.

The whole cutter, verified end to end (313 ms, 148 facets):

```
H = 15;        // blade height
WALL = 0.9;    // blade thickness — never below 0.8
RIM = 6;       // rim width, the part you press on
RIM_H = 2.5;
BITE = 1;      // how far the rim sinks INTO the blade

pts = [[0,0],[30,8],[45,0],[45,20],[30,12],[0,20],[-10,25],[-6,10],[-10,-5]];

union() {
  // the blade: a solid extrusion with an inset copy cut out of it
  difference() {
    linear_extrude(H) polygon(pts);
    translate([0,0,-1]) linear_extrude(H+2) offset(delta=-WALL) polygon(pts);
  }
  // the rim: the same trick, wider, sunk INTO the top of the blade
  translate([0,0,H-BITE]) difference() {
    linear_extrude(RIM_H+BITE) offset(delta=RIM) polygon(pts);
    translate([0,0,-1]) linear_extrude(RIM_H+BITE+2) polygon(pts);
  }
}
```

`offset(delta=)` is the mitred offset and is the right one for a blade;
`offset(r=)` rounds the corners off, which softens a shape people chose for its
corners.

The other two ways a cutter fails:

- **Coincident faces.** A rim resting exactly on the blade's top face gives the
  kernel two surfaces in one plane and it drops both, leaving a hole. The `BITE`
  above sinks the rim 1 mm INTO the blade — **always overlap, never rest on**.
  Same rule for the bore: it starts 1 mm below and runs 2 mm past the top.
- **A wall thinner than the nozzle.** A 0.3 mm blade looks right on screen and
  simply is not printed — the slicer has nothing to lay down, so long runs
  vanish while corners survive. Keep `WALL ≥ 0.8`, two perimeters at a 0.4
  nozzle, even though real cutters look thinner.

## "Make this a cookie cutter" — when the shape is ALREADY on screen

This is the common one: somebody traced a photo or drew an outline, has an
extrusion in the editor, and now wants a cutter from it. **The outline they
already have is the deliverable.** Do not re-trace it, do not re-draw it from
your idea of a salmon, and do not leave anything out of it.

- **Copy the points across verbatim.** They are already in the editor as
  `polygon([[x,y], …])`. Paste that same list into the OpenSCAD
  `polygon(points=[[x,y], …])` and offset THAT. Every point, in order, at the
  same numbers — no "cleanup" pass, no re-drawing by eye.
- **Keep every loop.** A gingerbread man traced as a body plus separate arms, a
  fish with a detached fin — each closed loop becomes its own blade ring, and
  OpenSCAD's `polygon(points=…, paths=…)` takes them all. Dropping one is
  deleting part of the model.

### Thinning points is allowed; changing the shape is not

Traced artwork arrives absurdly dense: a real icon came in at **1,430 points**,
569 on the outline alone — at 80 mm that is a point every half-millimetre, finer
than a 0.4 mm nozzle can print, and `offset()` still has to compute it all.

Thin by **tolerance, not point budget**: no point moves more than **0.25 mm**,
under half a nozzle width. That took the same icon to 202 points, same shape.
Deleting a *feature* — an arm, a fin, a loop — is not within any tolerance and
is never allowed. Over a few hundred points, thin it and say the tolerance.

### Say what the wait will be

Cost tracks the number of **separate pieces**, not points. Measured here at
80 mm: **one blade 3.4 s, three 11.8 s, five 35 s** — thinning 1,430 points to
202 barely moved it, but a fourth piece nearly doubles it. So with more than one
solid loop, say up front how many pieces it is (that is how many cutters they
get) and roughly how long. Never drop a piece to be quicker.
- **Keep the size.** Measure the existing outline's extent and keep it. Rescale
  only if asked, and say the new size if you do.
- **Never delete a feature to make the offset behave.** If a neck or a fin
  pinches below 2 × WALL the wall closes up there — say which feature and offer
  to thicken it or raise the height. Silently removing it produces a cutter that
  is not the shape they asked for, which is the one outcome nobody notices until
  it is printed.

The checks below about specks and thin necks are about TRACE NOISE — stray
pixels the tracer picked up — not about real features of the drawing. When in
doubt it is a feature: keep it and say what it will do.

Outline rules:

- **One closed loop, no specks.** Drop only true trace noise — islands of a
  couple of millimetres that are obviously scanner dirt, never a real limb or
  fin. Interior detail belongs on a separate stamp plate, never as holes in the
  cutting wall.
- **Nothing narrower than 2 × WALL.** A fin or a lip that pinches to 1.5 mm has
  no inside left after a 0.9 mm inset, and that stretch of wall closes up or
  breaks. Fatten it in the outline first, or say plainly that it will fill in.
- Print blade-down, no supports. The rim is the top.

Sizes: cutters are usually **50–90 mm** across and **15 mm** tall. With no size
given, use 70 mm across and say so.

You have everything you need — write it as OpenSCAD, in this order, with these
overlaps.
