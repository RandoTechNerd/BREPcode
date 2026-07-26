# The recipe library

Modelling knowledge that used to sit in the system prompt on **every** request —
the fins paragraph, the import rules, the whole reference-size table — whether
the user asked about a cube or a battery box. That is slower, costs more per
call, and buries the two paragraphs that matter under six that do not.

Now each subject is one markdown file here, and only the ones a message actually
mentions get sent. A request for a plain cube pulls **nothing**.

## Adding a recipe

Drop in a `.md` file with frontmatter. That is the whole process — the index is
generated from these headers, never hand-maintained:

```markdown
---
tag: bearing
title: Ball bearings
match: bearing, bearings, 608, 6001
ask: Which bearing, and is it a press fit or a slip fit?
---

608: 22mm outer diameter, 8mm bore, 7mm wide...
```

| Key | Required | Meaning |
|---|---|---|
| `tag` | yes | Unique. Shown to the user as `#bearing`. |
| `match` | yes | Comma-separated keywords. Word-boundary matched, case-insensitive, plural-tolerant (`cell` catches `cells`). |
| `title` | no | Heading the model sees. Defaults to the tag. |
| `parent` | no | Makes this a **child** — see below. |
| `ask` | no | One question to ask when the subject is still vague. |

Then run `npm run recipes` (or just `node build-site.mjs`, which regenerates it).
`test/recipes.js` fails if the committed manifest has drifted from the files, so
a forgotten regeneration is caught rather than silently serving a stale index.

## Nesting: the point of the whole design

A **child** recipe carries exact numbers for one specific thing. Naming one tells
us the request is already specific, so the generic questions get skipped:

```
"a battery holder"           -> #holder + #batt      -> asks "which cell?"
"a AAA holder, 3 across"     -> ##AAA + #batt + #holder -> asks NOTHING and builds
```

A matched child pulls its parent in for context even when the parent's own
keywords never appeared — "a AAA holder" never says the word "battery".

Two things close a question: a child matched, or the user gave measurements.
The bias is deliberately toward **not** asking, because the harness already
requires the model to state its assumptions — an unnecessary question costs a
whole round-trip, a stated assumption costs one sentence.

## Writing the content

- Lead with the numbers. The model has the prose already; what it lacks is
  *your* tolerances.
- State clearances explicitly (`+0.5mm on diameter`), not as advice to add some.
- End a child with something like "You have every dimension you need — build it.
  Do not ask the user for measurements." The whole purpose of a child is to
  remove a round-trip.
- Keep it under ~4KB. If it is longer than that it is probably two recipes.
- Safety notes belong here, not in the prompt: coin cells and children, lithium
  venting, load direction on a bracket. This is where they are guaranteed to
  reach the model exactly when they are relevant.
