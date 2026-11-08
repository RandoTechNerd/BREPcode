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
// the old one deleted on activate.
//
// The app's own files (its modules, recipes, fonts, icons) get the same
// treatment under a second cache, named for a hash of exactly those files;
// build-site.mjs writes their list in below. They used to go to the network
// every visit, and with no cache headers from the host that was the whole
// ~0.85 MB a returning visitor still downloaded. The page itself and
// version.json stay on the network: the page is how a visitor learns which
// build they are on.
//
// The one hazard of caching the app's modules is a new build arriving while
// an old worker still controls the page: the fresh page would import old
// modules out of the old cache. So the page carries its build's app hash in
// a <meta>, the worker reads it off every page it serves, and a page from
// another build switches this worker off for app files: every module goes
// to the network until the new worker (a new sw.js, fetched on every
// navigation) takes over. The switch is a cache entry, not a variable: the
// browser stops an idle worker between a page's load and its later lazy
// imports, and a restarted worker remembers nothing. Measured, a variable
// let 20 of 32 modules through from the old cache.

const CACHE = "brep-vendor-__VENDOR_HASH__";
const VENDOR = new URL("vendor/", self.registration.scope).href;
const APP_CACHE = "brep-app-__APP_HASH__";
const APP_HASH = "__APP_HASH__";
const APP_FILES = new Set(__APP_FILES__.map((f) => new URL(f, self.registration.scope).href));
// exists once a page from another build has been seen: app files go to the
// network from then on. Named brep-app-… so the next worker's activate
// deletes it with the other old app caches.
const STALE = "brep-app-stale";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (k.startsWith("brep-vendor-") && k !== CACHE) await caches.delete(k);
      if (k.startsWith("brep-app-") && k !== APP_CACHE) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

const inflight = new Map();

async function fromCache(url, name = CACHE) {
  const cache = await caches.open(name);
  const hit = await cache.match(url);
  if (hit) return hit;
  let pending = inflight.get(url);
  if (!pending) {
    // cache: "no-cache": ask the server, never the browser's own HTTP cache.
    // The host sends no cache headers, so the browser guesses how long a file
    // stays fresh, and a new build's cache was being filled with the LAST
    // build's copies of files whose names did not change (the Rust kernel's
    // loader among them: old loader + new kernel = no Rust kernel, every
    // build on the slow JS one). A hard refresh fixed it; this is that,
    // for every visitor.
    pending = fetch(url, { credentials: "same-origin", cache: "no-cache" }).then((res) => {
      // stored in the background: the asker gets the stream as it arrives
      if (res.ok && !res.redirected) cache.put(url, res.clone()).catch(() => {});
      return res;
    }).finally(() => inflight.delete(url));
    inflight.set(url, pending);
  }
  return (await pending).clone();
}

// A page is served from the network as always, but read on the way past:
// a build hash other than this worker's switches the app cache off.
async function servePage(event) {
  const res = await fetch(event.request);
  try {
    const m = /<meta name="brep-app" content="([0-9a-f]+)"/.exec(await res.clone().text());
    if (m && m[1] !== APP_HASH) {
      await (await caches.open(STALE)).put(self.registration.scope + "__stale", new Response("1"));
      self.registration.update().catch(() => {});
    }
  } catch { /* not our page, or not readable: nothing to decide */ }
  return res;
}

async function appFile(req) {
  if (await caches.has(STALE)) return fetch(req, { cache: "no-cache" });
  return fromCache(req.url, APP_CACHE);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  if (req.mode === "navigate") { event.respondWith(servePage(event).catch(() => fetch(req))); return; }
  // A query string is a retry or a debug switch: let those reach the network.
  if (req.url.includes("?")) return;
  if (req.url.startsWith(VENDOR)) { event.respondWith(fromCache(req.url).catch(() => fetch(req))); return; }
  if (APP_FILES.has(req.url)) event.respondWith(appFile(req).catch(() => fetch(req)));
});
