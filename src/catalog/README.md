# The BREPcode model catalog

Real things people print (a phone stand, a hook for a yoga mat, a cable clip), as
tested parametric designs the built-in chat can hand out with no AI. "I want a
phone holder" or "make me a hook for yoga roll" lands on a family, sizes it from
a real object if one is named, and puts readable code in the editor whose numbers
are sliders.

```
src/catalog/
  schema.js        what a family is; resolveParams, familyCode, validateFamily
  match.js         request -> family + spec + params (no AI)
  edit.js          follow-ups on an OPEN model: reads the dials back out of the
                   code and rewrites only the const lines that change
  index.js         registry (imports each category's index.js)
  specs/           real-object sizes shared by everyone (phones, tablets, round things, handles, cables)
  <category>/      one folder per category, each with its own index.js
    index.js       FAMILIES = [...], SPECS = [...] for this category only
    <family-id>.js one family per file
```

Categories: desk, wall, storage, kitchen, bathroom, garage, garden, electronics,
home, fitness, gaming, pets, travel, kids, printer, vehicle, decor, access.

## Adding a family

1. Write `src/catalog/<category>/<id>.js` exporting one family object.
2. Import it in that category's `index.js` and add it to `FAMILIES`.
3. `node test/catalog.js --full --category <category>` until it is green.

Read `desk/phone-stand.js` and `wall/cradle-hook.js` first: they are the pattern.

### The family object

| field | what it is |
|---|---|
| `id` | kebab-case, unique across the whole catalog |
| `category` | the folder it lives in |
| `title`, `summary` | "Phone stand", one sentence (it heads the generated code) |
| `print` | how it prints: orientation, and "no supports" (which the test holds you to) |
| `names` | multi-word phrases people say for it: "phone stand", "phone holder". NEVER a lone generic word like "hook", "clip", "holder", "box" (see Routing) |
| `nouns` | the generic head words ("stand", "hook"): weak on their own |
| `keywords` | weaker still: words that hint at it ("desk", "kitchen") |
| `fits` + `fromSpec(spec)` | spec kinds that can size it, and how a spec's dims become params |
| `primary` | the param a bare "150 mm" means when nothing else says (e.g. a diameter) |
| `triple` | params that "120 x 80 x 50" fills, in order |
| `ask` | `{ unless: [params], text, choices }`: the one question to ask when no spec was named; `choices` become one-tap replies |
| `tips` | three short follow-ups the chat suggests: "75 degrees", "90 mm wide". Every tip (and every `ask.choices` entry) must change a dial or ask a question on the family's own default code: the test sends each through the chat and fails a dead one |
| `examples` | at least two whole requests that MUST route here (tested) |
| `params` | the dials; see below |
| `things` | named variants: `{ names, title, params, spec, keywords }` |
| `derive(values)` | optional: fold one dial into others after every layer is in, returning overrides (clamped like any layer). The battery organizer turns `count: 12` into `cols: 4, rows: 3, count: 0`, so "holder for 12 AA batteries" sets the grid and the code shows it |
| `body` | BREPcode that uses the param names and RETURNS the part |

A param: `{ default, min, max, unit, label, say, more, less }`.
`unit` is `mm`, `deg`, `count`, `ratio` or `choice` (a choice has `choices` and
`words: { choice: [phrases] }`, and order matters: put "no lid" before "lid").
`say` are the words that tie a number to it ("120 mm wide" -> `say: ["wide"]`),
`more`/`less` the comparatives that nudge it ("wider", "narrower").
`role` marks a dial the chat should reach for by job: `role: "round"` for an
edge or corner radius ("round the edges" turns it up), `role: "holes"` for a count
of screw or drill holes ("add another hole"). Without them the chat falls back to
a generic fillet / a hole down the middle, which is cruder.
`fixed: true` keeps a size out of "scale it up" (anything matching a real
object or a fit: screws, clearances, walls and device sizes are kept by default).

### Things are how a few families cover a thousand requests

A thing is a family with some dials preset and its own names: the cradle hook is
also the yoga mat hook, the foam roller holder and the hose hanger. Prefer one
good family with ten things over ten near-identical families. Give a thing a
`spec` when it is FOR a real object; the matcher also uses that when the request
names the object but not the thing ("a hook for my foam roller").

### Specs

Real objects with real sizes. `specs/devices.js` and `specs/household.js` are
shared: do not edit them in a category session; put new objects in your
category's `index.js` `SPECS` (same shape: `{ id, kind, names, dims, label, note }`).
Sizes come from manufacturer spec sheets or standards; when an object varies,
use the common size and say so in `note`.

## Design rules (the test enforces most of them)

- **Prints with no supports, in the orientation it is built in.** Choose the
  orientation for printing (a hook lies on its side, a shelf on its back plate),
  not for how it hangs. Overhangs stay within 45 degrees of vertical; flat
  ceilings are bridges and must be short. A family that MEANS to have one (a
  bridge or overhang test print) declares it with `bridgeArea(values)`, the
  mm2 of down-facing area the test should allow.
- **`rotate([x, y, z])` applies Z first**, the reverse of OpenSCAD. Nest
  single-axis rotates when the order matters; `rotate([90, 90, 0])` sends a
  profile's x to y, its y to z and the extrusion to +x.
- **Sits on z = 0** with a real footprint, and the default fits a 256 mm bed.
- **Watertight.** Overshoot every cut by at least 0.01 mm past the face it goes
  through; overlap unioned parts.
