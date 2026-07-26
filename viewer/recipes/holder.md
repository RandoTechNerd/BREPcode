---
tag: holder
title: Holders, stands, docks, caddies
match: holder, holds, stand, dock, caddy, cradle, tray, organizer, organiser, rack, mount for, container for, box for, case for, sleeve for
ask: What is it holding, and roughly how big is that thing (diameter or width x depth, and height)?
---

Any "holder / stand / dock / caddy for X":

1. Cavity = X's cross-section **+ 0.4-0.8mm clearance per side**. Use 2-3% instead
   for soft or varied items (brushes, cables, hand-cut foam).
2. Wall >= 2.4mm around the cavity. Floor >= 3mm.
3. Overall height ~40-70% of X, so it grips the item without hiding it.
4. Base wider than tall wherever the design allows — a holder that tips over is
   worse than no holder.
5. Chamfer 0.8-1.5mm or fillet the top rim so the item drops in without catching.
6. If X can trap water (brushes, razors, cutlery): a 6-10mm drain hole through
   the floor.

Deliver it parametric: `cavityDia` (or `cavityW`/`cavityD`), `wall`, `depth` as
named variables at the top.

**Multiple bays**: keep one shared outer wall and divide with internal ribs of
the same wall thickness — do not butt separate boxes together, it doubles the
material and the footprint for no gain.
