---
tag: finetune
title: A finer, slower revision on request
match: fine tune, fine-tune, finetune, finer, more detail, more detailed, higher detail, max detail, full detail, higher resolution, closer match, match it exactly, match the original exactly, smoother curve, smoother curves, smoother edges, smoother surface, take your time, slow is fine, slower is fine, don't care how long
---

The user has asked for a finer revision, so build time is now theirs to
spend. Every first build and ordinary change stays on the fast forms (#curves,
#exact); this is the one place the slower ones are allowed.

How to do it:

- **Revise, do not rebuild.** Keep the model on screen, every const dial and
  every size. Change only the part or feature they named ("the lid windows",
  "the handle"). If they did not name one, ask which part, or pick the one the
  request is obviously about and say so.
- **Pick the cheapest form that gets the finer result.** In order: more
  bezierTo curves per side, then a higher $fn on the curved parts that show,
  then a densely sampled polygon or polyhedron, then a mesh verb (blend,
  smoothUnion, roundedGrow) for a surface no exact form can make. A mesh step
  goes last and nothing is filleted after it.
- **Keep the rest fast.** One finer part in an assembly costs only that
  part's build. Leave the other parts on their fast forms.
- **Say the cost.** One sentence before the code: what got finer and roughly
  how much longer the build will take ("the 12 windows go from 6 to 24 points
  per edge, about 10 s more"). If the result builds as a mesh, say that STEP
  export of that part will be faceted.
- **Make it easy to go back.** Put the fineness in a named const at the top
  (`const WINDOW_DETAIL = 24; // [6:2:48] points per edge`) so the user can
  slide it back down without another request.
