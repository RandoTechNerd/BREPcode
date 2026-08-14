// Something to look at while the kernel arrives.
//
// The first visit downloads several megabytes of WebAssembly before anything
// can be built, and a shared link adds its model on top. During that the page
// looked FINISHED and empty — a plate, a pill, no sign that work was happening
// — which reads as "this is all there is" rather than "nearly there".
//
// So: the build cube, at size, over a turning rainbow, with the pill wearing
// the same rainbow as an outline. Three things about it are load-bearing, and
// each is here because getting it wrong is worse than not having it:
//
//   IT MUST PAINT BEFORE THE APP DOES. The wait it covers starts before our
//   JavaScript runs. A loading screen assembled by script appears at the end of
//   the wait it was meant to cover, which is no loading screen at all — so the
//   markup is in the document and only its contents are filled in later.
//
//   IT MUST NEVER OUTLIVE ITS WAIT. A cheerful animation over a dead app is
//   the worst outcome here, so there are three independent ways out: the build
//   landing, a timeout, and any deliberate interaction.
//
//   IT MUST NOT SWALLOW CLICKS. It covers the whole stage. The empty plate
//   underneath stays orbitable throughout.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const html = readFileSync("viewer/index.html", "utf8");
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)]
  .map((m) => m[1]).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
const body = html.slice(html.indexOf("<body>"));

console.log("\nit is on screen in the first paint\n");
{
  check("the boot screen is in the markup, not built by script",
    /<div id="boot">/.test(body),
    "a loading screen assembled by JS appears after the wait it covers");
  check("...before the module that would build it",
    body.indexOf('id="boot"') < body.indexOf("<script type=\"module\">"));
  check("it holds a cube, a glow and a caption",
    /id="boot-glow"/.test(body) && /id="boot-cube"/.test(body) && /id="boot-note"/.test(body));
  check("the caption says something before any script runs",
    /id="boot-note">\s*\S/.test(body),
    "an empty caption is a blank rectangle for however long the module takes");
}

console.log("\nit is the build cube, not a second animation to maintain\n");
{
  check("the cube markup comes from the one factory",
    /\$\("boot-cube"\)[\s\S]{0,40}buildCubeHTML\(\)/.test(html),
    "the status bar and the chat bubble use the same story");
  check("...scaled by --bc like every other use of it",
    /#boot-cube \.bcube-wrap \{ --bc: \d+; \}/.test(css),
    "--bc is unitless on purpose: scale() rejects lengths");
  // (The media query is a block now — it also gives the note back its space.)
  check("...and smaller on a phone",
    /max-width: 700px\)[\s\S]{0,120}#boot-cube \.bcube-wrap \{ --bc: \d+/.test(css));
}

