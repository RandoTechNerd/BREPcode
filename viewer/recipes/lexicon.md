---
tag: lexicon
title: Plain English to geometry
match: punch, bite, hollow, shell, round the edges, round the corners, rounded, smooth it, soften, bevel, chamfer, slant, on top, attach, stack, mount on, floor, bed, ground, centre, center, align, line up, flush, coincident, z-fighting, epsilon
---

Beginners describe the *result*, not the operation. Map the phrase, then build.

| They say | It means | Write |
|---|---|---|
| punch a hole, cut the middle, take a bite out of | boolean subtraction | `difference(part, cutter)` |
| make it hollow | shell to a wall thickness | `difference(outer, inner)` — see below |
| round the edges, smooth it, soften it | fillet | `fillet(r, part)` |
| bevel, slant the edge | chamfer | `chamfer(d, part)` |
| put it on top, attach to the side | place against a measured face | `translate([…], shape)` off the bounding box |
| drop it to the floor | base to z = 0 | `translate([0, 0, -minZ], part)` |
| centre it, align them | match centroids | `translate([-cx, -cy, 0], part)` |

## The epsilon rule — this one is not optional

A cutter whose face lands exactly on the solid's face is a **coincident face**.
The kernel may or may not resolve it, and a slicer will cheerfully print a thin
skin across the "hole". It looks correct in the viewer and fails on the printer,
which is the worst kind of wrong.

**Every subtractive body must overshoot every surface it breaches.**

```js
const EPS = 0.01;                    // enough to break the tie, too small to see
const plate = 10;

difference(
  cube([40, 40, plate]),
  // starts EPS BELOW the bottom, runs EPS PAST the top
  translate([20, 20, -EPS], cylinder({ r: 4, h: plate + EPS * 2, $fn: 64 })));
```

Never write `h: plate` for a through hole. Never start a through cutter at `z: 0`.
A blind hole (one that stops inside) overshoots only the face it enters — the
closed end is *meant* to be inside the material.

## Hollowing

BREPcode has no shell operator, so hollow is a subtraction and the wall thickness
is yours to state:

```js
const wall = 2.4, w = 60, d = 40, h = 30;
difference(
  cube([w, d, h]),
  // inset by `wall` on all four sides and the floor; open at the top, so the
  // inner box overshoots the top face by EPS
  translate([wall, wall, wall],
    cube([w - wall * 2, d - wall * 2, h - wall + EPS])));
```

Wall 2.4mm is a sound default (three passes of a 0.4mm nozzle). Say which face
you left open — "open at the top" — because that is the thing the user cannot
see from the code at a glance.

## Placing one shape against another

Prefer measuring the part you already have over inventing coordinates:

```js
const baseW = 40, baseH = 12;
union(
  cube([baseW, baseW, baseH]),
  // ON TOP means starting exactly where the base ends
  translate([baseW / 2, baseW / 2, baseH], cone({ r1: 12, r2: 0, h: 20 })));
```

For a union, a **small overlap is a feature** — sink the added shape ~0.5mm into
the base so the two are certainly one solid rather than two touching at a plane.

"Attach to the right" is `translate([baseW, …])`, "to the front" is negative Y.
Work from the same named variables that built the part, so changing one number
still moves everything that depends on it.

## Never emit broken code

- Every parameter gets a real number. No undeclared variables, ever — a model
  that throws is worse than one with a size the user has to correct.
- **Nothing specified at all** ("a box with a hole in it"): pick proportionate
  values — 100 × 100 × 100 with a 50mm hole — and say what you chose in one
  sentence.
- **Partly specified** ("a 50mm cylinder with a hole"): derive the rest from
  normal proportions — height about twice the radius, a hole about a third of
  the diameter — and state those too.
- Put every size in a named `const` at the top so the user can change one number
  instead of hunting through the geometry.
- Comment the *why*, not the *what*: `// EPS so the cutter breaches both faces`
  teaches something; `// make a cylinder` does not.
