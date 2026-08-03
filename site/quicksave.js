// Publishing, the site half. Served by brepcode.com beside the editor; never
// bundled into the app or the exe, which is why no credential appears here and
// none ever should. Auth is whatever the host already does for the browser — a
// session cookie — so the page sends `credentials: "same-origin"` and carries
// nothing secret of its own.
//
// The app looks for exactly one global. If it is absent, publishing says so
// plainly and offers Share link instead, so a build served without this file
// degrades to a clear message rather than a failure in the dark.

import { normalizeVisitor } from "../src/visitor.js";

const endpoint = () =>
  window.BREPCODE_PUBLISH_ENDPOINT
  || document.querySelector('meta[name="brepcode-publish"]')?.content
  || "/api/publish";

// A data: URL is a fine way to hand a thumbnail across a function call and a
// poor way to put one in a JSON body — base64 inflates it by a third and the
// prefix has to be stripped somewhere. Do it here, once, rather than teaching
// the backend about data URLs.
function splitDataUrl(url) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(url || ""));
  if (!m) return null;
  return { mime: m[1], base64: !!m[2], data: m[3] };
}

window.__brepPublish = async ({ name, text, thumb, visitor } = {}) => {
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  if (!slug) return { ok: false, error: "give the model a name first" };
  if (!text) return { ok: false, error: "there is no model to publish" };

  let res;
  try {
    res = await fetch(endpoint(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        name: String(name || slug),
        text: String(text),
        thumb: splitDataUrl(thumb),
        // Normalised here so the backend stores a complete, well-formed object
        // rather than whatever an older editor happened to send.
        visitor: normalizeVisitor(visitor),
      }),
    });
  } catch (e) {
    // A network failure is not the same as a refusal, and the difference is
    // the difference between "try again" and "stop trying".
    return { ok: false, error: `could not reach the site (${String(e.message || e).slice(0, 60)})` };
  }

  if (res.status === 401 || res.status === 403) {
    return { ok: false, error: "you are not signed in to brepcode.com" };
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error || ""; } catch { /* not JSON */ }
    return { ok: false, error: detail || `the site returned HTTP ${res.status}` };
  }

  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return {
    ok: true,
    slug: body?.slug || slug,
    url: body?.url || `${location.origin}/${body?.slug || slug}`,
  };
};

// The stash gallery reads a manifest. Point the app at the signed-in user's
// one; the app falls back to a local path when this is not set, which is what
// keeps the offline exe working.
if (window.BREPCODE_MANIFEST_URL) {
  try {
    localStorage.setItem("brepcode-secret-url", window.BREPCODE_MANIFEST_URL);
  } catch { /* private mode: the gallery just stays on its default */ }
}
