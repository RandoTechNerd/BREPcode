# vendor/

Third-party code committed into this repository rather than fetched at install
time. Everything here keeps its own licence file, unmodified, as those licences
require.

## brep-io-kernel

The solid modelling kernel this whole app is built on, from Autodrop3d LLC.
`package.json` points at this copy (`file:./vendor/brep-io-kernel`) instead of
the npm registry.

**Why it is here.** The licence grants the right to use, copy, modify,
distribute and sublicense — but a package can be unpublished, and the version
this app is tested against would go with it. A vendored copy turns "the kernel
disappeared" from a supply problem into a maintenance one. See the strategy
notes in `docs/kernel.md`.

**What is here.** Only the runtime import graph, which is what the site build
already ships: `brep-kernel.js` and the chunks it reaches — PartHistory,
SketchSolver2D, deepClone, index.esm and manifold. 13MB against 189MB for the
full published package, which carries a whole CAD application, its UI assets,
fonts, help files and a physics engine that this app never loads.

**Do not modify these files.** Clause 1 of the licence voids every permission it
grants if modifications are not contributed back upstream. Keeping the kernel
untouched is what keeps that clause dormant, and it has been untouched from the
start. Anything this app needs to change belongs in `src/` or `viewer/`, on top
of the kernel rather than inside it.

**Updating.** Install the new version from npm into a scratch directory, copy
the same file set across, and run the suite. The version here is recorded in
`vendor/brep-io-kernel/package.json`.
