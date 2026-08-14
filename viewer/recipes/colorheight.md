---
tag: colorheight
title: Colour by height, and sealing a model
match: colour by height, color by height, colour bands, color bands, banded, rainbow, gradient, layer colour, layer color, colour change, color change, change filament, two tone, two-tone, ombre, stripe, striped, multi colour print, multi color print, airtight, air tight, watertight, water tight, sealed, seal, manifold, non-manifold, leak, leaks, holds water, hollow vessel
---

Two requests that sound unrelated and are actually the same fork in the road:

| you want | you need |
|---|---|
| separate colours / separate filaments | `group()` — separate solids |
| one airtight body | `union()` — fused into one |

You cannot get both from the same call. Everything below follows from that.

## Colour in bands up the model

**Call it, do not build it.**

```js
const model = union(cube([40, 40, 30]), translate([0, 0, 30], cylinder({ r: 20, h: 20 })));

return colorByHeight({ every: 10, colors: ["#e33333", "#3399ff"] }, model);
```

A band every 10mm from the **bottom of the model**, colours cycled. Or name the
cuts:

```js
const model = union(cube([40, 40, 30]), translate([0, 0, 30], cylinder({ r: 20, h: 20 })));
return colorByHeight({ at: [8, 22], colors: ["#e33333", "#3399ff", "#33cc55"] }, model);
```

One more colour than cuts. Heights are always measured from the bottom, because
that is how people say it — "red for the first 10mm" means from where it stands
on the bed. The model is measured at build time, so nothing has to be told how
tall it is; a cut above the top is simply ignored.

### The trap this function exists to close

Written by hand, it comes out like this:

```js
const model = union(cube([40, 40, 30]), translate([0, 0, 30], cylinder({ r: 20, h: 20 })));
const slab = (z0, z1) => translate([-100, -100, z0], cube([200, 200, z1 - z0]));
return union(                             // WRONG — one solid comes out
  colorize("#e33333", intersection(model, slab(0, 25))),
  colorize("#3399ff", intersection(model, slab(25, 50))),
);
```

It builds. Nothing errors. Both colours are on the tree. And the model is one
colour, because **`union()` fuses its arguments into a single solid** — one body
to paint, one object in the 3MF, one filament on the printer. Measured on a
50mm test model: `union` gives 1 solid, `group` gives 2.

So bands must stay separate solids. `colorByHeight` does that; if you ever write
it out longhand, it is `group(...)`, never `union(...)`.

### What comes out

Two or more colours export as a 3MF colour group, so a multi-material printer
assigns a filament per colour. Say how many filaments the print needs and which
colour goes where — that is the part someone has to act on.

## Sealing a model

**A model built here is already sealed.** BREPcode primitives and booleans go
through a solid kernel, which cannot produce an open body. If the model was
built in the editor, there is nothing to add — say so rather than inventing a
fix.

The cases that are genuinely open:

- **An imported mesh.** The app checks it on import and says whether it is
  watertight; when it is not, a **Repair** button appears that closes the holes.
  Use that. It is not something to patch triangle-by-triangle in code, and once
  repaired the mesh booleans like anything else.
- **Pieces that only touch.** Two solids meeting exactly at a face may not fuse
  cleanly. Overlap them by 0.1–0.5mm before `union()` and the join is solid.
- **A `group()` you meant to be one body.** Grouping keeps pieces separate on
  purpose. If the thing has to hold air or water, it is a `union()`.

For a container, the wall matters more than the seal: 1.6mm or more (four
perimeters) and no gaps in the floor. Say the wall thickness you used.

## Doing both at once

A vessel that must be watertight *and* two-tone is a real request, and the
answer is to seal first and band second — `colorByHeight` cuts a finished solid,
so the body is already closed before it is sliced into colours:

```js
const outerShell = difference(cylinder({ r: 30, h: 60 }), translate([0, 0, 2], cylinder({ r: 28.4, h: 60 })));
const base = cylinder({ r: 30, h: 2 });
const body = union(outerShell, base);          // one sealed solid first
return colorByHeight({ at: [12], colors: ["#2b6cb0", "#e2e8f0"] }, body);
```

The bands are separate solids, but each one is a closed piece of a body that was
watertight before it was cut, and they share exact faces at the cut — which is
what a multi-material slicer wants anyway.
