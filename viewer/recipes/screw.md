---
tag: screw
title: Metric screws, nuts & printed holes (ISO)
match: screw, screws, bolt, bolts, m2, m2.5, m3, m4, m5, m6, m8, countersunk, counterbore, cap head, socket head, hex nut, nut pocket, captive nut, tap, clearance hole, threaded hole
---

**Call for it, do not build it by hand.** `screwHole("M3", { depth, head })`
cuts the clearance hole and its head recess; `{ close: true }` for the tight
clearance, `{ tap: true }` for the self-tapping pilot. `nutPocket("M3")` cuts the
hex pocket at the right across-flats size, `{ captive: true }` adds the slide-in
slot. The numbers below are the ones those functions use — see #parts.


All ISO metric coarse. Columns: **thread pitch · clearance hole (normal) · tight
clearance · screw-forms-its-own-thread pilot (printed plastic)**:

- M2: 0.4 · 2.4 · 2.2 · 1.8
- M2.5: 0.45 · 2.9 · 2.7 · 2.2
- M3: 0.5 · 3.4 · 3.2 · 2.7
- M4: 0.7 · 4.5 · 4.3 · 3.6
- M5: 0.8 · 5.5 · 5.3 · 4.6
- M6: 1.0 · 6.6 · 6.4 · 5.5
- M8: 1.25 · 9.0 · 8.4 · 7.4

**Socket cap heads (DIN 912)** — head Ø × height (= thread Ø), hex key:
M2 3.8×2 (1.5) · M2.5 4.5×2.5 (2) · M3 5.5×3 (2.5) · M4 7×4 (3) · M5 8.5×5 (4)
· M6 10×6 (5) · M8 13×8 (6). Counterbore pocket: head Ø **+0.6**, depth head
height **+0.4** (deeper to fully hide it).

**Countersunk**: 90° cone, top Ø ≈ 2× thread (M3→6, M4→8, M5→10, M6→12).
Model the cone 0.3 deeper than flush so the head never stands proud.

**Hex nuts (ISO 4032)** — width across flats × thickness:
M2 4×1.6 · M2.5 5×2 · M3 5.5×2.4 · M4 7×3.2 · M5 8×4.7 · M6 10×5.2 · M8 13×6.8.
A printed nut pocket: across-flats **+0.3**, depth **+0.3**; across CORNERS =
flats × 1.155 — a hexagonal pocket needs that circumscribed size, a slot-in
side pocket needs flats+0.3 wide. Nut pockets beat printed threads for anything
that gets re-assembled.

Printed threads: fine for M5 and up at 0.2mm layers (model with the pilot Ø
above and let the screw cut); below M5 prefer a nut pocket or heat-set insert.

You have every dimension you need — build it. State which fastener you assumed.
