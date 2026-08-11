// Short links — the same model behind a name.
//
// The backend is a purpose-built REST route, not a database with a key in the
// browser, and the difference decides the test list: there is no anon key to
// leak, but there IS an owner secret whose whole job is stopping one person
// overwriting another's model. So most of this is about the states a name can
// be in (free, mine, taken, unreachable), refusing to confuse them, and never
// remembering ownership of a name we did not actually get.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// localStorage, because the owner-token store IS the ownership model.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const cl = await import("../viewer/cloudlink.js");

console.log("\nnames a URL can carry\n");
{
  check("spaces and case become a slug", cl.slugify("FISH bowl v2") === "fish-bowl-v2",
    cl.slugify("FISH bowl v2"));
  check("punctuation and edges are trimmed", cl.slugify("  --Holder!!  ") === "holder");
  check("accents survive as letters", cl.slugify("Café") === "cafe", cl.slugify("Café"));
  check("a name is capped", cl.slugify("x".repeat(80)).length === 48);
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

console.log("\nit works out of the box\n");
{
  // There is no key to configure, so unlike the first design this ships
  // switched ON. A default that needs editing before it works is a feature
  // most people never find.
  check("an endpoint is built in", cl.cloudReady() === true);
  check("...and it is the public one", /\/api\/public\/links$/.test(cl.cloudConfig().url),
    cl.cloudConfig().url);
  check("the size cap matches the server's", cl.cloudConfig().maxBytes === 4194304);
}

// ---- a stand-in for the real route --------------------------------------
function fakeServer(seed = {}) {
  const rows = { ...seed };
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url), m = init.method || "GET";
    const hdr = { ...(init.headers || {}) };
    calls.push({ m, u, hdr, body: init.body ? JSON.parse(init.body) : null });
    const slug = decodeURIComponent(/[?&]slug=([^&]+)/.exec(u)?.[1] || "");
    const json = (v, status = 200) => new Response(JSON.stringify(v), { status });

    if (m === "GET") {
      return rows[slug] ? json(rows[slug]) : json({ error: "not found", slug }, 404);
    }
    if (m === "POST") {
      const b = JSON.parse(init.body);
      if (rows[b.slug]) return json({ error: "slug already taken", slug: b.slug }, 409);
      rows[b.slug] = { slug: b.slug, name: b.name, payload: b.payload, owner: b.owner };
      return json({ slug: b.slug, name: b.name }, 201);
    }
    if (m === "PATCH") {
      const secret = hdr["X-Owner-Secret"];
      if (!secret) return json({ error: "missing header" }, 401);
      if (!rows[slug]) return json({ error: "not found" }, 404);
      if (rows[slug].owner !== secret) {
        return json({ error: "forbidden: owner secret does not match" }, 403);
      }
      const b = JSON.parse(init.body);
      if (b.payload != null) rows[slug].payload = b.payload;
      if (b.name != null) rows[slug].name = b.name;
      return json(rows[slug]);
    }
    return json({ error: "?" }, 400);
  };
  return { rows, calls };
}

console.log("\nclaiming a name\n");
{
  const srv = fakeServer({ "taken-name": { slug: "taken-name", payload: "SOMEONE ELSE", owner: "not-me" } });
  store.clear();
  const free = await cl.checkName("fish-bowl");
  check("a 404 from the server means the name is FREE", free.ok && free.free, JSON.stringify(free));
  const taken = await cl.checkName("taken-name");
  check("a 200 means taken, and says so by name",
    !taken.ok && /taken/.test(taken.reason), JSON.stringify(taken));

  check("saving returns the slug",
    await cl.saveShort({ slug: "fish-bowl", text: "MODEL", name: "FISH bowl" }) === "fish-bowl");
  check("...as a POST, not an update", srv.calls.filter((c) => c.m === "POST").length === 1);
  const mine = await cl.checkName("fish-bowl");
  check("the name is then MINE, not merely taken", mine.ok && mine.mine, JSON.stringify(mine));

  const got = await cl.resolveShort("fish-bowl");
  check("the model comes back byte for byte", got.text === "MODEL", got.text);
  check("...with the name it was saved under", got.name === "FISH bowl", got.name);

  // The failure that matters: someone else's link must survive.
  let threw = "";
  try { await cl.saveShort({ slug: "taken-name", text: "HIJACK" }); } catch (e) { threw = e.message; }
  check("a name owned by someone else cannot be claimed", /taken/.test(threw), threw);
  check("...and their model is untouched", srv.rows["taken-name"].payload === "SOMEONE ELSE");
}

