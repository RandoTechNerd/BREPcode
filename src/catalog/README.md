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
| `ask` | `{ unless: [params], text }`: the one question to ask when no spec was named |
| `tips` | three short follow-ups the chat suggests: "75 degrees", "90 mm wide" |
| `examples` | at least two whole requests that MUST route here (tested) |
| `params` | the dials; see below |
| `things` | named variants: `{ names, title, params, spec, keywords }` |
| `body` | BREPcode that uses the param names and RETURNS the part |

A param: `{ default, min, max, unit, label, say, more, less }`.
`unit` is `mm`, `deg`, `count`, `ratio` or `choice` (a choice has `choices` and
`words: { choice: [phrases] }`, and order matters: put "no lid" before "lid").
`say` are the words that tie a number to it ("120 mm wide" -> `say: ["wide"]`),
`more`/`less` the comparatives that nudge it ("wider", "narrower").

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
  ceilings are bridges and must be short.
- **Sits on z = 0** with a real footprint, and the default fits a 256 mm bed.
- **Watertight.** Overshoot every cut by at least 0.01 mm past the face it goes
  through; overlap unioned parts.
- **Builds fast.** A side profile `polygon()` + `linearExtrude()` or `revolve()`
  is cheapest; `hull()` of corner cylinders for rounded boxes; avoid fillets on
  whole parts. Default under 2 s; the test fails past 15 s.
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

## Routing

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
