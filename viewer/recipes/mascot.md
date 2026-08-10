---
tag: mascot
title: Mascots, logos & figurines
match: mascot, logo, character, figurine, bobble, bobblehead, toy, orca, penguin, blob character, cute, kawaii, chibi, plush, cartoon
---

Turning a 2D logo into a 3D character is mostly THREE techniques. Everything
else is spheres.

## 1. The head is the SAME sphere, shifted — not a smaller one on top

The single biggest mascot mistake, and it cost a real logo nine versions: a
smaller "head" sphere on the body reads as a snowman, and no amount of eye and
fin work rescues it. A character whose head OVERHANGS — chin jutting past the
body — is one ball plus a cap cut from an EQUAL sphere shifted forward and
down. Same radius means the cap keeps the body's own curvature, so it reads as
one form; the shift is what makes the chin hang. Cut cap and body apart with
tilted planes (big rotated cubes) and the gap between them is the logo's
background notch, for free.

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
