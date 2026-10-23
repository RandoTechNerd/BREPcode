---
tag: hardware
title: Modelling a machine — printers, consoles, consumer hardware
match: 3d printer, printer model, model of a printer, machine model, desk model, desk ornament, miniature, mini version, replica, console, game console, appliance, gadget model, product model, scale model
---

Modelling a real machine as an ornament — a mini 3D printer, a console, a
camera, an appliance. This is the shape of the job; a named product may also
have its own reference with real dimensions.

**Scale, and say it.** Put one `const SCALE` at the top and divide every real
dimension by it, so the proportions stay checkable and one number resizes the
whole thing. `0.15` turns a 580 mm machine into an 87 mm desk piece. State in
one sentence which real size you used and that it is scaled — published figures
for a machine's outside often disagree by 100 mm depending on whether they count
the spool tower or the feet.

**The colour budget is the number of TOOL HEADS**, not the number of things you
want to colour. Four heads means four filaments across the whole model. Share
one: a white body, a dark bay, and two accent colours covers almost any machine,
because the dark parts (screen, window, rails, heads, bed, logo plate) can all be
the same filament. A fifth colour is assigned to a head that does not exist and
prints wrong.

**Return `group(...)`, never `union(...)`.** Each coloured part stays its own
solid and keeps its colour into the 3MF. Unioning them welds the colours away
and takes far longer.

Getting the shape right:

- **Body**: `fillet({ r, edges: "z" }, cube(...))` rounds the vertical corners,
  then `fillet({ r: 2, edges: "top" }, ...)` softens the top edge: that is what
  gives a moulded machine its look, and it leaves the bottom flat so it prints.
  Both stay exact B-rep solids. `roundedGrow()` looks similar but makes a heavy
  triangle mesh and rounds the bottom too.
- **Openings, not outlines.** A front window is a `difference()` all the way
  through, not a shallow recess. The hole is what reads as a machine.
- **Dark panels beat clear ones.** A tinted door prints inside the colour budget
  and matches most real hardware; a genuinely see-through door needs a fifth,
  transparent filament. `glass(0.25, panel)` makes the same part see-through ON
  SCREEN while still exporting as a solid panel, which is usually what you want.
- **Recess the screen and the logo plate** into the face and colour them dark.
  On a multi-material machine a flat dark inlay reads better than relief and
  prints better than either.

**Wires and tubes: print them coiled.** A cable arcing through the air is the
detail that sells the model and the one that cannot print — the top of the arc
is an overhang over nothing. Print each one as a **flat clock-spring coil** lying
on a top surface, and the user bends it up into the arc afterwards. A coil of
2–3 turns, wire about 1.2–1.5 mm thick, spiralling from a 2 mm inner radius out
to about 7 mm, comes off the plate clean and straightens by hand. Build it with
`tube(helix({ r, turns, pitch: 0 }), { r: 1.4 })` — a flat spiral is a helix
with no rise. Never chain cylinders with balls at the joints; see #wires.

Rules that keep it printable:

- Nothing floats. Every part sits ON another part or on the bed.
- Anything that hangs off the side (a spool on a spindle) is a disc standing
  vertically — it needs a little support, so say so, or tuck it against the body.
- Keep it under about 60 primitives. A desk ornament does not need the frame
  extrusions, the belts or the fasteners; it needs the silhouette, the openings,
  and the two or three details a person recognises the machine by.
- Detail that is under about 0.8 mm after scaling will not print. Real lettering
  on a 0.15-scale model is under a millimetre tall — use a recessed plate in a
  contrasting colour instead, or scale the model up if the words matter.

## Six things that were learned the hard way on a real one

Every one of these came out of building a mini Snapmaker U1 against photographs.
They are cheap to follow and expensive to rediscover.

**A pocket does not lower the wall it sits inside.** Cutting a recessed bay into
the top of a box, inset from the walls, leaves the walls running to their FULL
height — the bay's floor is not the top of the front panel. Work out where a
badge or a screen goes from the face it is on, not from the pocket behind it.
Getting this backwards put a logo and a screen 15 mm too low on a 100 mm machine
and it took a person looking at it to spot.

**A rounded box is a fillet of its vertical edges, not an offset.**

```
translate([x0, y0, 0], fillet({ r: 6, edges: "z" }, cube([x1 - x0, y1 - y0, H])))
```

Rounded vertical corners, flat top and bottom, one exact solid (310 ms, 272
triangles for an 80 x 50 x 30 box). `hull()` of four corner cylinders gives the
same silhouette as a triangle mesh, so nothing after it can be filleted and
STEP loses the curves; `roundedGrow()` rounds all twelve edges and hands the
booleans that follow a heavy mesh: **44 s versus 5 s**.

**Line a cavity, do not fill it.** A dark box the size of the chamber makes a
door look deep — and hides the bed sealed inside it, which is the only thing the
door exists to show. Use thin panels on the walls and floor instead.

**Union same-coloured parts — unless they run diagonally.** Merging disjoint
pieces of one colour into a single solid usually pays: 81 solids took 18.9 s,
the same model at 35 solids took 13 s. But four tubes that each cross the whole
machine on a diagonal have bounding boxes that all overlap, and unioning THOSE
cost **9 s on its own**. Merge things that sit near each other; leave things that
span the model alone.

**Open a flange so the colour shows.** A spool's flange is a solid disc in real
life, and a solid disc hides the filament from the exact angle you look at a
spool from. On a multi-colour machine that throws away the whole point — cut the
flange to a rim and each colour reads at a glance.

**Glazing is a light tint at low opacity.** `colorize("#9FB4BE", glass(0.17, …))`
reads as acrylic. A dark smoked pane over a dark interior goes black and stops
looking like glass at all.

You have everything you need — build it, and say which real size you scaled from.
