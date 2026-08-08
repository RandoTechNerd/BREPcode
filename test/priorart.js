// Deciding whether a request names something worth searching for.
//
// The expensive mistake is a FALSE hit: someone asks for a 40mm spacer and the
// app interrupts with a list of other people's downloads. The cheap mistake is
// a miss — a link nobody sees. So this leans hard on "does not fire", and the
// list of things that must stay quiet is longer than the list that must fire.

import {
  namedSubject, searchQuery, safeModelUrl, looksLikeModelFile,
  DOWNLOAD_WARNING, MAX_DOWNLOAD_BYTES, MODEL_SITES,
} from "../src/priorart.js";
import { priorArtRequest, parsePriorArt } from "../viewer/chatbot.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

console.log("\nit fires on things that really exist\n");
{
  const fires = [
    "make me a snapmaker u1 model - same as the printer - 4 colors",
    "model the Snapmaker U1",
    "a GoPro Hero 11 mount",
    "iPhone 15 case",
    "Raspberry Pi 5 enclosure",
    "print me a 3DBenchy",
    "Ender 3 bed levelling knob",
    "an IKEA Skadis hook set",
  ];
  for (const t of fires) {
    const got = namedSubject(t);
    check(`fires: ${t.slice(0, 42)}`, !!got, "no subject");
  }
  check("the subject is the product, not the sentence",
    namedSubject("make me a snapmaker u1 model - same as the printer - 4 colors")?.subject
      .toLowerCase().startsWith("snapmaker u1"),
    namedSubject("make me a snapmaker u1 model - same as the printer - 4 colors")?.subject);
  check("a brand with a model number is the confident case",
    namedSubject("model the Snapmaker U1")?.confident === true);
}

console.log("\nand stays quiet on shapes nobody has a name for\n");
{
  const quiet = [
    "a 40mm bracket with two holes",
    "a box 60 x 40 x 20 with a lid",
    "make me a spacer, 12mm long, M3 clearance",
    "a cylinder 20 tall",
    "a plate with four screw holes",
    "something to hold my pens",
    "a bookshelf",
    "a gear with 24 teeth",
    "a washer 8mm id 16mm od",
  ];
  for (const t of quiet) {
    check(`quiet: ${t.slice(0, 42)}`, namedSubject(t) === null, JSON.stringify(namedSubject(t)));
  }
  // A brand-adjacent part DOES fire, and deliberately so. An earlier version
  // vetoed anything containing a generic noun, which threw out "GoPro Hero 11
  // mount" and "IKEA Skadis hook" — the very requests most likely to have
  // somebody else's work behind them.
  check("a part named for a brand still fires",
    namedSubject("a bracket for my Bambu spool holder") !== null);
  check("...but reads as the weaker kind of hit",
    namedSubject("a bracket for my Bambu spool holder")?.confident === false,
    JSON.stringify(namedSubject("a bracket for my Bambu spool holder")));
  // A bare measurement must never read as a model number.
  check("a bare measurement is not a product", namedSubject("M3 x 12 standoff") === null,
    JSON.stringify(namedSubject("M3 x 12 standoff")));
  check("an empty request is not a product", namedSubject("") === null);
  check("an essay is not a product name", namedSubject("x".repeat(500)) === null);
}

console.log("\nthe search is a lookup, not a research project\n");
{
  const q = searchQuery("snapmaker u1");
  check("the query names the subject", /snapmaker u1/i.test(q), q);
  check("...and asks for a model rather than a shop", /3D model|STL/i.test(q), q);
  check("the sites searched are places models actually live",
    MODEL_SITES.includes("printables.com") && MODEL_SITES.includes("makerworld.com"),
    MODEL_SITES.join(","));
}

