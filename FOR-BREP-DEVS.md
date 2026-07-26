# BrepScript — notes for the BREP.io maintainers

Hi — I've been building a small OpenSCAD-style authoring layer on top of `brep-io-kernel`, and along
the way I hit a handful of things that are probably worth reporting upstream. Sharing both what I
built and what I found, in case any of it is useful.

**Environment:** `brep-io-kernel@1.0.306`, Node v24.14.1, Windows 11, Chromium.
Everything below was verified by running it, not inferred from reading source.

---

## What I'm building

A thin DSL + CLI + live viewer over the kernel. The kernel does all the real work; this is purely an
authoring-ergonomics layer.

```js
// bracket.js
import { cube, cylinder, difference, translate } from "brepscript";

export default (params) => difference(
  cube([60, 40, 6]),
  translate([10, 10, -1], cylinder({ r: params.holeR ?? 2.5, h: 8, $fn: 32 })),
);
```

```bash
brepscript bracket.js -o bracket.stl -D holeR=3
```

Plus a browser page where you type and the solid rebuilds ~450 ms after you stop (30–150 ms per
rebuild), with autocomplete and a cheat sheet.

**Motivation:** the kernel is genuinely good, but composing a part directly against `PartHistory`
means cryptic short codes, in-place `inputParams` mutation, and wiring solids together by id string:

```js
const cube = await ph.newFeature("P.CU");
cube.inputParams.sizeX = 20;
const cyl = await ph.newFeature("P.CY");
cyl.inputParams.radius = 5;
const b = await ph.newFeature("B");
b.inputParams.targetSolid = cube.inputParams.id;
b.inputParams.boolean = { targets: [cyl.inputParams.id], operation: "SUBTRACT" };
await ph.runHistory({ throwOnFeatureError: true });
```

That becomes `difference(cube([20,20,20]), cylinder({ r: 5, h: 40 }))`.

The good news worth stating plainly: **the kernel runs headless in Node with no fuss.** Real manifold
booleans, `solid.toSTL(name, tol)`, the lot. That surprised me and it's the thing that makes any of
this possible.

---

## Likely bugs

### 1. `CadEmbed`'s default `frameModuleUrl` points at a chunk without the boot function

`CadEmbed` defaults `frameModuleUrl` to `import.meta.url`, which resolves to the internal minified
chunk `dist-kernel/CAD-BOR-g0AI.js`. That chunk's exports are `A, B, C, …` — it does **not** export
`bootCadFrame`. The generated iframe bootstrap looks for
`mod?.bootCadFrame || mod?.bootCADFrame || mod?.boot`, finds nothing, and posts `frameError`.

The wrapper `dist-kernel/CAD.js` does export it (`CADEmbed, CadEmbed, bootCADFrame, bootCadFrame`), so
passing `frameModuleUrl` explicitly gets past this step.

### 2. `CadEmbed` never finishes initialising (this one blocked me)

Even with an explicit `frameModuleUrl`, `mount()` always times out. The sequence:

1. The frame boots fine and posts `{type: "ready", payload: {version: 1}}`. Confirmed received.
2. The host then sends `init` via `#initializeAfterReady()`.
3. The frame's `#onMessage` receives it — I verified `event.source === window.parent`, and that
   `channel` and `instanceId` both match, by adding my own listener inside the frame.
4. No response is ever posted. No error, no rejection, no console output. `getState` behaves the same.

Since both `init` and `getState` `await this.#ensureViewer()` before responding, the hang looks like
`await viewer.ready` inside `#ensureViewer()` never settling.

What I ruled out:
- **Not WebGL** — WebGL2 is available (ANGLE / Intel Arc 140V, D3D11).
- **Not a missing asset** — no 404s in the server log beyond `/favicon.ico`.
- **Not cross-origin** — srcdoc iframe, same origin, messages arrive and validate.
- **Not the module URL** — importing `CAD.js` directly resolves fine and `bootCadFrame` is a function.

Repro is roughly: serve `node_modules/` statically, then

```js
const embed = new CadEmbed({
  frameModuleUrl: new URL("/node_modules/brep-io-kernel/dist-kernel/CAD.js", location.origin).href,
});
await embed.mount("#host");   // => "CadEmbed initialization timed out"
```

I ended up rendering the kernel's solids in my own three.js scene instead, so this isn't blocking me
any more — but the embed API is currently unusable from my side, and I couldn't find the root cause.

### 3. `EDGE` objects report `isMesh === true`

A solid's children are `FACE`, `EDGE`, `VERTEX`, and `Points`. The `EDGE` objects are `isMesh: true`
but carry a `LineMaterial`, and their position buffer is fat-line data rather than surface positions.

Anyone doing the obvious `solid.traverse(o => { if (o.isMesh) ... })` to pull geometry picks these up
and gets degenerate quads clustered near the origin. In my case it silently corrupted the bounding
box — a cube translated to `[200,150,60]` measured `[-1,-1,0] → [220,170,80]`, which sent camera
auto-framing to entirely the wrong place. Took a while to track down because nothing errors.

Filtering on `type === "FACE"` fixes it. Might be worth either an `isFace` flag or a documented
accessor for "just the renderable surface geometry".

### 4. `MeshToBrep` solids can't be cloned, so imported meshes silently fail as boolean tools

An `IMPORT3D` feature produces a `MeshToBrep` instance. `Solid.clone()` (in
`solidMethods/lifecycle.ts`) does `const Solid = this.constructor; const s = new Solid();` — but
`MeshToBrep`'s constructor throws `"MeshToBrep requires a THREE.BufferGeometry or THREE.Mesh"` when
called with no arguments. So cloning any imported solid throws.

