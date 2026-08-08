---
tag: u1
title: Snapmaker U1 (the printer itself)
match: snapmaker, snapmaker u1, u1, u1 printer, tool changer, toolchanger, 4 tool heads, four tool heads
---

The Snapmaker U1 is a **4-tool-head CoreXY colour printer in a boxy open frame**.
This is for modelling the MACHINE — a desk model, a shelf ornament, a scale
prop — not a part for it.

**Confirmed numbers** (these came from OrcaSlicer's own bundled U1 machine
profile and Snapmaker's spec page, and the two agree):

- Build volume **270 × 270 × 270 mm**
- **4 independent tool heads**, 0.4 mm nozzles, a real toolchanger — not one
  hotend fed by a splitter
- CoreXY motion, up to 500 mm/s

**External size — say what you assumed.** Published figures disagree, most
likely because some include the spool tower and some do not: **580 × 540 × 500 mm**
appears alongside **584 × 499 × 730 mm**. Use **580 × 540 × 500** for the body
and add the spools on top if they are wanted, put it in a named const, and say
in one sentence which you used. Do not present it as exact.

Scale it down for a desk model — `const SCALE = 0.15` over real millimetres
reads well at about 87 mm wide — and keep every real dimension in named consts
divided by SCALE so the proportions stay honest.

Shape, front to back:

- **Body**: an upright rectangular box, wider than it is deep, with a clearly
  rounded vertical edge on each corner. `roundedGrow(4, cube([...]))` gives the
  whole thing its soft-cornered look in one step — that is exactly what it is
  for. Round the body BEFORE cutting the window and door.
- **Front**: a large flat door taking up most of the front face, inset a few
  mm, with a slim handle edge down one side. Cut it with a shallow
  `difference()` rather than modelling a hinge.
- **Top**: flat, with **four filament spools** standing on it in a row — short
  wide cylinders, one per tool head. This is the printer's signature: four
  spools, four colours. Colour them differently with `colorize()`; that is the
  whole point of the machine and of the model.
- **Head**: a small carriage block inside near the top, and a bed plate inside
  near the bottom. Both read as "there is a printer in there" from outside; do
  not detail them.
- **Screen**: a small rounded rectangle on the front top-right, `colorize()`d
  dark.

Rules for this model:

- It is an ORNAMENT, so it must print. No floating parts: the spools sit ON the
  top face, the bed sits ON an internal ledge or is merged into the body.
- Return `group(...)` and not `union(...)` — the body, the four spools and the
  screen are separate coloured parts, and group keeps each one's colour into the
  3MF. A union of them all welds the colours away and takes far longer.
- FOUR colours total, across the whole model — not four spool colours plus a
  body colour. The machine has four tool heads, so a fifth colour is assigned to
  a head that does not exist and prints wrong. Share one: a dark body, a dark
  screen and one dark spool are all the same filament, leaving three bright
  spools. That is a real four-filament print.
- Keep it under about 60 primitives; a desk ornament does not need the frame
  extrusions modelled.

You have everything you need — build it, and say in one sentence which external
size you used and that it is scaled.
