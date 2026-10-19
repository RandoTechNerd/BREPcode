// BREPcode's service worker. Built site only: build-site.mjs copies this to
// the site root with __VENDOR_HASH__ replaced by a hash of everything under
// vendor/, and index.html registers it (see the note above window.__swReady).
//
// Why: brepcode.com sends no cache headers, so a browser kept nothing between
// visits. Every visit downloaded ~9 MB again (the kernel, three, the wasm),
// and the kernel twice per visit: the build worker cannot use the page's
// preload, so it fetched its own copy.
//
// What it does, and nothing more: GET requests for files under vendor/ come
// from a cache named for this build's vendor hash, and the first download of
// a file is shared by everyone asking for it at the same time. A new build
// with different vendor files is a new hash, so a new sw.js, a new cache, and
// the old one deleted on activate. Everything else (the page, the app's own
// modules, version.json) goes to the network exactly as before.

const CACHE = "brep-vendor-__VENDOR_HASH__";
const VENDOR = new URL("vendor/", self.registration.scope).href;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith("brep-vendor-") && k !== CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

const inflight = new Map();

async function fromCache(url) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) return hit;
  let pending = inflight.get(url);
  if (!pending) {
    pending = fetch(url, { credentials: "same-origin" }).then((res) => {
      // stored in the background: the asker gets the stream as it arrives
      if (res.ok && !res.redirected) cache.put(url, res.clone()).catch(() => {});
      return res;
    }).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return (await pending).clone();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // A query string is a retry or a debug switch: let those reach the network.
  if (req.method !== "GET" || !req.url.startsWith(VENDOR) || req.url.includes("?")
      || req.headers.has("range")) return;
  event.respondWith(fromCache(req.url).catch(() => fetch(req)));
});
