// Short links: the same model, behind a name instead of a kilobyte of fragment.
//
// The URL share is the good one — the model IS the link, nothing is stored
// anywhere, and it works forever with no server to keep alive. Its only fault
// is that it is enormous, so it cannot be read out loud, printed on a card, or
// pasted anywhere with a length limit.
//
// So this is the SAME link with a lookup in front of it: the .bcode text goes
// into a table keyed by a name, and the link becomes #s=<name>. Opening one
// fetches the text and hands it to exactly the same loader the long link uses.
// Nothing else about sharing changes — which is the point. If the lookup is
// unreachable, the long link still works, and the UI says so rather than
// pretending the short one is fine.
//
// WHY A FRAGMENT AND NOT A PATH: brepcode.com is a static host. /s/<name>
// would need server-side routing that does not exist, and every wrong guess
// there is a 404 with no way to recover. #s=<name> needs nothing — the page
// loads normally and reads its own fragment, the same as #m= already does.

// ---------------------------------------------------------------- config
//
// Lovable Cloud is Supabase underneath, so this speaks plain PostgREST.
//
// ►► PASTE THE TWO VALUES FROM YOUR LOVABLE CLOUD PROJECT HERE. ◄◄
// In Lovable: the project's Cloud/Backend panel shows a Project URL that looks
// like https://abcdefghijklm.supabase.co and an anon/publishable key. The anon
// key is meant to be public — it is what every browser client uses — and the
// table's row policies below are what actually decide who may write.
//
// Left empty, everything here stays switched off and the app simply offers the
// long link, which is the correct behaviour for a fork with no backend.
const BUILT_IN = {
  url: "",          // e.g. "https://abcdefghijklm.supabase.co"
  key: "",          // e.g. "eyJhbGciOi..."  (anon / publishable)
  table: "shortlinks",
};

// A deployment can set window.__BREPCODE_CLOUD instead of editing this file,
// which is how the hosted copy is configured without a rebuild — the same
// escape hatch __BREPCODE_PUBLIC_URL gives the share base.
export function cloudConfig() {
  const o = (typeof window !== "undefined" && window.__BREPCODE_CLOUD) || {};
  return { ...BUILT_IN, ...o };
}

export const cloudReady = () => {
  const c = cloudConfig();
  return !!(c.url && c.key);
};

const rest = (path) => {
  const c = cloudConfig();
  return `${c.url.replace(/\/+$/, "")}/rest/v1/${path}`;
};
const headers = (extra = {}) => {
  const c = cloudConfig();
  return { apikey: c.key, Authorization: `Bearer ${c.key}`, "Content-Type": "application/json", ...extra };
};

