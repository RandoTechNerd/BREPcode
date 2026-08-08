---
tag: shelf
title: The parts shelf — common printed parts, already written
match: standoff, boss, pcb mount, keyhole, wall mount, hang on the wall, zip tie, cable tie, gusset, brace, snap fit, snap hook, snap catch, clip, latch, dovetail, living hinge, hinge, knuckle hinge, enclosure, case, box with a lid, shell, lid, rebate, vent, louvre, louver, air vent, honeycomb, lightening, knob, knurled, handle, drawer pull, hook, coat hook, rubber foot, label plate, nameplate, pillow block, bearing block, shelf, parts shelf, common parts, prebuilt, pre-built, pcb standoff, pcb mount, raspberry pi, arduino, uno, pico, esp32, dev board, port cutout, panel mount, usb cutout, hdmi cutout, gridfinity, gridfinity bin, gridfinity baseplate, storage bin, organiser, organizer, cable clip, bolt circle, slot, elongated hole
---

Parts already written, already building, with the awkward number right. Reach
for one instead of modelling it, then change the options — all parametric.

Anything named `…Slot`, `…Pocket`, `…Hole` or `…Catch` is a **negative you
subtract**. So are `livingHinge`, `lidLip`, `portCutout` and `slot`, plus
`vent` and `honeycomb` unless you pass `{ solid: true }`.

## Mounting

```
standoff({ h: 8, id: 3.2, wall: 2 })          // post with a hole, for a PCB
screwBoss("M3", { h: 9 })                     // boss for a heat-set insert, bore cut
keyholeSlot({ head: 8, shank: 4.2, drop: 12 })  // CUT — hang it on a screw
zipTieSlot({ w: 5, gap: 12 })                 // CUT — a cable tie threads through
cornerGusset({ l: 15, t: 3 })                 // triangular brace, support-free
```

## Joining

```
snapHook({ w: 6, t: 1.6, l: 10, lip: 1.2 })   // cantilever clip with a ramp
snapCatch({ w: 6, lip: 1.2, t: 2 })           // CUT — the window it clicks into
dovetail({ w: 12, neck: 7, d: 6, h: 8 })      // slide-together tongue
dovetailSlot({ w: 12, neck: 7, d: 6, h: 8 })  // CUT — its socket, clearance applied
livingHinge({ l: 40, w: 3, t: 3 })            // CUT — thin the panel to 0.4 so it folds
pinHinge({ len: 40, knuckles: 5, pin: 3 })    // knuckle hinge + pin, printed as one
```

## Enclosure

```
shell({ size: [60, 40, 25], wall: 2, r: 3 })  // hollow box, rounded uprights
lidLip({ size: [60, 40], wall: 2, depth: 3 }) // CUT — rebate so a lid sits IN
vent({ w: 40, h: 20, slot: 3, gap: 3, t: 4 }) // CUT — round-ended louvres
honeycomb({ w: 60, h: 40, cell: 8, wall: 1.6, t: 4 })  // CUT — hex lightening
```

## Handling

```
knob({ d: 30, h: 12, flutes: 12 })            // fluted grip; { bore: 6 } to bore it
handle({ span: 60, rise: 25, r: 5 })          // D handle on two feet
hook({ plate: [30, 4, 40], reach: 30 })       // wall hook with an upturned lip
footPocket({ d: 12, h: 2 })                   // CUT — recess for a stick-on foot
labelPlate({ w: 40, h: 12, t: 1.5 })          // rounded plate to put text() on
```

## Motion

```
bearingBlock("608", { wall: 4 })              // pillow block, bored right through
```

## Electronics

Boards are centred on the origin, so a plate for a Pi is one call at 0,0.
Known boards: **pi4** (also 3 and 5), **pizero**, **pico**, **uno**.

```
pcbStandoffs("pi4", { h: 6 })                 // posts at the board's own holes
pcbPlate("pi4", { t: 3, h: 6 })               // a plate with those posts on it
portCutout("usb-c", { t: 3 })                 // CUT — panel hole, cuts along +Y
```

`portCutout` knows usb-a, usb-c, micro-usb, hdmi, mini-hdmi, rj45, microsd, sd,
xt60, xt30, rocker, barrel, audio, banana, fuse, button12, button16, pot. A
pair is a rectangle, a single number is a round hole; either way the size is
the CUT, already including the clearance a moulded cable shroud needs.

## Storage — Gridfinity

```
gridfinityBin({ x: 2, y: 1, u: 3 })           // 2x1 cells, 3 units tall
gridfinityBase({ x: 2, y: 2 })                // the sockets they drop into
```

## Handling — the rest

```
slot({ d: 4, len: 20, depth: 6 })             // CUT — a screw can slide along it
cableClip({ d: 6, t: 1.6, w: 8 })             // spring clip round a cable
boltCircle(6, 20, cylinder({ d: 3.4, h: 10 }))  // copies evenly round a circle
```

## Putting them together

Ordinary shapes: union them on, subtract the cuts, move them. A box with vents,
feet and a lid rebate is four calls:

```js
const W = 60, D = 40, H = 25;
return difference(
  shell({ size: [W, D, H], wall: 2, r: 3 }),
  translate([0, 0, H], lidLip({ size: [W, D], wall: 2, depth: 3 })),
  translate([0, D / 2, H / 2], rotate([90, 0, 0], vent({ w: 40, h: 12, t: 4 }))),
  ...[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) =>
    translate([sx * (W / 2 - 8), sy * (D / 2 - 8), 0], footPocket({ d: 12, h: 2 }))),
);
```

## The numbers that decide whether it works

- **A snap hook is a spring, and `t` is its stiffness.** 1.6mm in PLA flexes and
  returns; 3mm breaks. Pair it with `snapCatch()` on the same `w` and `lip` —
  that is why the catch takes those arguments rather than its own.
- **A living hinge leaves 0.4mm.** Thicker will not fold, thinner tears. Run it
  along the layer lines, not across them.
- **`shell()` rounds only the uprights** — four hulled cylinders, far cheaper
  than rounding every edge, and a rounded top is rarely what a case wants.
- **`vent()` slots run the SHORT way, round-ended.** Square ends start cracks;
  a long horizontal slot sags as it bridges.
- **`knob()` cuts its flutes**, so the diameter you ask for is what you get.
- **`bearingBlock()` bores right through.** A blind seat traps the bearing
  forever and leaves the shaft nowhere to go.
- **`portCutout()` cuts along +Y, not down Z.** It is the one break in the
  convention, and a deliberate one: a port is always in a vertical wall, and
  making every caller wrap it in a rotate is a rotation to get wrong. Put it at
  the wall's inside face and it runs outward through it. Rectangles get a
  45-degree roof by default so the top edge is not an unsupported bridge.
- **An Arduino Uno's holes are NOT a rectangle.** `pcbStandoffs("uno")` has the
  real four positions; laying them out as a rectangle by eye is the commonest
  reason a printed Arduino case will not close.
- **A Gridfinity bin gets one plinth per CELL.** A 2×1 bin has two, not one
  stretched across — that is what drops into a baseplate. `gridfinityBin()`
  does it; the profile is the published 0.8 / 1.8 / 2.15 stack, and a test
  checks a bin actually seats in a baseplate this code generated. Test-print
  one before committing to a batch if it has to mate with someone else's.

Every part validates its arguments and refuses bad ones by name, so a mistake
is a message rather than a shape that is quietly wrong.
