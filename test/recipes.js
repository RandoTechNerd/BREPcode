// The recipe library. Two things have to hold or the feature is worse than
// nothing: the right files must fire for a given sentence (a miss means the
// model builds from memory instead of the stated numbers), and the wrong ones
// must NOT (a false hit puts a page of battery lore in front of a request for a
// bookshelf). The hierarchy carries the interesting rule — a child match means
// the parent stops asking its question.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest, serialize, OUT, DIR } from "../scripts/recipes-manifest.mjs";
import { matchRecipes, termMatches, statesDimensions, stripFrontmatter, parseFrontmatter, parseDirectives, COMMANDS } from "../viewer/recipes.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const manifest = buildManifest();
const tags = (text) => matchRecipes(text, manifest).matched.map((r) => r.tag);
const asks = (text) => matchRecipes(text, manifest).questions.map((q) => q.tag);

// ---- the committed manifest must match the files -------------------------
check("committed manifest is not stale",
  readFileSync(OUT, "utf8") === serialize(manifest),
  "run: node scripts/recipes-manifest.mjs");

// ---- the headline case from the design -----------------------------------
// vague -> pull the general knowledge AND ask which cell
check("\"a battery holder\" pulls #holder and #batt",
  ["holder", "batt"].every((t) => tags("I want to build a battery holder").includes(t)),
  tags("I want to build a battery holder").join(","));
check("...and asks which cell", asks("I want to build a battery holder").includes("batt"));

// specific -> the child pins the numbers down, so no question
const aaa = "I want to make a AAA holder that is 3x4x11";
check("\"AAA holder\" pulls ##AAA", tags(aaa).includes("AAA"), tags(aaa).join(","));
check("...and pulls #batt as its parent", tags(aaa).includes("batt"));
check("...and #holder too", tags(aaa).includes("holder"));
check("...and asks NOTHING", asks(aaa).length === 0, asks(aaa).join(","));
check("...with the specific child ordered first", tags(aaa)[0] === "AAA", tags(aaa).join(","));

// the parent is pulled in even though "battery" was never said
check("a child drags its parent in without the parent's own keywords",
  !/batter/i.test(aaa) && tags(aaa).includes("batt"));

// ---- a child silences the question; so does giving dimensions ------------
check("a child alone silences every question — it already has the numbers",
  asks("AAA holder please").length === 0, asks("AAA holder please").join(","));
check("stated dimensions silence the question too",
  asks("a holder for something 20mm across").length === 0);
check("...but a vague request still asks",
  asks("can you make me a holder").includes("holder"));

// ---- the editor counts as context, not just the message -----------------
// "make it narrower" with an import on screen is a question ABOUT an import,
// but the sentence contains no word that says so. Missing #imported here is how
// a model ends up inventing a bounding box and writing cutters that miss.
{
  const code = 'return stretch({ axis: "x", by: -60, at: 0 },\n  importedMesh("black frame PRINT THIS ONE - BLACK .stl", { split: true }));';
  const withCode = matchRecipes("make it narrower", manifest, { code }).matched.map((r) => r.tag);
  const without = matchRecipes("make it narrower", manifest).matched.map((r) => r.tag);
  check("the message alone finds #resize", without.includes("resize"), without.join(","));
  check("...but not #imported, because nothing said so", !without.includes("imported"));
  check("the editor's importedMesh() pulls #imported in", withCode.includes("imported"), withCode.join(","));
  check("...and #resize is still there", withCode.includes("resize"));

  // questions stay a property of the REQUEST — a screenful of code must not
  // decide whether the user was vague
  const vague = matchRecipes("can you make me a holder", manifest, { code: "cube([10,10,10])" });
  check("code does not silence a vague request's question",
    vague.questions.some((q) => q.tag === "holder"), JSON.stringify(vague.questions));

  // and an empty editor must behave exactly as before
  check("empty editor changes nothing",
    matchRecipes("make it narrower", manifest, { code: "" }).matched.length === without.length);
}

// ---- false positives are the expensive failure --------------------------
check("\"aardvark\" does not match #AA", !tags("a model of an aardvark").includes("AA"));
check("\"excellent\" does not match #batt", !tags("that is excellent, thanks").includes("batt"));
check("a plain cube pulls nothing at all", tags("make a 20mm cube").length === 0,
  tags("make a 20mm cube").join(","));
