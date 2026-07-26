# BREPcode

**Type it, describe it, or grab it and drag. A complete CAD app that runs
entirely in your browser.**

→ **[Try it now at BREPcode.com](https://brepcode.com/)**. Nothing to install, runs entirely
client-side.
→ **[Download BREPcode.exe](../../releases/latest)**. Portable Windows build, no installer.

It started as code-CAD, and the language is still the heart of it. But there are
now four ways into the same model, and you can move between them mid-build:

- **✍️ Write it.** An OpenSCAD-style language that rebuilds as you type. Or paste
  OpenSCAD, JSCAD, build123d or CadQuery and it translates on the way in.
- **💬 Describe it.** Tell the built-in chat what you want in plain English and it
  writes the code. Bring your own Claude or Gemini key, stored in your browser.
- **🖱 Grab it.** Click a shape to select its code, then drag the handles to
  resize it. Alt+arrows nudge any number. The edit lands back in the source.
- **🧰 Import and edit it.** Bring in an STL, 3MF, OBJ or SVG, then drill it,
  stand it up, split and fill it, thicken its walls, shave the feet off, or add
  removable support fins.

Plus a live 3D viewer with materials, lighting and CAD outlines, exports to STL,
OBJ, multi-colour 3MF, GLB, curved-surface STEP and a 3-view blueprint, and a
[headless CLI](#cli-headless-no-browser) for when you want files instead of a window.

All of it sits on the [BREP.io](https://brep.io) kernel (`brep-io-kernel`): real
solid modeling, manifold booleans, feature history. Nothing is sent to a server
except the chat, if you turn it on.

### Built on BREP.io

The solid modeling is not ours. Every boolean, every feature, every millimetre of geometry comes
from the **[BREP.io kernel](https://brep.io)** by [Autodrop3d LLC](https://autodrop3d.com)
([source](https://github.com/mmiscool/BREP), [@mmiscool](https://github.com/mmiscool)), an
open-source, browser-native B-rep engine. BREPcode is a language and an interface sitting on top
of it.

The kernel ships **unmodified**, installed from npm, with its `LICENSE.md` bundled beside it in
every build. That license requires any modification to the kernel be contributed back to
Autodrop3d via pull request, so this project deliberately never patches it. If the kernel needs
to change, the change belongs upstream. If BREPcode is useful to you, the kernel is the part worth
starring.

```js
// bracket.js
import { cube, cylinder, difference, translate } from "brepscript";

export default (params) => difference(
  cube([60, 40, 6]),
  translate([10, 10, -1], cylinder({ r: params.holeR ?? 2.5, h: 8, $fn: 32 })),
);
```

```bash
node src/cli.js bracket.js -o bracket.stl -D holeR=3
#   P.CU1: 736 facets  x[0, 60]  y[0, 40]  z[0, 6]
#   wrote bracket.stl in 665ms
```

## Why this exists

The kernel is genuinely good, but authoring against it directly is rough. To subtract a cylinder
from a cube you write:

```js
const cube = await ph.newFeature("P.CU");            // cryptic short code
cube.inputParams.sizeX = 20;                          // mutate params in place
const cyl = await ph.newFeature("P.CY");
cyl.inputParams.radius = 5;
const b = await ph.newFeature("B");
b.inputParams.targetSolid = cube.inputParams.id;      // wire solids together by id string
b.inputParams.boolean = { targets: [cyl.inputParams.id], operation: "SUBTRACT" };
await ph.runHistory({ throwOnFeatureError: true });
```

BrepScript makes that `difference(cube([20,20,20]), cylinder({r:5, h:40}))`.

The published `brep-io-kernel` CLI (`npx brep-io-kernel`) only serves the browser app as a static
site; there is no headless script-to-STL path. That's what this adds.

## Desktop app (Windows)

```bash
npm run desktop         # run the shell against dist-site/
npm run desktop:build   # -> dist-desktop/BREPcode.exe
```

`BREPcode.exe` is a **portable** build: one file, no installer, no admin rights,
nothing written outside its own temp folder. It is the same static bundle the
website serves (`dist-site/`), wrapped in an Electron window. There is no
second implementation to keep in sync. Nothing is uploaded anywhere; the only
network traffic it can ever make is to a provider you name yourself — your AI
key's endpoint if you set one, and your own mail server if you set that up.

Two things worth knowing before handing it to someone:

- **It is not code-signed.** Windows SmartScreen will show *"Windows protected
  your PC"* on first run; the user has to click **More info → Run anyway**.
  Signing needs a paid certificate. For a first-time visitor, a link to the
  hosted `dist-site/` is genuinely less alarming than an unsigned download.
- **It is ~140 MB**, because Electron bundles its own Chromium. The web build
  of the identical app is 10.5 MB zipped.

The shell (`desktop/main.cjs`) serves the bundle over a custom `app://` scheme
rather than `file://`. ES modules and `WebAssembly.instantiateStreaming` both
refuse to load from an opaque `file://` origin, and a registered standard scheme
avoids that without opening a port or tripping the firewall.

### Sending a model by email (desktop only)

⚙ → **Email** takes an SMTP host, port, username and app password, after which
the ✉ buttons attach the STL or the engineering drawing and send it from your
own address. Nothing routes through a third party.

This is the one feature the website cannot have. A web page has no raw sockets,
so it cannot open an SMTP connection at all — in the browser the same buttons
download the file and open a pre-written draft in your mail app, which is as far
as a page can go. The desktop build has a Node process behind it, so it can do
the real thing.

Notes:

- Use an **app password**, never your account password. Gmail and Outlook both
  reject the real one for SMTP anyway. Gmail: Account → Security → 2-Step
  Verification → App passwords. Pasting it with the spaces Gmail shows is fine.
- The password is encrypted with Electron's `safeStorage`, which uses the OS
  keychain (DPAPI on Windows), and written to `userData` — not to the page's
  `localStorage`, which any script in the page could read. If a machine has no
  keychain available it is stored in plain text and the panel says so.
- The preload bridge (`desktop/preload.cjs`) exposes four calls and deliberately
  **no way to read the password back**. The page sends it once and never sees it
  again; `sendMail()` takes a recipient and attachments, and the main process
  supplies the credentials itself. That matters because the page runs model code
  and, if you turn the assistant on, text written by an AI.
- `npm run test:desktop` launches the real shell and checks the bridge, the
  sandbox, the encryption and an IPC round-trip. It never contacts a mail server.

## Toolbox and panels

Everything lives in the header bar. Nothing here needs the terminal.

**🧰 Toolbox** is the dropdown for edits that act on a shape you point at:

| Tool | What it does |
|---|---|
| **Drill** | Click a face, bore a hole along its normal |
| **Fin supports** | Removable 45° buttress fins with probed teeth and a bed skirt |
| **Fin supports, no skirt** | The same without the foot |

**📦 Import** brings in STL / 3MF / OBJ / SVG and unlocks the mesh-editing tools:

| Tool | What it does |
|---|---|
| **Rotate / orient** | Stand a part up, lay it flat, flip it over |
| **Split and fill** | Slice a part and fill the gap with its own cross-section, or pass a negative amount to take length out of the middle |
| **Thicken walls** | Scale up, then shrink the middle back, so rails get thicker without the part changing size |
| **Shave off the bottom** | Cut feet or a lip off flat |
| **Drill** | Same as above, on imported geometry |

**Other panels:**

| Panel | What it does |
|---|---|
| **💬 Chat** | Describe a part in plain English and get code. Bring your own API key (Claude or Gemini), stored locally in your browser, never sent anywhere but the provider. Optionally password-locked so you can publish a build with a key baked in |
| **📖 Cheat sheet** | Every word in the language, grouped and tabbed by dialect, click to insert working code |
| **🎨 Material and lighting** | Colour, metalness, roughness, opacity, textures, presets, CAD outline mode, lighting rig, background |
| **🖼 Trace image** | PNG or JPG to an extrudable outline |
| **📐 Dimensions** | Live width / depth / height overlay |
| **💾 Export** | STL, OBJ, 3MF (multi-colour), GLB, curved-surface STEP, and a 3-view SVG blueprint |
| **📁 Inventory** | Your saved models, with thumbnails |

## Live viewer

```bash
python -m http.server 5320 --directory BrepScript
# then open http://localhost:5320/viewer/
```

A "**+ Type a model**" button sits in the corner. Click it, type BrepScript, and the solid rebuilds
about half a second after you stop typing, typically 30-150 ms per rebuild. Drag to orbit, scroll to
zoom. Syntax errors show in red in the panel and the last good model stays on screen, so a
half-typed line never blanks the view.

Two buttons sit bottom-right:

- **📖 Cheat sheet**: every word you can use, grouped into Shapes / Combine / Move, each with its
  signature and a one-line explanation. Click any entry to insert working code at the caret. At the
  bottom are ready-made starting points (a bolt-hole plate, a hollow box, a peg on a base) that
  replace the editor contents with something that already builds.
- **+ Type a model**: the editor.

While typing, a suggestion list appears as soon as a word matches. **Tab** or **Enter** inserts the
full call with sensible defaults, typing `cy` then Tab gives you `cylinder({ r: 8, h: 20, $fn: 48 })`
with the arguments pre-selected, so typing immediately replaces them. Arrow keys move through the
suggestions, Escape dismisses. A hint line under the editor always says what the call you're inside
expects.

Mistakes get plain-English fixes rather than raw JavaScript errors:

| You type | It says |
|---|---|
| `cube` | You typed "cube" on its own. Give it values: `cube([20, 20, 10])` |
| `cub([10,10,10])` | "cub" isn't a BrepScript word. Did you mean `cube()`? |
| `cube([10,10,` | Unfinished square bracket `[`, add `]` (2 still open in total) |
| `cube([10,10,10)` | Mismatched brackets: `[` is closed by `)`. Use `]` instead |
| `linear_extrude(5)` | isn't available here, there's no 2D subsystem yet |
| `fillet(...)` | isn't available here, not wired up yet, it needs edge selection |
| `const a = cube(...)` | Almost, add `return` before your final shape |
| `difference(cube(...), 5)` | Expected a shape, got number: 5, shapes go inside shapes |

A broken line never blanks the view; the last good model stays on screen while you fix it.

### Manual adjustment, keyword swapping, and history

The editor and the 3D view edit the same model from either side:

- **Click a shape in the viewport** and its call is selected in the code, including cut features:
  clicking the inside wall of a drilled hole selects the `cylinder` that cut it, because the kernel
  preserves each face's originating feature through booleans. Mapping is only offered when it's
  provably right (the compile trace must match the source's primitive sequence one-to-one); code
  with loops, helper functions, or pasted modules says "can't map" instead of guessing.
- **Alt+↑/↓ on a number** nudges it and rebuilds, Shift steps ±10, Ctrl steps ±0.1. The hint line
  shows what you're adjusting and which call it belongs to.
- **Alt+↑/↓ on a keyword** is the inline swapper: `cube → cylinder → sphere → cone → torus`,
  `union → difference → intersection`, `translate → rotate → scale → mirror`. Primitive swaps
  convert the arguments (`cylinder({ r: 8, h: 14 })` → `sphere({ r: 8 })` → `cube([16, 16, 14])`)
  so the model stays sensible; boolean/transform swaps are literal since their arguments already match.
- **◀ ▶ in the editor header** step through history. Every change lands in one stack (typing
  grouped per pause, scrubs, swaps, cheat-sheet inserts, recipes) so you can walk back through
  manual adjustments and forward again. Capped at 200 entries.

### Exact mode

An **Exact** checkbox sits under the editor, unticked by default. While it's off, forgiving mode
patches the small stuff before building, unclosed brackets and quotes get closed, smart quotes and
en-dashes pasted from a document get straightened, and the status bar says what it patched
(`auto-fixed: closed 1 open bracket with )`). So a half-typed line keeps rendering while you work.

Two guarantees: **it only ever appends what's missing**, never rewriting or deleting what you typed,
and **your text is left alone**, the repair is applied to a copy, so the caret never jumps. Brackets
inside strings and comments aren't counted, and genuinely crossed brackets (`cube([1,1,1)`) are left
untouched, because guessing there just yields differently-broken code, you get
*"Mismatched brackets: `[` is closed by `)`"* instead.

Tick **Exact** and nothing is patched: you get the strict error, which is what you want when the code
is supposed to be final.

Both expression form and statement form work:

```js
difference(cube([30, 30, 12]), translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })))
```
```js
const t = 4;
return difference(cube([30, 30, t]), translate([15, 15, -1], cylinder({ r: 9, h: t + 2, $fn: 48 })));
```

The page is deliberately dependency-free, no build step and no CDN, just an import map pointing at
`node_modules`. `window.brepscript` exposes `{ scene, camera, renderer, modelGroup, rebuild, dsl }`
for poking at from the console.

### Why it doesn't embed the real BREP.io app

The kernel ships a `CadEmbed` API that mounts the full BREP.io UI in an iframe. I tried that first and
it doesn't work here: the frame boots and posts `ready`, but every subsequent request (`init`,
`getState`) hangs forever inside `#ensureViewer()`, waiting on a `viewer.ready` promise that never
settles, no error, no rejection, just silence. Two related traps found on the way:

- `CadEmbed`'s default `frameModuleUrl` resolves to the **minified internal chunk**
  (`CAD-BOR-g0AI.js`, whose exports are `A, B, C…`) rather than the `CAD.js` wrapper that actually
  exports `bootCadFrame`. You must pass `frameModuleUrl` explicitly. That alone doesn't fix the hang.
- The hang is not WebGL (WebGL2 works fine here) and not a missing asset (no 404s).

So the viewer renders the kernel's solids directly instead. That's lighter anyway, and it's fully
under our control.

Two gotchas this created, both worth knowing if you render kernel solids yourself:

- The kernel bundles **its own copy of three.js**, and meshes built by one copy are silently skipped
  by a renderer from another, they never draw, with no warning. The viewer copies raw vertex buffers
  into fresh `BufferGeometry` owned by the page's three, baking each mesh's world matrix in.
- A solid's children are `FACE`, `EDGE`, `VERTEX`, and `Points`. **`EDGE` objects report
  `isMesh === true`**, but they carry a `LineMaterial` and their vertex buffer holds fat-line data,
  not surface positions. Filtering on `isMesh` alone adopts them and yields degenerate quads pinned
  near the origin, which quietly wrecks the bounding box and sends auto-framing to the wrong place.
  Filter on `type === "FACE"`.

Camera framing re-centres on the model after every rebuild, but keeps whatever angle and zoom you've
set, only re-fitting the distance when the model's size changes by more than ~1.8×. So you can orbit
in close, keep typing, and the view stays put and stays on the part. The fit distance honours
whichever field of view is tighter, so a tall narrow window doesn't clip the part horizontally.

A third rendering trap, unrelated to the kernel but easy to hit: `renderer.setSize(w, h, false)`
sets the drawing buffer but **skips the canvas CSS size**, so on any display with
`devicePixelRatio !== 1` the canvas lays out at buffer size and overflows its container, the image
is drawn oversized and anchored top-left, pushing the model off-centre and partly off-screen. Use
`setSize(w, h)` and let three set the CSS size. A `ResizeObserver` on the container handles panes
that resize without firing a window `resize` event.

## Kernel behaviour worth knowing

These were established by probing the kernel directly, and are the things most likely to bite you if
you drop down to the raw API. BrepScript normalises all of them.

| Behaviour | Raw kernel | BrepScript |
|---|---|---|
| Cube origin | Corner at origin (0→size) | Same (matches OpenSCAD) |
| Cylinder / cone axis | Extrudes along **+Y** from y=0, centred in XZ | **+Z** from z=0, centred in XY |
| Torus plane | Lies in the XZ plane | XY plane |
| Sphere | Centred at origin | Same |
| Rotation units | **Degrees** (not radians) | Degrees |
| Boolean result identity | Result keeps the *target* solid's id and name | Chains automatically |

Two more that cost real debugging time:

- `newFeature()` returns a plain history entry `{ type, inputParams, persistentData, id }`, **not** a
  feature-class instance, and `inputParams` arrives **pre-populated with defaults**.
- The id lives at `inputParams.id`. Some kernel tests reference `inputParams.featureID`, which is
  `undefined`, yet the boolean still resolves and cuts correctly, because the kernel falls back when
  a reference is missing. So the mistake is invisible rather than fatal. Wire with `.id` anyway:
  relying on the fallback breaks as soon as there are more than two solids in play.
- A genuine silent no-op: an `undefined` **entry inside** `targets` (alongside a valid `targetSolid`)
  is skipped without complaint, the tool solid stays in the scene and nothing is cut.

## API

Everything returns an opaque shape node; nothing is evaluated until `build()`.

**Primitives**, `cube([x,y,z] | size, {center})`, `cylinder({r|d, h, r1/r2, $fn, center})`,
`cone({r1, r2, h})`, `sphere({r|d, $fn})`, `torus({r, tube, arc, $fn})`.

**Booleans**, `union(...)`, `difference(target, ...tools)`, `intersection(...)`. All variadic.

**Transforms**, `translate([x,y,z], ...)`, `rotate([rx,ry,rz], ...)` in degrees,
`scale([x,y,z] | s, ...)`, `mirror([nx,ny,nz], ...)`. Nesting composes as 4×4 matrices and is baked
into each primitive's transform block at compile time.

**Escape hatch**, `feature("SM.TAB", { ...params })` drives any kernel feature by short code, so
you're never boxed in by the DSL. Available codes include `P.CU P.CY P.S P.CO P.T P.PY` (primitives),
`B` (boolean), `E` (extrude), `R` (revolve), `F` (fillet), `CH` (chamfer), `SW` (sweep), `LOFT`,
`TU` (tube), `H` (hole), `M` (mirror), `PATTERN`, `THK` (thicken), `XFORM`, `S` (sketch),
`TEXT`, `HX` (helix), `SM.*` (sheet metal).

**Programmatic use**, `build(shape)` → `{ partHistory, solids }`, plus `toSTL(result)` and
`stats(result)`.

## CLI (headless, no browser)

This is a **separate way in from the "Type a model" editor**, not the thing that
powers it. The editor is the browser app: you type, it rebuilds on screen. The CLI
is a terminal command that takes a `.js` (or `.scad`) file on disk and writes an
STL, with no window, no viewer, and nothing to click.

Reach for it when you want to make files rather than look at them:

```bash
# one model to one STL
node src/cli.js examples/bracket.js -o bracket.stl

# same model, different sizes, no clicking
for r in 2.5 3 3.5; do
  node src/cli.js examples/bracket.js -D holeR=$r -o "bracket-$r.stl"
done

# just measure it, write nothing
node src/cli.js examples/bracket.js --info
```

Typical uses: batching out a family of sizes, regenerating parts in a build script
or CI, or editing an imported mesh repeatably. `examples/remove-feet.js` does the
last one, shearing the feet off a holder and boring glue pockets, straight from a
slicer-exported binary STL.

The two share all the same code, so a model that builds in the editor builds here.
Paste the editor's code into a file, add `export default`, and run it.

```
brepscript <model.js> [-o out.stl] [-D key=value]... [--info]

  -o, --output FILE     Write STL here (default: <model>.stl)
  -D, --define K=V      Inject a parameter, readable as params.K
  -t, --tolerance N     Export decimal precision (default 6)
      --info            Print facet counts and bounds, write nothing
```

A model file default-exports either a shape or a `(params) => shape` function.

## Reading OpenSCAD and JSCAD

BrepScript translates both, but they are in **very** different states, and it is
worth being blunt about it.

> ### If you want to run OpenSCAD, use OpenSCAD
>
> Real [OpenSCAD](https://openscad.org) is a mature, complete, well-tested
> program and it is unreservedly the right tool for OpenSCAD code. Nothing here
> competes with it.
>
> The translator in BREPcode exists as a **teaching and porting aid**: paste a
> `.scad` file you found, see it build, see the equivalent BREPcode next to it,
> and carry on from there. It handles *light* OpenSCAD. It will not run a serious
> library-heavy model, and it is not trying to.
>
> If a paste fails, that is expected rather than a bug worth reporting. Open it
> in OpenSCAD.

**JSCAD** is the one that genuinely works. It is JavaScript already, so the
translation is a real API mapping rather than a parser guessing at another
language's semantics, and `@jscad/modeling` models tend to build unchanged.

**OpenSCAD**, `.scad` files work directly from the CLI, and pasting OpenSCAD into the viewer is
auto-detected (the status line then reads `OpenSCAD · …`).

```bash
brepscript examples/knob.scad -o knob.stl
```

A practical subset is implemented: variables and arithmetic, `module` and `function` definitions
(including use-before-definition and `children()`), `for` with `[start:step:end]` ranges, `if`/`else`,
the `*` `!` `#` `%` modifiers, named and positional arguments, `d`/`d1`/`d2` diameter forms, global or
per-call `$fn`, axis-angle `rotate(a, v)`, and the usual primitives, booleans and transforms.

What it does **not** do, each raising a clear error naming the feature rather
than quietly producing the wrong solid:

| Not translated | Why it matters |
|---|---|
| The entire 2D subsystem (`square`, `circle`, `polygon` as 2D, `offset`, `projection`, `text`) | Anything that builds a profile then extrudes it. This rules out a large share of real `.scad` files |
| `include <…>` / `use <…>` | So BOSL2, MCAD, dotSCAD and every other library are out. Paste the file's contents in instead |
| `minkowski`, `surface`, `import` | No equivalent path |
| `hull()` of 2D shapes | Works in 3D only, wrap each shape in `linear_extrude()` first |
| `rotate_extrude` | Use `revolve()` on a BREPcode profile |
| List comprehensions, recursion, `assert`, `echo` beyond basics | The parser is deliberately small |

Put together: a self-contained model built from 3D primitives and booleans has a
good chance. Anything using a library, or that starts in 2D and extrudes, will
not translate. That is the line, and it is not moving much, because closing it
properly would mean writing an OpenSCAD implementation, which already exists and
is better than anything this would become.

**JSCAD**, import the compatibility layer; the `@jscad/modeling` API surface is mapped:

```js
import { primitives, booleans, transforms } from "brepscript/jscad";
booleans.subtract(
  primitives.cuboid({ size: [30, 30, 12] }),
  primitives.cylinder({ radius: 8, height: 20, segments: 64 }),
);
```

Its differing conventions are converted for you: JSCAD primitives are centred on the origin, and
JSCAD rotations are in radians. In the viewer, `primitives` / `booleans` / `transforms` are already in
scope, so JSCAD can be pasted straight in.

### The 2D subsystem: linear_extrude works

`square`, `circle`, `polygon`, and `linear_extrude` are real now, in all three languages. Under the
hood each 2D outline becomes a kernel **Plane → Sketch → Extrude** chain (the kernel had the
machinery all along, sketches with loop detection, `distanceBack` extruding +Z, and a Transform
feature for placement). Nothing is computed in 2D: booleans between 2D shapes keep their structure
and are applied by the manifold engine after extrusion, which is equivalent for straight extrusions.
Cutting tools are automatically overshot so caps never sit coincident.

```scad
linear_extrude(height=8)
  difference() {
    circle(r=10, $fn=64);   // ring = 2D difference, extruded
    circle(r=7, $fn=64);
  }
```

BrepScript: `linearExtrude({ h: 10, center: true }, polygon([[0,0], [20,0], [10,15]]))`, winding is
normalised automatically. JSCAD: `extrudeLinear({ height }, subtract(rectangle(...), circle(...)))`
plus `polygon`/`rectangle`/`circle`, including via `require('@jscad/modeling/src/operations/extrusions')`.

2D transforms (`translate`/`rotate`/`scale`/`mirror`) bake straight into the outline points.
Deliberately not supported, each with a clear error: `twist`, extrusion `scale`, `rotate_extrude`,
`polygon()` hole paths (use `difference()`), `offset`, and mixing 2D with 3D in one boolean.

### OpenSCAD libraries (BOSL2, MCAD, …)

`include <BOSL2/std.scad>` and `use <MCAD/…>` directives are handled rather than fatal. The
most-used calls are **shimmed**, reimplemented against our primitives, and every approximation
announces itself in the warnings line instead of silently changing geometry:

- **BOSL2**: `up/down/left/right/fwd/back`, `move`, `x/y/zmove`, `x/y/zrot`, `cuboid`, `cyl`,
  `x/y/zcyl`, `spheroid`, `tube`, `torus`, the anchor constants (`TOP`, `CENTER`, …). Attachable
  primitives render their children, so `cuboid() attach(TOP) cyl()` chains, but there is **no
  attachment solver**: `attach`/`position` place children at the parent's centre and say so.
  `rounding=`/`chamfer=` are accepted and ignored, with a warning ("edges left sharp").
- **MCAD**: `roundedBox` (corners square, warned), `polyhole`, `teardrop` (approximated, warned).
- **Anything else** (NopSCADlib, dotSCAD, threadlib, Round-Anything): the include warns that the
  library isn't bundled and the script continues, it still builds if it only used calls we know,
  and otherwise fails naming the missing call.

Also supported: `let()` (statement and expression), `assert()`, and declared-but-`undef` parameters.

This is deliberately a *compatibility net for pasted scripts*, not a claim of BOSL2 support, gears,
threading, sweeps, and real rounding would need the actual libraries under an OpenSCAD-WASM engine.

**CLI model files paste as-is too.** A file with `import { … } from "brepscript"` and
`export default (params) => …` runs verbatim in the viewer, the module skeleton is stripped and the
exported function is called with default params. The status bar always shows the model's bounding
box (`30.0 × 20.0 × 10.0 mm`), and clicking a shape shows that piece's own dimensions in the hint.

**Pasting LLM output works as-is.** Markdown fences (with any language tag, prose around them, even a
cut-off reply with an unclosed fence) are stripped before anything else. Full JSCAD modules, the
form Gemini and friends actually emit, with `require('@jscad/modeling')` or ESM imports, `main()`,
`getParameterDefinitions()` (defaults are applied), and `module.exports`, are rewritten and run;
a `main()` that returns an array of solids gets unioned. The status bar shows which language it
detected (`OpenSCAD · …` / `JSCAD · …`). Requiring an unsupported JSCAD namespace (`extrusions`,
`hulls`, …) raises an error naming it.

## Writing models with an LLM

`LLM_PROMPT.md` is a complete authoring guide written for a model rather than a person, paste it
into Gemini/Claude/GPT as a system prompt and describe the part you want. It pins down units and
orientation, gives the full closed vocabulary, lists what doesn't exist (so the model stops reaching
for `fillet` and `linear_extrude`), and covers the geometry rules that actually matter, overshoot
through-cuts, overlap unions, one target per difference.

Every worked example in it is covered by `test/docs.js`, so the guide can't drift into teaching code
that doesn't build.

### The recipe library

The in-app assistant used to send one fixed system prompt carrying everything it might ever need,
on every request: the fins paragraph, the imported-mesh rules, the whole reference-size table,
whether you asked for a battery box or a cube.

`viewer/recipes/` breaks that into tagged markdown files that are fetched only when a message
actually mentions them. The prompt went from **9.1 KB on every call to 4.3 KB**, plus 1-3 KB only
when it is relevant.

Tags nest, and that is the useful part:

```
"a battery holder"            -> #holder + #batt          -> asks "which cell?"
"a AAA holder, 3 across"      -> ##AAA + #batt + #holder   -> asks nothing, builds
"make a 20mm cube"            -> nothing at all
```

`##AAA` is a child of `#batt` and states 10.5 x 44.5 outright, so naming it removes the round-trip.
A matched child also drags its parent in even when the parent's own keywords never appeared, since
"a AAA holder" never says the word "battery".

Adding a subject is dropping a `.md` file in with a `tag:` and `match:` header — see
[viewer/recipes/README.md](viewer/recipes/README.md). The index is **generated** from that
frontmatter (`npm run recipes`), and `test/recipes.js` fails if the committed manifest has drifted,
because a hand-maintained list is exactly how the three.js addons once went missing from two
shipped bundles.

### Editing in plain English, with no API key

Beginners describe the *result*, not the operation. A good number of those phrases have exactly one
sensible reading once the part's bounding box is known, so the built-in assistant answers them
directly — no key, no cost, no round-trip, and **no chance of inventing a bounding box**, which is
the failure this class of edit is famous for.

| You say | It does |
|---|---|
| punch a hole, cut the middle, take a bite out of it | `difference` with a cylinder down the centre, through |
| round the edges, smooth it, soften the corners | `fillet` |
| bevel it, chamfer it, slant the edges | `chamfer` |
| take 0.2mm off the top, trim 2mm from the left | shave that face |
| extend the right side by 7mm, add 5mm to the top | push that face out |
| decrease width by 30%, make it 50mm wide, 20mm longer | cut a slab out of the middle, or fill one in |
| double the width, half the height | `scale` (and it says that features scaled too) |
| drop it to the floor | base to z = 0 |
| centre it | centroid to the origin |

Sizes are used when you give them and derived from the part when you don't. Anything that cannot
fit is refused with the number that explains why — *"a 90mm hole doesn't fit, the part is only 60mm
across at its narrowest"* — rather than built into a broken model. Genuinely ambiguous wording
("make it smaller", "make it wider") still goes to the AI instead of being guessed at.

The rest of the lexicon — hollowing, putting one shape on another's face, aligning several solids —
needs a judgement the bounding box cannot supply: a wall thickness, which face to open, what shape
to add. Those go to the model with `#lexicon` attached, and with no key the assistant says which
piece is missing rather than guessing.

### The epsilon rule

A subtractive body whose face lands exactly on the solid's face is a **coincident face**. The kernel
may or may not resolve it, and a slicer will happily print a thin skin across the "hole". It looks
correct in the viewer and fails on the printer, which is the worst way to be wrong.

So every cutter overshoots every surface it breaches. A through hole in a 10mm plate is
`h: 10 + 2*EPS` starting at `z: -EPS`, never `h: 10` starting at `z: 0`. This is in the always-on
part of the prompt rather than a recipe, because it applies to every subtraction anyone ever writes,
and the built-in assistant's own hole command emits it with the comment explaining why.

## Status and next steps

**Working today:** primitives, the three booleans (including nesting), transform
composition, `hull()`, `fillet()` / `chamfer()`, `linearExtrude()` / `revolve()`,
`stretch()` in both directions, `drill()`, `fins()`, text / stencils / scannable
codes, mesh import and editing, the CLI with parameter injection, the live
viewer, and the OpenSCAD / JSCAD translators.

**Export:** STL, OBJ, 3MF (including multi-colour), GLB, curved-surface STEP via
replicad, and a 3-view SVG blueprint. All covered by tests.

**The real remaining gap is edge selection.** `fillet()` and `chamfer()` work,
but they take a coarse target: everything, or a named face group
(`fillet({ r: 2, faces: "top" }, …)`). There is no way to say "the four vertical
edges" or "every edge above z = 10". The kernel identifies edges by generated
names, so a proper query layer (`.edges({ z: "max" })`) has to come first. That
is the genuinely hard part, and it is what most of the remaining polish depends
on.

Also missing: no 2D subsystem (so no `offset()` on profiles, and OpenSCAD's 2D
operators translate as errors rather than shapes), and no assembly or joint
model beyond `group()` keeping solids separate.

## Tests

```bash
npm test              # 25 suites, 521 checks
node test/run.js      # or run one
npm run test:desktop  # separate: launches the real Electron shell
```

`test/run.js` covers the DSL, `test/translate.js` the OpenSCAD/JSCAD translators, `test/docs.js` the
examples in `LLM_PROMPT.md`, and `test/bundle.js` the **built** site, that last one exists because a
missing vendored file passes every source-level check and then 404s for every user.

Every suite that touches the kernel ends with `process.exit(fail ? 1 : 0)`. That is not decoration:
the kernel leaves a socket handle open, so a test file that simply runs off the end never exits and
`npm test` hangs there forever without reporting anything.

The suite computes each solid's volume independently from the exported STL (signed tetrahedron sum)
rather than trusting the DSL's own bookkeeping, so it verifies the kernel's actual output, e.g. a
20mm cube minus a r5 through-hole must measure `8000 - π·25·20`.

## License

BREPcode is MIT. See [LICENSE](LICENSE).

It depends on the **BREP.io kernel**, which is licensed separately by Autodrop3d LLC and is
**not** MIT, notably, clause 1 requires that any modification to the kernel be contributed back
to Autodrop3d via pull request. The kernel is installed from npm and shipped unmodified, with its
own `LICENSE.md` included in `dist-site/vendor/kernel/` and inside the desktop build. If you fork
this project, that obligation travels with the kernel, not with BREPcode's own code.

Also bundled, each with its own license file alongside it:
[three.js](https://threejs.org) (MIT), [replicad](https://replicad.xyz) + OpenCascade.js for
curved-surface STEP export, and [bwip-js](https://github.com/metafloor/bwip-js) for barcodes.
