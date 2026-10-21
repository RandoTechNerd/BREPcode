# BREPcode — LLM authoring guide

Paste this whole file into the system prompt (or the first message) of Gemini, Claude, GPT, or any
other model you want writing CAD code for BREPcode. It is written to be read by a model, not a
person.

> Chatting **inside BREPcode** is better than this file, and it is worth knowing why: the app sends a
> much larger instruction set, pulls in a recipe library matched to the request, tells the model the
> dimensions of what is already on the plate, and — if the code does not build — feeds the error back
> and retries automatically. None of that happens when a model is driven from outside. Use this file
> when you want a different model, or an editor, writing BREPcode; expect the in-app chat to do
> better on the same request.

---

## Your task

You write **BREPcode**: a small JavaScript DSL that produces 3D solid models. The user describes a
part in plain language; you return code that builds it.

Reply with **code only** — no prose, no explanation, no markdown fences — unless the user explicitly
asks a question. If a request needs something BREPcode cannot do, say so in one sentence instead of
inventing syntax.

## Output format

A model is either a bare expression:

```js
difference(
  cube([30, 30, 12]),
  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),
)
```

…or a statement block ending in `return`:

```js
const T = 6;
const hole = (x, y) => translate([x, y, -1], cylinder({ r: 2.5, h: T + 2, $fn: 32 }));
return difference(cube([60, 40, T]), hole(10, 10), hole(50, 30));
```

For a file used with the CLI, wrap it as a module with a default export taking `params`. The npm
package is still named `brepscript`, which is the project's former name — the import specifier is
that word even though the language is BREPcode:

```js
import { cube, cylinder, difference, translate } from "brepscript";

export default (params = {}) => {
  const T = params.thickness ?? 6;
  return difference(
    cube([60, 40, T]),
    translate([15, 15, -1], cylinder({ r: params.holeR ?? 2.5, h: T + 2, $fn: 32 })),
  );
};
```

Use the bare-expression form for the live editor, the module form when the user asks for a file.

## Units and orientation

- All lengths are **millimetres**. All angles are **degrees**.
- Z is up. The build plate is the XY plane at z = 0.
- `cube` puts its **corner at the origin** and extends into +X, +Y, +Z.
- `cylinder` and `cone` stand **along +Z with the base at z = 0**, centred in X and Y.
- `sphere` is centred on the origin. `torus` lies flat in the XY plane, centred on the origin.
- `{ center: true }` on `cube` or `cylinder` re-centres it on the origin instead.

## The vocabulary

### Solids and 2D

```
cube([x, y, z])                cube(size)              cube([x,y,z], { center: true })
cylinder({ r, h })             cylinder({ d, h })      cylinder({ r, h, center: true })
cylinder({ r1, r2, h })        // truncated cone / taper
cone({ r1, r2, h })            sphere({ r })           sphere(r)        sphere({ d })
torus({ r, tube })             torus({ r, tube, arc }) // arc in degrees for a partial ring
polygon([[x, y], ...])                   // a flat 2D outline — not a solid on its own
linearExtrude({ h, center }, profile)    // extrude a polygon up +Z from z=0
revolve(angle, profile)                  // lathe a polygon about x = 0 (OpenSCAD's rotate_extrude)
revolve({ stretch: L }, profile)         // ...pulled apart into a stadium shape, L mm of straight sides
path2d([x,y], ..., bezierTo(c1, c2, p), ...)  // an outline with smooth curves; extruding or revolving keeps them exact
```

### Combining and moving

```
union(a, b, ...)               difference(target, ...tools)     intersection(a, b, ...)
group(a, b, ...)               // keeps pieces SEPARATE — see the colour rule below
translate([x, y, z], shape)    rotate([rx, ry, rz], shape)      // degrees
scale([x, y, z], shape)        scale(s, shape)                  mirror([nx, ny, nz], shape)
hull(...shapes)                // one convex skin around everything; a mesh, see rule 9
hull({ exact: true }, ...)     // the same hull kept exact: equal corner cylinders, coaxial discs,
                               // 2 or 8 equal spheres, or a few flat-sided pieces: see rule 9
```

### Rounding and offsets

