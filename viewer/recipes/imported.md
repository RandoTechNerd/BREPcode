---
tag: imported
title: Editing an imported mesh
match: imported, importedmesh, my stl, the stl, my model, my part, this part, uploaded, dragged in
---

If the current code contains `importedMesh("file.stl")`, that is the user's real
part. Wrap **that exact call** — `difference` to drill, `union` to add, `stretch`
to lengthen. Keep the filename byte-identical.

**Where an import actually sits.** Get this wrong and every cutter misses, the
build "succeeds", and nothing changes. An import is recentred: X and Y run from
-width/2 to +width/2 (**not** 0 to width), and Z runs from 0 up to the height.
There is never any geometry below z=0. So a plane that shears the bottom off
sits at a **positive** z, and a pocket in the underside is bored **upward** from
that plane, not downward from z=0. A cutter at negative z removes nothing.

**Orientation first.** Imports land centred on the origin sitting on z=0, but in
whatever pose the STL was saved — often lying down when the user wants it
standing. The status bar dimensions tell you the pose: read them before anything
else. If the long axis is X or Y when it should be Z, wrap it in `rotate([…])`
**first**, then do the rest. `rotate([90,0,0])` tips it upright, `rotate([0,0,90])`
spins it flat, `rotate([180,0,0])` flips it. The rotation is baked in, so
drilling/splitting/fins all work on the new pose. Say in one sentence which way
you turned it and why.

**Removing a feature** (feet, a boss, a tab, a lip): never invent its size or
position. The status bar gives overall dimensions; everything else you must ask
for or key off the bounding box. Say plainly "I need the foot positions" rather
than guessing — a guess produces code that runs cleanly and does nothing, which
is far worse than an error.

For feet specifically: they are the part's lowest few millimetres, so
`difference()` the part against `translate([-200,-200,-1], cube([400,400,H+1]))`
where H is the height the feet stand — that shears them off flat. To leave a
glue pocket where each foot was, add cylinder cutters starting at that same H
running **up** into the fresh face, then `translate([0,0,-H])` to drop the part
back on the bed.

**Thicker walls / wider rails without changing outside size:** scale it up, then
stretch the middle back out by exactly the amount you added. `scale([2,2,1], mesh)`
doubles every rail *and* the overall size; `stretch({axis:"x", by:-W})` and
`stretch({axis:"y", by:-H})` with W/H the **original** width and height bring the
outside back, leaving rails at doubled thickness. The result lands offset by
half — recentre with `translate([W/2, H/2, 0])`. Everything inside the removed
slab is gone (a frame's centre bar, an inner boss); union it back afterwards if
wanted. Remember a feature may only be part-depth — a frame's centre bar is
often a thin ledge on the back face, not a full-thickness rib, so rebuild it as
`cube([w, d, ledgeZ])` at z=0, not the full height.
