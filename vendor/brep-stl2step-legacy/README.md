# brep-stl2step-legacy

The next.BREP.io Rust BREP kernel at commit `75bad91` (BREP_kernel 0.9.0),
built from `rust/brepcode-kernel` before the move to 0.11.0, unmodified. It
is the exact build the app shipped until 2026-11-01.

It is kept for ONE job: the second opinion in "Open as an exact solid"
(STL -> STEP). `src/stlexact.js` runs the current kernel's reconstruction
first and only loads this one when that attempt fails, traps, times out or
comes back as repaired facets, then keeps whichever result has more real
surfaces. Models never build on it.

Why: measured on 24 real STLs, 0.11.0 converts more files and is faster, but
it rebuilt two CAD parts as facets where 0.9.0 recovered exact planes and
cylinders, and it traps or hangs on three meshes that 0.9.0 refuses cleanly.
See `bench/kernels.md`. Drop this folder once upstream closes that gap.

Licence: Autodrop3d LLC, `LICENSE.md` (same text as `vendor/brep-kernel-rust`).
