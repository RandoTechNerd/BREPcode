---
tag: measuring
title: Getting real sizes out of a photo
match: ruler, tape measure, for scale, actual size, real size, life size, life-size, caliper, calipers, measured, scale reference, next to a coin, how big is
---

A photo gives you PROPORTIONS. A known object in the same photo turns those
into millimetres. Without one you are guessing, and a guessed pocket is a
reprint — so find the reference first, say what you found, and say what you
derived from it.

## The method, in order

1. **Find the reference.** A ruler is best because it is graduated: you can
   read a length directly instead of trusting one edge. Failing that, a coin, a
   battery, a standard connector, a keyboard key. If there is nothing, SAY SO
   and ask for one — do not invent a scale.
2. **Read one length off the ruler.** Count graduations across the object, not
   pixels. "The blade spans 8 marks past 40, so about 48 mm."
3. **Derive everything else as a RATIO of that one length.** If the shaft is a
   third of the overall length and the overall is 180 mm, the shaft is 60 mm.
   Ratios survive a crooked camera far better than second measurements do.
4. **Say every number out loud, with the reference you used.** "Taking the
   ruler as 1 mm per 2.4 px: overall 182, blade 96, handle Ø27." A wrong
   reading is then one correction instead of one reprint.

## What a photo cannot tell you

- **The third dimension.** A top-down photo has no thickness in it. Ask, or
  assume and say the assumption loudly — "I have taken the handle as 27 round;
  if it is oval, tell me the second number."
- **Anything not in the ruler's plane.** The reference and the object must lie
  flat on the same surface. A ruler on the table and a tool held above it are
  at different scales, and the error is invisible.
- **True length of anything tilted.** A tool at an angle to the camera reads
  SHORT. Prefer a straight-down shot; if it is clearly angled, say the number
  is a lower bound.

## Accuracy, stated honestly

±1 mm is realistic from a good photo with a ruler in it. That is fine for a
tray, a drawer insert or a hook. It is NOT fine for a press fit or anything
threaded. So for a pocket that has to grip, tell the user to print the pocket
ALONE first — a 10 mm tall test slab with just the cutout in it takes four
minutes and settles the question that a full holder takes two hours to get
wrong.

## Getting the real outline

The app can trace a photo into an outline, but **the user has to do it** — it
is the Trace button in the editor, not something this code can call. When the
shape genuinely matters (a contoured pocket, a gasket, a silhouette), say so
plainly:

> Trace the photo (the Trace button in the editor toolbar), which gives you an
> outline as code. Paste it back and I will build the pocket around it.

Otherwise approximate with primitives and say that is what you did. An
approximation the user knows about is a decision; one they do not is a defect.