- **Builds fast.** A side profile `polygon()` + `linearExtrude()` or `revolve()`
  is cheapest; `hull()` of corner cylinders for rounded boxes; avoid fillets on
  whole parts. Default under 2 s; the test fails past 15 s. What the six
  category sessions measured (time a family in a FRESH process: identical
  geometry is cached and re-builds instantly):
  - `difference(a, ...cutters)` as a flat list is fast; `difference(a, union(...cutters))`
    is the slow path (11 s to 0.55 s for 48 pockets).
  - A cut costs by the TARGET's face count: ~5 ms per hole in a cube, 150-300 ms
    in a revolve or an exact cylinder, growing per hole. Cut holes in a plain plate
    first, then union it to the round part; cutting from `hull()` pieces is fast.
  - A revolve minus a cylinder on its own axis: 8-15 s. Put the cavity in the
    revolve profile instead (0.1 s), or build from `cylinder({ r1, r2 })`.
  - Near-coincident geometry (0.01 mm overlaps, a cone rim exactly on a cylinder
    radius, tangent faces) turns 1 s into 20 s and can leave the mesh not
    watertight. Overlap by 0.4-1 mm or touch exactly.
  - Many parts: `union(body, union(...parts))`, not `union(body, ...parts)`
    (31 s to 2.4 s for a brick with 64 studs). Tilted round pegs: use 8-gons.
  - A low `$fn` IS the polygon: `$fn: 8` grips an axle fine and costs a quarter
    of `$fn: 24`. `revolve()` needs an edge on x = 0 (no ring profiles).
- **No name a DSL word**, as a param or as a `const` in the body (`hook`,
  `slot`, `shell`, `handle`, `knob`, `standoff`… the test lists the clash).
- **Only the params become sliders.** A body `const N = 48;` turns into a
  meaningless slider: derive it (`Math.max(4, plateT)`) or make it a helper
  default (`(r, a0, a1, N = 48) =>`).
- **No `text()`, `qrcode()` or other editor-only words**: the catalog must build
  headless, where they do not exist.
- **Design it yourself.** Real-object SIZES are facts; other people's models are
  not. Do not copy geometry from Thingiverse, Printables or MakerWorld.
- Mounting: countersunk holes for screws (the face the head goes on), keyholes
  for hanging, a flat back for adhesive. Clearances: 0.3 mm per side for a slip
  fit, 0.6+ for "drops in", interference (negative) only for snap rings.

## Follow-ups (edit.js)

The code the chat puts in the editor carries one header line that every
later follow-up keys on:

```
// Every number below is a slider (Params). From the BREPcode catalog: phone-stand.
```

`catalogOf(code)` finds the family from it; `editCatalog(family, code, text)`
reads the dials back out of the `const` lines and rewrites only the ones a
message changes, so a fillet the chat wrapped on, a colour, or a line the user
typed all survive "wider". What it understands, in the order it tries them:

- a dial named outright, on or off: "no cable hole", "add a divider", "with a lid"
  ("with stepped rows" turns a dial sitting at zero up to a third of its range)
- holes: "add another hole", "two more holes" (`role: "holes"`, else a drilled hole)
- rounding: "round the edges", "sharp corners" (`role: "round"`, else a fillet wrap)
- one feature: "bigger drainage hole", "make the slot wider" (by `say` words)
- an object: "bigger phone" asks which phone, with the family's `ask.choices`
- one axis: "twice as wide", "half the height"
- the whole part: "scale it up 20%", "bigger" (clearances, walls and fits stay)
- numbers and words: "90 mm wide", "for a Pixel 9", "70 degrees", "120 x 80 x 50"

A line that is no longer a plain number (`const width = w * 2;`) is reported
back ("missing-dial") rather than overwritten. Anything an AI writes over the
code must keep the header line, or the follow-ups stop (LLM_PROMPT.md says so).

What the editor does NOT do, so tips and names work round it:
- a thing's name wins over the numbers in the same message ("a set of 8
  place card holders" sets the place-card thing, whose preset count is 4):
  a count tip names the dial's own word instead ("a set of 8 stands");
- a thing is only recognised by the words that are not the family's own
  names and nouns: "for compression socks" cannot reach a thing when
  "compression sock aid" is also a family name, so the phrase lives on the
  thing alone;
- a plural is stemmed by one letter: "dominoes" is not "domino", so a thing
  that answers to both lists both;
- "3 in a row" reads "in" as inches; say "3 balls in a row";
- a tip equal to the default ("8 holes" on an 8-hole rack) changes nothing
  and reads as dead: tips must move something.

## Routing

What the matcher understands, so names do not have to work around it:
fractions ("5/8 inch", "1-1/4"), units (mm, cm, inch, ", degrees), "W x D x H",
counts both ways ("3 cables", "cables 3"), brand names mapped to generic ones
(lego, frisbee, post-it, velcro, sharpie), and model numbers glued to letters
(cat6, m4, 18650, 18v) or inside a named object ("iPhone 15") are names, never
sizes. Filler words are dropped from requests and names alike ("a", "my",
"printed", "3d", "can you"); "3", "d", "can" and "one" are kept, because
"d ring", "can rack" and "3 inch grommet" need them. The test fails any
several-word name that filler removal shrinks to one word, and any phrase two
families both claim.

`match.js` scores each family against a request: a whole name phrase is strong
(10+), a noun is weak (4), keywords weaker (1), and a spec the family `fits`
adds 6. 9 is the line. So "hook" alone matches nothing (correct: it is too
vague), "a hook for my yoga mat" matches the cradle hook (noun + spec), and
"phone holder" matches the phone stand outright.

Two families claiming the same phrase is a routing bug: the test routes every
example and every thing name and fails if it lands anywhere else. Generic words
belong in `nouns`, never in `names`. The rule engine's own requests ("a box with
a cone on top", "plate with a hole") must still route to nothing.

## Tests

```
node test/catalog.js                          quick: shape, routing, defaults build
node test/catalog.js --full                   every thing, every param at min and max
node test/catalog.js --full --category desk   one category
```