// ------------------------------------------------------------------ names
//
// What a person types is "FISH bowl v2"; what a URL can carry is "fish-bowl-v2".
// Everything that is not a letter, a digit or a dash becomes a dash, and runs
// of dashes collapse, so two obviously-different names cannot quietly become
// the same one without it being visible in the box.
export function slugify(name) {
  return String(name || "")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")   // café -> cafe
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
// There is no login here, and inventing one for a share link would be worse
// than the problem. Instead: whoever creates a name gets a random secret, kept
// in this browser, and only that secret can overwrite the name later. Losing
// the browser means losing the ability to update that link — say so rather
// than pretend otherwise. It is not a security boundary against a determined
// person with the anon key; it is what stops two people quietly clobbering
// each other, which is the failure that actually happens.
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
const newToken = () => {
  const b = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(b);
  return [...b].map((n) => n.toString(16).padStart(2, "0")).join("");
};

// ---------------------------------------------------------------- lookups
//
// Every call reports which of the three states it is in, because the UI has to
// say something different for each: free, taken by someone else, or taken by
// you (in which case updating is fine). An unreachable server is a FOURTH
// state and must not be reported as "free" — that would promise a name we
// cannot actually claim.
export async function checkName(slug, { signal } = {}) {
  const bad = nameProblem(slug);
  if (bad) return { ok: false, reason: bad };
  if (!cloudReady()) return { ok: false, offline: true, reason: "short links are not set up on this copy" };
  try {
    const r = await fetch(rest(`${cloudConfig().table}?slug=eq.${encodeURIComponent(slug)}&select=slug`),
      { headers: headers(), signal });
    if (!r.ok) return { ok: false, offline: true, reason: `lookup failed (${r.status})` };
    const rows = await r.json();
    if (!rows.length) return { ok: true, free: true };
    return ownerTokenFor(slug)
      ? { ok: true, free: false, mine: true, reason: "you already have this name — saving replaces it" }
      : { ok: false, free: false, reason: `"${slug}" is taken — pick another name` };
  } catch (e) {
    if (e?.name === "AbortError") throw e;
    return { ok: false, offline: true, reason: "could not reach the link server" };
  }
}

// Claim or update a name. Returns the slug actually used.
export async function saveShort({ slug, text, name }) {
  const bad = nameProblem(slug);
  if (bad) throw new Error(bad);
  if (!cloudReady()) throw new Error("short links are not set up on this copy");
  if (!text) throw new Error("nothing to save");

  const mine = ownerTokenFor(slug);
  const token = mine || newToken();
  const body = JSON.stringify({ slug, payload: text, name: name || slug, owner: token });
  const table = cloudConfig().table;

  // An existing name we own is an update; anything else is a fresh insert and
  // the table's unique key on slug is what refuses a collision. Deciding it
  // here instead would be a race — two people can pass the same check.
  // The x-brep-owner header is what the table's update policy actually checks
  // (see SCHEMA_SQL) — the ?owner=eq. filter alone is a request the caller
  // writes, so it selects rows but proves nothing. The filter stays as well so
  // a mismatched token touches no row instead of erroring late.
  const r = mine
    ? await fetch(rest(`${table}?slug=eq.${encodeURIComponent(slug)}&owner=eq.${encodeURIComponent(token)}`),
      { method: "PATCH", headers: headers({ Prefer: "return=representation", "x-brep-owner": token }), body })
    : await fetch(rest(table), { method: "POST", headers: headers({ Prefer: "return=representation" }), body });

  if (r.status === 409) throw new Error(`"${slug}" was taken a moment ago — pick another name`);
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new Error(`could not save the short link (${r.status})${detail ? ` — ${detail.slice(0, 120)}` : ""}`);
  }
  const rows = await r.json().catch(() => []);
  if (mine && Array.isArray(rows) && !rows.length) {
    throw new Error(`"${slug}" belongs to someone else now — pick another name`);
  }
  rememberOwner(slug, token);
  return slug;
}

// The other end: a fragment comes in, the model text comes back.
export async function resolveShort(slug) {
  if (!cloudReady()) throw new Error("short links are not set up on this copy");
  const r = await fetch(rest(`${cloudConfig().table}?slug=eq.${encodeURIComponent(slug)}&select=payload,name`),
    { headers: headers() });
  if (!r.ok) throw new Error(`could not fetch that link (${r.status})`);
  const rows = await r.json();
  if (!rows.length) throw new Error(`there is no model called "${slug}"`);
  return { text: rows[0].payload, name: rows[0].name };
}

// Pull the name out of a fragment. Same shape as the #m= reader so the loader
// can ask both the same way.
export function shortSlugIn(hash) {
  const m = /[#&]s=([A-Za-z0-9._-]{1,64})(?:&|$)/.exec(String(hash || ""));
  return m ? m[1] : null;
}

export const shortUrl = (base, slug) => `${base}#s=${slug}`;

// The table this expects, for pasting into the Lovable Cloud SQL editor.
// Kept here rather than in a README because the code and the schema have to
// agree, and a schema in another file is one nobody re-reads when the code
// changes.
export const SCHEMA_SQL = `
-- BREPcode short links
create table if not exists public.shortlinks (
  slug        text primary key,
  payload     text not null,          -- the .bcode text, exactly as the long link carries it
  name        text,
  owner       text not null,          -- random per-browser secret; see cloudlink.js
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.shortlinks enable row level security;

-- Anyone may READ a link: that is the entire point of sharing one.
create policy "read links" on public.shortlinks
  for select using (true);

-- Anyone may CLAIM a name that is free. The primary key is what makes this
-- safe: a second claim on the same slug fails on the unique constraint rather
-- than overwriting.
create policy "claim a free name" on public.shortlinks
  for insert with check (true);

-- Only the browser holding the owner secret may change a link. Without this
-- every visitor could overwrite every model on the site.
create policy "update your own" on public.shortlinks
  for update using (owner = current_setting('request.headers', true)::json->>'x-brep-owner')
  with check  (owner = current_setting('request.headers', true)::json->>'x-brep-owner');
`.trim();
