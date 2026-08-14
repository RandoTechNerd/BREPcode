// A log file, written where you point it.
//
// The app wrote nothing for its whole life, which was fine until a model
// failed to import three different ways in one afternoon and the only record
// of it was memory. "Check the logs" had no answer.
//
// Two properties matter more than the format:
//
//   IT CANNOT BREAK A BUILD. Every call is fire-and-forget and swallows its
//   own failures. A logger that can take the app down is worse than none.
//
//   IT IS OFF, AND HIDDEN, UNTIL ASKED FOR. The log carries model SOURCE —
//   that is most of what makes it worth reading — so it sits behind the same
//   lock as the private stash, not in the open.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

// localStorage is the only browser API the pure parts touch.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const lb = await import("../viewer/logbook.js");

console.log("\nit stays quiet until it is switched on\n");
{
  check("a fresh session is off", lb.enabled() === false);
  lb.log("build", "ok", { ms: 10 });
  check("...and records nothing while off", lb.pending() === 0, String(lb.pending()));
  lb.setEnabled(true);
  lb.log("build", "ok", { ms: 10 });
  check("switched on, it records", lb.pending() === 1, String(lb.pending()));
  check("the switch is remembered across a reload", lb.wasEnabled() === true);
  lb.setEnabled(false);
  check("...and so is being switched off", lb.wasEnabled() === false);
  check("turning it off drops what was buffered", lb.pending() === 0,
    "leaving it in memory would leak the source of a model you stopped logging");
}

console.log("\none line per event, scannable by eye and by tool\n");
{
  lb.setEnabled(true);
  lb.drain();
  lb.log("build", "failed", { error: "Not manifold", ms: 812 });
  const line = lb.drain().trim();
  const cols = line.split("\t");
  check("timestamp, kind, message, detail — tab separated", cols.length === 4, String(cols.length));
  check("...with a sortable timestamp first",
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(cols[0]), cols[0]);
  check("...the kind second", cols[1] === "build", cols[1]);
  check("...and the detail as JSON last", JSON.parse(cols[3]).error === "Not manifold", cols[3]);
  lb.log("plain", "no detail at all");
  check("an event with no detail is still one clean line",
    lb.drain().trim().split("\t").length === 3);
}

console.log("\nit cannot take the app down with it\n");
{
  lb.setEnabled(true);
  lb.drain();
  const circular = {}; circular.self = circular;
  lb.log("weird", "circular detail", circular);
  check("detail that will not serialise is noted, not thrown",
    /could not be serialised/.test(lb.drain()), "JSON.stringify throws on a cycle");
  // Nothing is granted in Node, so this is the no-folder path: it must buffer
  // rather than fail, and must not grow without bound.
  lb.setEnabled(true);
  for (let i = 0; i < 900; i++) lb.log("spam", `line ${i}`);
  check("with no folder it buffers instead of failing", lb.pending() > 0);
  check("...and is capped, so a long session cannot eat memory",
    lb.pending() <= 500, String(lb.pending()));
  check("it counts what was lost before a folder existed", lb.lostBeforeFolder() > 0);
}

console.log("\nthe browser side is declared honestly\n");
{
  check("support is feature-detected, not assumed", lb.supported() === false,
    "no showDirectoryPicker in node — it must say so rather than throw");
  let threw = null;
  try { await lb.chooseFolder(); } catch (e) { threw = String(e.message); }
  check("...and choosing a folder without support explains why",
    /Chrome or Edge/.test(threw || ""), threw);
  check("restoring with nothing stored is a null, not a crash",
    (await lb.restore().catch(() => "threw")) === null);
}

console.log("\nit is wired in behind the lock, and costs nothing otherwise\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  const gated = HTML.slice(HTML.indexOf('<div id="secret-lib"'), HTML.indexOf('<div id="theme-row"'));
  check("the controls live inside the unlocked-only block",
    /id="log-on"/.test(gated) && /id="log-folder"/.test(gated) && /id="log-save"/.test(gated));
  check("...and the panel says the log carries the model source",
    /records the model\s*source/.test(gated),
    "someone switching this on should know what goes in the file");
  check("the module is only fetched once someone asks",
    /const getLogbook = \(\) => \(_logbook \|\|= import\("\.\/logbook\.js"\)\)/.test(HTML));
  check("...so logEvent does nothing at all until then",
    /function logEvent\([\s\S]{0,120}if \(!_logbook\) return;/.test(HTML),
    "an ordinary session must not pay for a feature it never turns on");
  check("every log call swallows its own failure",
    /_logbook\.then\(\(lb\) => \{ try \{ lb\.log\(kind, message, detail\); \} catch/.test(HTML));
  check("it wakes only when the gate is unlocked",
    (HTML.match(/wakeLogbook\(\)/g) || []).length >= 3);
  check("what is buffered is flushed on the way out",
    /beforeunload[\s\S]{0,120}lb\.flush\(\)/.test(HTML));

  // The events that make it worth reading at all.
  check("a successful build is recorded", /logEvent\("build", "ok"/.test(HTML));
  check("...and a failed one, with the source that failed",
    /logEvent\("build", "failed"[\s\S]{0,200}source: code\.value\.slice/.test(HTML));
  check("...and every import, with whether it had to be repaired",
    /logEvent\("import", file\.name[\s\S]{0,140}repaired: !!repairNote/.test(HTML));
  check("the module ships in the site build",
    /"logbook\.js"/.test(readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8")));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
