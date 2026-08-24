---
tag: organic
title: Organic shapes — creatures, mascots, blends
match: creature, character, mascot, animal, snowman, blob, blobby, metaball, metaballs, organic, fleshy, cute, chibi, plush, squishy, monster, ghost, gnome, duck, teddy, bear, bunny, cat figure, dog figure, figurine, smooth blend, smooth union, melt together, melted, soft join
---

Bodies are not assemblies. `union()` puts a crease exactly where two shapes
cross — right for a bracket, wrong for a wrist. The organic ops blend
distance fields instead, and the fillet **shapes itself**: widest where the
surfaces meet at a shallow angle, tighter head-on. Nobody places that radius.

## The cheapest creature: blob()

Metaballs — spheres that melt together wherever they come near. Sketch the
body as balls, let the blends do the sculpting:

```js
// a duck: body, head, two cheek bulges, tail nub
return blob([
  [0,   0,  12, 14],     // body
  [12,  0,  28,  8],     // head, forward and up
  [17,  4,  27,  3],     // cheeks
  [17, -4,  27,  3],
  [-13, 0,  16,  5],     // tail
], { k: 6 });
```

Each entry is `[x, y, z, r]` in mm. `k` is the blend distance: it defaults to
half the smallest radius, which always shows.

## Different shapes: smoothUnion()

When the parts are not spheres — a cylinder neck, a box body, an imported
mesh — `smoothUnion(k, ...shapes)` blends anything:

```js
// a toadstool: stem flows into cap
return smoothUnion(5,
  cylinder({ r: 6, h: 22, $fn: 48 }),
  translate([0, 0, 24], intersection(
    sphere({ r: 16, $fn: 64 }),
    translate([-16, -16, 0], cube([32, 32, 16])),   // dome = half a sphere
  )),
);
```

## Picking k

| k (mm) | reads as |
|---|---|
| 2–4 | a generous fillet — parts still distinct |
| 6–10 | flesh — a limb flowing into a body |
| 15+ | melting — parts lose their identity |

Compare on the same snowman: `k: 5` is three balls with soft necks, `k: 10`
is one pear-shaped body.

## The rules that keep it working

- **The result is a MESH solid.** It booleans, exports and prints — but there
  are no exact cylinders left inside for STEP. Do the blend LAST when you can.
- **Detail comes after the blend, as `group()`.** Eyes, buttons, a hat sit ON
  the body, so group them with it: no boolean runs, and each part keeps its
  own colour. `union()` onto a blended body pays a heavy mesh boolean AND
  fuses everything to one colour — use it only when you truly need one solid.
- **Resolution comes from a triangle budget** (default ~6000 triangles, a
  few seconds to build). For the ONE build before a final export, pass
  `{ maxTris: 20000 }` or pin `{ res: 96 }` — cost grows with the cube.
- **Keep children under ~40k triangles each** (the distance sampler refuses
  more). Simplify an imported mesh first if it is heavy.
- **Never blend mating faces.** The bulge grows past both surfaces — a
  blended peg no longer fits its hole. Blend the LOOK, union the FIT.

## A whole character, the pattern

```js
const body = blob([
  [0, 0, 14, 13], [0, 0, 34, 9],          // body, head
  [11, 0, 12, 4], [-11, 0, 12, 4],        // arms
  [5, -9, 2, 4.5], [-5, -9, 2, 4.5],      // feet, forward
], { k: 7 });

// hard details ON the soft body: group(), not union() — they only touch,
// so no boolean runs and every part keeps its colour
return group(
  colorize("#e8e4da", body),
  colorize("#222", translate([3.5, -8, 37], sphere({ r: 1.2, $fn: 24 }))),   // eyes
  colorize("#222", translate([-3.5, -8, 37], sphere({ r: 1.2, $fn: 24 }))),
  colorize("#e0762f", translate([0, -9, 34], rotate([90, 0, 0], cone({ r1: 1.6, r2: 0.2, h: 5 })))), // beak
);
```
