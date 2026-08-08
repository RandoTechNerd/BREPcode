---
tag: parts
title: Standard hardware — bearings, screws, inserts, nuts, magnets
match: bearing, 608, 623, 625, 626, 688, 6800, ball bearing, screw, bolt, m2, m2.5, m3, m4, m5, m6, m8, clearance hole, tap hole, tapping, countersink, countersunk, counterbore, socket head, cap screw, button head, heat set, heat-set, threaded insert, brass insert, nut, hex nut, captive nut, nut trap, nut pocket, magnet, neodymium, fastener, hardware, screw hole, pilot hole
---

**Do not recall these numbers — call for them.** Every size below is in the code
already, with the fit allowance applied. `screwHole("M3")` is 3.4 whether or not
you remember that 3.4 is the clearance and 3.2 is the close fit.

## The two shapes, and why they are never the same size

Each fastener has a **part** and a **pocket**. The part is what you buy; the
pocket is the hole you cut for it, and it is deliberately bigger. Subtracting
the part instead of the pocket makes a hole the hardware cannot enter — the
commonest way a printed assembly fails at the last step.

```js
difference(
  cube([40, 40, 10]),
  translate([20, 20, 3], bearingPocket("608")),     // the SEAT
  translate([8, 8, 10], screwHole("M3", { depth: 10, head: "socket" })),
  translate([32, 8, 10], insertBore("M3")),
);
```

## What is in the tables

- **Bearings** (bore/OD/width): 608 (8/22/7), 623 (3/10/4), 624 (4/13/5),
  625 (5/16/5), 626 (6/19/6), 627 (7/22/7), 688 (8/16/5), 6001 (12/28/8),
  6201 (12/32/10), 6800 (10/19/5), 6801 (12/21/5), 6802 (15/24/5),
  6803 (17/26/5), MR105 (5/10/4), MR115 (5/11/4), MR126 (6/12/4).
- **Screws**: M2, M2.5, M3, M4, M5, M6, M8 — clearance, close fit, self-tap
  pilot, metal tap drill, pitch, hex key, hex nut size, and socket / button /
  countersunk head figures for each.
- **Inserts**: M2, M2.5, M3, M4, M5, M6 brass heat-set, with the minimum boss
  diameter that leaves 2mm of wall.

An unknown size throws and lists the real ones, so a wrong guess is a message
rather than a wrong part.

## The calls

```js
bearing("608")                       // the bearing, for a fit check
bearingPocket("608")                 // press seat: +0.1 on diameter, 0.2 deeper
bearingPocket("608", { slip: true })      // +0.3 instead — turns freely
bearingPocket("608", { through: true })   // + a rod hole to push it back out

screwHole("M3", { depth: 12 })                       // 3.4 clearance
screwHole("M3", { depth: 12, close: true })          // 3.2, when position matters
screwHole("M3", { depth: 12, tap: true })            // 2.7 pilot, to self-tap into
screwHole("M3", { depth: 12, head: "socket" })       // + a 6.1 counterbore, 0.4 deep
screwHole("M3", { depth: 12, head: "flat" })         // + a real 90 degree cone
insertBore("M3")                     // 4.0 x 6.7 deep
nutPocket("M3")                      // 5.8 across the FLATS
nutPocket("M3", { captive: true, slot: 20 })   // + a slide-in slot
magnetPocket(6, 3)                   // a 6x3 disc, 6.25 x 3.2
screw("M3", { length: 12 }), nut("M3")         // for an exploded view
```

**`screwHole` cuts DOWNWARD from z=0.** Place it where the head goes and the
shaft runs into the part — which is how anyone describes it out loud, and means
you position one point rather than two.

## The four things that go wrong

- **A pocket is not a part.** See above. If in doubt, the one ending in
  `Pocket` or `Bore` or `Hole` is the one you subtract.
- **A nut is measured across the FLATS.** 5.5 for an M3 — but a hexagon built
  from a radius of 5.5/2 comes out 13% too small, because that radius gives you
  across-flats of 4.8. `nutPocket()` does the `/cos(30°)` for you. It also turns
  the hexagon 30° so the flats face a captive slot: unturned, the nut's corners
  bind on the slot walls, which measured as 0.4mm³ of nut left outside the
  pocket — a part that assembles in CAD and not on the bench.
- **An insert bore is the insert's OWN diameter, not smaller.** 4.0 for an M3,
  cut 1mm deeper than the insert is long so the melt has somewhere to go.
  The knurl displaces plastic sideways as it sinks; starting undersize squeezes
  the melt up around the rim and leaves the insert standing proud.
- **A bearing seat wants +0.1 on the diameter and no more.** 0 is a hammer
  job; +0.3 is the SLIP fit and lets the outer race turn in the plastic, which
  destroys the seat in an hour of running if you meant it to be pressed. Ask
  for `{ slip: true }` when turning is the point.

## Fits, all overridable

`FIT` holds them, all **on diameter** — the way a supplier states a fit, and
the way you would say it out loud. Bearing press +0.1, bearing slip +0.3,
magnet +0.25, nut +0.3 across flats, insert 0 (it melts its own), counterbore
+0.6 wide and 0.4 deeper than the head, countersink 0.3 below flush.

Per side is the trap: halving one of these gives a bearing that will not press
in, doubling it gives one that spins in its seat and chews the plastic out.
Pass `{ fit: 0.15 }` to any pocket to change one — worth doing, and worth
SAYING you did, because the right number depends on the printer.

Boss walls round an insert or a bearing: **2mm minimum**, 3 if it takes load.
