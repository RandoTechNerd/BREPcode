// Making the FIRST build as good as the last one.
//
// The pattern this exists for: attempt 1 fails, the error goes back to the
// model, attempt 2 or 3 works, and the model that finally lands is better than
// the one that was asked for — better ports, better text, better structure. All
// of that knowledge is thrown away the moment the tab closes, and the next
// request starts from the same first-attempt mistakes.
//
// Two mechanisms, both deterministic and both derived only from what actually
// happened on THIS machine:
//
//   HOUSE RULES  — errors that keep failing attempt 1 here get promoted into a
//                  short list of preventive rules at the top of the prompt.
//                  Counted, so the rules are the ones this user's work actually
//                  trips over rather than a generic lecture.
//
//   WORKED EXAMPLES — the closest previous SUCCESSFUL build, included as an
//                  example. This is the one that moves the first attempt most:
//                  a model that has seen "here is what a finished one of these
//                  looks like, from your own history" starts where the last
//                  session finished instead of where it started.
//
// Deliberately NOT a diff-learner. Deriving "the fix" from the difference
// between a broken and a working model is guesswork, and a wrong lesson is
// worse than no lesson — it would be injected into every future prompt.

// Errors carry specifics (a name, a number, a position) that make every
// occurrence look unique. Strip those and the same underlying mistake collapses
// to one signature that can be counted.
export function errorSignature(message) {
  let s = String(message || "").trim();
  if (!s) return "";
  s = s
    .replace(/^(Error|TypeError|ReferenceError|SyntaxError):\s*/i, "")
    .replace(/["'`][^"'`]*["'`]/g, "X")          // quoted names
    .replace(/\bline \d+|\(\d+:\d+\)|:\d+:\d+/gi, "")
    .replace(/\b\d+(\.\d+)?\s?mm\b/gi, "N")
    .replace(/\b\d+(\.\d+)?\b/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  // "foo is not defined" and "bar is not defined" are one lesson, not two.
  s = s.replace(/^[a-z_$][\w$]* is not defined$/, "x is not defined");
  return s.slice(0, 120);
}

// Recognised first-attempt failures and the rule that prevents each one. The
// text is what gets injected, so it is written as an instruction rather than a
// description of the bug.
const CATALOGUE = [
  [/is not defined/, "Every word you use must be in the vocabulary above. If you need something that is not there, build it from the shapes that are — never invent a verb."],
  [/is not a function/, "Check the call shape against the vocabulary: most BREPcode verbs take (options, shape) or (shape, ...), not a bare value."],
  [/last line must be|no shape|produced no solids|returned nothing/, "End with `return <shape>;`. A bare final expression evaluates and is discarded, and the user sees nothing."],
  [/not manifold|non-manifold/, "Never let a cutter's face land exactly on a solid's face. Start it 1mm inside and run it 1mm past, using a named EPS."],
  [/unexpected|unfinished|syntax/, "Close every bracket and finish the code block. A truncated model is a failed reply."],
  [/undeclared|not declared|cannot access/, "Declare every size as a named const at the top before it is used."],
  [/too many|refused|past the/, "Keep the primitive count down: fewer, larger shapes and a lower $fn on anything that is not the point of the model."],
  [/redeclare|already been declared/, "Never name a variable after a BREPcode word — pick labelText, finSpacing, body, plate, cutter."],
];

const ruleFor = (sig) => (CATALOGUE.find(([re]) => re.test(sig)) || [])[1] || null;

// ---------------------------------------------------------------- the store
//
// Plain JSON so it can sit in a file, in localStorage, or nowhere at all.
export const emptyStore = () => ({ version: 1, builds: [], fails: {} });

// One finished request: what was asked, what happened on the FIRST attempt, and
// the code that ended up working.
export function recordBuild(store, { prompt, ok, error, attempts = 1, code } = {}) {
  const s = store && store.version ? store : emptyStore();
  const text = String(prompt || "").trim();
  if (!text) return s;

  // Only the FIRST attempt teaches anything about first attempts.
  if (!ok || attempts > 1) {
    const sig = errorSignature(error);
    if (sig) s.fails[sig] = (s.fails[sig] || 0) + 1;
  }
  // A build that eventually worked is worth keeping as an example, whether or
  // not it took a few goes to get there.
  if (code && String(code).trim()) {
    s.builds.push({
      prompt: text.slice(0, 300),
      code: String(code).trim(),
      attempts,
      at: s.builds.length,          // order only; no clock, so this stays pure
    });
    if (s.builds.length > 60) s.builds.shift();
  }
  return s;
}

// The rules worth carrying, commonest first. A failure seen once is noise; the
// threshold is what stops a one-off typo becoming permanent advice.
export function houseRules(store, { max = 4, min = 2 } = {}) {
  const s = store || emptyStore();
  return Object.entries(s.fails || {})
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([sig, n]) => ({ sig, count: n, rule: ruleFor(sig) }))
    .filter((r) => r.rule)
    .slice(0, max);
}

const STOP = new Set(["make", "me", "a", "an", "the", "with", "for", "and", "of", "to",
  "in", "on", "that", "this", "it", "my", "please", "can", "you", "build", "model",
  "create", "print", "printed", "some", "is", "are", "i", "want", "need"]);

// Two characters, not three. "pi", "u1", "sd" and "pc" are among the most
// meaningful words a request can contain, and a three-character floor threw all
// of them away — "a raspberry pi case with usb" then scored below the match
// threshold against "a pi case with usb ports", which is the same object.
const words = (t) => String(t || "").toLowerCase().match(/[a-z][a-z0-9-]+/g) || [];
const meaningful = (t) => [...new Set(words(t))].filter((w) => !STOP.has(w));

// How alike two requests are: shared meaningful words over the smaller set.
// Crude on purpose — it only has to beat "no example at all".
export function similarity(a, b) {
  const A = meaningful(a), B = new Set(meaningful(b));
  if (!A.length || !B.size) return 0;
  const shared = A.filter((w) => B.has(w)).length;
  return shared / Math.min(A.length, B.size);
}

// The closest things this machine has successfully built before.
export function nearestExamples(store, prompt, { max = 1, floor = 0.34 } = {}) {
  const s = store || emptyStore();
  return (s.builds || [])
    .map((b) => ({ ...b, score: similarity(prompt, b.prompt) }))
    .filter((b) => b.score >= floor)
    .sort((a, b) => b.score - a.score || b.at - a.at)
    .slice(0, max);
}

// Past this the example is costing more than the advice is worth.
const MAX_EXAMPLE_CHARS = 2600;

// The block that gets appended to the system prompt. Empty string when there is
// nothing worth saying, so a fresh install is exactly as it is today.
export function lessonBlock(store, prompt, opts = {}) {
  const rules = houseRules(store, opts);
  const examples = nearestExamples(store, prompt, opts)
    .filter((e) => e.code.length <= MAX_EXAMPLE_CHARS);
  if (!rules.length && !examples.length) return "";

  let out = "\n\nFROM THIS MACHINE'S OWN HISTORY\n";
  if (rules.length) {
    out += "\nFirst attempts here keep failing in these specific ways. Get them"
      + " right in the FIRST reply, not after a retry:\n";
    for (const r of rules) out += `- ${r.rule}\n`;
  }
  if (examples.length) {
    out += "\nA model this user asked for before, and the code that ended up"
      + " working. Match its structure and its level of finish — this is the"
      + " standard to start at, not to work up to:\n";
    for (const e of examples) {
      out += `\nAsked for: ${e.prompt}\n\`\`\`\n${e.code}\n\`\`\`\n`;
    }
  }
  return out;
}
