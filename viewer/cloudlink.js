// Short links: the same model, behind a name instead of a kilobyte of fragment.
//
// The URL share is the good one — the model IS the link, nothing is stored
// anywhere, and it works forever with no server to keep alive. Its only fault
// is that it is enormous, so it cannot be read out loud, printed on a card, or
// pasted anywhere with a length limit.
//
// So this is the SAME link with a lookup in front of it: the .bcode text goes
// into a store keyed by a name, and the link becomes #s=<name>. Opening one
// fetches the text and hands it to exactly the same loader the long link uses.
// Nothing else about sharing changes — which is the point. If the lookup is
// unreachable, the long link still works, and the UI says so rather than
// pretending the short one is fine.
//
// WHY A FRAGMENT AND NOT A PATH: brepcode.com/<name> is a static host route
// that would need server-side rewriting, and every wrong guess there is a 404
// with no way to recover. #s=<name> needs nothing — the page loads normally
// and reads its own fragment, the same as #m= already does.

// ---------------------------------------------------------------- the API
//
// A plain REST/JSON route on brepcode.com itself. Worth writing down WHY it is
// not a database-behind-PostgREST, because the difference is the whole
// security model: PostgREST would have put a database key in the browser and
// left the owner check as a query filter — and a filter is written by the
// caller, so anyone could write a different one and edit anyone's model. Here
// the secret goes in a header the SERVER compares (hashed, constant-time), so
// the browser holds no credential except the one secret for its own links.
//
//   GET    ?slug=x                      -> 200 {slug,name,payload} | 404
//   POST   {slug,name,payload,owner}    -> 201 | 409 taken
//   PATCH  ?slug=x  X-Owner-Secret: ..  -> 200 | 401 | 403 | 404
//
// There is no DELETE, and no key of any kind. Reads are anonymous.
const BUILT_IN = {
  url: "https://brepcode.com/api/public/links",
  // The server's own cap. Checked here as well so an oversized model is
  // refused with a sentence about what to do instead, rather than a 413 the
  // user has to interpret.
  maxBytes: 4194304,
};

// A deployment can set window.__BREPCODE_CLOUD instead of editing this file —
// the same escape hatch __BREPCODE_PUBLIC_URL gives the share base.
export function cloudConfig() {
  const o = (typeof window !== "undefined" && window.__BREPCODE_CLOUD) || {};
  return { ...BUILT_IN, ...o };
}

export const cloudReady = () => !!cloudConfig().url;

// The desktop app talks to the link server through its OWN bridge.
//
// A fetch from the app's page is blocked before it leaves: it serves itself
// over app://, and CORS does not extend to custom schemes. But that is a rule
// about renderer processes, not about the machine — Electron's main process
// has no origin and no CORS, so it just makes the request. desktop/shortlink.cjs
// is that bridge, and it is deliberately not a URL fetcher: the page names an
// operation and a name, and main builds the address itself.
const bridge = () =>
  (typeof window !== "undefined" && typeof window.brepcodeDesktop?.shortLink === "function")
    ? window.brepcodeDesktop.shortLink : null;

// Where the feature genuinely cannot work: a non-http page with no bridge —
// an older exe, or the bundle opened straight off disk. Said plainly, so the
// browser hand-off can be offered instead of a network error nobody can act on.
export function originProblem() {
  if (bridge()) return null;
  if (typeof location === "undefined") return null;
  if (/^https?:$/.test(location.protocol)) return null;
  return "short links need the website — this build cannot reach the link server";
}

// One call, two transports. Everything below goes through here so the bridge
// and the browser cannot drift into behaving differently.
async function api({ method, slug, body, secret, signal }) {
  const send = bridge();
  if (send) {
    const r = await send({ method, slug, body, secret });
    if (!r || r.ok === false) throw new TypeError(r?.error || "could not reach the link server");
    return { status: r.status, json: async () => r.json, ok: r.status >= 200 && r.status < 300 };
  }
  const headers = { Accept: "application/json" };
  if (body) headers["Content-Type"] = "application/json";
  if (secret) headers[OWNER_HEADER] = secret;
  const r = await fetch(endpoint(slug && method !== "POST" ? slug : ""), {
    method, headers, signal,
    body: body ? JSON.stringify(body) : undefined,
  });
  return r;
}

const OWNER_HEADER = "X-Owner-Secret";