console.log("\nupdating your own\n");
{
  const srv = fakeServer();
  store.clear();
  await cl.saveShort({ slug: "my-part", text: "V1" });
  await cl.saveShort({ slug: "my-part", text: "V2", name: "My part" });
  const posts = srv.calls.filter((c) => c.m === "POST"), patches = srv.calls.filter((c) => c.m === "PATCH");
  check("the first save creates, the second updates", posts.length === 1 && patches.length === 1,
    `${posts.length} POST / ${patches.length} PATCH`);
  check("the update sends the secret in the X-Owner-Secret HEADER",
    patches.every((c) => !!c.hdr["X-Owner-Secret"]),
    "the server hashes and compares this; a query filter would be spoofable");
  check("...the same secret the create stored",
    patches[0].hdr["X-Owner-Secret"] === srv.rows["my-part"].owner);
  check("...and never as a query parameter",
    patches.every((c) => !/owner=/.test(c.u)), patches[0]?.u);
  check("the model really changed", srv.rows["my-part"].payload === "V2");
  check("the token is remembered against the slug", cl.ownerTokenFor("my-part") === srv.rows["my-part"].owner);
}

console.log("\nwhen the server says no\n");
{
  const srv = fakeServer({ "not-mine": { slug: "not-mine", payload: "THEIRS", owner: "real-owner" } });
  store.clear();
  // This browser wrongly believes it owns a name — the server must be the one
  // that decides, and the message must not blame the user's model.
  localStorage.setItem("brepcode-shortlink-owner", JSON.stringify({ "not-mine": "wrong-secret" }));
  let threw = "";
  try { await cl.saveShort({ slug: "not-mine", text: "X" }); } catch (e) { threw = e.message; }
  check("a 403 is reported as the name belonging to someone else",
    /belongs to someone else/.test(threw), threw);
  check("...and their model survives", srv.rows["not-mine"].payload === "THEIRS");

  // A record deleted server-side while this browser still holds the token:
  // recreate rather than dead-end on "not found".
  store.clear();
  localStorage.setItem("brepcode-shortlink-owner", JSON.stringify({ "ghost": "old-secret" }));
  const back = await cl.saveShort({ slug: "ghost", text: "REBORN" });
  check("a PATCH against a vanished record falls back to creating it",
    back === "ghost" && srv.rows.ghost?.payload === "REBORN", JSON.stringify(srv.rows.ghost));
  check("...with a NEW secret, since the old one owns nothing",
    cl.ownerTokenFor("ghost") !== "old-secret");
}

console.log("\na failed create must not look like a win\n");
{
  // Remembering ownership before the server confirms it means every later
  // save is a PATCH against a record this browser does not own — a name that
  // can never be claimed and never be fixed.
  fakeServer({ "already": { slug: "already", payload: "X", owner: "someone" } });
  store.clear();
  try { await cl.saveShort({ slug: "already", text: "MINE" }); } catch { /* expected */ }
  check("a rejected create leaves NO owner token behind",
    cl.ownerTokenFor("already") === null, cl.ownerTokenFor("already"));
}

console.log("\ntoo big for the store\n");
{
  fakeServer();
  store.clear();
  let threw = "";
  const huge = "x".repeat(cl.cloudConfig().maxBytes + 1);
  try { await cl.saveShort({ slug: "huge-one", text: huge }); } catch (e) { threw = e.message; }
  check("an oversized model is refused before it is uploaded", /limit is/.test(threw), threw);
  check("...saying its real size", /4\.0MB/.test(threw), threw);
  check("...and pointing at the routes that have no such limit",
    /full link/.test(threw) && /\.bcode/.test(threw), threw);
  check("byte length counts UTF-8, not characters", cl.byteLength("é") === 2, `${cl.byteLength("é")}`);
}

