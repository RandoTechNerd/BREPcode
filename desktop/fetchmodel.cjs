// Downloading somebody else's model, on purpose and with the brakes on.
//
// This exists in the DESKTOP app only, and not for policy reasons: a browser
// cannot fetch a file from another site at all — the request is blocked before
// it leaves. So the web build offers the link and the user downloads it the
// ordinary way; here the app can do it in one click.
//
// Everything below is a brake. The file arrives from a URL a language model
// produced, which is about as untrusted as an input gets, so:
//
//   - https/http only. No file://, no data:, nothing that could read the disk.
//   - A model-file extension only. A .zip could hold anything and a .gcode is
//     already sliced for somebody else's machine.
//   - A hard size ceiling, checked BEFORE the body is read and again while it
//     streams — a Content-Length can lie.
//   - Redirects followed, but only to the same kind of URL, and not forever.
//
// The user has already been shown the warning and pressed the button by the
// time this runs. That is consent to fetch a file, not consent to fetch
// anything at all.

const { ipcMain } = require("electron");
const https = require("node:https");
const http = require("node:http");

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const FILE_EXT = /\.(stl|3mf|obj|step|stp)(\?|#|$)/i;

function checkUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch { return { ok: false, error: "that is not a URL" }; }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    return { ok: false, error: `refusing ${u.protocol} — only http and https` };
  }
  if (!FILE_EXT.test(u.href)) {
    return { ok: false, error: "that link is not a model file (.stl, .3mf, .obj, .step)" };
  }
  return { ok: true, url: u };
}

function get(url, redirectsLeft) {
  return new Promise((resolve) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.get(url, {
      headers: { "user-agent": "BREPcode", accept: "*/*" },
      timeout: 30000,
    }, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) return resolve({ ok: false, error: "too many redirects" });
        let next;
        try { next = new URL(res.headers.location, url); } catch { return resolve({ ok: false, error: "bad redirect" }); }
        const ok = checkUrl(next.href);
        if (!ok.ok) return resolve({ ok: false, error: `redirected somewhere we will not follow — ${ok.error}` });
        return resolve(get(ok.url, redirectsLeft - 1));
      }
      if (code !== 200) {
        res.resume();
        return resolve({ ok: false, error: `the site answered ${code}` });
      }
      // A stated length over the ceiling is refused without reading a byte.
      const stated = Number(res.headers["content-length"] || 0);
      if (stated > MAX_BYTES) {
        res.destroy();
        return resolve({ ok: false, error: `that file is ${Math.round(stated / 1048576)}MB, over the 100MB limit` });
      }
      const chunks = [];
      let size = 0;
      res.on("data", (c) => {
        size += c.length;
        // ...and a length that lied is caught here, mid-stream.
        if (size > MAX_BYTES) {
          res.destroy();
          resolve({ ok: false, error: "the file kept going past 100MB" });
          return;
        }
        chunks.push(c);
      });
      res.on("end", () => resolve({
        ok: true,
        base64: Buffer.concat(chunks).toString("base64"),
        bytes: size,
        name: decodeURIComponent(url.pathname.split("/").pop() || "model"),
      }));
      res.on("error", (e) => resolve({ ok: false, error: String(e.message || e) }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "the site did not answer" }); });
    req.on("error", (e) => resolve({ ok: false, error: String(e.message || e) }));
  });
}

function register() {
  ipcMain.handle("model:fetch", async (_e, url) => {
    const checked = checkUrl(url);
    if (!checked.ok) return { ok: false, error: checked.error };
    return get(checked.url, MAX_REDIRECTS);
  });
}

module.exports = { register, checkUrl, MAX_BYTES };