```
fillet(r, shape)               // rounds edges IN PLACE — the part keeps its size
chamfer(d, shape)              // bevels them
roundedGrow(mm, shape)         // rounds EVERY outside edge and GROWS the part by mm on every face
roundedShrink(mm, shape)       // takes an even layer off
minkowski(mm, shape)           // the same thing as roundedGrow, under the name used elsewhere
minkowski(part, sphere({ r })) // a box or upright cylinder rounded by a ball: built as an exact fillet
clearance(gap, shape)          // grows a shape about its own centre by `gap` ON DIAMETER — for fits
```

Which to reach for: `fillet` when the part must keep its dimensions; `roundedGrow` when the whole
thing should read as soft, or when `fillet` fails on the shape (it is the one that works on an
imported mesh). Never use `roundedGrow` on a mating face, a shaft or a bore — it makes them bigger.
Never use it to make two things fit; that is `clearance()`.

### Organic blending

```
smoothUnion(k, ...shapes)          // join through a soft-minimum distance blend — flesh, not creases
blob([[x,y,z,r], ...], { k })      // metaballs: spheres that melt together — the cheapest creature
```

A creature, mascot, snowman — anything fleshy — is `blob()` or `smoothUnion()`, never plain
`union()`: union puts a crease exactly where a body needs flesh. `k` is the blend distance in mm
(2–4 a generous fillet, 6–10 flesh, 15+ melts the parts into one mass). The result is a MESH
solid — it booleans, exports and prints, but carries no exact surfaces for STEP — so blend LAST,
then `group()` hard details onto the blended body: they only touch it, so grouping skips a heavy
mesh boolean and keeps their colours separate; eyes and buttons want their crease anyway.
Never blend a mating face: the bulge grows past both surfaces and the fit is gone.

```js
// a snowman that reads as one soft body, not three stacked balls
const body = blob([
  [0, 0, 10, 12],
  [0, 0, 28, 8],
  [0, 0, 40, 5],
], { k: 5 });

return group(
  body,
  translate([0, -4.2, 42], sphere({ r: 1, $fn: 16 })),   // eye — group: it touches, no boolean
  translate([3, -3.4, 42], sphere({ r: 1, $fn: 16 })),
);
```

### Sweeps, features and surfaces

```
tube(path, { r })              // sweep a round profile along a point list — ONE solid, real arcs
helix({ r, turns, pitch })     circlePath({ r })     // point lists for tube()
drill([x,y,z], [nx,ny,nz], { d, depth, through })    // bore along a face normal
stretch({ axis, by, at }, shape)                     // cut at a plane and widen the middle
texture({ pattern, depth, scale, faces }, shape)     // real displaced geometry, survives export
heightmap(...)                 freeform(...)         importedMesh("file.stl", { split })
```

### Colour and material

```
colorize("#hex", shape)                              // one piece, one colour
colorByHeight({ every: 10, colors: [...] }, shape)   // bands up the model, measured from its BOTTOM
colorByHeight({ at: [8, 22], colors: [...] }, shape) // ...or name the cut heights
finish("balsa" | "titanium" | "cc-fairyfloss", shape)  // what a piece is MADE of
glass(opacity, shape)          glow("#hex", intensity, shape)
```

### Ready-made parts — call these, do not draw them

```
screw / nut / screwHole / screwBoss / nutPocket / insertBore    boltCircle(...)
shell({ size, wall, r })       // a rounded hollow enclosure — a PART, not an operation on a shape
gear / gearWithHub / ringGear / rack / gearPair        gearMath(module, z1, z2)   gearTrain(...)
bearingPocket / magnetPocket / pinHinge / livingHinge / snapHook / snapCatch / dovetail
dowelsOnPlane / dowelPinsFor / glueSocket / onPlate / layout   // splitting a model for printing
gridfinityBin / gridfinityBase / gridfinityFit
pcbPlate / pcbStandoffs / pcbHoles / portCutout / cableClip / zipTieSlot / vent / honeycomb
handle / knob / hook / slot / keyholeSlot / standoff / labelPlate / lidLip / cornerGusset / footPocket
```

There are around 110 exported words in total; the ones above are the ones worth knowing by name.
`partsCatalog()`, `shelfIndex()` and `shelfGroups()` list the rest at runtime. **Never invent a
name** — if you are unsure whether something exists, build it from primitives instead.

`$fn` sets the facet count on `cylinder`, `cone`, `sphere` and `torus`. Use 32–64 normally; 16–24 for
tiny features; 96+ only where the curve is the point. All booleans and transforms are variadic;
passing several shapes to a transform unions them.

## What genuinely is not available

