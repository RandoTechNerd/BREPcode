---
tag: toolholder
title: Holders and trays for real tools
match: tool holder, tool tray, tool insert, tool organiser, tool organizer, shadow board, shadow foam, screwdriver, pliers, wrench, spanner, allen key, hex key, chisel, drill bit, bit holder, socket set, custom cutout, pocket for
ask: Should it lie FLAT in a scooped pocket, or STAND UPRIGHT in a hole? And is a simple slot fine, or does the pocket need to follow the tool's real outline?
---

**Ask which way up before building it, even if you were given sizes.** Flat and
upright are different objects, not different numbers — a wrong guess is not a
tweak, it is the whole part again. Orientation is not a dimension, so being
handed "2x3, 6u" does not answer it.

If a photo is the only source, read #measuring first — the size has to come
from a reference object, and the third dimension is never in the picture.

## Lying flat

The pocket is the tool's OUTLINE plus clearance, sunk about **half** the tool's
thickness. Half is the whole trick: sink it fully and there is nothing to grip.

- **Clearance 0.6–1.0 mm on each side.** This is a thing being picked up twenty
  times a day with oily hands, not a press fit. `clearance(1.2, tool)` if you
  have the tool as a shape.
- **Cut a finger scoop** across the middle of the pocket — a cylinder lying on
  its side, or a sphere — or the tool cannot be lifted out at all. This is the
  single most common omission, and it makes the holder useless rather than
  imperfect.
- **Depth = half the thickness**, and say the number.

```js
const L = 182, W = 27, T = 22;              // from the photo, via #measuring
const bin = gridfinityBin({ x: 3, y: 1, u: 3 });
const pocket = translate([0, 0, 21 - T / 2],
  roundedGrow(2, cube([L - 4, W - 4, T])));  // outline + clearance, half-sunk
const scoop = translate([L / 2, 0, 18], rotate([0, 90, 0],
  cylinder({ r: 11, h: 40, $fn: 32 })));     // so it can be picked up
return difference(bin, translate([-(L - 4) / 2, -(W - 4) / 2, 0], pocket), scoop);
```

## Standing upright

A hole, not a pocket. The bin must be tall enough that the tool cannot lever
itself out: **at least a third of the tool's length** inside the hole.

- **6u (42 mm) is the standard tall bin** for screwdrivers and markers; go 9u
  or 12u for anything long.
- The hole is the tool's **widest cross-section** plus 1 mm — for a screwdriver
  that is the handle, not the shaft, and the handle is usually fluted, so take
  the widest flute.
- A blind hole a few millimetres above the floor beats one through it: the tip
  sits on plastic instead of on your bench, and the bin still stacks.
- Several tools in one bin: space them by **widest diameter + 4 mm** or knuckles
  will not fit between them.

```js
const bin = gridfinityBin({ x: 2, y: 1, u: 6 });
const hole = (x) => translate([x, 21, 6],
  cylinder({ r: 14.5, h: 40, $fn: 48 }));    // handle Ø28 + 1 clearance
return difference(bin, hole(21), hole(63));  // 42mm apart: Ø28 + knuckle room
```

## Sizing the bin to the tool

Gridfinity cells are **42 mm**. Divide the tool's length by 42 and round UP,
then add a cell if the number lands within 6 mm of the boundary — a 180 mm
screwdriver is 4.3 cells, so 5 across, not 4. Usable inside a bin is about
`42n − 5` after walls.

## Before the full print

Say this whenever the fit matters: print a **10 mm slab with just the cutout**
first. Four minutes, and it settles a fit that a whole holder takes two hours
to get wrong. Then say what you assumed — the sizes, which way up, the
clearance you used, and that the scoop is there so it can be lifted out.
