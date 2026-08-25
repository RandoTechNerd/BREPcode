// "Here is a photo of a screwdriver next to a ruler — make a Gridfinity box
// that fits it."
//
// That request needs four things the app had separately and never joined up:
// read a real size off a photo, know that a POCKET wants the outline (unlike a
// logo, which wants primitives), know that tracing is the user's job, and ask
// which way up before building — because flat and upright are different
// objects, not different numbers.
//
// All of it lives in recipes, matched on demand. So the tests are: does the
// sentence pull them in, does an unrelated sentence pull NOTHING, and did the
// always-on prompt stay out of it.

import { readFileSync } from "node:fs";
import { matchRecipes, termMatches } from "../viewer/recipes.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const manifest = JSON.parse(readFileSync("viewer/recipes/manifest.json", "utf8"));
const tagsFor = (text) => matchRecipes(text, manifest).matched.map((r) => r.tag);
const asksFor = (text) => matchRecipes(text, manifest).questions.map((q) => q.ask).join(" | ");
const body = (f) => readFileSync(`viewer/recipes/${f}`, "utf8");

console.log("\nthe request that started this\n");
{
  const q = "here is a picture of a screwdriver next to a ruler, "
    + "make a gridfinity box that fits it";
  const tags = tagsFor(q);
  check("it pulls in how to MEASURE from a photo", tags.includes("measuring"), tags.join(", "));
  check("...how to build a holder for a real tool", tags.includes("toolholder"), tags.join(", "));
  check("...and the Gridfinity geometry", tags.includes("gridfinity"), tags.join(", "));
  check("it asks which way up BEFORE building",
    /FLAT .*or STAND UPRIGHT/.test(asksFor(q)), asksFor(q).slice(0, 90));
}

console.log("\nother ways of asking the same thing\n");
{
  for (const [q, want] of [
    ["make a gridfinity holder for these pliers", "toolholder"],
    ["a tray for my allen keys", "toolholder"],
    ["shadow board for my wrenches", "toolholder"],
    ["a pocket for this chisel", "toolholder"],
    ["photo of a part, life size please", "measuring"],
    ["how big is this, there is a coin next to it for scale", "measuring"],
    ["I measured it with calipers: 18.4 across", "measuring"],
  ]) {
    check(`"${q}" -> ${want}`, tagsFor(q).includes(want), tagsFor(q).join(", ") || "(none)");
  }
}

console.log("\nand the whole point: it costs NOTHING otherwise\n");
{
  // The reason this is recipes and not prompt. A plain request must not carry
  // a word of it.
  for (const q of ["make me a cube 20mm", "a 40mm gear with 20 teeth",
    "a box with a lid", "round the edges 2mm"]) {
    const tags = tagsFor(q);
    const carried = tags.filter((t) => t === "toolholder" || t === "measuring");
    check(`"${q}" carries none of it`, carried.length === 0, tags.join(", "));
  }
  // A Gridfinity request that is NOT about a tool must not drag them in either.
  const plain = tagsFor("a gridfinity bin 2x3");
  check("a plain gridfinity bin stays plain",
    !plain.includes("toolholder") && !plain.includes("measuring"), plain.join(", "));
}