console.log("\nwhen it goes wrong\n");
{
  fakeServer();
  store.clear();
  let threw = "";
  try { await cl.resolveShort("nobody-made-this"); } catch (e) { threw = e.message; }
  check("a link to nothing names the name, not a status code",
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

console.log("\nwhere it cannot work\n");
{
  // The desktop app serves itself over app://, and CORS does not extend to
  // custom schemes. Better to say so than to fail with a network error the
  // user will read as "the site is down".
  const realLoc = globalThis.location;
  globalThis.location = { protocol: "app:" };
  check("a non-http origin with no bridge is named as the reason",
    /cannot reach the link server/.test(cl.originProblem() || ""),
    cl.originProblem());
  const res = await cl.checkName("fish-bowl");
  check("...and a name check reports it rather than claiming free",
    !res.ok && res.offline && /cannot reach/.test(res.reason), JSON.stringify(res));
  let threw = "";
  try { await cl.saveShort({ slug: "fish-bowl", text: "T" }); } catch (e) { threw = e.message; }
  check("...and saving refuses up front", /cannot reach/.test(threw), threw);
  globalThis.location = { protocol: "https:" };
  check("on the website there is no such problem", cl.originProblem() === null);
  globalThis.location = realLoc;
}

console.log("\nclaiming by proxy, for the desktop app\n");
{
  // The .exe cannot reach the link server at all, so it hands the job to a
  // browser: the ordinary long share link with the wanted name on the front.
  const frag = "#m=H4sIAAAAmodel";
  const url = cl.claimUrl("https://brepcode.com/brep/index.html", "fish-bowl", frag);
  check("a claim link is the share link with the name in front",
    url === "https://brepcode.com/brep/index.html#claim=fish-bowl&m=H4sIAAAAmodel", url);
  check("the name reads back out", cl.claimSlugIn(url) === "fish-bowl");
  check("a fragment already lacking # is handled the same",
    cl.claimUrl("x", "a-b", "m=zzz") === "x#claim=a-b&m=zzz");
  check("no model still produces a usable link",
    cl.claimUrl("x", "a-b", "") === "x#claim=a-b");

  // The whole trick depends on the long-link reader still finding the model
  // with "claim=" sitting in front of it. "claim=" ENDS in "m=", so a reader
  // matching a bare m= would grab the name and decode garbage.
  check("the m= reader cannot mistake the tail of claim= for the model",
    /[#&]m=([A-Za-z0-9\-_]+)/.exec("#claim=fish-bowl&m=PAYLOAD")[1] === "PAYLOAD");
  check("...even when the name itself ends in m",
    /[#&]m=([A-Za-z0-9\-_]+)/.exec("#claim=aquarium&m=PAYLOAD")[1] === "PAYLOAD");

  check("a plain share link is NOT a claim", cl.claimSlugIn("#m=abc") === null);
  check("nothing is nothing", cl.claimSlugIn("") === null);
}

console.log("\nthe desktop app sends it ITSELF\n");
{
  // A fetch from the exe's page is blocked before it leaves — app:// is not an
  // origin any server can allow. But that is a rule about RENDERER processes,
  // not about the machine: Electron's main process has no origin and no CORS.
  // So the exe stops handing the job to a browser and just makes the request.
  const calls = [];
  const rows = { "someone-elses": { slug: "someone-elses", payload: "THEIRS", owner: "not-mine" } };
  globalThis.location = { protocol: "app:" };
  globalThis.fetch = async () => { throw new TypeError("a renderer fetch must NEVER be attempted here"); };
  globalThis.window = {
    brepcodeDesktop: {
      shortLink: async (req) => {
        calls.push(req);
        const { method, slug, body, secret } = req;
        if (method === "GET") {
          return rows[slug]
            ? { ok: true, status: 200, json: rows[slug] }
            : { ok: true, status: 404, json: { error: "not found" } };
        }
        if (method === "POST") {
          if (rows[body.slug]) return { ok: true, status: 409, json: { error: "slug already taken" } };
          rows[body.slug] = { ...body };
          return { ok: true, status: 201, json: { slug: body.slug } };
        }
        if (method === "PATCH") {
          if (!rows[slug]) return { ok: true, status: 404, json: {} };
          if (rows[slug].owner !== secret) return { ok: true, status: 403, json: { error: "forbidden" } };
          Object.assign(rows[slug], body);
          return { ok: true, status: 200, json: rows[slug] };
        }
        return { ok: false, error: "?" };
      },
    },
  };
  store.clear();

  check("with the bridge present this is NOT reported as unreachable",
    cl.originProblem() === null, cl.originProblem());
  const free = await cl.checkName("bridged");
  check("a name can be checked from the app", free.ok && free.free, JSON.stringify(free));
  check("saving works from the app",
    await cl.saveShort({ slug: "bridged", text: "MODEL" }) === "bridged");
  check("...and it went through the BRIDGE, not a renderer fetch",
    calls.some((c) => c.method === "POST"), calls.map((c) => c.method).join(","));
  const got = await cl.resolveShort("bridged");
  check("...and reading it back gives the model", got.text === "MODEL", got.text);

  await cl.saveShort({ slug: "bridged", text: "V2" });
  const patch = calls.find((c) => c.method === "PATCH");
  check("an update passes the owner secret as its own field",
    !!patch?.secret && patch.secret === rows.bridged.owner);
  check("...and the page never names a URL — only an operation and a name",
    calls.every((c) => !("url" in c) && !("endpoint" in c)),
    "a bridge that accepted a URL would be an open relay to any host");

  // Every guarantee the browser path makes has to hold here too.
  let threw = "";
  try { await cl.saveShort({ slug: "someone-elses", text: "HIJACK" }); } catch (e) { threw = e.message; }
  check("someone else's name is still refused over the bridge", /taken/.test(threw), threw);
  check("...and their model is untouched", rows["someone-elses"].payload === "THEIRS");

  globalThis.window.brepcodeDesktop.shortLink = async () => ({ ok: false, error: "no internet" });
  const down = await cl.checkName("bridged");
  check("a bridge with no internet is UNREACHABLE, never free",
    !down.ok && down.offline && !down.free, JSON.stringify(down));

  // An older exe has no bridge — that is when the browser hand-off is right.
  delete globalThis.window.brepcodeDesktop;
  check("no bridge on app:// falls back to naming the limitation",
    /cannot reach/.test(cl.originProblem() || ""), cl.originProblem());
  globalThis.location = { protocol: "https:" };
  globalThis.window = {};
}

console.log("\noffering a name that IS free\n");
{
  // "Taken — pick another name" is half an answer. Walk a few and come back
  // with one that works.
  fakeServer({ orca: { slug: "orca", owner: "x" }, "orca-2": { slug: "orca-2", owner: "x" } });
  store.clear();
  check("the first free variant is offered", await cl.suggestFreeName("orca") === "orca-3",
    await cl.suggestFreeName("orca"));

  fakeServer();
  check("a free name suggests its own -2", await cl.suggestFreeName("bowl") === "bowl-2");

  // A dead server must not produce a suggestion — offering a name we could not
  // check is how someone ends up claiming something already taken.
  globalThis.fetch = async () => { throw new TypeError("down"); };
  check("an unreachable server offers nothing", await cl.suggestFreeName("bowl") === null);
}

console.log("\nthe desktop bridge is actually wired up\n");
{
  // Three separate files have to agree, and nothing at runtime complains if
  // one of them does not: the page would simply fall back to "cannot reach the
  // link server" in an app that CAN.
  const main = readFileSync("desktop/main.cjs", "utf8");
  const pre = readFileSync("desktop/preload.cjs", "utf8");
  const mod = readFileSync("desktop/shortlink.cjs", "utf8");
  const page = readFileSync("viewer/cloudlink.js", "utf8");

  check("main requires the bridge", /require\("\.\/shortlink\.cjs"\)/.test(main));
  check("...and registers its handler", /shortlink\.register\(\)/.test(main));
  check("preload exposes it under the name the page looks for",
    /shortLink:\s*\(req\)\s*=>\s*ipcRenderer\.invoke\("shortlink:call"/.test(pre));
  check("...matching what cloudlink.js calls",
    /brepcodeDesktop\?\.shortLink/.test(page));
  check("the handler answers that exact channel", /ipcMain\.handle\("shortlink:call"/.test(mod));

  // The bridge must not become a way to reach anything else on the network.
  // The page runs model code and, with the chat on, text written by an AI.
  check("the endpoint is a CONSTANT in the main process, not a parameter",
    /const ENDPOINT =/.test(mod) && !/req\.(url|endpoint|host)/.test(mod),
    "a bridge that took a URL would be an open relay");
  check("only the three methods the API has are allowed",
    /METHODS = new Set\(\["GET", "POST", "PATCH"\]\)/.test(mod));
  check("the slug is re-validated in main, not trusted from the page",
    /SLUG\.test\(slug\)/.test(mod));
  check("a write is size-capped before it is sent", /payload\.length > MAX_BYTES/.test(mod));
}

console.log("\nthe module actually ships\n");
{
  // A dynamic import the site build does not copy is a 404 the first time a
  // user ticks the box — and the build's file list is typed by hand.
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
