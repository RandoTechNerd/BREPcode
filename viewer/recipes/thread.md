---
tag: thread
title: Screw threads, jars and lids
match: thread, threads, threaded, screw thread, screw-on, screw on, screw top, screw cap, jar, bottle, threaded rod, leadscrew, lead screw, helix, coil, spring
ask: What diameter and pitch, how long, and how much play between the parts?
---

Threads are **thread()**, an exact solid: the rod (bolt, jar neck) with its
axis on +Z from z = 0 to z = length. Never build a thread from tube(helix()):
that is a round bead, not a tooth, and it used to make the whole model a
triangle mesh.

```js
thread({ d: 8, length: 20 })                       // M8 bolt thread, ISO coarse pitch (1.25)
thread({ d: 40, pitch: 3, length: 9, profile: "round", chamfer: "top" })   // jar neck
thread({ d: 8, length: 7, internal: true })        // the TAP: subtract it from a nut
thread({ d: 40, pitch: 3, length: 9, profile: "round", internal: true, blind: true, clearance: 0.6 })  // lid
```

- **d** is the major (outside) diameter, **pitch** the rise per turn (default:
  ISO coarse for d). **profile**: `"iso"` (60 degree tooth, default), `"round"`
  (a jar or bottle bead, prints without support), `"square"`.
- **The rod is chamfered** at both ends and the tooth stops short of them, so
  a nut starts cleanly and whatever the rod stands on meets a plain cylinder.
  `chamfer: "top"` for a jar neck or a bolt under a head (the joined end
  stays square), `"none"` for neither.
- **internal: true** gives the TAP, the shape to `difference()` out of a nut or
  a lid. It is the matching rod grown by **clearance** (on diameter, like
  clearance(); default 0.4, use 0.4-0.6 for FDM), with a 45 degree countersink
  at each open face. It runs out through z = 0 and, unless **blind: true**,
  through z = length too: a nut's thread opens onto both faces, a lid's stops
  under its top.
- **exact**: see below. **starts: 2** makes a two-start thread (lead = 2 x pitch, a quick jar lid),
  **leftHand: true** a left-hand one.
- Give the bolt and the tap the SAME d, pitch, profile and starts. The fit
  comes from clearance alone.

**Jar and lid.** The jar is a cup with a threaded neck; the lid a cup whose
inside wall is cut by the tap. Overlap the neck 0.5 mm into the body so the
union is a real join, and bore the jar AFTER the union.

```js
const D = 40, PITCH = 3, NECK = 9, PLAY = 0.6;
const jar = difference(
  union(cylinder({ r: 24, h: 60 }),
        translate([0, 0, 59.5], thread({ d: D, pitch: PITCH, length: NECK + 0.5, profile: "round", chamfer: "top" }))),
  translate([0, 0, 2], cylinder({ r: D / 2 - 3, h: 80 })));
const lid = difference(cylinder({ r: 24, h: NECK + 3 }),
  translate([0, 0, -0.01], thread({ d: D, pitch: PITCH, length: NECK + 1, profile: "round", internal: true, blind: true, clearance: PLAY })));
return union(jar, translate([60, 0, 0], lid));
```

A lid prints upside down (open side up) as written. Knurl its outside with
texture() only as the LAST step, after the tap is cut.

**It costs time.** Joining the swept tooth to its core is the slow step on the
exact kernel, and it grows faster than the thread: about 5 s for 2 turns, half
a minute for 6-7. So a thread of up to **4 turns** is exact by default and a
longer one is built as triangles (instant, but a mesh); `exact: true` or
`exact: false` decides for yourself. Keep threads as short as the part needs:
a jar or bottle wants 1.5-2 turns of a coarse 3-4 mm pitch, not eight of 2 mm.
If the kernel refuses one, the thread is built as triangles instead and the
model still builds.

**Coils.** `tube(helix({ r, turns, pitch }), { r: wire })` is an exact coil
(a spring, a coiled cable) as long as the helix goes straight in: it keeps
flat ends. `caps: "round"`, `sides:`, a tapered helix (r2) or a flat spiral
(pitch 0) build the triangle sweep instead.
