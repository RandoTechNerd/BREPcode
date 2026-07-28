---
tag: insert
title: Heat-set threaded inserts
match: heat set, heatset, heat-set, threaded insert, threaded inserts, brass insert, brass inserts, ruthex, voron insert
---

Standard brass heat-set inserts (Ruthex / E3D style). Columns: **thread ·
hole Ø · insert length (typical) · minimum boss Ø**:

- M2: Ø3.2 · 4.0 long · boss 7
- M2.5: Ø3.5 · 4.0 · boss 7.5
- M3: Ø4.0 · 5.7 · boss 8
- M4: Ø5.6 · 8.1 · boss 11
- M5: Ø6.4 · 9.5 · boss 13
- M6: Ø8.1 · 12.7 · boss 16

Rules that make them hold:

- Hole depth = insert length **+1mm** (melt displacement needs somewhere to go —
  a bottomed insert sits proud).
- Wall around the hole ≥ **2mm** everywhere (the boss Ø above gives that).
- Screw must be shorter than hole depth or it jacks the insert back out.
- Model the hole straight; the insert's own taper does the alignment.
- Vertical walls: print the boss solid (no hole shells rattling loose) — in
  BREPcode just difference() the hole, walls come out solid by default.

You have every dimension you need — build it. Do not ask which insert unless
the thread size is genuinely unstated — then assume M3 and say so.
