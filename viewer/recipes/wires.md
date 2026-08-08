---
tag: wires
title: Cables, bowden tubes and anything else shaped like a line
match: wire, wires, cable, cables, bowden, ptfe tube, tubing, hose, loom, harness, lead, leads, cord, flex, conduit, pipe, piping, hoop, ring, o-ring, handle, bail, coil, coiled, spring, spiral, bent rod, rod bent
---

Anything whose shape is a **line** — a cable, a bowden/PTFE tube, a handle, a
hoop, a bent rod, a length of piping — is a swept tube. Write the path it
follows and let `tube()` build it.

```
tube([[0, 0, 0], [40, 0, 0], [40, 30, 0], [40, 30, 25]], { r: 2 })
```

That is one solid, whatever the bend count, and the corners are real arcs.

## Do not chain cylinders

The workaround this replaces looked like this, and it is now wrong:

```
// WRONG — one solid per segment, one per joint, and a kink at every bend
const loopTube = (a, b, c) => union(
  cylinderBetween(a, b), sphere({ r }), cylinderBetween(b, c), sphere({ r }),
);
```

A five-bend wire written that way is **eleven solids and eleven booleans**. The
same wire as `tube()` is one solid of about a thousand triangles. On a model
with a few cables that is the difference between a build you wait two seconds
for and one you cancel — and a cancelled build applies none of your other
changes either, which is how a colour edit appears to "not work".

## Options worth knowing

| Option | Does |
|---|---|
| `r` | Radius. A **list** of radii, one per path point, tapers it. |
| `sides` | Facets around the tube. 16 is the default; 8–10 is plenty for a thin cable, and halves the triangles. |
| `bend` | Corner radius. Defaults to `1.5 × r`, which looks like real cable. `0` gives mitred corners. |
| `closed` | `true` joins the last point to the first and drops the end caps — a hoop, an O-ring, a bail. |
| `caps` | `"round"` (default) or `"flat"`. Flat is right where the cable disappears into a housing. |

An already-smooth path — a helix, a sampled circle, an exported spline — is left
alone rather than "rounded" again, so feeding one 200 points does not explode the
mesh.

**Leave `bend` alone unless you have a reason.** It defaults to three times the
tube radius, which is chosen so the inner wall of the arc stays well clear of
itself. Force it much tighter and the rings on the inside of the bend land closer
together than the kernel's welding distance; those vertices merge, the quads
between them collapse into slivers, and the import spends its time repairing
them. Four 0.8 mm strands with an over-tight bend cost **12.7 seconds** for 380
triangles — the same mesh with a sane bend costs nothing. If you want a hard
corner, `bend: 0` gives an honest mitre, which is cheap.

## Paths you do not have to write out

```
tube(helix({ r: 12, turns: 4, pitch: 5 }), { r: 1.6 })   // a coiled cable
tube(helix({ r: 20, turns: 3, pitch: 0 }), { r: 2 })     // a flat spiral
tube(circlePath({ r: 30 }), { r: 3, closed: true })      // a hoop
```

`pitch` is the rise per turn; `pitch: 0` gives a flat spiral, which is how you
**print a cable coiled up** so it needs no supports and takes no bed space.
`helix({ r2 })` tapers the coil into a cone.

## Routing a cable on a real model

Write the path as the points the cable actually passes through, and keep the
numbers in terms of the parts they connect — then moving a part moves its wiring.

```
const PSU = [12, 8, 6], BOARD = [70, 40, 22];
const drop = [PSU[0], PSU[1], BOARD[2] + 14];   // up out of the PSU first

return group(
  colorize("#1c1e21", tube([PSU, drop, [BOARD[0], PSU[1], drop[2]], BOARD],
    { r: 1.4, sides: 10 })),
);
```

Two habits that make wiring read as wiring:

- **Leave the run.** A cable never takes the shortest path — give it a rise out
  of the connector and a sag between anchors. One extra point does it.
- **Bundle, don't merge.** Two or three thin tubes side by side read as a loom;
  one fat tube reads as a pipe.

## Printing it

A swept tube printed as-is is a bridge with no support under the bends. For a
part that has to print:

- **Coil it flat** (`helix` with `pitch: 0`) and it prints as a spiral on the
  bed with no supports at all.
- Keep `r` at or above **1.2 mm** — thinner than that and a 0.4 nozzle makes a
  single-wall noodle that snaps.
- If the tube is decoration on a larger print, sink it a little into the body so
  it fuses rather than balancing on the surface.
