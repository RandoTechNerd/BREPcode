---
tag: mascot
title: Mascots, logos & figurines
match: mascot, logo, character, figurine, bobble, bobblehead, toy, orca, penguin, blob character, cute, kawaii, chibi, plush, cartoon
---

Turning a 2D logo into a 3D character is mostly THREE techniques. Everything
else is spheres.

## 1. ONE sphere, sliced, with a slice slid — never a second sphere

The single biggest mascot mistake, and it cost a real logo nineteen versions
before it came out: any second ball added for a "head" reads as a snowman, and
no amount of eye and fin work rescues it. Two overlapping circles in a flat
logo, sharing an outline with no seam between them, are ONE sphere that has
been cut — not two spheres that have been stacked.

So: build one ball. Cut it with two tilted planes (huge rotated cubes) into
bottom, middle and top. Then TRANSLATE the top slice up and along. That single
move does all the work at once — the top overhangs on one side, notches on the
other, and the middle slice shows between them as the logo's colour band. Every
piece keeps the original ball's curvature, because every piece IS the original
ball.

```js
const R = 25, ball = sphere({ r: R, $fn: 64 });
const half = (p, ang) => translate(p, rotate([0, -ang, 0], translate([-300, -300, -600], cube([600, 600, 600]))));
const cap  = intersection(ball, half([0, 0, 0], 34));            // top slice
const band = difference(intersection(ball, half([0, 0, 0], 22)), half([0, 0, 0], 34));
return group(
  translate([14, 0, 5], cap),                                    // THE slide
  band, difference(ball, half([0, 0, 0], 22)),
);
```

Two planes through a common point make a wedge that tapers to nothing — that
is how a sash or swoosh comes to a POINT at one end, and the shared point is
what decides where. If a slice ends up proud of a neighbour, do not nudge it:
work out where the plane leaves the ball and put the edge there.

Reserve two different-sized spheres for characters that really have a neck.
And check the SILHOUETTE, not the iso view — a logo is a silhouette.

## 2. A curl is a hull-chain, and it has three rules

Tails, quiffs, fins, flames — anything that sweeps and tapers:

```js
const blob = (p, r) => translate(p, sphere({ r, $fn: 24 }));
const curl = union(
  hull(blob([3, 0, 55], 8),      blob([-1, 0, 62], 6)),
  hull(blob([-1, 0, 62], 6),     blob([-6, 0, 66], 4.6)),
  hull(blob([-6, 0, 66], 4.6),   blob([-12, 0, 68], 3.4)),
  hull(blob([-12, 0, 68], 3.4),  blob([-18, 0, 66], 2.3)),
  hull(blob([-18, 0, 66], 2.3),  blob([-23, 0, 62], 1.0)),
);
return union(translate([0, 0, 48], sphere({ r: 18, $fn: 48 })), scale([1, 0.78, 1], curl));
```

- **Centres ON the spine.** Three to six blobs following the curve, hulled in
  PAIRS. Blobs in a straight line squashed hard afterwards is how a fin comes
  out a paper shard.
- **Radii taper** (8 → 1): the base buries in the body, the tip is a point.
- **The tip DROPS.** The last two centres descending past horizontal is what
  turns a horn into a wave-crest flick, and leaves the notch of background
  under the tip that the logo has.
- Squash the whole union a little (`scale([1, 0.78, 1], …)`) for a blade —
  never to 0.6, which flattens every blob into a lens.

## 3. Details are surface patches, not spheres poking out

An eye, a cheek spot, a badge: intersect an ellipsoid with a *slightly grown
copy* of the surface it sits on. The result is a thin sticker that hugs the
curve, standing proud by exactly the grow amount.

```js
const head = translate([0, 0, 46], sphere({ r: 18, $fn: 48 }));
const eye = intersection(
  translate([0, 0, 46], sphere({ r: 18.6, $fn: 48 })),          // grown +0.6
  translate([0, 13, 53], rotate([28, -42, 0],
    scale([1.5, 1, 0.7], sphere({ r: 4.6, $fn: 32 })))),
);
return group(head, eye);
```

A white sphere half-buried instead reads as a golf ball stuck on. The grow is
0.4–0.8 mm: visible as a printed layer step, invisible as a lump.

## 4. Colour bands are plane cuts of the SAME sphere

A sash or belly panel: intersect the body with half-spaces (huge rotated
cubes), giving each slice its own colour. Two edges at different angles make
the band taper like a brushstroke. Overlap the cuts by ±0.05 into their
neighbours — exactly coincident faces flicker and can leave hairline gaps.

In OpenSCAD, top-level siblings with different `color()`s stay SEPARATE solids
here — one filament each in the 3MF — which is what a multi-colour toy wants.
Do not wrap them in union() unless you want one single-colour part.

## Cost, so nobody thinks it crashed

Organic models are the expensive kind: every hull of two $fn-40 spheres is
real kernel work, and a character is dozens of them. A bobble at $fn 64 takes
**~30 s** — normal, say so. Keep hulled blobs at **$fn 24** (the hull skins
them; the facets never show) and only the big body spheres at 48–64. Iterate
at $fn 32, raise it once when the shape is right.

Say what you assumed (height, which side the flick curls) — and check the
SILHOUETTE against the logo before polishing anything else.
