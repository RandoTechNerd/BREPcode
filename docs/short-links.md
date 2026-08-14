# Tidy short links — `brepcode.com/m/your-model-name`

A short link used to look like this:

    https://brepcode.com/brep/index.html#s=snapmakeru1

Everything after the `#` is a **fragment**. Fragments never leave the browser —
they are not in the request, the web server never sees one — which is exactly
why that form has always worked with no server configuration at all. It is also
why it cannot be made shorter on its own: `brepcode.com/snapmakeru1` is a
*path*, and a path is the server's business.

So the tidy form needs one rule added at the host. The app already reads both.

## Why `/m/` and not the bare root

`brepcode.com/snapmakeru1` would mean **every** path on the domain is a
potential model name, and the model names are chosen by whoever publishes them.
The first person to claim `about`, `pricing`, `blog`, `docs` or `login` takes
that page away from the site — permanently, because links to it are already out
in the world. There is no way to add a page later without checking it against
every name ever claimed.

`/m/` is a **reserved prefix**: nothing else is ever served from under it, so
names inside it cannot collide with anything, now or in five years. It costs two
characters.

## The rule to add

The app is served from `/brep/`. Point `/m/*` at it and pass the name along in
the fragment the app already understands.

**Netlify / Cloudflare Pages** — a file called `_redirects` at the site root:

    /m/*  /brep/index.html#s=:splat  302

**Vercel** — in `vercel.json`:

    { "redirects": [
      { "source": "/m/:slug", "destination": "/brep/index.html#s=:slug" }
    ] }

**nginx**:

    location ~ ^/m/([A-Za-z0-9._-]+)/?$ {
      return 302 /brep/index.html#s=$1;
    }

**Apache** — in `.htaccess` at the site root:

    RewriteEngine On
    RewriteRule ^m/([A-Za-z0-9._-]+)/?$ /brep/index.html#s=$1 [R=302,NE,L]

A **302 redirect** is used rather than a silent 200 rewrite for a practical
reason: the app is served from `/brep/`, and every stylesheet, module and WASM
file it loads is addressed relative to that folder. Serve the same HTML at
`/m/snapmakeru1` and those become `/m/exporters.js`, which is nothing. The
redirect hands the browser the real address first, so nothing has to change
about how the app is packaged. The visitor types the short link; the address bar
settles on the long one.

(If you would rather the tidy URL *stayed* in the address bar, a 200 rewrite
also works — but then the page needs `<base href="/brep/">`, and the app already
reads the slug out of the path for that case.)

## The app configures itself

Nothing needs switching on. When someone claims a short link, the app sends one
`HEAD` request to `/m/<name>` and looks at the answer:

- **200** — the rule is live, so it hands out `brepcode.com/m/your-model-name`
- **404, or no answer** — it hands out the `#s=` form instead

The answer is cached for the session. This is asked rather than configured
because both hard-coded answers fail in a way a setting cannot repair:
assuming the rule exists mints dead links on a host that has not been set up
yet, and assuming it does not means adding the rule changes nothing. Asking
means the day the rule lands, links start coming out tidy on their own.

The `.exe` serves itself over `app://`, which has no HTTP origin to probe, so it
keeps using the fragment form — as it must, since it cannot reach the link
server directly either.

## Reserving `/tour`

`brepcode.com/tour` should be the guided tour, and should be *occupied* so it
cannot be taken for anything else later. Two halves, both already done on the
app side:

- **`tour` is a reserved model name.** `nameProblem()` refuses it, so nobody can
  claim `brepcode.com/m/tour`. (So are `index`, `app`, `about`, `help`, `docs`,
  `share`, `edit`, `admin`, `api`, `new`, `s` and `m`.)
- **The app answers to the path.** `/tour`, `/tour/` and `/brep/tour/` all start
  the walkthrough, alongside the existing `?tour=1` and `#tour`. `/m/tour` is
  explicitly excluded — that shape is a model address, and the two should not
  need the reserved list to tell them apart.

What is left is the root route, exactly like `/m/`:

> Add a route at `/tour` that immediately opens `/brep/index.html?tour=1`,
> rendering nothing of its own. It should also cover `/tour/` with a trailing
> slash. Nothing else about the site changes.

The build already produces a working bounce page at `/brep/tour/` — same idea,
one level down — so if it is easier, point `/tour` at that instead and it will
hop twice.

## Old links keep working

The reader accepts both shapes and always will. Every `#s=` link already sent to
somebody, printed on a card, or embedded in a QR code opens exactly as before.
This is an addition, never a replacement.
