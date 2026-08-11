// Short links — the same model behind a name.
//
// The thing that must never happen is handing someone a short URL that
// resolves to nothing, so most of this is about the four states a name can be
// in (free, mine, taken, server-unreachable) and refusing to confuse them. An
// unreachable server reported as "free" would promise a name we cannot claim.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// localStorage, because the owner-token store is the whole ownership model.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.window = undefined;

const cl = await import("../viewer/cloudlink.js");

console.log("\nnames a URL can carry\n");
{
  check("spaces and case become a slug", cl.slugify("FISH bowl v2") === "fish-bowl-v2",
    cl.slugify("FISH bowl v2"));
  check("punctuation and edges are trimmed", cl.slugify("  --Holder!!  ") === "holder",
    cl.slugify("  --Holder!!  "));
  check("accents survive as letters", cl.slugify("Café") === "cafe", cl.slugify("Café"));
  check("a name is capped, not truncated mid-nonsense", cl.slugify("x".repeat(80)).length === 48);
  check("an empty name is a problem, and says so", /give it a name/.test(cl.nameProblem("")));
  check("one character is too short", /longer/.test(cl.nameProblem("a")));
  check("a reserved word is refused by name", /reserved/.test(cl.nameProblem("index")));
  check("a normal name is fine", cl.nameProblem("fish-bowl") === null);
}

console.log("\nreading a link\n");
{
  check("a short fragment is recognised", cl.shortSlugIn("#s=fish-bowl") === "fish-bowl");
  check("...alongside other keys", cl.shortSlugIn("#foo&s=my-part") === "my-part");
  check("a long-link fragment is NOT one", cl.shortSlugIn("#m=H4sIAAA") === null);
  check("nothing is nothing", cl.shortSlugIn("") === null && cl.shortSlugIn(undefined) === null);
  check("the URL is the base plus the name",
    cl.shortUrl("https://brepcode.com/brep/index.html", "fish-bowl")
      === "https://brepcode.com/brep/index.html#s=fish-bowl");
}

console.log("\nwith no backend configured\n");
{
  // A fork of this repo has no cloud. It must degrade to "the long link still
  // works", never to a broken short one.
  check("the feature reports itself off", cl.cloudReady() === false);
  const res = await cl.checkName("anything");
  check("...and a name check says so rather than claiming free",
    res.ok === false && res.offline === true, JSON.stringify(res));
  let threw = "";
  try { await cl.saveShort({ slug: "x-y", text: "T" }); } catch (e) { threw = e.message; }
  check("...and saving refuses outright", /not set up/.test(threw), threw);
}

// ---- with a backend ------------------------------------------------------
// A stand-in PostgREST, so every branch runs without a network.
function fakeServer(seed = {}) {
  const rows = { ...seed };
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || "GET";
    calls.push({ m, u, hdr: { ...(init.headers || {}) } });
    const slug = decodeURIComponent(/slug=eq\.([^&]+)/.exec(u)?.[1] || "");
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status });
    if (m === "GET") return json(rows[slug] ? [rows[slug]] : []);
    if (m === "POST") {
      const b = JSON.parse(init.body);
      if (rows[b.slug]) return new Response("duplicate key", { status: 409 });
      rows[b.slug] = b;
      return json([b], 201);
    }
    if (m === "PATCH") {
      const b = JSON.parse(init.body);
      const owner = decodeURIComponent(/owner=eq\.([^&]+)/.exec(u)?.[1] || "");
      if (!rows[slug] || rows[slug].owner !== owner) return json([]);   // matched nothing
      rows[slug] = b;
      return json([b]);
    }
    return new Response("?", { status: 400 });
  };
  globalThis.window = { __BREPCODE_CLOUD: { url: "https://fake.supabase.co", key: "anon", table: "shortlinks" } };
  return { rows, calls };
}

