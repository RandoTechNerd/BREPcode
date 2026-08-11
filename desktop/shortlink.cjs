// Claiming a short link from the desktop app, directly.
//
// The app serves itself over app://, and CORS does not extend to custom
// schemes — a fetch from the page is blocked before it leaves. That is a
// BROWSER rule about renderer processes, not a rule about this machine: the
// main process has no origin and no CORS, so it can simply make the request.
//
// So the exe does what it looked like it should have been doing all along:
// builds the link and sends it. The browser hand-off (#claim=) stays as the
// fallback for an older build without this bridge, and for anyone who would
// rather see it happen on the site.
//
// THIS IS NOT A PROXY, and the difference matters. The page never supplies a
// URL — it names an operation and a slug, and the main process builds the
// address itself from the constant below. A generic "fetch this URL for me"
// on the bridge would be an open relay for a page that runs model code and,
// with the chat on, text written by an AI: it could reach any host on the
// user's network, including things only this machine can see.

const { ipcMain } = require("electron");
const https = require("node:https");
const http = require("node:http");

// The one address this bridge can talk to.
const ENDPOINT = process.env.BREPCODE_LINKS_URL || "https://brepcode.com/api/public/links";
const MAX_BYTES = 4 * 1024 * 1024;          // the server's own cap
const TIMEOUT_MS = 20000;
const METHODS = new Set(["GET", "POST", "PATCH"]);   // there is no DELETE, by design

const SLUG = /^[a-z0-9][a-z0-9-]{1,63}$/;

function request({ method, slug, body, secret }) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(ENDPOINT); } catch { return resolve({ ok: false, error: "bad endpoint" }); }
    if (slug) url.search = `slug=${encodeURIComponent(slug)}`;

    const payload = body == null ? null : Buffer.from(JSON.stringify(body), "utf8");
    if (payload && payload.length > MAX_BYTES) {
      return resolve({ ok: false, status: 413, error: "too large for a short link" });
    }
    const headers = { Accept: "application/json" };
    if (payload) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = payload.length;
    }
    // The owner secret is the only credential in the system. It is passed
    // through untouched and never logged.
    if (secret) headers["X-Owner-Secret"] = secret;

    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, { method, headers, timeout: TIMEOUT_MS }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        // A reply is a small JSON object or one stored model. Anything wildly
        // bigger than the write limit is not an answer to this question.
        if (size > MAX_BYTES + 65536) { req.destroy(); return; }
        chunks.push(c);
      });
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let json = null;
        try { json = JSON.parse(text); } catch { /* a non-JSON body is reported as status only */ }
        resolve({ ok: true, status: res.statusCode, json });
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "the link server did not answer" }); });
    req.on("error", (e) => resolve({ ok: false, error: e?.message || "could not reach the link server" }));
    if (payload) req.write(payload);
    req.end();
  });
}

function register() {
  ipcMain.handle("shortlink:call", async (_e, req = {}) => {
    const method = String(req.method || "GET").toUpperCase();
    if (!METHODS.has(method)) return { ok: false, error: `refusing ${method}` };
    const slug = req.slug == null ? "" : String(req.slug);
    // Checked here as well as in the page: the bridge must stand on its own,
    // because "the caller already validated it" is how a bridge becomes the
    // hole. A slug is the only part of the URL the page influences at all.
    if (slug && !SLUG.test(slug)) return { ok: false, error: "not a valid short-link name" };
    if (method !== "POST" && !slug) return { ok: false, error: "that call needs a name" };
    return request({
      method,
      slug,
      body: req.body && typeof req.body === "object" ? req.body : null,
      secret: req.secret ? String(req.secret) : "",
    });
  });
}

module.exports = { register, ENDPOINT, MAX_BYTES, SLUG };
