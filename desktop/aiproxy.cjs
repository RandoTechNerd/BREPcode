// One narrow errand: make an AI provider request from the MAIN process.
//
// It exists because of a policy, not a bug. Measured from a page:
//
//     GET  https://api.openai.com/v1/models           + Authorization -> allowed
//     POST https://api.openai.com/v1/chat/completions + Authorization -> blocked
//     POST https://api.openai.com/v1/chat/completions, no auth        -> allowed
//
// and the identical POST-with-Authorization against an ordinary CORS server
// succeeds, so it is OpenAI refusing browsers rather than our request being
// malformed. You may list models from a web page; you may not chat. Anthropic
// and Google both publish browser-callable endpoints, so they need none of
// this — OpenAI is the odd one out, and a desktop app has no such limit
// because there is no origin and no preflight.
//
// SECURITY. The renderer runs model code and AI-written text, so what arrives
// here is treated as hostile. This is emphatically NOT a general "fetch
// anything for me" pipe, which would be a server-side-request-forgery hole
// wearing a helpful hat:
//   - HTTPS only, and only to an allowlisted set of AI hosts
//   - method fixed to GET or POST, nothing else
//   - only the headers an AI call actually needs, by name
//   - the response comes back as text; no streaming, no redirects followed
//     to anywhere off the allowlist

const ALLOWED_HOSTS = new Set([
  "api.openai.com",
  "openrouter.ai",
  "api.groq.com",
  "api.together.xyz",
  "api.deepseek.com",
  "api.mistral.ai",
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
]);

// Azure OpenAI gives every customer their own subdomain, so it cannot be a
// fixed string — but it is still pinned to Microsoft's domain rather than
// "any host with the right shape".
const ALLOWED_SUFFIXES = [".openai.azure.com", ".services.ai.azure.com"];

const ALLOWED_HEADERS = new Set([
  "content-type", "authorization", "x-api-key", "anthropic-version",
  "api-key", "http-referer", "x-title",
]);

function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { throw new Error("not a URL"); }
  if (u.protocol !== "https:") throw new Error("HTTPS only");
  const host = u.hostname.toLowerCase();
  const ok = ALLOWED_HOSTS.has(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
  if (!ok) throw new Error(`host not allowed: ${host}`);
  return u;
}

function cleanHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h || {})) {
    const key = String(k).toLowerCase();
    if (!ALLOWED_HEADERS.has(key)) continue;
    const val = String(v);
    // a header value carrying CR/LF is a response-splitting attempt
    if (/[\r\n]/.test(val)) continue;
    out[key] = val;
  }
  return out;
}

async function relay({ url, method, headers, body } = {}) {
  const u = checkUrl(url);
  const m = String(method || "GET").toUpperCase();
  if (m !== "GET" && m !== "POST") throw new Error("method not allowed");
  const resp = await fetch(u.toString(), {
    method: m,
    headers: cleanHeaders(headers),
    ...(m === "POST" && body != null ? { body: String(body) } : {}),
    redirect: "error",
  });
  return { ok: resp.ok, status: resp.status, text: await resp.text() };
}

function register() {
  const { ipcMain } = require("electron");
  ipcMain.handle("ai:relay", async (_e, req) => {
    try {
      return await relay(req || {});
    } catch (err) {
      return { ok: false, status: 0, error: String(err?.message || err) };
    }
  });
}

module.exports = { register, relay, checkUrl, cleanHeaders };
