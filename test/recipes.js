// The recipe library. Two things have to hold or the feature is worse than
// nothing: the right files must fire for a given sentence (a miss means the
// model builds from memory instead of the stated numbers), and the wrong ones
// must NOT (a false hit puts a page of battery lore in front of a request for a
// bookshelf). The hierarchy carries the interesting rule — a child match means
// the parent stops asking its question.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildManifest, serialize, OUT, DIR } from "../scripts/recipes-manifest.mjs";
import { matchRecipes, termMatches, statesDimensions, stripFrontmatter, parseFrontmatter } from "../viewer/recipes.js";

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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
