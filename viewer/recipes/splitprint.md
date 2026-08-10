---
tag: splitprint
title: Splitting a model for printing
match: split, cut, cut in half, separate parts, multi part, multipart, dowel, dowels, pin, pins, alignment pin, registration, glue, glue together, print separately, multi colour, multi color, multicolour, two colour, assembly, build plate, lay out, parts, seam, join, joinery, insert, inlay, socket
---

**Call for it, do not draw it.** The holes for a joint come from ONE call and
are subtracted from BOTH parts, so the two bores are the same bore.

```js
const R = 25, ball = sphere({ r: R, $fn: 48 });
const under = translate([-100, -100, -200], cube([200, 200, 200]));   // z < 0
const lowerHalf = intersection(ball, under);
const upperHalf = difference(ball, under);

const AT = [[0, 0], [14, -9], [14, 9]];         // three points fix a plane
const joint = dowelsOnPlane({ p: [0, 0, 0], ang: 0, at: AT, d: 4, depth: 5 });
return group(
  difference(lowerHalf, joint),                  // the SAME joint...
  translate([0, 60, 0], difference(upperHalf, joint)),   // ...cut from both
  translate([0, -40, 0], dowelPinsFor({ at: AT, d: 4, depth: 5 })),
);
```

Placing the holes twice by hand is how a seam ends up a few tenths out with
nothing to show why.

## Why split at all

- **A colour that needs its own filament** on a single-extruder printer.
- **A seam that would need supports** — cut there and print the face flat.
- **Taller than the bed**, or an overhang no orientation fixes.
- A part that wants to be **a different material** — a clear lens, a soft foot.

Cut where the model ALREADY has an edge: a colour boundary, a plane you cut
with, the line where two shapes meet. A seam on an existing edge disappears;
one across a smooth curve never does.

## The rules that decide whether it goes back together

- **Three pins, not two, and never in a line.** Three points fix a plane. Two
  let it pivot; collinear three do the same.
- **Bore both sides from one call.** `dowelsOnPlane` does this by default —
  that is the whole point of it.
- **Pin shorter than the two bores together.** `dowelPinsFor` makes it
  `depth × 2 − 1`, so the faces close on each other and not on the pin.
- **Print pins lying down.** Standing up they are a stack of discs and snap at
  the first layer line.

Fits are ON DIAMETER: `"snug"` 0.15 (tap in, stays), `"slip"` 0.35 (comes apart
again), `"glue"` 0.30 (the gap IS the glue line), `"steel"` 0.10 (a real 3 mm
pin or a filament offcut).

## Glue-in parts

For an inlay, an eye, a badge — anything that drops into a pocket:

```js
const eye = cylinder({ r: 5, h: 3, $fn: 32 });          // the part that drops in
const body = translate([-15, -15, -8], cube([30, 30, 10]));
return group(
  difference(body, glueSocket(eye, { gap: 0.3 })),      // pocket cut in the body
  translate([0, 40, 0], clearance(0.3, eye)),           // the same grow, on its own
);
```

`clearance()` measures the shape and grows it about its own centre, so the gap
is ON DIAMETER and the part stays where it was. Exact for a box, a cylinder or
a sphere. Do NOT reach for `roundedGrow`/`minkowski` for a fit: a true offset is
the right shape but the wrong engine at a few tenths, where it is slow and often
comes back non-manifold.

On a strongly non-convex part (an L, a star) a measured grow is uneven — and if
the part was BUILT as an intersection, an ellipsoid clipped by a surface, then
rebuilding it with the ellipsoid a fraction larger is both exact and cheaper
than growing the finished patch.

## Laying them out

`onPlate([a, b, c])` MEASURES each part, butts them up along X with a gap, and
stands each one on the bed. Parts of different sizes therefore neither overlap
nor waste plate; `{ gap: 8 }` changes the spacing, `{ spacing: 70 }` forces a
fixed pitch, `{ onBed: false }` leaves heights alone. `layout()` is the same
thing for any row of shapes, not just printed parts.

**Turn each part so its big flat split face is DOWN** — a flat face on the bed
needs no supports and prints the seam crisp, which is why you cut there.

Keep a `SHOW = "plate"` / `"assembled"` switch at the top so the same file can
be checked for fit and then laid out to print. Exporting is then just **Mesh →
3MF, parts laid out**.

## Say what you did

List the parts, what colour each is, how many pins, and what glues to what.
Someone has to print and assemble this; the model alone does not say so.
