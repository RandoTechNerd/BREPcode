---
tag: exact
title: Staying on the exact B-rep kernel
match: rounded box, rounded corners, round corners, rounded edges, soft corners, taper, tapered, frustum, hull, revolve, lathe, turned, cone, b-rep, brep, exact, step file, step export, rounded rectangle
---

BREPcode builds on an exact B-rep kernel: true planes, cylinders and cones,
fast booleans, and STEP export with real curved surfaces. A model stays on it
only while every step is exact. One MESH step turns the rest of that branch
into triangles (nothing after it can be filleted, STEP comes out faceted), and
a step the kernel REFUSES drops the whole model to the old JS kernel, which
is several times slower. The status bar shows which: "Exact", "Mesh" or
"JS kernel". Most drops are habits with an exact equivalent.

**Exact:** cube, cylinder, cone / cylinder({ r1, r2 }), sphere, torus,
polygon + linearExtrude, revolve, path2d, union / difference / intersection,
fillet, chamfer, drill, the hardware and shelf parts, and
`hull({ exact: true }, ...)` of a FEW flat-sided pieces (boxes, extruded
polygons, cylinders with $fn 3-8): the hull goes to the kernel as an exact
polyhedron while it has 64 faces or fewer. Opt-in, because it is not free:
many stacked exact hulls (a Gridfinity bin) took 70 s and were refused,
against 0.5 s as meshes.

**Mesh** (fine when the design needs it, but apply it LAST and never fillet()
after it): plain hull() (and an exact hull over round pieces: 328 faces
took 4.7 s exact against 0.09 s as a mesh), roundedGrow / minkowski /
roundedShrink, tube, texture /
heightmap, blob / smoothUnion / blend, text and the codes, importedMesh.

Measured on the engine (each pair is the same shape):

| Build | Lane | Time |
|---|---|---|
| rounded box, `fillet({ r, edges: "z" }, cube)` | exact | 310 ms, 272 tris |
| rounded box, hull() of 4 corner cylinders | mesh | 245 ms |
| hull({ exact: true }) of two boxes (10 faces) | exact | 0.2 s |
| rounded box, roundedGrow() | mesh | 751 ms, 13k tris |
| cup, cones + centre hole | exact | 43 ms |
| cup, revolve() + the same centre hole | JS fallback | refused: self-intersects |
| hex pot, 6 tilted cutters in one difference() | exact / refused | 2.5 s at 12 sides, refused at 4 and 8 |
| the same cutters one difference() at a time | exact | 66-323 ms |
| fillet() after hull() | JS fallback | it cannot find the hull's edges yet |

The rules that follow from it:

- **A rounded box** is `fillet({ r, edges: "z" }, cube([x, y, z]))`: rounded
  vertical corners, flat top and bottom, exact. Add
  `fillet({ r: 2, edges: "top" }, ...)` for a soft top edge. Not hull() of
  corner cylinders, not roundedGrow().
- **A taper** is a cone: `cylinder({ r1, r2, h, $fn: 96 })`. Pots, cups,
  bosses, feet.
- **A tapered polygon** (hex pot, square planter) is linearExtrude of the
  polygon at its wider end, each side planed off by a big tilted cube, ONE
  difference() AT A TIME (#vessel has the helper). `hull({ exact: true }, ...)`
  of two flat polygon slabs is also exact; never a cone with $fn 3-8 (refused).
- **No hole down a revolve() axis.** The lathe's seam self-intersects with
  the cutter and the kernel refuses it. A round body with a centre hole is
  built from cylinders and cones; off-axis holes in a revolve are fine.
- **Overlapping cutters go one at a time.** `difference(a, t1, t2, t3)` unions
  t1..t3 first, and tools that cross each other are where that slows down or
  is refused. Nest them, `difference(difference(a, t1), t2)`, or loop.
  Disjoint tools (a row of holes) are fine in one call.
- **No grazing contact.** Two solids that only touch along an edge or a line
  (a flare that starts exactly at another solid's top edge) are refused. Run
  one 0.5-1 mm into the other on the same surface line, so the faces cross.
- **$fn:** a cylinder with $fn 3-8 is a real polygon prism
  (`cylinder({ r, h, $fn: 6 })` is a hex nut); above 8 it is a true circle
  whatever the number.

```js
// an open box with rounded corners, all exact
const W = 80, D = 50, H = 30, R = 6, WALL = 2.4;
const outside = fillet({ r: R, edges: "z" }, cube([W, D, H]));
const inside = translate([WALL, WALL, WALL],
  fillet({ r: R - WALL, edges: "z" }, cube([W - 2 * WALL, D - 2 * WALL, H])));
return difference(outside, inside);
```