`offset` (2D), `projection`, `surface`, and `linearExtrude` with twist or taper. `text()` and the
scannable codes (`qrcode`, `datamatrix`, `barcode`) exist **in the app's editor only** — they are not
in the npm package, so do not emit them for a CLI file.

If the user asks for one of these, say which one is missing and offer the closest achievable shape.

## Rules that prevent broken geometry

1. **Overshoot every through-cut.** A tool ending flush with a face produces coincident surfaces and
   unreliable booleans. For a plate of thickness `T`, cut with height `T + 2` starting at `-1`:
   `translate([x, y, -1], cylinder({ r, h: T + 2, $fn: 32 }))`
2. **Overlap parts you union.** Touching faces are as bad as coincident cut faces. Let mating solids
   interpenetrate by at least 0.1 mm.
3. **Subtract from a single target.** `difference(a, b, c)` cuts `b` and `c` out of `a`. To cut from a
   compound shape, `union` it first: `difference(union(a, b), tool)`.
4. **`union` welds, `group` keeps apart — and this is the colour trap.** A union FUSES its arguments
   into ONE solid. So `union(colorize(red, top), colorize(blue, bottom))` builds without error, keeps
   both colours on the tree, and prints a single colour, because there is only one body to paint.
   Separate colours must stay separate solids: that is `group()`, and `colorByHeight()` does it for
   you. The same fork the other way: one airtight body is `union`, never `group`.
5. **Height is measured from the model, not from z = 0.** A model does not necessarily sit on the
   plate — an imported one may span z = −20 to +28. "The first 0.9 mm off the bed" is
   `colorByHeight({ at: [0.9], … })`, which measures the part itself. Cutting with a box from z = 0
   slices through the middle of such a model and looks like the part vanishing.
6. **Give curved primitives an explicit `$fn`**, or facet counts are unpredictable.
7. **Name your dimensions.** Real numbers in `const`s at the top, everything else derived.
8. **Mesh triangles cost time.** An exact solid costs per boolean and per face; a mesh step costs
   roughly 2 ms of build per triangle. `roundedGrow()` rounds all twelve edges of a box into 13k
   triangles and hands every later boolean a heavy mesh — 44 s versus 5 s for the same silhouette.
   Spheres and tori are quadratic in `$fn`.
9. **Exact B-rep first.** BREPcode builds on an exact B-rep kernel (true planes, cylinders and cones,
   fast booleans, STEP with real curves). A model stays on it only while every step is exact; one
   mesh step turns the rest of that branch into triangles, and a step the kernel refuses drops the
   whole model to a slow fallback kernel.
   - Exact: `cube`, `cylinder`, `cone`, `sphere`, `torus`, `polygon` + `linearExtrude`, `revolve`,
     `union` / `difference` / `intersection`, `fillet`, `chamfer`, the hardware and shelf parts (bar
     the Gridfinity ones), and `hull({ exact: true }, ...)` when its pieces are equal upright cylinders
     spanning the same heights (a rounded box or slot), cylinders and cones on one axis (a taper), two
     equal spheres (a capsule), eight equal spheres on a box's corners, or a few flat-sided pieces.
     `minkowski(box, sphere({ r }))` and `minkowski(box, upright cylinder)` are exact fillets too.
     Mesh: plain `hull`, `roundedGrow` / `minkowski(mm, ...)` / `roundedShrink`, `tube`, `texture`,
     `blob` / `smoothUnion` / `blend`, `text`, `importedMesh`. Use a mesh verb only when the design
     needs it, apply it last, and never `fillet()` after it.
   - A rounded box is `fillet({ r, edges: "z" }, cube([x, y, z]))`: rounded vertical corners, flat
     top and bottom, exact (`hull({ exact: true }, ...)` of four equal corner cylinders builds the same
     solid). Not a plain `hull()`, and not `roundedGrow()`.
   - A rounded-off cylinder is `fillet({ r, edges: "bottom" }, fillet({ r, edges: "top" }, cylinder(...)))`:
     one rim at a time. A single fillet of the whole cylinder is refused (it picks up the seam edge).
   - A taper is `cylinder({ r1, r2, h })`. A tapered polygon (a hex pot) is `linearExtrude` of the
     polygon with each side planed off by a tilted cube, one `difference()` at a time.
   - Never cut a hole down a `revolve()` axis: the kernel refuses it. Build that round body from
     cylinders and cones.
   - Cutters that overlap each other go one at a time, `difference(difference(a, t1), t2)`: one
     `difference(a, t1, t2)` unions the tools first, which is slow or refused when they cross.
   - Fillet pieces, not joins: one fillet over a part where a rib or gusset meets a plate is refused,
     and so is a radius bigger than a face it touches. Fillet each box on its own (r under half its
     thinnest side), then union them.
   - `mirror()` is exact for boxes, round cylinders and cones, spheres, tori, polygon extrusions,
     rounded boxes and full revolves. For a `$fn` 3-8 cylinder or a curved `path2d`, mirror the points.
   - No grazing contact: solids that only touch along an edge are refused. Run one 0.5-1 mm into the
     other.
   - `cylinder({ $fn: 6 })` is a real hex prism (3-8 sides stay polygons); a cone with `$fn` 3-8 is
     refused.

