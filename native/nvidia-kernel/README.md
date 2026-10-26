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

Box, cylinder, cone, sphere and full torus primitives, sketches on XY (lines,
cubic Beziers, arcs and circles, with hole loops), extrude, full and partial
revolve, union / subtract / intersect, fillet and chamfer on named edges, and
translate / rotate / scale transforms. Arcs are SMLib's own exact rational
quadratics (SmApiCreateArc); a full circle goes in as two half arcs, as the
Rust kernel builds it, so both name its wall's two faces alike. Anything else
is refused and the model builds on the Rust kernel instead: part tori, mirrored (negative) scales, transforms about the bounding
box centre, primitives that carry their own boolean, and exact imports (STEP),
which SMLib can't read.

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