console.log("\nthe always-on prompt did not grow to pay for it\n");
{
  // A ceiling, not a measurement: the whole design here is that new knowledge
  // goes in recipes. If either of these fails, something was put in the prompt
  // that belonged in a file — check before raising it.
  //
  // TWO numbers now, because context-gating changed what the old single number
  // meant. Six situational sections only ship when the request calls for them
  // (see AUTO_SECTIONS), so DEFAULT_HARNESS.length is the sum of everything
  // the app COULD say, while the thing that costs every message is the
  // always-on core. Measuring only the total would let the core rot unnoticed
  // behind a shrinking gated pile — and would also punish adding a gated
  // section that most requests never see.
  const { DEFAULT_HARNESS, composeSystemParts } = await import("../viewer/chatbot.js");

  // What an ordinary "make me a bracket" actually pays for.
  const core = composeSystemParts({ context: { text: "a 30mm bracket" } }).stable.length;
  check("the always-on core is still under its ceiling",
    core < 21500, `${core} chars`);

  // And the whole library, so the gated sections cannot grow without bound.
  check("...and the whole harness under its own",
    DEFAULT_HARNESS.length < 36000, `${DEFAULT_HARNESS.length} chars`);

  // The saving is the point of the split: if these ever converge, gating has
  // silently stopped working and every message is paying full price again.
  check("gating still saves a third of the prompt",
    core < DEFAULT_HARNESS.length * 0.7,
    `core ${core} vs total ${DEFAULT_HARNESS.length}`);
  // The one thing that HAD to go in the prompt: #fromimage says "never trace
  // the outline", which is right for a logo and wrong for a pocket. That
  // correction has to travel with the rule it corrects.
  check("...but the outline exception is stated where the rule is",
    /EXCEPTION IS A POCKET FOR A REAL OBJECT/.test(DEFAULT_HARNESS));
  check("...and it points at the recipes rather than repeating them",
    /#measuring/.test(DEFAULT_HARNESS) && /#toolholder/.test(DEFAULT_HARNESS));
}

console.log("\nwhat the recipes actually have to say\n");
{
  const m = body("measuring.md"), t = body("toolholder.md");

  // Scale. Without a reference object the answer is a guess, and a guessed
  // pocket is a reprint.
  check("measuring insists on a reference object", /find the reference/i.test(m));
  check("...refuses to invent a scale when there is none", /do not invent a scale/i.test(m));
  check("...warns the third dimension is not in the picture", /third dimension/i.test(m));
  check("...gives an honest accuracy, not a promise", /±1 ?mm|1 ?mm is realistic/i.test(m));

  // Tracing is the USER's action. The model cannot call it, and a model that
  // does not know that will quietly approximate instead of saying so.
  check("measuring says tracing is the USER's action",
    /Trace button/.test(m) && /user has to do it/i.test(m));
  check("...and gives the words to ask with", />\s*Trace the photo/.test(m));

  // Flat vs upright. Getting this wrong is the whole part again.
  check("toolholder asks which way up even when given sizes",
    /even if you were given sizes/i.test(t));
  check("flat: the pocket is HALF sunk, or it cannot be gripped",
    /half/i.test(t) && /nothing to grip/i.test(t));
  check("flat: a finger scoop, the omission that makes it useless",
    /finger scoop/i.test(t) && /most common omission/i.test(t));
  check("upright: enough depth that it cannot lever out",
    /third of the tool's length/i.test(t));
  check("upright: the hole is the WIDEST section, not the shaft",
    /widest/i.test(t) && /not the shaft/i.test(t));
  check("clearance is a grab fit, not a press fit",
    /0\.6.*1\.0 ?mm/.test(t) && /not a press fit/i.test(t));
  check("it tells the user to test-print the cutout alone",
    /10 ?mm slab/i.test(t) && /four minutes/i.test(t));
  check("...and to cross-read the measuring recipe", /#measuring/.test(t));
}

console.log("\nthe recipes are registered, and small\n");
{
  const entries = manifest.recipes || [];
  for (const tag of ["measuring", "toolholder"]) {
    const r = entries.find((e) => e.tag === tag);
    check(`${tag} is in the generated manifest`, !!r);
    const file = readFileSync(`viewer/recipes/${r.file}`, "utf8");
    check(`...and fits the budget`, Buffer.byteLength(file) < 6144,
      `${Buffer.byteLength(file)} bytes`);
  }
  const th = entries.find((e) => e.tag === "toolholder");
  check("toolholder carries the orientation question itself", !!th.ask && /FLAT/.test(th.ask));
  check("...and has no parent, which would silence that question",
    !th.parent, `parent: ${th.parent}`);
  // termMatches is the whole matcher; a term that cannot fire is dead weight.
  const dead = (entries.find((e) => e.tag === "toolholder").match || [])
    .filter((term) => !termMatches(term, `I need a ${term} please`));
  check("every toolholder keyword can actually fire", dead.length === 0, dead.join(", "));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
