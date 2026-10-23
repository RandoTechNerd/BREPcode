# Deploying the site zip on Lovable

`BREPcode-site.zip` is a **finished, pre-built** static web app: 139 files,
36.9 MB unzipped, already compiled and already minified where it needs to be.
Nothing in it should be processed on the way to the server.

The zip has **no `brep/` folder inside it** — `index.html` is at the top level.
Its contents are what goes *into* `/brep/`.

The one thing that matters technically: in a Vite/React project (which is what
Lovable builds), everything under `public/` is copied to the output **verbatim**,
while everything under `src/` goes through the bundler. This app must be copied
verbatim, so it belongs in `public/brep/`. Handing it to the bundler would try
to parse a 10.4 MB WebAssembly binary and a hand-written Web Worker as
application source.

## Paste this into Lovable

> I'm adding a prebuilt static web app to this site. Please install it exactly
> as-is and change nothing else about the project.
>
> 1. Unzip the attached archive into `public/brep/`, so that
>    `public/brep/index.html` exists with `public/brep/vendor/`,
>    `public/brep/src/` and `public/brep/recipes/` beside it. It must go under
>    `public/`, never under `src/` — these files are already built.
>
> 2. Do not bundle, minify, transpile, reformat, rename, lint, tree-shake or
>    "optimize" anything under `public/brep/`, and do not import any of it from
>    application code. It is served as static files. The JavaScript is already
>    ES modules and every path inside it is relative, so any rewriting breaks
>    it. Preserve filename casing exactly.
>
> 3. It contains large binaries — `vendor/replicad/replicad_single.wasm` is
>    10.4 MB and `vendor/kernel/PartHistory-CIahaME9.js` is 9.1 MB. Please make
>    sure `.wasm` files are served with the `application/wasm` content type,
>    and that nothing is dropped from the deploy for being too large.
>
> 4. `public/brep/kernel-worker.js` is loaded as a Web Worker from that exact
>    path. Don't move or rename it.
>
> 5. Add a route at `/m/:slug` that immediately redirects to
>    `/brep/index.html#s=` followed by the slug, rendering nothing at all — no
>    layout, no flash of the landing page.
>
> 5b. Add three more redirects the same way, rendering nothing:
>    `/make` -> `/brep/index.html?make=1` (the quick door for newcomers),
>    `/tour` -> `/brep/index.html?tour=1`, and `/welcome` -> `/brep/index.html?welcome=1`.
>    Every other route stays as it is.
>
> 6. Keep the files under `public/brep/` that the zip does not contain:
>    `quicksave.js` (and `locked-key.js`, if there is one). Unzip over the
>    folder; never delete it first.
>
> 7. Never edit files under `public/brep/` by hand. Anything the app needs is
>    baked into the zip; a change made there is wiped by the next upload.

## Host-owned files

Three files live on brepcode.com and never in the zip:

- `quicksave.js`: Publish and the private cloud stash. `index.html` loads it
  with a plain `<script>` tag, so on any other host it simply 404s.
  `site/quicksave.live-2026-10-05.js` is a copy of the live one.
- the OCCT wasm, `replicad_single.wasm` (10.8 MB). The `/brep/` folder will
  not take a file that size, so it sits in the site's asset store, and
  `index.html` points there when it is running on brepcode.com. If that copy
  ever goes, `viewer/curved.js` falls back to a pinned public copy of the same
  bytes, so curved STEP keeps working; re-uploading it is still the better fix.

- the Rust BREP kernel, `vendor/brep-kernel-rust/brep_kernel_bg.wasm`
  (14.5 MB, the split engine's exact lane and "Open as an exact solid"). Too big
  for `/brep/` as well. Upload it to the asset store, then uncomment the
  `window.__BREP_RUST_WASM_URL` line in `viewer/index.html` with its address and
  rebuild the zip. Without it the site still works: the worker tries the wasm
  once per session, remembers that it failed, and every build runs on the JS
  kernel (the status line says "JS kernel (Rust unavailable)"), and the drop
  menu's exact-solid option reports that it can't load.

These used to be patched into the live `index.html`, `welcome.js` and
`curved.js` by hand (the `?example=` links, the example note, the wasm
address). They are in the source now, so a new zip no longer wipes them.

## Checking it worked

Four things, in order — each one tells you something different:

| Load this | You should get |
|---|---|
| `brepcode.com/brep/index.html` | the app, with a model on the plate |
| Export, STEP (curved), in the app | a .step file, not a hang (that is the OCCT wasm loading) |
| `brepcode.com/m/snapmakeru1` | the app, with the U1 on the plate |
| the browser console on the app | no red errors mentioning `vendor/` or `worker` |

If the third one works, publish a new short link from inside the app — it will
come out as `brepcode.com/m/your-name` on its own. Nothing needs switching on:
the app asks the server once whether `/m/` answers, and believes the answer.

If it does **not** work, nothing is broken. Short links keep coming out in the
`#s=` form, which needs no server configuration and always works.

## If the WASM 404s

`brepcode.com/brep/vendor/replicad/replicad_single.wasm` 404s on purpose (see
Host-owned files above), and the app copes. Any other missing file is a real
problem (vendor/manifold/manifold.wasm, a kernel chunk): if the app looks fine
until you build something and then hangs with no obvious cause, a file was
skipped or rewritten on the way in. Re-upload with the "do not
process anything under `public/brep/`" instruction stated first — that is the
rule an AI builder is most likely to help you out of.

## The vendor cache (`sw.js`)

brepcode.com sends no cache headers, so without help a browser keeps nothing
between visits: ~9 MB again every time, and the kernel twice per visit (the
page and the build worker each fetched their own copy). `sw.js`, at the top
of the zip, is a service worker that caches `vendor/` only, in a cache named
for a hash of the vendor files, and shares one download between the page and
the worker. Measured on a throttled phone profile: one kernel download instead
of two on a first visit, and a return visit fetching ~1.6 MB instead of all of it,
with the loading screen gone in 1.3 s instead of 3.1 s.

- It must be served from `/brep/sw.js` (it is, if the zip is unzipped as-is).
- `?nosw` on the app's address skips it, for comparing.
- A new zip with changed vendor files ships a new hash: the browser picks up
  the new `sw.js` on the next visit and drops the old cache.
- To retire it, ship an `sw.js` that only unregisters itself
  (`self.addEventListener("install", () => self.registration.unregister())`).
  Deleting the file is not enough: a registered worker outlives a 404.