// ------------------------------------------------------------------ names
//
// What a person types is "FISH bowl v2"; what a URL can carry is
// "fish-bowl-v2". Everything that is not a letter, a digit or a dash becomes a
// dash, and runs of dashes collapse — so two obviously-different names cannot
// quietly become the same one without it being visible in the box.
export function slugify(name) {
  return String(name || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // café -> cafe
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Names the app itself uses as fragments, plus a few that would be confusing
// to hand out. A link called "index" or "new" reads like a page, not a model.
const RESERVED = new Set(["", "new", "index", "app", "about", "help", "docs",
  "share", "tour", "edit", "admin", "api", "s", "m"]);

export function nameProblem(slug) {
  if (!slug) return "give it a name";
  if (RESERVED.has(slug)) return `"${slug}" is reserved — pick another name`;
  if (slug.length < 2) return "a bit longer, please";
  return null;
}

// ------------------------------------------------------------- ownership
//
// There is no login, and inventing one for a share link would be worse than
// the problem. Whoever creates a name gets a random secret, kept in this
// browser; the server stores only its hash and compares in constant time, so
// the plaintext exists nowhere but here.
//
// The consequence has to be said out loud rather than discovered: clear this
// browser's storage and the link keeps working forever but can never be
// updated again. There is no recovery and no delete.
const OWN_KEY = "brepcode-shortlink-owner";

const ownerMap = () => {
  try { return JSON.parse(localStorage.getItem(OWN_KEY) || "{}"); } catch { return {}; }
};
export const ownerTokenFor = (slug) => ownerMap()[slug] || null;
const rememberOwner = (slug, token) => {
  try {
    const m = ownerMap();
    m[slug] = token;
    localStorage.setItem(OWN_KEY, JSON.stringify(m));
  } catch { /* private mode — the link still works, it just cannot be updated here */ }
};
// The server accepts 16-512 characters. 32 hex is 128 bits of randomness,
// which is not guessable, and crypto.getRandomValues is the only source used —
// Math.random() would be a secret anyone could reproduce.
const newToken = () => {
  const b = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(b);
  return [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
};

const endpoint = (slug) => {
  const base = cloudConfig().url.replace(/\/+$/, "");
  return slug ? `${base}?slug=${encodeURIComponent(slug)}` : base;
};

export const byteLength = (s) => new TextEncoder().encode(String(s ?? "")).length;

// ---------------------------------------------------------------- lookups
//
// Every call reports which state it is in, because the UI says something
// different for each: free, yours, taken by someone else — and UNREACHABLE,
// which must never be reported as free. Promising a name we cannot claim is
// the one failure that ends with a dead link in someone's hands.
export async function checkName(slug, { signal } = {}) {
  const bad = nameProblem(slug);
  if (bad) return { ok: false, reason: bad };
  const orig = originProblem();
  if (orig) return { ok: false, offline: true, reason: orig };
  if (!cloudReady()) return { ok: false, offline: true, reason: "short links are not set up on this copy" };
  try {
    const r = await api({ method: "GET", slug, signal });
    if (r.status === 404) return { ok: true, free: true };
    if (!r.ok) return { ok: false, offline: true, reason: `lookup failed (${r.status})` };
    return ownerTokenFor(slug)
      ? { ok: true, free: false, mine: true, reason: "you already have this name — saving replaces it" }
      : { ok: false, free: false, reason: `"${slug}" is taken — pick another name` };
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return { ok: false, offline: true, reason: "could not reach the link server" };
  }
}

const errorFrom = async (r, fallback) => {
  const body = await r.json().catch(() => null);
  return (body && (body.error || body.message)) || fallback;
};

// Claim or update a name. Returns the slug actually used.
export async function saveShort({ slug, text, name }) {
  const bad = nameProblem(slug);
  if (bad) throw new Error(bad);
  const orig = originProblem();
  if (orig) throw new Error(orig);
  if (!cloudReady()) throw new Error("short links are not set up on this copy");
  if (!text) throw new Error("nothing to save");

  // Checked here as well as on the server so the message can say what to do
  // instead. A 413 on its own tells someone their model is "too large" with no
  // hint that the long link has no such limit.
  const { maxBytes } = cloudConfig();
  const size = byteLength(text);
  if (size > maxBytes) {
    throw new Error(`this model is ${(size / 1048576).toFixed(1)}MB and the limit is `
      + `${(maxBytes / 1048576).toFixed(0)}MB — use the full link, or save a .bcode and send the file`);
  }

  const mine = ownerTokenFor(slug);

  // An existing name we hold is an update. Anything else is a create, and the
  // SERVER decides whether the name was free — a 409 is the race being settled
  // there rather than here, where two people can pass the same check.
  if (mine) {
    const r = await api({
      method: "PATCH", slug, secret: mine,
      body: { name: name || slug, payload: text },
    });
    if (r.status === 401 || r.status === 403) {
      throw new Error(`"${slug}" belongs to someone else — pick another name`);
    }
    if (r.status === 404) {
      // The record is gone but this browser still thinks it owns the name.
      // Fall through to a create rather than leaving the user stuck on an
      // error about a record that no longer exists.
      return createShort({ slug, text, name });
    }
    if (r.status === 413) throw new Error("the link server refused this model as too large");
    if (!r.ok) throw new Error(await errorFrom(r, `could not update the short link (${r.status})`));
    rememberOwner(slug, mine);
    return slug;
  }
  return createShort({ slug, text, name });
}

async function createShort({ slug, text, name }) {
  const token = newToken();
  const r = await api({
    method: "POST",
    body: { slug, name: name || slug, payload: text, owner: token },
  });
  if (r.status === 409) throw new Error(`"${slug}" is taken — pick another name`);
  if (r.status === 413) throw new Error("the link server refused this model as too large");
  if (!r.ok) throw new Error(await errorFrom(r, `could not save the short link (${r.status})`));
  // Only remembered once the server has confirmed it, or a failed create would
  // leave this browser believing it owns a name it never got — and every
  // later attempt would be a PATCH against somebody else's record.
  rememberOwner(slug, token);
  return slug;
}

// The other end: a fragment comes in, the model text comes back.
export async function resolveShort(slug) {
  if (!cloudReady()) throw new Error("short links are not set up on this copy");
  const r = await api({ method: "GET", slug });
  if (r.status === 404) throw new Error(`there is no model called "${slug}"`);
  if (!r.ok) throw new Error(await errorFrom(r, `could not fetch that link (${r.status})`));
  const row = await r.json();
  if (!row || !row.payload) throw new Error(`"${slug}" came back empty`);
  return { text: row.payload, name: row.name };
}

// Pull the name out of a fragment. Same shape as the #m= reader so the loader
// can ask both the same way.
export function shortSlugIn(hash) {
  const m = /[#&]s=([A-Za-z0-9._-]{1,64})(?:&|$)/.exec(String(hash || ""));
  return m ? m[1] : null;
}

export const shortUrl = (base, slug) => `${base}#s=${slug}`;

// ------------------------------------------------------- claiming by proxy
//
// The desktop app cannot reach the link server at all: it serves itself over
// app://, and CORS does not extend to custom schemes, so the request never
// leaves. Telling the user "not here" is honest but useless — they still want
// the short link.
//
// So the .exe hands the job to a browser. A CLAIM LINK is the ordinary long
// share link with the wanted name written on the front:
//
//   https://brepcode.com/brep/index.html#claim=fish-bowl&m=<the whole model>
//
// The long link already carries the entire model, so nothing extra has to
// travel and no intermediate storage is involved. Opening it on the real site
// loads the model exactly as any shared link does, and the page — now on an
// https origin that CORS allows — claims the name and reports back.
//
// The owner secret is generated by the BROWSER that claims it, never by the
// exe, because a secret written into a URL belongs to whoever the URL reaches.
// The consequence is worth saying out loud: the link can later be updated from
// that browser, not from the app.
export function claimSlugIn(hash) {
  const m = /[#&]claim=([A-Za-z0-9._-]{1,64})(?:&|$)/.exec(String(hash || ""));
  return m ? m[1] : null;
}

export function claimUrl(base, slug, shareFragment) {
  const frag = String(shareFragment || "").replace(/^#/, "");
  return `${base}#claim=${encodeURIComponent(slug)}${frag ? `&${frag}` : ""}`;
}

// When a name is taken, an error is half an answer. Walk a few variants and
// return the first one actually free, so the offer is "fish-bowl-2 is
// available" rather than "pick another name" and a shrug.
export async function suggestFreeName(slug, tries = 4) {
  for (let i = 2; i < 2 + tries; i++) {
    const candidate = `${slug}-${i}`.slice(0, 48);
    try {
      const r = await checkName(candidate);
      if (r.ok && r.free) return candidate;
      if (r.offline) return null;            // no point walking a dead server
    } catch { return null; }
  }
  return null;
}