console.log("\nthe rainbow now covers every first load, not only shared links\n");
{
  // The glow was written for share links. The wait it was invented for happens
  // on every first visit.
  check("the boot screen turns the pill's glow on", /shareLoading\(true\);/.test(html));
  check("...and the same class the share loader uses",
    /classList\.toggle\("loading-share"/.test(html),
    "one glow, one code path — two would drift");
  check("a shared link says so, rather than a generic message",
    /Unpacking a shared model/.test(html) && /\[#&\]\(m\|s\)=/.test(html));
  check("the glow spins for real rather than fading",
    /@keyframes brc-spin \{ to \{ --brc-spin: 360deg; \} \}/.test(css),
    "a border that MOVES cannot be mistaken for a style");
  check("...with a fallback for engines without @property",
    /@supports not \(background: conic-gradient\(from var\(--brc-spin\)[\s\S]{0,400}#boot-glow/.test(css),
    "Firefox never animates a registered custom property");
}

console.log("\nit cannot outlive the wait it covers\n");
{
  const boot = /function bootScreen\(\)[\s\S]*?\}\)\(\);/.exec(html)?.[0] ?? "";
  check("the boot block was found", boot.length > 200);
  check("the real exit is the first build landing", /onceBuilt\(finish\)/.test(boot));
  check("...a timeout catches a kernel that never arrives", /setTimeout\(finish, \d+\)/.test(boot));
  check("...and on a PLAIN load any deliberate interaction dismisses it",
    /"pointerdown", "keydown", "wheel"/.test(boot) && /once: true/.test(boot));
  check("...but not on a shared one, where it would only reveal the empty plate",
    /if \(!shared\) \{\s*\n\s*for \(const ev of \["pointerdown", "keydown", "wheel"\]\)/.test(boot),
    "the visitor opened a link to look at a model");
}

console.log("\n...and it does not leave before the model it is covering arrives\n");
{
  const boot = /function bootScreen\(\)[\s\S]*?\}\)\(\);/.exec(html)?.[0] ?? "";
  // The bug this guards. The shared branch polled the shareLoading counter and
  // stopped as soon as it read 1 — "only this screen is still holding it". But
  // the share loader does not register until several awaits later, so the very
  // first tick, 120ms in, always found 1 and took the cover away. Everything
  // after that was a black stage until the kernel finished. It happened on
  // every shared link, every time.
  check("the counter poll is gone", !/shareLoads <= 1/.test(boot),
    "it read 'nobody else is loading' during the gap before the loader started");
  check("...and no interval is left behind it", !/setInterval/.test(boot));
  // Both branches wait for a build. They differ in how forgiving they are: a
  // plain load finishes on the first build either way, a shared link insists
  // on a SUCCESSFUL one (see the failed-pass section above).
  check("a plain load waits for the first build", /\} else \{\s*\n\s*onceBuilt\(finish\);/.test(boot));
  check("...and a shared link waits for a successful one", /onceBuilt\(onBuild\);\s*\n\s*setTimeout\(finish, 120000\)/.test(boot));
  check("a shared link waits far longer before giving up",
    /setTimeout\(finish, 120000\)/.test(boot), "a kernel plus a fetch is not a 30s wait");
  check("the shared test matches the rest of the boot",
    /const shared = urlCarriesModel\(\)/.test(boot),
    "hash-only here would take the wrong branch when /m/name is served as a rewrite");

  // The cover lifts a beat AFTER the build, so the model is painted underneath
  // first — otherwise the last frame before the fade is still the empty plate.
  check("the reveal waits for a paint", /requestAnimationFrame\(\(\) => requestAnimationFrame\(lift\)\)/.test(boot));
  check("...but not forever, because frames stop in a background tab",
    /setTimeout\(lift, 250\)/.test(boot) && /if \(lifted\) return;/.test(boot),
    "a cover waiting on a frame that never comes is a loading screen with no way out");

  // With interaction no longer an escape on shared links, the paths that KNOW
  // the model is not coming have to say so.
  check("a dead short link takes the cover down", /bootDismiss\(\);\s*\/\/ nothing is coming/.test(html));
  check("...as does an unreadable payload",
    /if \(!text\) \{ unreadable\(\); return false; \}/.test(html)
      && /const unreadable = \(\) => \{[\s\S]{0,600}bootDismiss\(\);/.test(html),
    "both 'no text' and 'no source' go through one helper that dismisses and explains");
  check("...and an outright failure", /catch \{ bootDismiss\(\); return false; \}/.test(html));
  check("bootDismiss is declared before the boot screen assigns it",
    html.indexOf("let bootDismiss = () => {};") < html.indexOf("bootDismiss = finish;"),
    "a let further down the module would be in its dead zone");
  check("it only finishes once, however many of those fire first",
    /if \(done\) return;\s*\n\s*done = true;/.test(boot),
    "shareLoading is a COUNTER — two decrements would unbalance it");
  check("the glow is released with it", /finish[\s\S]{0,120}shareLoading\(false\)/.test(boot));
  check("and the layer is removed, not just made transparent",
    /boot\.hidden = true/.test(boot),
    "an invisible sheet over the model costs an afternoon later");
}

console.log("\na build that FAILED is not the model arriving\n");
{
  // The black screen, finally. The cover waited for onceBuilt — but the
  // failure paths call fireBuilt() too (they must, or a share that cannot
  // build would glow forever), and the cover could not tell the two apart.
  //
  // On a shared link the FIRST pass routinely fails: a packed mesh is not
  // registered yet, or a lazy module is still landing, and a retry is already
  // queued. So the cover came off on that failure and the visitor watched an
  // empty stage until the real build finished. Measured on the live site:
  // cover gone at ~1s, first successful build at 7.5s.
  check("fireBuilt says whether a model actually landed", /function fireBuilt\(ok = true\)/.test(html));
  check("...and passes it on to whoever is waiting", /for \(const fn of fns\) \{ try \{ fn\(ok\); \}/.test(html));
  check("every failure path says so",
    (html.match(/fireBuilt\(false\);\s+\/\/ a share that cannot build must stop glowing/g) || []).length === 3,
    `${(html.match(/fireBuilt\(false\)/g) || []).length} marked`);
  // The success path passes no argument, so `ok` defaults to true. Matched
  // loosely across the lines between: the logbook writes its build entry in
  // that gap, and more may follow.
  check("...and the success path still means success",
    /\n        fireBuilt\(\);\n[\s\S]{0,400}?setStatus\("ok", lastGoodStatus\);/.test(html));

  const boot = /function bootScreen\(\)[\s\S]*?\}\)\(\);/.exec(html)?.[0] ?? "";
  check("the cover waits through a failed pass", /if \(ok \|\| \+\+attempts >= 3\) return finish\(\)/.test(boot));
  check("...by getting back in line, since firing cleared the set",
    /onceBuilt\(onBuild\);\s*\/\/ fireBuilt cleared the set/.test(boot));
  check("...but gives up after a few, so a broken model is not covered for two minutes",
    /let attempts = 0;/.test(boot) && /attempts >= 3/.test(boot));
}

console.log("\nthe boot screen only touches things that already exist\n");
{
  // A REGRESSION, and a nasty one: the boot screen runs immediately, and it
  // asks urlCarriesModel() which reads PRETTY_PATH — a `const` that was
  // declared further down the module, still inside its dead zone at that
  // moment. It threw, module init stopped, and NOTHING built.
  //
  // What made it survive a round of testing is the || chain. A shared link
  // matches on the hash and short-circuits before ever reaching PRETTY_PATH,
  // so every link worked perfectly while a PLAIN first load — much the
  // commonest way anyone arrives — was completely dead.
  const declared = html.indexOf("const PRETTY_PATH");
  const bootAt = html.indexOf("(function bootScreen()");
  check("PRETTY_PATH is declared before the boot screen runs",
    declared > 0 && bootAt > 0 && declared < bootAt,
    `declared at ${declared}, boot at ${bootAt}`);
  // The same trap, one line over.
  const dismissAt = html.indexOf("let bootDismiss = () => {};");
  check("...and so is bootDismiss", dismissAt > 0 && dismissAt < bootAt);
  // tourRequested and urlCarriesModel are function DECLARATIONS, which hoist —
  // that is why they may be defined below and still be callable here.
  check("the two things it calls are hoistable declarations",
    /^\s*function tourRequested\(\)/m.test(html) && /^\s*function urlCarriesModel\(\)/m.test(html),
    "an arrow assigned to a const would have the same dead-zone problem");
}

console.log("\na link that cannot open says why, somewhere that survives\n");
{
  // Both failure paths fall through to the starter model, and THAT build
  // writes its own line into the status bar a second later — so a message put
  // only in the status was gone before it could be read. The visitor was left
  // with a cube and no explanation, which reads as the link having been
  // silently ignored.
  check("a dead short link writes to the hint, not just the status",
    /hint\.innerHTML = `⚠️ <b>That link did not open<\/b>/.test(html));
  check("...and names what was actually asked for",
    /That link did not open<\/b> — \$\{esc\(String\(e\?\.message \|\| e\)\)\}/.test(html));
  check("an unreadable payload explains itself too",
    /That link did not carry a readable model/.test(html));
  check("...and says what usually truncates one", /wrapping it, or a chat app trimming it/.test(html));
  check("both take the cover down as well", (html.match(/bootDismiss\(\)/g) || []).length >= 4);
}

console.log("\nthe wording matches how you arrived\n");
{
  check("a shared link says a model is being unpacked", /Unpacking a shared model/.test(html));
  check("...but a handoff is your OWN file, and says so",
    /\/\[#&\]open=handoff\\b\/\.test\(location\.hash\)\s*\n?\s*\? "Opening your model…"/.test(html),
    "being told your own file is 'a shared model' makes the app feel like it is guessing");
  check("a tour link gets no loading screen at all",
    /if \(tourRequested\(\)\) \{ boot\.hidden = true; return; \}/.test(html));
}

console.log("\n/tour is an address, not just a query string\n");
{
  // brepcode.com/tour is a link to hand someone, so it should work however the
  // host chooses to serve it — bounced through ?tour=1 (what the built page
  // does today) or rewritten straight onto the app.
  const re = /(^|\/)tour\/?$/i;
  for (const p of ["/tour", "/tour/", "/brep/tour/"]) check(`${p} is a tour link`, re.test(p));
  for (const p of ["/detour", "/tourism", "/brep/index.html"]) check(`${p} is NOT`, !re.test(p), p);
  // /m/tour reads as a tour link to that regex even though it is a MODEL
  // address. "tour" is a reserved name so no model can actually be called
  // that, but the app should not have to rely on the reserved list to tell
  // two kinds of URL apart.
  const MODEL_GUARD = "!/(^|\\/)m\\/tour\\/?$/i.test(location.pathname)";
  const TOUR_PATH = "/(^|\\/)tour\\/?$/i.test(location.pathname)";
  check("a /m/ address is a model link, never the tour",
    html.includes(MODEL_GUARD), "the tour test must exclude /m/tour explicitly");
  check("the app accepts the path as well as the query and the hash",
    html.includes(TOUR_PATH));
  check("...and so does the pre-paint script that hides the cover",
    html.split(TOUR_PATH).length - 1 >= 2,
    "the inline script runs before the module and needs its own copy");
  check("the name is reserved so a model cannot take it",
    /RESERVED = new Set\(\[[^\]]*"tour"/.test(readFileSync(new URL("../viewer/cloudlink.js", import.meta.url), "utf8")));
}

console.log("\nthe note clears the cube that spins above it\n");
{
  // A rotating box sweeps outside the bounds it occupies at rest — its corners
  // reach furthest at 45°. The static boxes do not overlap, which is why the
  // gap looked sufficient and was not.
  check("the note is pushed clear of the sweep", /#boot-note \{[^}]*margin-top: 16px/.test(css));
  check("...and says why, since measuring the box will not show it",
    /rotating box sweeps outside the bounds it[\s\S]{0,40}occupies at rest/.test(html));
  check("a phone scales the cube DOWN, so it gets the space back",
    /max-width: 700px\)[\s\S]{0,180}#boot-note \{ margin-top: 0; \}/.test(css));
}

console.log("\nit is scenery, so the plate underneath stays live\n");
{
  const rule = /#boot \{([^}]*)\}/.exec(css)?.[1] ?? "";
  check("the boot layer does not take pointer events", /pointer-events:\s*none/.test(rule), rule.trim());
  check("...and sits above the canvas while it is there", /z-index:\s*\d+/.test(rule));
  check("it fades rather than vanishing", /#boot \{[^}]*transition:[^}]*opacity/.test(css));
  check("someone who asked for less motion still gets the cube, calmer",
    /prefers-reduced-motion[\s\S]{0,220}#boot-glow \{ animation-duration/.test(css));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