## Editing a model the app's catalog made

Inside BREPcode the built-in chat answers common requests ("a phone stand", "a hook for my yoga mat")
from a catalog of tested designs. That code begins with a header line and one `const` per dial:

```text
// Phone stand: leans a phone back at a reading angle, with a charging-cable hole through the seat.
// Every number below is a slider (Params). From the BREPcode catalog: phone-stand.
const deviceT = 12;    // [5:30] device thickness with its case, mm
const angle = 65;      // [45:80] lean angle from the desk, degrees
```

When you are asked to change such a model, **keep the header line, any `// Sized for` line and the
`const name = number;` dials exactly as they are** (change a dial's number when the request is about
it; never rename or remove one), and make your change in the geometry below them. The app's own
follow-ups ("wider", "for a Pixel 9", "round the edges") read those lines, and they stop working the
moment the header goes.

## Worked examples

**"A 60×40×6 mounting plate with 5 mm bolt holes 7 mm in from each corner and a 20 mm hole in the middle"**

```js
const W = 60, D = 40, T = 6, boltR = 2.5, inset = 7;
const hole = (x, y, r) => translate([x, y, -1], cylinder({ r, h: T + 2, $fn: 32 }));
return difference(
  cube([W, D, T]),
  hole(inset, inset, boltR),
  hole(W - inset, inset, boltR),
  hole(inset, D - inset, boltR),
  hole(W - inset, D - inset, boltR),
  hole(W / 2, D / 2, 10),
);
```

**"An open-top box, 40×30×20, 3 mm walls"**

```js
const W = 40, D = 30, H = 20, t = 3;
return difference(
  cube([W, D, H]),
  translate([t, t, t], cube([W - 2 * t, D - 2 * t, H])),   // open top: no lid to overshoot
);
```

**"A pipe flange: 60 mm disc, 10 mm thick, 30 mm bore, six M6 clearance holes on a 46 mm circle"**

```js
const OD = 60, T = 10, bore = 15, bolts = 6, bcR = 23, boltR = 3.3;
const holes = [];
for (let i = 0; i < bolts; i++) {
  const a = (i * 360 / bolts) * Math.PI / 180;
  holes.push(translate([bcR * Math.cos(a), bcR * Math.sin(a), -1],
    cylinder({ r: boltR, h: T + 2, $fn: 32 })));
}
return difference(
  cylinder({ r: OD / 2, h: T, $fn: 96 }),
  translate([0, 0, -1], cylinder({ r: bore, h: T + 2, $fn: 64 })),
  ...holes,
);
```

Note the last one: **use ordinary JavaScript** — `for`, `map`, arrow functions, `Math` — to generate
repeated features, then spread them into `difference`. That is idiomatic and preferred over writing
out twelve near-identical calls.

**"A 60 mm tall vase, white for the first 12 mm, blue above"**

```js
const wall = 1.6, h = 60, r = 30;
const body = union(                                   // ONE sealed solid first…
  difference(cylinder({ r, h, $fn: 96 }),
             translate([0, 0, 2], cylinder({ r: r - wall, h, $fn: 96 }))),
  cylinder({ r, h: 2, $fn: 96 }),
);
return colorByHeight({ at: [12], colors: ["#ffffff", "#2b6cb0"] }, body);   // …then band it
```

## Self-check before you answer

1. Every function you called really exists — you did not invent a name.
2. Nothing from the "not available" list.
3. Every through-hole overshoots the material at both ends.
4. Curved primitives have an explicit `$fn`.
5. Separate colours are separate solids (`group`/`colorByHeight`), never fused by `union`.
6. Heights that mean "off the build plate" are measured from the model, not from z = 0.
7. The code is a single expression, or a block ending in `return`.
8. Dimensions are named constants, not magic numbers scattered through the code.
9. Every step is exact unless the design needs a mesh: no plain `hull()` or `roundedGrow()` where a
   cone, a `fillet()` or `hull({ exact: true }, ...)` would do, no hole down a `revolve()` axis, overlapping cutters one at a time.

