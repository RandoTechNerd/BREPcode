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
>    layout, no flash of the landing page. Every other route stays as it is.

## Checking it worked

Four things, in order — each one tells you something different:

| Load this | You should get |
|---|---|
| `brepcode.com/brep/index.html` | the app, with a model on the plate |
| `brepcode.com/brep/vendor/replicad/replicad_single.wasm` | a download, not a 404 or an HTML error page |
| `brepcode.com/m/snapmakeru1` | the app, with the U1 on the plate |
| the browser console on the app | no red errors mentioning `vendor/` or `worker` |

If the third one works, publish a new short link from inside the app — it will
come out as `brepcode.com/m/your-name` on its own. Nothing needs switching on:
the app asks the server once whether `/m/` answers, and believes the answer.

If it does **not** work, nothing is broken. Short links keep coming out in the
`#s=` form, which needs no server configuration and always works.

## If the WASM 404s

That is the one failure worth naming in advance, because the app looks fine
until you build something and then hangs with no obvious cause. It means the
binary was skipped or rewritten on the way in. Re-upload with the "do not
process anything under `public/brep/`" instruction stated first — that is the
rule an AI builder is most likely to help you out of.
