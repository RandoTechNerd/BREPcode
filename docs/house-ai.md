# The house AI (assist mode)

BREPcode's chat is the **built-in helper** by default: a rule engine plus the
model catalog (`src/catalog`). No AI, no key, nothing to set up. It makes
catalog things ("a phone stand", "a hook for my yoga mat"), simple shapes, and
edits them ("wider", "for a Pixel 9", "round the edges", "make it blue").

The **house AI** is an AI the site provides, for the moments the helper is
stuck:

- the helper replies that it can't do what was asked, or
- code the helper made fails to build.

Then the chat shows one button, **Let the AI try**. Pressing it sends that one
request to the house AI through the normal AI path (same harness, same build
and auto-fix retry; when the helper's own code failed to build the request is
prefixed "fix this so it builds:"). The next message goes back to the helper.
A visitor who connects their own AI in ⚙ uses theirs as usual. The free-model
ladder does not apply to a proxy: do any fallback in the Worker.

## Picking the model

While a house AI is configured, a small model picker sits beside the chat
input. Its list is `HOUSE_MODELS` in `viewer/chatbot.js`: cheap, fast code
models on OpenRouter (Gemini Flash variants, Claude Haiku, DeepSeek Flash,
Qwen3 Coder, Mercury, GLM Flash), the first one the default. The choice is
kept in `localStorage["brepcode-house-model"]`, every AI reply is labelled
"answered by …", and house requests always ask for low reasoning, so models
can be compared in real use. Each entry has a `tier` ("free" for all of them
today); `houseModels(tiers)` is the single place a paywall would gate them.

In the desktop app (`BREPcode.exe`) every AI request goes through the main
process relay (`desktop/aiproxy.cjs`), which only talks to an allowlist of
hosts. `*.workers.dev` is on it; a proxy on a custom domain has to be added to
`ALLOWED_HOSTS` there before it works in the exe. The relay sends no `Origin`,
so the Worker's CORS list only matters for the website.

Nothing is enabled until you configure it. With nothing configured the helper
points people at the sliders, the editor, connecting their own AI, and your
email / Discord.

## The premium door (/rtn2026)

`mode: "premium"` in `locked-key.js` makes two sites out of one zip:

- **brepcode.com/rtn2026** (or `?rtn2026` on the app's address): the house AI
  is the chat's AI. The catalog still answers first when it has a tested
  design; everything else goes straight to the house AI, no button. The model
  picker sits under the chat. Remembered for the browser tab only.
- **brepcode.com**: the built-in helper. When it is stuck it offers the ways
  on: your own key (Claude, Gemini, OpenRouter), the free in-browser AI, a
  local model, the BREPcode .exe, the 2-minute tour and the video tutorials.

A visitor who has connected their own AI keeps using it on either door. The
door is a link, not a lock: the key is in the bundle, so use a dedicated
OpenRouter key with a credit limit (or a proxy). The doors live in
`PREMIUM_DOORS` in `viewer/index.html`; the build writes a `/rtn2026/` folder
that bounces in, and on Lovable the route is an iframe of
`/brep/index.html?rtn2026=1`, the same as `/make`.

```js
export const LOCKED = {
  mode: "premium",
  open: "sk-or-v1-…",            // a dedicated key with a credit limit
  provider: "openai",
  model: "google/gemini-3.8-flash",
  baseUrl: "https://openrouter.ai/api/v1",
  label: "BREPcode AI",
};
```

Build with `node build-site.mjs --with-locked-key`.

## Turning it on

Pick one. The first one found wins.

### 1. Try it on your own machine (no rebuild)

In the browser console on the site or the desktop app:

```js
localStorage.setItem("brepcode-house-ai", JSON.stringify({
  key: "sk-or-v1-…", model: "google/gemini-3.8-flash", baseUrl: "https://openrouter.ai/api/v1",
}));
```

or point it at a proxy: `{ "proxy": "https://…/v1", "model": "google/gemini-3.8-flash" }`.
`localStorage.removeItem("brepcode-house-ai")` turns it off again. This is
per browser, so only you see it.

### 2. Ship it with a proxy (recommended for a public demo)

The key lives on a server you control; the bundle only knows the proxy URL.
A Cloudflare Worker is enough:

```js
// wrangler secret put OPENROUTER_KEY      (and optionally MODELS, ALLOW_ORIGINS)
export default {
  async fetch(req, env) {
    // ALLOW_ORIGINS: a comma list. The site, plus a dev server while you test
    // (http://localhost:5320). The desktop app needs none: its relay has no origin.
    const origins = (env.ALLOW_ORIGINS || "https://brepcode.com").split(",").map((s) => s.trim());
    const origin = req.headers.get("origin") || "";
    const cors = {
      "access-control-allow-origin": origins.includes(origin) ? origin : origins[0],
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
      "vary": "origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    if (req.method !== "POST" || !url.pathname.endsWith("/chat/completions")) {
      return new Response("not found", { status: 404, headers: cors });
    }
    const body = await req.json();
    // The page sends the visitor's pick; only models on this list go through
    // (keep it in step with HOUSE_MODELS in viewer/chatbot.js).
    const allowed = (env.MODELS || "google/gemini-3.8-flash").split(",").map((s) => s.trim());
    if (!allowed.includes(body.model)) body.model = allowed[0];
    if (body.max_tokens) body.max_tokens = Math.min(body.max_tokens, 16000);
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENROUTER_KEY}`,
        "HTTP-Referer": "https://brepcode.com",
        "X-Title": "BREPcode",
      },
      body: JSON.stringify(body),
    });
    return new Response(r.body, {
      status: r.status,
      headers: { ...cors, "content-type": r.headers.get("content-type") || "application/json" },
    });
  },
};
```

Add a Cloudflare rate-limiting rule on the route (for example 20 requests per
IP per hour) and a monthly spend limit on the OpenRouter key. Later, a paid
plan is the same Worker checking a token in the `authorization` header before
forwarding.

Then in `viewer/locked-key.js` (gitignored; copy `locked-key.example.js`):

```js
export const LOCKED = {
  mode: "assist",
  proxy: "https://brepcode-ai.<you>.workers.dev/v1",
  model: "google/gemini-3.8-flash",
  label: "BREPcode AI (demo)",
};
```

and build with the key file included: `node build-site.mjs --with-locked-key`.

### 3. Ship a plain key (quickest, least safe)

Same file, `open: "sk-or-v1-…"` instead of `proxy`. The key is readable by
anyone who opens devtools: cap its spend at OpenRouter and expect to rotate it.

`mode: "assist"` is what keeps the helper in charge. Without it, a key in
`locked-key.js` becomes every visitor's default AI provider (FORM 1 in the
example file), which is the "AI fully included" setup, not this one.

## Where it lives

- `viewer/index.html`: `houseCfg()`, `offerHouseAI()`, `applyHelperCode()`,
  and the `house` override at the top of `sendChat()`.
- `viewer/chatbot.js`: replies the helper can't complete carry `cantDo: true`
  and the help buttons (`HELP_ACTIONS`, `CONTACT`).
