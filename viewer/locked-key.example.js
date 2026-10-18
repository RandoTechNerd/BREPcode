// TEMPLATE — copy to `locked-key.js` (same folder) and put a real key in.
//
// `locked-key.js` itself is gitignored, deliberately: GitHub and the key
// issuers both scan public repos, and a committed key is usually revoked
// before anyone gets to use it. This example file carries no secret, so it
// is safe to commit and exists to save you a trip to the console.
//
// Build with the key included:
//
//     node build-site.mjs --with-locked-key
//
// A plain `node build-site.mjs` leaves it out, which is the right default for
// anything you are not deliberately handing over.

// ---------------------------------------------------------------------------
// FORM 1 — the HOUSE KEY: no password, applied on a visitor's FIRST run so the
// chat just works with nothing to paste.
//
// The key is plain text in the bundle. Anyone who opens devtools, or unzips
// the site, has it. That is the deliberate trade for a public demo, so:
//   - cap the key's spend at the provider before you deploy
//   - expect to rotate it, and treat that as routine rather than an incident
//
// A visitor who has already chosen their own provider keeps it: the house key
// only ever fills a browser that has never been set up.
export const LOCKED = {
  open: "sk-or-v1-PUT-YOUR-OPENROUTER-KEY-HERE",
  provider: "openai",                          // OpenRouter speaks the OpenAI wire format
  // GLM-5.3 Flash is what "stealth/ox-alpha" turned out to be all along — the
  // stealth id 404s now, and the app maps it here automatically (see
  // MODEL_SUCCESSORS in the viewer) so even a stale copy of this file works.
  // ~$0.001 per generation on OpenRouter, no shared-pool rate limits.
  model: "z-ai/glm-5.3-flash",
  baseUrl: "https://openrouter.ai/api/v1",
};

// ---------------------------------------------------------------------------
// FORM 2 — PASSWORD-LOCKED, for handing a key to one person rather than to the
// public. The key is encrypted (lockbox.js, PBKDF2), and the recipient
// triple-taps the "API key" label in ⚙ and enters the password.
//
// The blob has to be generated in a browser, because that is where the crypto
// lives. In BREPcode's console:
//
//     brepscript.lockKey("sk-or-v1-…", "the-password", "openai",
//                        "z-ai/glm-5.3-flash", "https://openrouter.ai/api/v1")
//
// It prints a block in exactly this shape — replace the export above with it:
//
// export const LOCKED = {
//   blob: "…encrypted…",
//   provider: "openai",
//   model: "z-ai/glm-5.3-flash",
//   baseUrl: "https://openrouter.ai/api/v1",
// };
//
// On a PUBLIC host the blob is downloadable by anyone and PBKDF2 only buys
// time against offline guessing — so this suits a private hand-off, not a
// website.

// ---------------------------------------------------------------------------
// FORM 3 — ASSIST MODE, the "AI hops in when the helper is stuck" demo.
//
// The built-in helper (rule engine + model catalog) stays the chat. Only when
// it says it can't do something, or what it made fails to build, does the
// chat offer a "✨ Let the AI try" button, and that one request goes to the
// house AI. Prefer `proxy`: an OpenAI-compatible endpoint you run (see
// docs/house-ai.md for a 30-line Cloudflare Worker) that holds the OpenRouter
// key server-side, so nothing secret ships in the bundle. `open` works too,
// for a quick demo, with the same plain-text caveats as FORM 1.
//
// export const LOCKED = {
//   mode: "assist",
//   proxy: "https://brepcode-ai.<you>.workers.dev/v1",   // or: open: "sk-or-v1-…",
//   model: "z-ai/glm-5.3-flash",
//   baseUrl: "https://openrouter.ai/api/v1",             // only used with `open`
//   label: "BREPcode AI (demo)",
// };
