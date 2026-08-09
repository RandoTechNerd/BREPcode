---
tag: machine
title: Machines, gears and mechanisms
match: gear, gears, gearing, geared, gearbox, gear train, cog, cogs, spur gear, ring gear, planetary, rack and pinion, rack, pinion, worm, ratio, reduction, trebuchet, catapult, winch, windlass, crank, crankshaft, escapement, clockwork, automaton, mechanism, mechanical, linkage, pulley, drivetrain, transmission, differential, flywheel, ratchet, pawl, axle, shaft, bearing block, gear ratio, torque
---

**Call for it, do not draw it.** A gear drawn by eye binds or skips, and a
render cannot show it. Every gear here has an involute tooth, and every position
comes from `gearMath`/`gearTrain` — you never type a centre distance.

`gear({module, teeth, h, bore})` · `gearWithHub({…, hub, hubH})` grub-screw
collar · `ringGear({…, rim})` teeth INSIDE · `rack({module, length, h, back})`
straight-line travel · `gearPair({module, teeth1, teeth2, h})` both, spaced and
interleaved for you.

```js
return gearPair({ module: 2, teeth1: 12, teeth2: 36, h: 6, bore: 5 });
```

## The module is the entire compatibility rule

```
module m = pitch diameter / tooth count
```

Two gears mesh **if and only if** they share a module and a pressure angle (20°
here, and on every off-the-shelf gear). Everything else follows:

| | m=2, z=20 |
|---|---|
| pitch Ø `m·z` | 40 |
| tip Ø `m(z+2)` | 44 |
| root Ø `m(z−2.5)` | 35 |
| **centre** `m(z₁+z₂)/2` · **ratio** `z₂/z₁` | |

So **pick one module for the machine, then choose tooth counts** — never
diameters. Two gears with the "right" diameters but different modules have teeth
of different sizes and cannot mesh.

## Get the numbers from the code, not from arithmetic

```js
const g = gearMath(2, 12, 36);
// g.centre 48  g.ratio 3  g.ratioText "3:1 reduction"  g.reverses true
// g.speedFactor 0.333 — output turns per input turn
// g.warnings [] — anything worth saying about undercut or printability

// A train lays itself out — .axles, .ratio (FIRST to LAST, see below),
// .reverses, .idlers, .span, .warnings
const t = gearTrain(2, [12, 36, 12, 48]);
return group(...t.axles.map((a) =>
  translate([a.x, a.y, 0], gear({ module: t.module, teeth: a.teeth, h: 6 }))));
```

State the ratio — "3:1 reduction, three turns of the handle per turn of the
drum" is what someone asking for gears wants to know.

## Which way does the drive go? Decide this first

Decide whether the machine wants **torque or speed** first. They are opposite
arrangements; backwards builds a centrifuge that will not spin.

| you want | small drives big | big drives small |
|---|---|---|
| | **reduction** — torque | **step-up** — speed |
| examples | winch, hoist, jack, clock hands | centrifuge, drill, fan, flywheel |
| output | slower, stronger | faster, weaker |

```
gearMath(1.5, 10, 50).ratioText  ->  "5:1 reduction"   a winch
gearMath(1.5, 51, 17).ratioText  ->  "3:1 step-up"     a centrifuge
```

Quote `ratioText`. `speedFactor` is **output turns per input turn** — 3 above,
so "three turns of the rotor per turn of the handle".

One spur stage buys **3–4×** before the big gear stops being "mini": 4:1 at
module 1.5 needs a 68-tooth gear 105 mm across. For more, two stages **on a
shared shaft**, where the ratios really do multiply.

## The four things that go wrong

**1. Multiplying the stage ratios.** In a simple train the middle gears cancel:
10 → 30 → 20 is **2:1**, not 6:1. An idler changes *direction*, not ratio — that
is what it is for. Use `gearTrain().ratio`. To really compound, put two gears
**on one shaft**; then they do multiply.

**2. Forgetting they counter-rotate.** Every external mesh reverses; an odd
number of meshes means the output runs backwards. `.reverses` says so. A ring
gear does *not* reverse — that is when to reach for one.

**3. Too few teeth.** Under **17** at 20° the tooth undercuts: the root is cut
away and the gear is much weaker than it looks. It still turns, so nothing warns
you — `gearMath` reports it in `.warnings`.

**4. Modules too small to print.** Below **m ≈ 0.8** a 0.4 mm nozzle cannot form
a tooth. m 1.0 for display, **m 1.5–2** for a mechanism, m 3+ for hand torque.

## Printing gears

- Backlash defaults to **0.1 mm** and earns it: a nozzle lays a bead wider than
  its path, and two perfect flanks jam. 0.2 for a squashed first layer.
- **Lay gears flat.** On their side the layer lines are in shear and the teeth
  strip; flat also cuts the profile with XY moves, the accurate axis.
- Axle bore **+0.2 mm** to turn, **−0.1 mm** to press on.
- Tooth counts sharing no factor ("hunting teeth") spread wear over every tooth
  — `gearMath().huntingTeeth`. 12:36 suits a toy; 12:37 lasts longer.

## Placing two gears yourself

When the gears are **separate objects** — a crank gear and a rotor that print
apart — two things are not optional:

```js
const g = gearMath(3, 10, 50);            // a trebuchet winch: 5:1 reduction
return group(
  gear({ module: 3, teeth: 10, h: 8, bore: 6 }),
  translate([g.centre, 0, 0],             // computed, never typed
    rotate([0, 0, 180 / 50],              // HALF A TOOTH, or they collide
      gearWithHub({ module: 3, teeth: 50, h: 8, bore: 8, hub: 20, hubH: 10 }))),
);
```

**`g.centre`**, so the frame's bearing holes cannot be wrong, and the **half
tooth** of rotation (`180 / teeth`) so the teeth interleave — without it they
are drawn tip-to-tip and overlap, which renders beautifully and is a lump.

## It is not only the gears

None of this shows in a render; all of it decides whether the thing works:

- **A bearing or generous journal** — a rotor on a bare printed hole wears oval
  in a week. #bearing: a 625 (5 mm bore) or 608 (8 mm) in a seat.
- **Clearance between parts that MOVE past each other**, not just ones sitting
  still. Sweep the handle through a turn and check what it passes; state the
  running clearances.
- **A lid** if it can throw what it holds.
- **Gears are slow to build** — two is most of a minute in the browser. Normal,
  not a hang, but say so before the user wonders.

## Other mechanisms

| | |
|---|---|
| **rack travel** | `π · m · z` per turn — module 2, 20 teeth = 125.7 mm |
| **planetary** | `ring = sun + 2 × planet` teeth, not optional. Ratio (ring fixed, carrier out) = `1 + ring/sun` |
| **ratchet** | teeth are NOT involute — a ramp one way, a cliff the other. `polygon` alternating outer and 0.8× inner radius; the pawl clears the ramp by 0.4 mm |
| **worm drive** | not in the DSL (needs a helical sweep). Say so, offer a two-stage spur reduction |
| **crank throw** | half the stroke |

You have what you need — build it, and state the ratio.