check("\"framework\" does not match #frame", !tags("what framework is this").includes("frame"));
check("\"amount\" does not match #mount", !tags("a large amount of holes").includes("mount"));

// ---- term matching edge cases -------------------------------------------
check("a plural still matches the singular term", termMatches("18650", "two 18650s in series"));
check("...and so does an ordinary word", termMatches("cell", "four cells"));
check("...without matching a longer word", !termMatches("cell", "excellent"));
check("multi-word term matches as a phrase", termMatches("coin cell", "a coin cell holder"));
check("multi-word term tolerates extra spacing", termMatches("coin cell", "a coin  cell"));
check("term does not match across a word boundary", !termMatches("aa", "aaa battery"));
check("matching is case insensitive", termMatches("gopro", "a GoPro mount"));

// ---- dimension detection -------------------------------------------------
check("80x40x3 reads as dimensions", statesDimensions("a plate 80x40x3"));
check("40 x 60 reads as dimensions", statesDimensions("legs 40 x 60"));
check("12mm reads as dimensions", statesDimensions("a 12mm hole"));
check("\"diameter 20\" reads as dimensions", statesDimensions("diameter 20 please"));
check("prose with no numbers does not", !statesDimensions("a nice big holder for my brushes"));

// ---- frontmatter never reaches the model --------------------------------
for (const r of manifest.recipes) {
  const raw = readFileSync(join(DIR, r.file), "utf8");
  const body = stripFrontmatter(raw);
  if (r.tag === "holder") {
    check("frontmatter is stripped from the injected text",
      !body.includes("match:") && !body.startsWith("---"), body.slice(0, 40));
    check("...but the prose survives", body.includes("Cavity"));
  }
  check(`${r.file}: parses and has a body`, body.length > 100, `${body.length} chars`);
  const fm = parseFrontmatter(raw);
  check(`${r.file}: browser and build parse the tag identically`, fm.tag === r.tag);
}

// ---- the point of the exercise: this must be SMALLER than the old harness
const bytes = manifest.recipes.reduce((n, r) => n + stripFrontmatter(readFileSync(join(DIR, r.file), "utf8")).length, 0);
const worst = Math.max(...manifest.recipes.map((r) => stripFrontmatter(readFileSync(join(DIR, r.file), "utf8")).length));
console.log(`\n  library: ${manifest.recipes.length} recipes, ${(bytes / 1024).toFixed(1)}KB total, largest ${(worst / 1024).toFixed(1)}KB`);
check("no single recipe is bigger than 6KB", worst < 6144, `${worst} bytes`);

