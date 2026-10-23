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

// WHAT HAS ACTUALLY BEEN PUBLISHED.
//
// Publishing POSTs here; the gallery read a static file. Nothing joined the
// two, so a model could publish successfully and still never appear in the
// stash — which is exactly what happened on brepcode.com, where the served
// manifest is still the shipped stub with an empty `models` array.
//
// The app calls this when it exists and falls back to the manifest when it
// does not, so a host without the endpoint keeps working as before and the
// offline exe is untouched.
//
// Expected response: `[{ name, file }]` or `{ models: [...] }`, where `file`
// is a URL the browser can GET — the gallery resolves it against the manifest
// path and opens .bcode in the editor. Same-origin cookies, no credential
// here, same as publishing.
const listEndpoint = () =>
  window.BREPCODE_LIST_ENDPOINT
  || document.querySelector('meta[name="brepcode-list"]')?.content
  || "/api/models";

window.__brepStashList = async () => {
  const res = await fetch(listEndpoint(), {
    method: "GET",
    credentials: "same-origin",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  // A 404 means this host has no list endpoint. Throwing sends the gallery to
  // the manifest, which is the correct answer, not an error worth showing.
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};