`applyBooleanOperation` clones its operands. When an imported mesh is the **tool** (e.g.
`difference(nativeSolid, importedMesh)`), the clone throws, the boolean is caught internally, and it
**silently no-ops** — the result keeps the target's full volume with no error surfaced to the caller.
Imported-as-**target** and unions happen to survive because those paths don't clone the imported
operand. `XFORM`/Transform features hit the same clone path and fail identically, which is why
transforms on imported solids don't apply either.

Minimal repro:

```js
const ph = new PartHistory();
const im = await ph.newFeature("IMPORT3D");  im.inputParams.fileToImport = asciiStlCube;
const cu = await ph.newFeature("P.CU");      Object.assign(cu.inputParams, { sizeX:20, sizeY:20, sizeZ:20 });
const b  = await ph.newFeature("B");
b.inputParams.targetSolid = cu.inputParams.id;
b.inputParams.boolean = { targets: [im.inputParams.id], operation: "SUBTRACT" };
await ph.runHistory({ throwOnFeatureError: true });   // no throw, but nothing is cut
```

A one-line fix would be to give `MeshToBrep` a no-arg-safe constructor (skip the geometry build when
called bare, since `clone()` overwrites the geometry from a snapshot immediately afterward), or to
have `clone()` construct the base `Solid` rather than `this.constructor`. As a workaround on my side I
monkeypatch `MeshToBrep.prototype.clone` at runtime to masquerade as the base `Solid` for the copy,
which makes both booleans and transforms on imported meshes work — but it'd be much better handled in
the kernel.

---

## Papercuts

### Primitive origin/axis conventions are inconsistent

Measured bounding boxes, default params, all at the origin with no transform:

| Primitive | Result | Convention |
|---|---|---|
| `P.CU` 20³ | `x[0,20] y[0,20] z[0,20]` | corner at origin |
| `P.CY` r5 h40 | `x[-5,5] y[0,40] z[-5,5]` | **+Y axis**, base at y=0, centred in XZ |
| `P.CO` r5 h10 | `x[-5,5] y[0,10] z[-5,5]` | **+Y axis** |
| `P.S` r5 | `x[-5,5] y[-5,5] z[-5,5]` | centred |
| `P.T` | `x[-12,12] y[-2,2] z[-12,12]` | lies in **XZ** |

So the cube is corner-based while the cylinder is centred-and-base-at-zero, and the extrusion axis is
+Y while most CAD/printing workflows assume +Z. Nothing wrong with the choice, but it's unexpected
and undocumented as far as I could find. A uniform +90° rotation about X normalises the lot to the
OpenSCAD convention, which is what my DSL does.

Also: `rotationEuler` is in **degrees**. I lost time assuming radians — passing `1.5708` gives a
1.57° tilt rather than 90°, which looks like a subtle geometry bug rather than a unit mistake.

### `newFeature()` returns a plain object, not a feature instance

It returns `{ type, inputParams, persistentData, id }` with `inputParams` **pre-populated with
defaults** (nice!). But there's no schema on it, so there's no obvious way to introspect a feature's
parameters at runtime — which is what I'd want for autocomplete and for driving an LLM. I ended up
hardcoding my vocabulary. Is there a supported way to reach `inputParamsSchema` from the published
package? `FeatureRegistry` isn't exported.

### Reference fallback hides mistakes

The kernel's own tests reference `inputParams.featureID`, which doesn't exist (the key is `id`), so it
evaluates to `undefined`. I initially assumed that would break — it doesn't. With both `targetSolid`
and `targets` undefined, the boolean still resolves and cuts correctly, presumably via a fallback.

I'm not sure that's desirable: it means a genuinely wrong reference produces correct-looking output
in the 2-solid case and would presumably pick the wrong solid once there are more. Meanwhile an
`undefined` **entry inside** `targets` (with a valid `targetSolid`) is silently skipped and nothing
gets cut. Verified all four combinations on identical overlapping geometry:

| Wiring | Result |
|---|---|
| no boolean | 2 solids (12f cube + 128f cylinder) |
| `targetSolid`/`targets` via `.id` | 1 solid, 144f — clean through-hole |
| both via `.featureID` (undefined) | 1 solid, 144f — **also cuts** |
| valid `targetSolid`, `targets: [undefined]` | 2 solids, uncut — silent no-op |

### `npx brep-io-kernel` isn't a headless CLI

Minor expectation mismatch: the bin just static-serves `dist/`. Coming from OpenSCAD I assumed
`brep-io-kernel model.js -o out.stl`. Might be worth a line in the README clarifying that it's an app
server, not a build tool. (This gap is basically why I wrote mine.)

### The kernel bundles its own three.js

Not a bug, but a sharp edge for anyone rendering kernel output in their own scene: meshes created by
the bundled three are **silently skipped** by a renderer from a different three instance — they just
never draw, no warning. I now copy raw vertex buffers into fresh `BufferGeometry` owned by my three,
baking `matrixWorld` in. Worth a docs note, or exposing the bundled three as an export so consumers
can share the instance.

---

## What would help most

Honestly, in priority order:

1. **A way to introspect feature schemas from the published package** (`inputParamsSchema` via a
   supported export). This unlocks autocomplete, parameter validation, and LLM-driven generation
   without hardcoding a vocabulary.
2. **Edge/face selection that's addressable from code.** This is the big one — fillet, chamfer,
   extrude and revolve are all out of reach for a script-first tool because edges are identified by
   generated names. Something like a query API (`solid.edges({ z: "max" })`) would open up most of
   the remaining feature set.
3. Clarity on whether `CadEmbed` is expected to work standalone, or only inside the app.

Happy to file these as separate issues, put together minimal repros, or send a PR for the
`frameModuleUrl` default if that'd be useful. And thanks — the headless story is genuinely good, and
the fact that I could get a working script→STL pipeline running in an afternoon says a lot.
