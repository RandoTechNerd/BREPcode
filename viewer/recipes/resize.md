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

- `at` is where the cut lands, in the part's own coordinates. Imports are
  recentred, so **`at: 0` is the middle** and is almost always what you want.
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
