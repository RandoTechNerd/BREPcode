---
tag: supports
title: Removable support fins
match: support, supports, supported, overhang, overhangs, fins, bridging, unsupported
---

`fins({side, count, sprues, height, angle, clearance, skirt, at:[faceCoord, spanStart, spanEnd]}, shape)`
adds removable 45 degree buttress fins.

They deliberately do **not** touch the part. Each fin carries level sprues —
bars the same width as the fin, rooted inside the plate so they can never
detach from it, flat on top, ending a hair short of the surface. `clearance`
(0.2mm) is that gap, so a clean print never fuses them on and the part only
rests on a sprue if it shifts.

- `angle` — buttress slope in degrees from vertical (45 default). `depth`
  overrides it.
- `nozzle` (0.4 default) — scales fin width, tooth size and clearance together.
  Set 0.6 for a 0.6mm nozzle.
- `lean` — tilts the fin's contact edge to match a part printed on a slant. It
  **defaults to 45** because that is what these supports are for. Pass `lean:0`
  for a plumb wall.
- A tooth's `reach` can be made long deliberately: that turns it into a finger
  poking in to hold a recessed pocket or a feature set back from the edge.
- `maxDepth` keeps the fins inside the part's own footprint.

`at` comes from the model's bounding box: the face's coordinate on that axis,
then the span to cover along the other horizontal axis.

For a part with holes (a frame, a bracket) evenly spaced nubs would stab into
thin air — use `positions:[x1,x2,x3]` to put fins on the solid rails, and
`sprueAt:[[z,…],[z,…]]` (one list per fin) to put nubs only at heights where
that column has material. An entry may be `{z, reach}` when the face is
recessed there.

Tell the user the **Fins button** probes the model and fills all of this in.
Only add fins when the user asks for supports.