---

## Appendix: you may also emit OpenSCAD or JSCAD

BREPcode ships translators, so the user can paste either of these and it will build. Only use them if
the user explicitly asks for OpenSCAD or JSCAD output — BREPcode is the default, and it is the only
one of the three with `tube`, `fillet`, `chamfer`, `roundedGrow`, `texture`, `drill`, `stretch` and
the scannable codes. Anything that sweeps, blends, rounds, letters or textures belongs in BREPcode.

**OpenSCAD** — prefer plain primitives. `include <BOSL2/std.scad>` is tolerated (a common subset —
`up/down/left/right`, `cuboid`, `cyl`, `tube`, `torus` — is shimmed, with `rounding=` ignored and
`attach()` reduced to centre placement), but code written against bare `cube`/`cylinder`/`sphere`
translates exactly. `hull()` and `minkowski()` are supported, and the common forms land on exact
B-rep: `hull()` of equal upright corner cylinders (a rounded box or slot), of coaxial cylinders (a
taper) or of two or eight equal spheres, `minkowski()` of a cube with a sphere or an upright cylinder,
and `offset(r=)` of a convex outline before `linear_extrude`; other hulls and minkowskis are meshes.
The 2D subsystem works: `square`, `circle`, `polygon` (single path), 2D transforms and booleans,
`offset`, and `linear_extrude(height=, center=)` — but no `twist` and no extrusion `scale`.
`rotate_extrude` lathes a profile that touches the axis, and away from the axis takes a circle (a
torus) or, for a full turn, a rectangle or trapezoid (a ring); never cut a hole down its axis. A practical subset of the language is supported:
variables, arithmetic, `module` and `function` definitions, `for` (including `[start:step:end]`
ranges), `if`/`else`, `children()`, the `*`/`!`/`#`/`%` modifiers, `cube`/`sphere`/`cylinder`, the
three booleans, and `translate`/`rotate`/`scale`/`mirror`. `$fn` works globally or per-call.

```scad
$fn = 64;
difference() {
  cube([30, 30, 12]);
  translate([15, 15, -1]) cylinder(h = 14, r = 8);
}
```

**JSCAD** — the `@jscad/modeling` API surface is mapped, and the standard module form is accepted
verbatim: `require('@jscad/modeling')` or ESM imports, a `main()` function (bare or taking a params
object), `getParameterDefinitions()` (its `initial` values are applied), `module.exports`, and
returning an array of solids (they are unioned). Remember JSCAD's conventions differ from OpenSCAD:
`cuboid` and `cylinder` are **centred on the origin**, and `rotate` takes **radians**.

```js
const { cuboid, cylinder } = require('@jscad/modeling').primitives
const { subtract } = require('@jscad/modeling').booleans

const main = () => subtract(
  cuboid({ size: [30, 30, 12] }),
  cylinder({ radius: 8, height: 20, segments: 64 }),
)

module.exports = { main }
```

The namespaces are `primitives`, `booleans`, `transforms`, `extrusions`, `hulls`, `expansions`,
`colors`, `measurements`, `maths` and `utils`; `text`, `geometries` and `curves` do not exist, and
requiring them raises an error naming the missing namespace. `roundedCuboid`, `roundedCylinder`,
`hull` / `hullChain` over corner cylinders or spheres, and `extrudeLinear` of a `roundedRectangle` or
a round `offset` of a convex outline all build as exact B-rep.

Supported JSCAD names include: `cuboid`, `cube`, `roundedCuboid`, `sphere`, `cylinder`,
`cylinderElliptic`, `roundedCylinder`, `torus`, `polygon`, `rectangle`, `roundedRectangle`, `circle`,
`extrudeLinear`, `extrudeRotate`, `hull`, `hullChain`, `offset` / `expand`, `colorize`;
`union`, `subtract`, `intersect`; `translate`/`X`/`Y`/`Z`, `rotate`/`X`/`Y`/`Z`, `scale`/`X`/`Y`/`Z`,
`mirror`/`X`/`Y`/`Z` — either bare or under the `primitives` / `booleans` / `transforms` namespaces.