// ---- #tags and /commands: saying it outright ------------------------------
//
// Keyword matching is a guess, and until now a guess the user could neither see
// nor correct. These let them force a subject in, push one out, or change the
// approach for a single message. The risk that earns most of these checks is
// the opposite failure: eating words the user meant to keep.
console.log("");
{
  const D = (t) => parseDirectives(t, manifest);

  const f = D("make a #cookiecutter for a salmon");
  check("an explicit #tag is picked up", f.force.join() === "cookiecutter", JSON.stringify(f.force));
  check("...and stripped from what the model reads",
    !f.text.includes("#cookiecutter") && f.text.includes("salmon"), JSON.stringify(f.text));
  check("...and it really reaches the matcher",
    matchRecipes("make a salmon shape", manifest, { force: ["cookiecutter"] })
      .matched.some((r) => r.tag === "cookiecutter"));

  const d = D("a battery holder -#batt");
  check("-#tag is a drop, not a force", d.drop.join() === "batt" && !d.force.length);
  check("...and the matcher honours it",
    !matchRecipes("a battery holder", manifest, { drop: ["batt"] })
      .matched.some((r) => r.tag === "batt"));
  // Dropping a parent must take its children too — cell dimensions with none of
  // the rules that make sense of them is worse than neither.
  const kids = matchRecipes("a AAA holder", manifest, { drop: ["batt"] }).matched.map((r) => r.tag);
  check("dropping a parent drops its children as well",
    !kids.includes("AAA") && !kids.includes("batt"), kids.join(","));
  // ...and forcing a CHILD still pulls the parent in, as a keyword match would.
  const forcedKid = matchRecipes("something", manifest, { force: ["AAA"] }).matched.map((r) => r.tag);
  check("forcing a child still brings its parent", forcedKid.includes("batt"), forcedKid.join(","));
  check("a drop beats a force in the same message",
    !matchRecipes("x", manifest, { force: ["batt"], drop: ["batt"] })
      .matched.some((r) => r.tag === "batt"));

  check("/simple sets the approach", D("a bowl /simple").approach === "iterative");
  check("/complex sets the other one", D("a bowl /complex").approach === "oneshot");
  check("/scad sets the language", D("a bowl /scad").language === "openscad");
  check("/py means build123d", D("/py a bowl").language === "build123d");
  check("commands are stripped too", D("a bowl /simple").text === "a bowl");
  check("several directives in one message all apply", (() => {
    const r = D("#cookiecutter a star /scad /simple");
    return r.force.join() === "cookiecutter" && r.language === "openscad" && r.approach === "iterative";
  })());
  check("every COMMANDS entry parses to what it claims",
    Object.entries(COMMANDS).every(([k, v]) => {
      const r = D(`x /${k}`);
      return (!v.approach || r.approach === v.approach) && (!v.language || r.language === v.language);
    }));

  // The thing that must NOT happen: eating the user's actual words.
  check("a #2 pencil keeps its #2", D("a holder for a #2 pencil").text.includes("#2"));
  check("...and is reported in case it was a typo",
    D("a holder for a #2 pencil").unknown.join() === "#2");
  check("an unknown /command is reported, not silently dropped",
    D("a bowl /purple").unknown.join() === "/purple");
  check("...and left in the text rather than eaten",
    D("a bowl /purple").text.includes("/purple"));
  check("a fraction is not a command", D("cut it 1/2 inch deep").text === "cut it 1/2 inch deep");
  check("a URL survives intact",
    D("like https://x.com/simple/thing").text.includes("https://x.com/simple/thing"));
  check("a bare # is not a directive", D("size # 4").text === "size # 4");
  check("nothing typed means nothing steered", D("just make a cube").any === false);
  check("...and the text comes back unchanged", D("just make a cube").text === "just make a cube");
  check("a tag mid-word is left alone", D("email me at a#batt.com").force.length === 0);
  check("#COOKIECUTTER works too", D("#COOKIECUTTER").force.join() === "cookiecutter");
  check("duplicates collapse", D("#batt #batt").force.length === 1);
  check("a directive-only message still leaves usable text", D("#cookiecutter").text === "");
}

// ---- and the app actually uses all of it ----------------------------------
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  for (const id of ["chat-complete", "chat-input"]) {
    check(`#${id} exists`, HTML.includes(`id="${id}"`));
  }
  check("directives are parsed before the message is sent",
    /parseDirectives\(raw,/.test(HTML));
  check("the bubble shows what was TYPED, not the stripped version",
    /addMsg\("user", raw\)/.test(HTML));
  check("...but the model gets the cleaned text",
    /dir\?\.any && dir\.text \? dir\.text : raw/.test(HTML));
  check("force and drop reach the reference lookup",
    /force: dir\?\.force \|\| \[\], drop: dir\?\.drop \|\| \[\]/.test(HTML));
  check("the per-message override reaches the real API path",
    (HTML.match(/composeOverride\(\{ approach: dir\?\.approach/g) || []).length >= 2);
  // The list must come from the shipped manifest. A hand-written copy is how a
  // menu ends up offering tags that no longer do anything.
  check("the tag list is read from the manifest, not typed into the page",
    /loadManifest\(\)[\s\S]{0,200}r\.tag\.toLowerCase\(\)\.startsWith/.test(HTML));
  check("...and the command list from COMMANDS",
    /R\.COMMANDS/.test(HTML));
  // Enter must not send a half-typed tag.
  check("the open list owns Enter", /if \(ccItems\.length\)[\s\S]{0,600}acceptChatComplete\(ccIndex\)/.test(HTML));
  check("...and Escape closes it", /e\.key === "Escape"[\s\S]{0,80}closeChatComplete/.test(HTML));

  // The lessons gap this work uncovered: the ordinary API path never got them.
  check("lessons are computed once, not per provider branch",
    (HTML.match(/await lessonsFor\(text\)/g) || []).length === 1,
    `${(HTML.match(/await lessonsFor\(text\)/g) || []).length} call sites`);
  check("...and reach the browser API request",
    /stream: wantStream, reference, \.\.\.harnessOpts\(\),[\s\S]{0,120}lessons,/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
