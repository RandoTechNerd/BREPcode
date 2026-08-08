---
tag: pipes
title: Funnels, spouts, elbows and anything hollow that bends
match: funnel, spout, elbow, pipe, piping, duct, hose barb, nozzle, horn, chute, hopper, drain, adapter, reducer, cone to pipe, bent pipe, 90 degree bend, tubing, conduit, watering can, oil funnel, vase, bottle, goblet, lampshade, revolve, revolved, lathe, turned profile, rotate_extrude
---

Anything hollow that follows a line is **two tubes and a difference**. Not a
stack of hulled discs, not a chain of cylinders — one call for the outside, one
for the bore, subtract.

```js
const IN = 25.4;
const TOP_R = 2.5 * IN / 2;     // bowl opening
const OUT_R = 0.75 * IN / 2;    // spout
const WALL = 2;
const CONE_H = 55, NECK = 8, BEND = 18, SPOUT = 20;

const Z_ELBOW = BEND + OUT_R;          // spout sits on z=0
const Z_CONE  = Z_ELBOW + NECK;
const CORNER  = Z_ELBOW - BEND;        // where the centreline turns

// bowl top -> bowl bottom -> the corner -> out the spout
const path = (ext) => [
  [0, 0, Z_CONE + CONE_H + ext],
  [0, 0, Z_CONE],
  [0, 0, CORNER],
  [-(BEND + SPOUT + ext), 0, CORNER],
];
const radii = (a, b) => [a, b, b, b];   // taper on the first leg only

return difference(
  tube(path(0),   { r: radii(TOP_R, OUT_R),             bend: BEND, sides: 64, caps: "flat" }),
  tube(path(1.5), { r: radii(TOP_R - WALL, OUT_R - WALL), bend: BEND, sides: 64, caps: "flat" }),
);
```

*1,280 triangles, 0.35 s, 90.5 × 69.8 × 90.5 mm.*

## Why this and not hull

The same funnel written the obvious way — discs placed round the arc and
`hull()`ed in pairs — is **8,824 triangles and 16.3 s**. Identical part, 46x the
wait, and about forty lines instead of fifteen. If a taper runs along a path,
it is a sweep. `hull()` is for lofting between profiles that do NOT follow one.

## The four things that go wrong

- **The bore must overshoot both open ends.** `path(1.5)` is the same path with
  the two open ends pushed 1.5 mm further out. An inner tube that stops exactly
  level with the outer leaves two faces in one plane and the kernel drops both,
  which reads as a funnel with a skinned-over mouth.
- **`caps: "flat"`** on both. Round caps put a dome on the mouth of the bowl.
- **The taper belongs to the first leg only.** `[TOP_R, OUT_R, OUT_R, OUT_R]`
  gives cone, then constant pipe. Tapering all four points shrinks the spout to
  nothing.
- **`bend` is the centreline radius of the elbow.** Keep it at least 1.5x the
  pipe radius or the inside of the bend pinches; the default of 3x r is a good
  elbow on its own.

## Vases, bottles, anything you would put on a lathe

**There is no `rotate_extrude()`** — the OpenSCAD translator does not have it, so
a vase written that way builds to nothing and says only that it skipped a module.
Two real routes instead:

- **Straight axis, changing radius** — a vase, bottle, goblet, lampshade — is
  this same `tube()` with a radius list. One call, no bend:
  `tube([[0,0,0],[0,0,20],[0,0,60],[0,0,90]], { r: [30, 44, 26, 34] })`, hollowed
  by a second tube inset by the wall. The radii interpolate, so four numbers give
  a curved silhouette.
- **A profile you actually want to draw** — BREPcode `revolve(angle,
  polygon([...]))` spins a 2D outline about the axis. Use it when the shape has
  a lip, a foot or a bead that a radius list cannot express.

## Variations, all the same shape of code

- **Reducer / adapter** — no bend. Two points, two radii:
  `tube([[0,0,0],[0,0,40]], { r: [12, 6] })`, hollowed the same way.
- **Hose barb** — a straight tube with rings: union the tube with a few short
  `tube()`s of larger radius, or `cylinder()`s, spaced along it.
- **S-bend / trap** — more corners in the same list. Each one rounds itself.
- **Watering-can spout** — a long path with three or four points and a taper
  from the can wall to the rose.
- **Hopper / chute** — a rectangular mouth is not a tube; make the mouth with
  `hull()` of two profiles and join it to a `tube()` for the throat.

Wall **2 mm** for a printed funnel; **1.6 mm** is the floor if it has to flex.
Print mouth-up — the elbow is self-supporting at 3x r, and the spout end is the
only overhang.
