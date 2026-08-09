---
tag: machine
title: Machines, gears and mechanisms
match: gear, gears, gearing, geared, gearbox, gear train, cog, cogs, spur gear, ring gear, planetary, rack and pinion, rack, pinion, worm, ratio, reduction, trebuchet, catapult, winch, windlass, crank, crankshaft, escapement, clockwork, automaton, mechanism, mechanical, linkage, pulley, drivetrain, transmission, differential, flywheel, ratchet, pawl, axle, shaft, bearing block, gear ratio, torque
---

**Call for it, do not draw it.** A gear drawn by eye binds or skips, and nothing
in a render shows it. Every gear here has an involute tooth and every position
comes out of `gearMath` / `gearTrain` — you never type a centre distance.

```js
return group(
  gear({ module: 2, teeth: 20, h: 6, bore: 5 }),                     // a spur gear
  translate([50, 0, 0],
    gearWithHub({ module: 2, teeth: 20, h: 6, bore: 5, hub: 12, hubH: 5 })),
  translate([0, 110, 0], ringGear({ module: 2, teeth: 40, h: 6, rim: 4 })),  // teeth INSIDE
  translate([-50, 0, 0], rack({ module: 2, length: 80, h: 6, back: 8 })),    // straight-line travel
  translate([0, -70, 0], gearPair({ module: 2, teeth1: 12, teeth2: 36, h: 6 })),
);
```

## The module is the entire compatibility rule

```
module m = pitch diameter / tooth count
```

Two gears mesh **if and only if** they share a module and a pressure angle
(20° here, and every off-the-shelf gear). Everything else follows:

| quantity | formula | for m=2, z=20 |
|---|---|---|
| pitch diameter | `m·z` | 40 |
| tip (outside) Ø | `m(z+2)` | 44 |
| root Ø | `m(z−2.5)` | 35 |
| **centre distance** | `m(z₁+z₂)/2` | — |
| **ratio** | `z₂/z₁` | — |

So: **pick one module for the whole machine, then choose tooth counts.** Never
pick diameters. Two gears with the "right" diameters and different modules have
teeth of different sizes and will not mesh at all.

## Get the numbers from the code, not from arithmetic

```js
const g = gearMath(2, 12, 36);
// g.centre = 48   g.ratio = 3   g.ratioText = "3:1"   g.reverses = true
// g.warnings = [] — anything worth saying about undercut or printability

// A whole train lays itself out: t.axles is every shaft position, t.ratio is
// FIRST to LAST (see the trap below), plus .reverses, .idlers, .span, .warnings
const t = gearTrain(2, [12, 36, 12, 48]);
return group(...t.axles.map((ax) =>
  translate([ax.x, ax.y, 0],
    gear({ module: t.module, teeth: ax.teeth, h: 6, bore: 5 }))));
```

State the ratio in your reply. "A 3:1 reduction, so three turns of the handle
per turn of the drum" is what the user is actually asking for when they ask for
gears.

## The four things that go wrong

**1. Multiplying the stage ratios.** In a simple train the middle gears cancel:
10 → 30 → 20 is **2:1**, not 6:1. An idler changes *direction*, not ratio —
that is what it is for. `gearTrain().ratio` gets this right. To really compound
a reduction you need two gears **on one shaft**, and then they do multiply.

**2. Forgetting they counter-rotate.** Every external mesh reverses. An odd
number of meshes means the output runs backwards; `.reverses` says so. A ring
gear does *not* reverse — that is when to reach for one.

**3. Too few teeth.** Under **17** at 20° the tooth undercuts: the root is cut
away and the gear is far weaker than it looks. It still turns, so nothing warns
you at the time. `gearMath` reports it in `.warnings`.

**4. Modules too small to print.** Below **m ≈ 0.8** a 0.4 mm nozzle cannot form
a tooth. m 1.0 for a display piece, **m 1.5–2** for a printed mechanism, m 3+
for hand-crank torque and anything you lean on.

## Printing gears

- Backlash defaults to **0.1 mm** and it is doing real work — a nozzle lays a
  bead wider than its path and two nominally perfect flanks jam. Raise to 0.2
  for a first layer that squashes, or a well-used nozzle.
- **Lay gears flat.** Teeth printed on their side are layer lines in shear and
  they strip. Flat also gets the tooth profile from the XY moves, which is the
  accurate axis.
- Give the axle bore **+0.2 mm** to turn freely, **−0.1 mm** to press on. See
  #bearing for a proper bearing seat; a 608 in a gear hub is the usual answer
  for anything that spins under load.
- Tooth counts sharing no common factor ("hunting teeth") spread wear over every
  tooth instead of pounding the same pairs. `gearMath().huntingTeeth` says so.
  12:36 is fine for a toy; 12:37 lasts longer.

## Worked: a trebuchet winch

The user asks for a trebuchet. The arm and frame are ordinary geometry; the part
that needs this page is the **winch that draws the counterweight down**, because
that is where a ratio has to be a real number.

```js
const M = 3;                                  // hand-crank torque
const g = gearMath(M, 10, 50);                // pinion on the crank, gear on the drum
// g.ratio 5, g.centre 90 — five turns of the handle per turn of the drum

const pinion = gear({ module: M, teeth: 10, h: 8, bore: 6 });
const drum   = gearWithHub({ module: M, teeth: 50, h: 8, bore: 8, hub: 20, hubH: 10 });

return group(
  pinion,
  translate([g.centre, 0, 0], rotate([0, 0, 180 / 50], drum)),
);
```

Two things there are not optional. **`g.centre`** — computed, so the frame's
bearing holes cannot be wrong. And the **half-tooth rotation** (`180 / teeth` on
the second gear): without it the gears are drawn tip-to-tip and overlap, which
renders beautifully and is a solid lump of plastic. `gearPair()` does both — do
it by hand only when the gears must be separate objects.

Then say it: *"5:1 — five turns of the handle per turn of the drum, turning the
opposite way."*

## Other mechanisms, briefly

- **Ratchet and pawl.** A winch that does not hold is a machine that hits you.
  Ratchet teeth are **not** involute — asymmetric on purpose: a shallow ramp one
  way, a radial cliff the other. Build it as a `polygon` alternating outer and
  inner radius (0.8 r is a good tooth depth). The pawl is a sprung lever whose
  tip clears the ramp and catches the cliff; give it 0.4 mm on the ramp side.
- **Rack and pinion.** Travel per turn = `π · m · z`, the pinion's pitch
  circumference. A module-2 20-tooth pinion moves 125.7 mm per revolution.
- **Planetary.** `ring = sun + 2 × planet` teeth. Not optional — break it and
  the planets do not fit. Ratio (ring fixed, carrier out) = `1 + ring/sun`.
- **Worm drive.** Not in the DSL: a worm needs a helical sweep. Say so, and
  offer a two-stage spur reduction, which reaches the same ratio and prints.
- **Crank throw** = half the stroke. A 40 mm stroke is a 20 mm throw.

You have everything you need — build it, and state the ratio.
