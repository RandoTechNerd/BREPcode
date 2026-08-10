---
tag: gridfinity
title: Gridfinity bins & baseplates
match: gridfinity, grid finity, gridfinity bin, gridfinity baseplate, gridfinity grid, drawer organiser, drawer organizer, drawer insert, modular bin, modular storage, storage grid, tool drawer, parts bin
---

**Call for it, do not draw it.** The profile is a stepped chamfer that has to be
exact or nothing seats, and it is already written.

```js
return group(
  gridfinityBin({ x: 2, y: 1, u: 3 }),                            // 2x1 cells, 3u tall
  translate([0, 90, 0], gridfinityBin({ x: 1, y: 1, u: 6, divide: "quad" })),
  translate([120, 0, 0], gridfinityBase({ x: 4, y: 3 })),          // a 4x3 baseplate
);
// gridfinityFit(380, 290) answers "what fits in my drawer" — see below
```

## Someone describes a drawer

This is the usual opening, and the arithmetic has one trap: a bin is **41.5**
across but a **cell is 42**, so the last column still needs a full 42 mm. Always
round DOWN — `gridfinityFit` does, and reports what is left over.

```js
const d = gridfinityFit(380, 290);
// d.x 9, d.y 6, d.cells 54, d.spanX 378, d.spanY 252
// d.leftoverX 2, d.leftoverY 38   <- tell the user; 38 mm is a real gap
return gridfinityBase({ x: d.x, y: d.y });
```

Say the numbers back: *"9 × 6 cells, 378 × 252 mm, leaving 2 mm across and 38 mm
front-to-back — enough that you may want the plate pushed to one side."*
`gridfinityFit(w, d, { margin: 10 })` keeps 10 mm of wiggle room first.

## The numbers (all mm)

| | |
|---|---|
| cell pitch | **42 × 42** — a 2×3 bin spans 84 × 126 |
| bin footprint | **41.5 × 41.5** per cell (0.5 clearance), corner **r 3.75** |
| height unit | **1u = 7**, and `u` counts BODY units |
| bin foot | **0.8** 45° → **1.8** straight → **2.15** 45° = 4.75 tall |
| stacking lip | **0.7** → **1.8** → **1.9** = 4.4, on top of the body |
| baseplate socket | **0.7** → **1.8** → **2.15** = 4.65, opens at the full 42.0 |
| baseplate | 42 per cell, **r 4.0** outer corner, ~5 thick |
| mating clearance | **0.25 on the radius**, where the straight sections meet |

Every chamfer is 45°, so a step's rise IS its change in radius — which is why
all four corner centres sit at **±17.0** at every height, in every profile.

**Height is the thing people get wrong.** `u` is body units and the lip stands
on top: a **2u bin measures 18.4** overall (14 + 4.4), a 3u is 25.4. Stacked,
the upper bin's foot sinks into the lip and the pitch returns to a clean u × 7.
Quote the overall height when you answer.

## Bins

```
gridfinityBin({ x, y, u, wall, floor, divide, lip, solid })
```

- `divide: "split"` two compartments · `"quad"` four · `"thirds"` three ·
  `"six"` 3×2. Or `divX` / `divY` for anything else.
- Dividers stop **under** the lip on purpose — one run up into it would hold the
  next bin off its seat and the stack would rock.
- `lip: false` for a bin that will never be stacked on (it gets 4.4 shorter).
- `solid: true` skips the hollowing, for a fit check.
- `wall` defaults 1.2, `floor` defaults to the plinth + 1.2.

Common heights: **2u** for small parts and hardware, **3u** general purpose,
**6u** for tall things standing up (screwdrivers, markers).

## Baseplates

```
gridfinityBase({ x, y, h })              // h defaults 5, must be >= 4.65
gridfinityBase({ x, y, bottomless: true })   // a FRAME — sockets open through
```

`bottomless` drops the floor under every cell (~a third of the plastic): glue
the frame straight onto the drawer bottom and the drawer becomes the floor.
The seat survives — bins hold exactly as they do in a solid plate.

The socket is **not** the bin's foot grown by a clearance — it has its own
profile, which opens at exactly 42.0 with an r4.0 corner. That is why sockets
meet edge to edge with no flat between them, and why the plate's own outside
corner is r4.0 too.

A bin seated in a plate sits **0.1 mm proud** of the top face: the foot is 4.75
and the socket 4.65, so it rests on its foot rather than on the plate. That is
the standard, not a rounding error.

## Magnets and screws, if asked

Ø6 × 2 magnets in **Ø6.5** pockets **2.4** deep, one per corner of each cell,
centres **4.8** in from the cell edges. Press fit plus a drop of CA; a 0.4 mm
cover layer skips the glue. M3 screws go through the same positions instead.

You have every dimension you need — build it, and state the overall size.
