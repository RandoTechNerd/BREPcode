---
tag: resize
title: Making a part narrower, shorter or longer through the middle
match: narrower, narrow it, half as wide, less wide, reduce the width, cut the middle, cut out the middle, remove the middle, shorten, shorter, lengthen, longer, widen, wider, make it bigger, make it smaller, resize, trim the middle, take out of the middle, close the gap
---

`stretch()` is the whole answer here. Do not hand-write intersections against
bounding-box numbers you had to guess — that is how a build "succeeds" and
changes nothing.

**Narrower / shorter — a NEGATIVE `by`:**

```js
stretch({ axis: "x", by: -60, at: 0 }, importedMesh("frame.stl"))
```

That deletes a 60mm slab from the middle and slides the two halves together. A
120mm-wide frame comes out **60mm wide, with both original ends intact**, and
the height and depth completely untouched.

**Longer / wider — a POSITIVE `by`:** splits at the plane and fills the gap with
the part's own cross-section.

```js
stretch({ axis: "x", by: 25, at: 0 }, importedMesh("tray.stl"))
```

### One-sided work is a different operation

"Take 0.2mm off the top", "extend the right side by 7mm" — these are **not**
cuts through the middle. Reading them as `stretch` would delete a slab out of
the centre of the part.

**Trim a face**: `difference()` against a slab covering that face. Overshoot the
other two axes so the cut is unambiguous.

```js
// 0.2mm off the top of a part whose box is known
difference(part,
  translate([minX - 5, minY - 5, maxZ - 0.2], cube([w + 10, d + 10, 0.2 + 5])))
```

Taking material off the **bottom** leaves the part floating — add
`translate([0, 0, -amount], …)` around the whole thing to drop it back onto
z = 0.

**Extend a face**: `stretch` with the cut plane placed a couple of millimetres
*inside* that face, so the slice being extruded is real material.

```js
// push the right face out by 7mm
stretch({ axis: "x", by: 7, at: maxX - 2 }, part)
```

To push a **low** face out (left / front / bottom), stretch by the same positive
amount and then `translate` the whole part back by that amount, so the far face
stays where it was.

### Scaling is not resizing

`scale([2, 1, 1], part)` multiplies **every feature**: a 2mm wall becomes 4mm, a
round hole becomes an oval, a fillet changes radius. Only reach for it when the
user says "scale", "double", "twice as big" — and say in one sentence that the
details scaled too. If they wanted the outside size changed with the details
left alone, that is `stretch`, not `scale`.

### Why not the obvious alternatives

- `scale([0.5, 1, 1], part)` **squashes** it — the border, the rails and every
  round hole get distorted. `stretch` keeps every feature its true size and
  only removes length.
- Two `intersection()` calls plus a `translate` is what `stretch` already does
  internally, but with a 1000mm half-space instead of a guessed `frameWidth`.
  Hand-writing it means inventing dimensions, and a cutter placed on a wrong
  guess removes nothing at all.

### It lands off-centre — recentre it

The near half stays where it is and the far half slides in to meet it, so the
result is anchored on its low edge. A part that came in centred ends up shifted
by **half** of what you removed. Add the translate back:

```js
const remove = 60;
translate([remove / 2, 0, 0],
  stretch({ axis: "x", by: -remove, at: 0 }, importedMesh("frame.stl")))
```

Use `[0, remove/2, 0]` for the y axis and `[0, 0, remove/2]` for z. Skip it only
when the part is going straight to the printer and position genuinely does not
matter.

### Getting it right

- **`at: 0` is the middle. Never write `at: width / 2`.** This is the single
  most common way to get this wrong. The viewer recentres every import, so a
  120mm-wide part spans −60 to +60 — `width / 2` is 60, which is its right
  EDGE. The removed slab is centred on `at`, so half of it hangs off the end
  into empty space and you take out half of what you asked for: on a real
  120mm frame, `at: 60, by: -60` yields a **90mm** part, not 60mm, chewed in
  from one side. `at: 0` gives the correct 60mm.
- `at` is only non-zero when you deliberately want an off-centre cut — and then
  it is a coordinate in the part's own space (−60…+60 here), never a width.
- Land the cut on a plain stretch of the part — not through a hole, a boss or
  a piece of text, or the two halves will not meet cleanly.
- "Remove 50% of the width" means `by: -(width * 0.5)`. Read the width from the
  status-bar dimensions and put it in a named variable.
- Anything inside the removed slab is deleted. On a picture frame that includes
  the middle of the top and bottom rails, which is exactly the intent — but if
  a centre bar or a boss lived there, say so in one sentence and `union()` it
  back if the user wants it.
- One axis at a time. To narrow *and* shorten, nest two `stretch()` calls.

You have everything you need — write the single `stretch()` call. Never ask for
a bounding box you can get from the status bar.
