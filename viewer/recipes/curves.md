---
tag: curves
title: Curved outlines that build fast
match: arc, arcs, curved, curve, curves, window, windows, spoke, spokes, sector, sectors, annular, crescent, kidney, bezier, swept edge, curved slot, arc slot, build is slow, builds slowly, slow build, takes too long, speed it up, faster build, build faster
---

The exact kernel costs per FACE. Every point of a `polygon()` outline is a
flat face, and every boolean after it has to cut each of them. A curve
sampled into 20+ points is the slowest thing you can hand it, even though it
stays on the exact lane and looks fine. Write the curve as a curve.

**An arc between two radii** (a window in a plate, a sector, a kidney slot
without round ends) is a ring cut by two rotated box corners: true arcs, two
cylinder faces. Up to 90 degrees per sector; a wider one is two sectors
side by side.

```js
// the sector r0..r1, a0..a1 degrees, z0..z1
function arcSector(r0, r1, a0, a1, z0, z1) {
  const h = z1 - z0, big = r1 * 3;
  const ring = translate([0, 0, z0], difference(cylinder({ r: r1, h, $fn: 96 }),
    translate([0, 0, -1], cylinder({ r: r0, h: h + 2, $fn: 96 }))));
  const corner = (a) => rotate([0, 0, a], translate([0, 0, z0 - 1], cube([big, big, h + 2])));
  return intersection(ring, corner(a0), corner(a1 - 90));
}
// a 4 mm plate with eight arc windows
const plate = difference(cylinder({ r: 60, h: 4, $fn: 96 }), cylinder({ r: 20, h: 10, $fn: 96 }));
return difference(plate, ...Array.from({ length: 8 }, (_, i) => arcSector(30, 50, i * 45 + 8, i * 45 + 37, -1, 5)));
```

A curved slot with round ends is that sector plus a cylinder at each end.

**A free curved edge** (a swept spoke, a lobe, a flowing outline) is
`path2d([x, y], ..., bezierTo(c1, c2, p), ...)`. A handful of curves per side
is enough: 6 curves held a swept window edge within 0.01 mm of the 24-point
polygon it replaced. Take each curve's handles from the direction of travel
at its two ends, a third of the segment long.

Measured on a motor assembly, same shape both ways:

| Part | As polygons | As curves |
|---|---|---|
| plate with 12 arc windows | 34 points each, 44 s | ring-and-corner sectors, 4 s |
| lid with 12 swept windows | 24 points per edge, 14.5 s | 6 bezierTo per edge, 2.1 s |

Volumes matched within 0.04%. Keep hand-written polygons to the real corners
of the part: a hexagon is 6 points, a gear tooth profile a few dozen at most.
Anything that is "a smooth curve" should never be a list of points.
