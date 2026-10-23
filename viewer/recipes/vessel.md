---
tag: vessel
title: Pots, planters, cups, bowls and drip trays
match: planter, plant pot, flower pot, pot, saucer, drip tray, drainage, drain hole, drip hole, vase, cup, mug, bowl, tub, bin, bucket, container, vessel
ask: How big across and how tall, and should it have drain holes and a drip tray?
---

A vessel is an OUTER solid minus a CAVITY. Almost every broken pot is one of
these three mistakes, so check each before you answer:

1. **The cavity starts AT the floor, not at 0.** `translate([0, 0, floor], ...)`
   and it runs past the top (height + 1). A cavity from z = 0 cuts the whole
   floor away and leaves a ring: the "big hole in the bottom".
2. **Drain holes go through the floor only**: small cylinders from z = -1 to
   z = floor + 1, placed inside the cavity's footprint (about 0.4-0.5 of the
   radius from the centre). 5-8 mm each, 1-8 of them. Never subtract anything
   tall from the pot to make a hole.
3. **A drip tray is its own solid with a SOLID floor.** Build it separately
   (outer minus its own cavity starting at `tray_floor`), never cut the pot's
   cavity or holes out of it, and print it beside the pot (translate it clear
   along x) rather than fused underneath. If it must sit under the pot, give
   the pot feet and leave a gap; do not union the two.

Keep the outside plain and EXACT: no texture(), hull() or smooth booleans on
a pot unless asked. Those are triangle meshes: they multiply the triangle
count (a 100k-triangle pot waits behind the Build button and cannot be
checked), a bulge can push the underside below z = 0, and the pot stops being
an exact B-rep solid.

Round pots: cones. `cylinder({ r1: bottom, r2: top, h, $fn: 96 })` for the
outside, the same for the cavity from the floor up. NOT `revolve()` when there
is a centre drain hole: the kernel refuses a hole down a revolve's axis and
the whole pot falls back to the slow kernel. A cone pot builds exact in about
0.1 s.

Polygon pots (hex, octagon): `linearExtrude` a regular `polygon`; an inward
wall of `t` on an n-gon moves the corner radius in by `t / cos(PI / n)`. For
straight walls that is the whole pot (the example below). For a TAPERED
polygon, never a cone with `$fn: 6`
(refused): extrude the polygon at its wider end, then plane each side off
with a big cube tilted to the taper, ONE `difference()` AT A TIME. Handing
difference() all n tilted cubes at once makes the kernel union the
overlapping cubes first: 2.5 s at 12 sides, refused at 4 and 8. One at a
time, every side count builds exact in 0.1-0.3 s:

```js
// apothem a0 at z0 to a1 at z1, n sides, a flat facing the front
const n = 6;
const k = 1 / Math.cos(Math.PI / n);
const ngon = (a) => polygon(Array.from({ length: n }, (_, i) => {
  const t = Math.PI / n - Math.PI / 2 + 2 * Math.PI * i / n;
  return [a * k * Math.cos(t), a * k * Math.sin(t)];
}));
const taperedPrism = (a0, z0, a1, z1) => {
  const h = z1 - z0, big = Math.max(a0, a1) + 1, L = 2 * (big * k + h) + 10;
  const tilt = Math.atan((a1 - a0) / h) * 180 / Math.PI;
  let solid = translate([0, 0, z0], linearExtrude({ h }, ngon(big)));
  for (let i = 0; i < n; i++) solid = difference(solid, rotate([0, 0, -90 + 360 * i / n],
    translate([a0, 0, z0], rotate([0, tilt, 0], translate([0, -L, -L], cube([L, 2 * L, 2 * L]))))));
  return solid;
};
return taperedPrism(40, 0, 50, 80);   // a hex frustum, 80 to 100 across the flats
```

A flared rim on top is a second taper unioned on: start it 1 mm down inside
the body on the same line, and run the body 1 mm past the knee, so the faces
cross. A rim that only touches the body's top edge is refused. The catalog's
plant pot (`sides`, `holes`, `saucer`) is built exactly this way.

Before claiming a fix, state the z-ranges: pot 0..height, cavity
floor..height+1, holes -1..floor+1, tray 0..tray_h with its cavity from
tray_floor. If any cut starts at 0 or below and is wider than a drain hole,
the floor is gone.

Worked example (hex planter, drain holes, separate drip tray):

```js
const R = 60;                       // pot: centre to corner
const height = 90, wall = 2.4, floor = 3;
const holes = 6, hole_d = 6;
const tray_h = 14, tray_floor = 2.4, tray_gap = 1.5;

const hex = (r) => polygon([0, 1, 2, 3, 4, 5].map((i) => [r * Math.cos(i * Math.PI / 3), r * Math.sin(i * Math.PI / 3)]));
const inset = (r, t) => r - t / Math.cos(Math.PI / 6);

const outer = linearExtrude({ h: height }, hex(R));
const cavity = translate([0, 0, floor], linearExtrude({ h: height }, hex(inset(R, wall))));
const drains = [0, 1, 2, 3, 4, 5].slice(0, holes).map((i) => translate(
  [0.45 * R * Math.cos(i * Math.PI / 3 + Math.PI / 6), 0.45 * R * Math.sin(i * Math.PI / 3 + Math.PI / 6), -1],
  cylinder({ r: hole_d / 2, h: floor + 2 })));
const pot = difference(outer, cavity, ...drains);

const TR = R + tray_gap + wall / Math.cos(Math.PI / 6);
const tray = difference(
  linearExtrude({ h: tray_h }, hex(TR)),
  translate([0, 0, tray_floor], linearExtrude({ h: tray_h }, hex(inset(TR, wall)))));

return group(pot, translate([R + TR + 10, 0, 0], tray));
```