console.log("\nnothing gets downloaded without the warning and a real URL\n");
{
  // The warning has to say all three things, because "it's from the internet"
  // on its own is not informed consent.
  check("the warning says it is not ours", /not made by BREPcode/i.test(DOWNLOAD_WARNING));
  check("...and names the licence as the user's problem", /licence/i.test(DOWNLOAD_WARNING));
  check("...and says to look before printing or selling",
    /print/i.test(DOWNLOAD_WARNING) && /sell/i.test(DOWNLOAD_WARNING));

  check("an https link is allowed",
    safeModelUrl("https://www.printables.com/model/123") === "https://www.printables.com/model/123");
  for (const bad of [
    "javascript:alert(1)", "file:///C:/Windows/System32/drivers/etc/hosts",
    "data:text/html,<script>", "not a url", "", null,
  ]) {
    check(`refused: ${String(bad).slice(0, 34)}`, safeModelUrl(bad) === null);
  }

  check("an .stl is a model file", looksLikeModelFile("https://example.com/part.stl"));
  check("a .3mf is too", looksLikeModelFile("https://example.com/part.3mf?dl=1"));
  for (const bad of [
    "https://example.com/part.zip", "https://example.com/part.gcode",
    "https://example.com/part.exe", "https://example.com/page",
  ]) {
    check(`not fetched: ${bad.split("/").pop()}`, looksLikeModelFile(bad) === false);
  }
  check("there is a size ceiling", MAX_DOWNLOAD_BYTES > 0 && MAX_DOWNLOAD_BYTES <= 200 * 1024 * 1024,
    `${MAX_DOWNLOAD_BYTES}`);
}

console.log("\nonly providers whose servers can search are asked\n");
{
  // A browser cannot fetch a search engine across origins, so this only works
  // where the PROVIDER does the searching. Anywhere else the feature simply
  // does not appear rather than failing in front of the user.
  const claude = priorArtRequest({ provider: "claude", key: "k", model: "m", subject: "snapmaker u1", sites: ["printables.com"] });
  check("claude gets a server-side web search tool",
    JSON.parse(claude.options.body).tools[0].type.startsWith("web_search"),
    JSON.parse(claude.options.body).tools[0].type);
  check("...and the subject is what gets searched",
    /snapmaker u1/i.test(claude.options.body), claude.options.body.slice(0, 90));
  const gem = priorArtRequest({ provider: "gemini", key: "k", model: "m", subject: "x", sites: [] });
  check("gemini gets grounding", "google_search" in JSON.parse(gem.options.body).tools[0]);
  for (const p of ["openai", "local", "browser", "builtin", "claude-code"]) {
    check(`${p} is not asked`, priorArtRequest({ provider: p, key: "k", model: "m", subject: "x" }) === null);
  }
}

console.log("\na malformed answer costs nothing but the feature\n");
{
  const opt = { safeUrl: safeModelUrl };
  const n = (t) => parsePriorArt(t, opt).length;
  check("a clean array parses",
    n('[{"title":"Mini U1","url":"https://www.printables.com/model/1"}]') === 1);
  check("prose around it is tolerated",
    n('Sure!\n[{"title":"A","url":"https://makerworld.com/m/2"}]\nHope that helps.') === 1);
  check("nothing found is nothing shown", n("[]") === 0);
  check("a non-answer yields nothing", n("I could not find anything.") === 0);
  check("a truncated reply yields nothing", n('[{"title":"A","url":"https://x.com/a"') === 0);
  check("rubbish rows are skipped", n('[null, 3, {"title":"ok","url":"https://x.com/ok"}]') === 1);
  check("duplicates collapse",
    n('[{"title":"A","url":"https://x.com/a"},{"title":"again","url":"https://x.com/a"}]') === 1);
  check("it is capped",
    n(JSON.stringify(Array.from({ length: 9 }, (_, i) => ({ title: `t${i}`, url: `https://x.com/${i}` })))) === 4);

  // The safety rule from src/priorart.js has to hold HERE too, where the URLs
  // come from a model's output rather than from us.
  const mixed = parsePriorArt(
    '[{"title":"bad","url":"javascript:alert(1)"},{"title":"good","url":"https://printables.com/b"}]', opt);
  check("a dangerous url never reaches the card", mixed.length === 1 && mixed[0].title === "good",
    JSON.stringify(mixed));
  const one = parsePriorArt('[{"title":"A","url":"https://www.printables.com/model/1"}]', opt)[0];
  check("the site is inferred when the model omits it", one.site === "printables.com", one.site);
  check("an unstated licence says so rather than guessing", one.licence === "unknown", one.licence);
}


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
