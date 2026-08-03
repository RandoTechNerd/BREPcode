// The publish permissions. These are read months after they were written, by
// a page in a different codebase, so the thing worth proving is that a stored
// value from any era normalises to something sane — and that the sentence the
// publisher reads matches what the page will actually offer.

import {
  VISITOR_DEFAULTS, VISITOR_KEYS, normalizeVisitor, isPreviewOnly, visitorSummary,
} from "../src/visitor.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
const all = (v) => Object.fromEntries(VISITOR_KEYS.map((k) => [k, v]));

console.log("\nanything can be stored; only booleans get through\n");
{
  check("a full set survives untouched",
    JSON.stringify(normalizeVisitor(all(true))) === JSON.stringify(all(true)));
  check("...and so does the all-off set",
    JSON.stringify(normalizeVisitor(all(false))) === JSON.stringify(all(false)));
  // A model published before these options existed has no visitor field at
  // all. It must keep behaving as it did, which is the defaults — absent is
  // "not specified", never "forbidden".
  for (const missing of [null, undefined, {}, "nonsense", 42, []]) {
    check(`${JSON.stringify(missing) ?? "undefined"} falls back to the defaults`,
      JSON.stringify(normalizeVisitor(missing)) === JSON.stringify(VISITOR_DEFAULTS));
  }
  check("a truthy non-boolean is NOT taken as yes",
    normalizeVisitor({ svg: "yes" }).svg === VISITOR_DEFAULTS.svg);
  check("...nor a 1", normalizeVisitor({ svg: 1 }).svg === VISITOR_DEFAULTS.svg);
  check("a key we do not know is dropped rather than carried",
    !("wat" in normalizeVisitor({ wat: true })));
  check("one explicit false is kept while the rest default",
    normalizeVisitor({ model: false }).model === false
      && normalizeVisitor({ model: false }).orbit === VISITOR_DEFAULTS.orbit);
}

console.log("\npreview-only means every box clear, and nothing else does\n");
{
  check("all off is preview only", isPreviewOnly(all(false)));
  check("the defaults are not", !isPreviewOnly(VISITOR_DEFAULTS));
  check("a null is not — it is the defaults", !isPreviewOnly(null));
  check("an empty object is not either", !isPreviewOnly({}));
  for (const k of VISITOR_KEYS) {
    check(`${k} alone is enough to not be preview only`,
      !isPreviewOnly({ ...all(false), [k]: true }));
  }
}

console.log("\nthe sentence says what the page will do\n");
{
  check("preview only says so plainly",
    visitorSummary(all(false)) === "Preview only — visitors get the still thumbnail and nothing else.");
  check("one thing reads as one thing",
    visitorSummary({ ...all(false), orbit: true }) === "Visitors can spin it.");
  check("two are joined with 'and', no comma",
    visitorSummary({ ...all(false), orbit: true, model: true })
      === "Visitors can spin it and download the model.");
  check("three get commas and a final 'and'",
    visitorSummary({ ...all(false), orbit: true, model: true, edit: true })
      === "Visitors can spin it, download the model and open it in BREPcode.");
  check("everything on lists everything",
    visitorSummary(all(true))
      === "Visitors can spin it, download the model, download the drawing, "
        + "take a standalone page and open it in BREPcode.");
  // The summary is what the publisher is shown before they commit, so it must
  // never claim less than the page will offer.
  check("a stored null summarises as the defaults, not as preview only",
    visitorSummary(null) === visitorSummary(VISITOR_DEFAULTS));
  check("...and that is not the preview-only sentence",
    !visitorSummary(null).startsWith("Preview only"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
