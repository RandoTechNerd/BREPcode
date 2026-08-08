---
tag: shelf
title: The parts shelf — common printed parts, already written
match: standoff, boss, pcb mount, keyhole, wall mount, hang on the wall, zip tie, cable tie, gusset, brace, snap fit, snap hook, snap catch, clip, latch, dovetail, living hinge, hinge, knuckle hinge, enclosure, case, box with a lid, shell, lid, rebate, vent, louvre, louver, air vent, honeycomb, lightening, knob, knurled, handle, drawer pull, hook, coat hook, rubber foot, label plate, nameplate, pillow block, bearing block, shelf, parts shelf, common parts, prebuilt, pre-built
---

Twenty-one parts that are already written, already build, and already have the
awkward number right. Reach for one instead of modelling it — then change the
options, because every one is parametric.

Anything named `…Slot`, `…Pocket`, `…Hole` or `…Catch` is a **negative you
subtract**. Four more are cuts without saying so in the name: `livingHinge`,
`lidLip`, `vent` and `honeycomb` — the first two always, the last two unless
you pass `{ solid: true }`.

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

## Putting them together

Shelf parts are ordinary shapes — union them on, subtract the cuts, move them
where you want. A box with vents, feet and a lid rebate is four calls:

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
  returns; 3mm does not bend, it breaks. Always pair it with `snapCatch()` using
  the same `w` and `lip` — that is the whole reason the catch takes those
  arguments instead of its own.
- **A living hinge leaves 0.4mm.** Thicker will not fold, thinner tears on the
  first bend. It must run along the layer lines, not across them.
- **`shell()` rounds only the uprights.** That is deliberate: four hulled
  cylinders build in a fraction of the time of rounding every edge, and a
  rounded top edge is not usually what an enclosure wants.
- **`vent()` slots run the SHORT way and are round-ended.** A square end starts
  a crack; a long horizontal slot sags as it bridges.
- **`knob()` cuts its flutes.** So the diameter you ask for is the diameter you
  get — adding flutes instead would make it bigger than you said.
- **`bearingBlock()` bores right through.** A blind seat traps the bearing
  forever and leaves the shaft nowhere to go.

Every part validates its arguments and refuses bad ones by name, so a mistake
is a message rather than a shape that is quietly wrong.