console.log("\nclaiming a name\n");
{
  const srv = fakeServer({ "taken-name": { slug: "taken-name", payload: "SOMEONE ELSE", owner: "not-me" } });
  store.clear();
  check("the backend is seen once configured", cl.cloudReady() === true);
  const free = await cl.checkName("fish-bowl");
  check("a free name is free", free.ok && free.free, JSON.stringify(free));
  const taken = await cl.checkName("taken-name");
  check("someone else's name is refused, by name",
    !taken.ok && /taken/.test(taken.reason), JSON.stringify(taken));

  check("saving returns the slug", await cl.saveShort({ slug: "fish-bowl", text: "MODEL", name: "FISH bowl" }) === "fish-bowl");
  const mine = await cl.checkName("fish-bowl");
  check("...and the name is then MINE, not merely taken",
    mine.ok && mine.mine, JSON.stringify(mine));
  const got = await cl.resolveShort("fish-bowl");
  check("the model comes back byte for byte", got.text === "MODEL", got.text);
  check("...with the name it was saved under", got.name === "FISH bowl", got.name);

  // The failure that matters: someone else's link must survive.
  let threw = "";
  try { await cl.saveShort({ slug: "taken-name", text: "HIJACK" }); } catch (e) { threw = e.message; }
  check("a name owned by someone else cannot be overwritten", /taken/.test(threw), threw);
  check("...and their model is untouched", srv.rows["taken-name"].payload === "SOMEONE ELSE");
}

console.log("\nupdating your own\n");
{
  const srv = fakeServer();
  store.clear();
  await cl.saveShort({ slug: "my-part", text: "V1" });
  await cl.saveShort({ slug: "my-part", text: "V2" });
  const posts = srv.calls.filter((c) => c.m === "POST"), patches = srv.calls.filter((c) => c.m === "PATCH");
  check("the first save inserts, the second updates", posts.length === 1 && patches.length === 1,
    `${posts.length} POST / ${patches.length} PATCH`);
  check("the update carries the owner secret as a HEADER",
    patches.every((c) => !!c.hdr["x-brep-owner"]),
    "the table's update policy checks the header, not the query filter");
  check("...and still filters on it, so a wrong token touches no row",
    patches.every((c) => /owner=eq\./.test(c.u)));
  check("the model really changed", srv.rows["my-part"].payload === "V2");
  check("the owner token is stable across saves",
    srv.rows["my-part"].owner === cl.ownerTokenFor("my-part"));
}

console.log("\nwhen it goes wrong\n");
{
  fakeServer();
  store.clear();
  let threw = "";
  try { await cl.resolveShort("nobody-made-this"); } catch (e) { threw = e.message; }
  check("a link to nothing says the name, not a status code",
    /no model called "nobody-made-this"/.test(threw), threw);

  // A server that is down must not read as "this name is free".
  globalThis.fetch = async () => { throw new TypeError("network down"); };
  const res = await cl.checkName("fish-bowl");
  check("an unreachable server is NOT reported as free",
    !res.ok && res.offline && !res.free, JSON.stringify(res));

  globalThis.fetch = async () => new Response("nope", { status: 500 });
  const err = await cl.checkName("fish-bowl");
  check("...nor is a 500", !err.ok && err.offline, JSON.stringify(err));
}

console.log("\nthe schema matches the client\n");
{
  // These two drifting apart is a feature that works in testing and silently
  // lets anyone overwrite anyone on the real site.
  const sql = cl.SCHEMA_SQL;
  check("row-level security is switched ON", /enable row level security/i.test(sql));
  check("reads are public — that is what sharing means", /for select using \(true\)/i.test(sql));
  check("the update policy checks the same header the client sends",
    /x-brep-owner/.test(sql), "client sends x-brep-owner");
  check("slug is the primary key, so a race collides instead of overwriting",
    /slug\s+text primary key/i.test(sql));
  check("the payload column is the one the client writes",
    /payload\s+text not null/i.test(sql));
}

console.log("\nthe module actually ships\n");
{
  // A dynamic import that the site build does not copy is a 404 the first time
  // a user ticks the box — and the build's file list is typed by hand.
  const html = readFileSync("viewer/index.html", "utf8");
  const build = readFileSync("build-site.mjs", "utf8");
  const listed = new Set([...build.matchAll(/"([a-z0-9-]+\.js)"/g)].map((m) => m[1]));
  const imported = [...html.matchAll(/import\(\s*["']\.\/([a-z0-9-]+\.js)["']\s*\)/g)].map((m) => m[1]);
  check("index.html dynamically imports something", imported.length > 0, `${imported.length} found`);
  const missing = imported.filter((f) => !listed.has(f));
  check("every module index.html imports is in the site build's file list",
    missing.length === 0, missing.join(", "));
  check("cloudlink.js specifically", listed.has("cloudlink.js"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
