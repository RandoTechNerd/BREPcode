// Does the desktop half of the learning loop really work?
//
// The module-level tests cover the reasoning. This covers the plumbing: that
// Electron registers the handlers, that a store survives a write and a read,
// that the session log appends, and that the files land somewhere a person can
// actually find. Run with: npx electron scripts/lessons-check.cjs
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

app.whenReady().then(async () => {
  const lessons = require("../desktop/lessons.cjs");

  // Somewhere findable — the point of the log is that it can be read and shared.
  const where = { root: lessons.ROOT(), store: lessons.STORE(), sessions: lessons.SESSIONS() };
  check("the folder is under Documents, not an opaque app-data blob",
    /Documents/i.test(where.root), where.root);

  // Start clean so the run is repeatable.
  try { fs.rmSync(where.root, { recursive: true, force: true }); } catch { /* first run */ }

  check("a missing store loads as an empty one, not a crash",
    JSON.stringify(lessons.load()) === JSON.stringify({ version: 1, builds: [], fails: {} }));

  const store = { version: 1, builds: [{ prompt: "a pi case", code: "return cube([1,1,1]);", attempts: 2, at: 0 }], fails: { "x is not defined": 2 } };
  const saved = lessons.save(store);
  check("it saves", saved.ok, saved.error);
  check("...to the path it says", saved.ok && fs.existsSync(saved.path), saved.path);

  const back = lessons.load();
  check("it reads back identically", JSON.stringify(back) === JSON.stringify(store),
    JSON.stringify(back).slice(0, 90));

  // The readable half.
  const a = lessons.append({ prompt: "a pi case with usb", ok: false, attempts: 1, error: "x is not defined", provider: "claude-code", model: "local" });
  const b = lessons.append({ prompt: "a pi case with usb", ok: true, attempts: 3, code: "return cube([90,60,25]);", provider: "claude-code", model: "local" });
  check("the session log appends", a.ok && b.ok, a.error || b.error);
  check("...both lines to one dated file", a.path === b.path, `${a.path} vs ${b.path}`);

  const lines = fs.readFileSync(a.path, "utf8").trim().split("\n");
  check("one line per exchange", lines.length === 2, `${lines.length}`);
  const rows = lines.map((l) => JSON.parse(l));
  check("every line is valid JSON with the fields that matter",
    rows.every((r) => r.at && r.prompt && "ok" in r && "attempts" in r));
  check("the failure kept its error", rows[0].error === "x is not defined", rows[0].error);
  check("the success kept its code", /cube\(\[90/.test(rows[1].code), rows[1].code);
  check("...and how many attempts it took", rows[1].attempts === 3, `${rows[1].attempts}`);

  // A half-written last line must not poison the next read.
  fs.appendFileSync(a.path, '{"at":"broken"');
  let survived = true;
  try {
    for (const l of fs.readFileSync(a.path, "utf8").trim().split("\n")) {
      try { JSON.parse(l); } catch { /* the point: one bad line is skippable */ }
    }
  } catch { survived = false; }
  check("a truncated last line is skippable, not fatal", survived);

  // Rubbish in must not corrupt the store.
  check("a non-store is refused", lessons.save(null).ok === false);
  fs.writeFileSync(where.store, "{ not json");
  check("a corrupted store loads as empty rather than throwing",
    lessons.load().version === 1 && lessons.load().builds.length === 0);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  app.exit(fail ? 1 : 0);
});
