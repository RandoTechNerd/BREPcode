# NVIDIA SMLib kernel (BREPcode Alpha)

BREPcode Alpha builds models on NVIDIA's open-source SMLib B-rep kernel
([NVIDIA-Omniverse/usd-brep](https://github.com/NVIDIA-Omniverse/usd-brep),
Apache-2.0), falling back to the next.BREP.io Rust kernel and then the BREP.io
JS kernel whenever SMLib refuses a model. The standard BREPcode build doesn't
include it.

| File | What it is |
|---|---|
| `fetch-upstream.mjs` | Fetches SMLib + SM_API (only) at the pinned release into `upstream/` |
| `binding.gyp`, `list-sources.cjs` | Compiles those ~235 files straight into one Node addon, on Windows and macOS alike (no NVIDIA build tooling, no OpenUSD, no TBB) |
| `src/addon.cc` | The thin C++ bridge: solids as integer handles, one kernel call per function |
| `adapter.cjs` | Makes the addon look like the Rust kernel module to `src/engine.js`, interprets the feature list, and names faces the way the Rust kernel does |

Build it with `npm run build:nvidia` (about 10 minutes the first time), then
`node test/nvidia.js`. `node src/cli.js model.js --engine nvidia-split` builds
a model on SMLib alone; `--engine nvidia` lets it fall back.

## What it covers today

Box, cylinder, cone, sphere and torus (full or part) primitives, sketches on XY
(lines and cubic Beziers), extrude, full and partial revolve, union / subtract /
intersect, a primitive, extrude or revolve carrying its own boolean (one
target), fillet and chamfer on named edges, and translate / rotate / scale
transforms, mirrored (negative) scales and transforms about the bounding-box
centre included. Anything else is refused and the model builds on the Rust
kernel instead: pyramids, sketches off the XY plane, a feature's own boolean
with more than one target, and exact imports (STEP), which SMLib can't read.

## Gotchas

- SMLib sets up thread-local storage in `DllMain` when built as its own DLL.
  Linked into the addon there's no such hook, so `Init` calls
  `SmThreadLocalStorage::SetupTLS` itself. Without it the first boolean
  throws.
- SMLib's `StdAfx.h` and SM_API's are different headers with the same name, so
  the two libraries are separate gyp targets, each with its own include order.
- The kernel needs C++17; Node's common.gypi forces `-std:c++20` on Windows,
  which `binding.gyp` strips. Node also turns on LTCG for Release, which made
  the link alone take 15 minutes; that's off as well.
- SMLib can report success and return a body that isn't a solid (a torus
  tangent to a cylinder came back with zero volume), so every boolean, sweep
  and fillet checks `SmApiBrepIsManifoldSolid` and refuses if it fails.
- A part revolve needs the closed profile, axis edge included (a full turn
  takes the open one); without it SmApiCreateRotationalSweep returns 1001.
- SMLib's merge isn't symmetric in its numerics: a union that comes back open
  one way round can be a clean solid the other way, so the addon retries a
  failed union or intersection with the operands swapped.
- SmApiScale refuses negative factors; a mirror goes through the brep's own
  4x4 `Transform`, which splits the reflection out and turns the faces over.
