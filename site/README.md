# The site half

Nothing in this folder ships in the app. It is what **brepcode.com** has to
serve alongside it, kept here so the contract between the two is written down
in one place instead of living in two people's heads.

There are no credentials in here and there must never be. Every file assumes
the browser is already authenticated the ordinary way — a session cookie the
host sets — so a key never has to reach the page. If you find yourself wanting
to paste a token into `quicksave.js`, the endpoint is wrong, not the file.

## What the app expects from the site

| the app calls | the site provides | what it does |
|---|---|---|
| `window.__brepPublish({name, text, thumb, visitor})` | `quicksave.js` | stores the model, returns `{ok, slug, url}` |
| `fetch(manifestUrl)` | any JSON host | the stash gallery: `{models: [{file, name, thumb}]}` |

## What the site expects from the app

| the site calls | the app provides | what it does |
|---|---|---|
| `window.__brepOpenQuicksave({name, text})` | `viewer/index.html` | loads a `.bcode` as a live project, meshes and all |

That last one is the whole of "Open in BREPcode". The published page does not
need to know anything about how a model is loaded — it hands over the `.bcode`
text and the editor does the rest.

## Files

- **`quicksave.js`** — defines `window.__brepPublish` and `window.__brepStashList`.
  Load it from the page that hosts the editor, after the app. Configure the
  endpoints by setting `window.BREPCODE_PUBLISH_ENDPOINT` (or a
  `<meta name="brepcode-publish">`) and `window.BREPCODE_LIST_ENDPOINT` (or
  `<meta name="brepcode-list">`) before it runs.

### Publishing without a list endpoint does not fill the stash

These are two halves of one feature and it is easy to ship only the first.
`__brepPublish` POSTs a model to the site; the stash gallery shows what
`__brepStashList` returns, falling back to the static
`secret-models/manifest.json` when there is no list endpoint. That fallback file
ships with an **empty** `models` array, so a host that implements publishing and
not listing publishes successfully into a gallery that is permanently empty —
the models are stored and cannot be opened. brepcode.com was in exactly this
state.

`GET /api/models` (or whatever `BREPCODE_LIST_ENDPOINT` names) should return
the models the signed-in user has published:

```json
[{ "name": "Dash goggles", "file": "https://…/goggles.bcode" }]
```

`{ "models": [...] }` is accepted too. `file` must be a URL the browser can GET;
relative paths resolve against the manifest location. A 404 here is fine and
means "this host has no list endpoint" — the gallery quietly uses the manifest.
- **`published-page.html`** — the template for `brepcode.com/<slug>`. Honours
  the `visitor` flags. Substitute the `__BREPCODE_*__` placeholders server-side.

## The `visitor` object

Five booleans, defined and normalised in [`../src/visitor.js`](../src/visitor.js),
which both the editor and the published page import so they cannot disagree:

```js
{ orbit: true, model: true, svg: false, html: false, edit: true }
```

A model stored before these existed has no `visitor` field. `normalizeVisitor()`
fills missing keys from the defaults — absent means "not specified", never
"forbidden" — so old models keep behaving exactly as they did.

**These flags are not a security boundary.** The `.bcode` is served to the page
either way, so a determined visitor can always read the source. They decide what
the page *offers*. Anything that genuinely must not be handed out should not be
published.

## Storage shape

`__brepPublish` sends one JSON body. A reasonable backend stores it as:

```
<slug>/model.bcode      the text, verbatim
<slug>/thumb.jpg        the data: URL decoded
<slug>/model.glb        base64-decoded; absent when `orbit` is off
<slug>/meta.json        { name, visitor, published }
```

The GLB is only sent when `visitor.orbit` is true — a page that will only ever
show a still does not need geometry uploaded for it. When it is absent the page
keeps the thumbnail, which is the correct appearance for that setting anyway.

`published-page.html` also expects `<model-viewer>` at `/vendor/model-viewer.min.js`.
Serve it yourself rather than from a CDN: a published model should not stop
spinning because someone else's host went down.

and serves `published-page.html` with the placeholders filled at
`brepcode.com/<slug>`. Republishing the same name overwrites all three, which
is what makes changing the visitor options on an existing model take effect.
