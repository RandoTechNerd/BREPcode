// Where the desktop app keeps what it has learned.
//
// The loop this closes: a first attempt fails, the error goes back to the model,
// attempt two or three works — and all of that is thrown away when the window
// closes. Next session starts from the same first-attempt mistakes. Here the
// outcome of every chat build is written down, so the next prompt can carry the
// rules this machine keeps tripping over and the closest thing it has already
// built successfully.
//
// DESKTOP ONLY, deliberately. The website has no disk to write to and no reason
// to accumulate one person's history in a browser store.
//
// Two files, because they have two audiences:
//
//   lessons.json  — the machine-readable store the prompt is built from.
//   sessions/*.jsonl — one line per exchange, append-only, human and
//                      AI readable. This is the one you hand to Claude and say
//                      "look at where the first attempt keeps going wrong".
//
// In DOCUMENTS, not app-data: the whole point is that the log can be found,
// read, and shared. An opaque blob under AppData would be useless for that.

const { app, ipcMain, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = () => path.join(app.getPath("documents"), "BREPcode", "learning");
const STORE = () => path.join(ROOT(), "lessons.json");
const SESSIONS = () => path.join(ROOT(), "sessions");

function ensure() {
  fs.mkdirSync(SESSIONS(), { recursive: true });
  return ROOT();
}

function load() {
  try {
    const raw = fs.readFileSync(STORE(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version) return parsed;
  } catch { /* first run, or a file someone edited into nonsense */ }
  return { version: 1, builds: [], fails: {} };
}

function save(store) {
  if (!store || typeof store !== "object") return { ok: false, error: "not a store" };
  try {
    ensure();
    // Write beside and rename: a crash mid-write must not leave a truncated
    // store that then fails to parse and silently loses every lesson.
    const tmp = `${STORE()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 1), "utf8");
    fs.renameSync(tmp, STORE());
    return { ok: true, path: STORE() };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

// One line per exchange. JSONL because it appends without rewriting, survives a
// half-written last line, and reads fine in any editor.
function append(entry) {
  try {
    ensure();
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(SESSIONS(), `${day}.jsonl`);
    const row = {
      at: new Date().toISOString(),
      prompt: String(entry?.prompt || "").slice(0, 2000),
      ok: !!entry?.ok,
      attempts: Number(entry?.attempts) || 1,
      error: String(entry?.error || "").slice(0, 600),
      provider: String(entry?.provider || "").slice(0, 40),
      model: String(entry?.model || "").slice(0, 80),
      code: String(entry?.code || "").slice(0, 20000),
    };
    fs.appendFileSync(file, `${JSON.stringify(row)}\n`, "utf8");
    return { ok: true, path: file };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function register() {
  ipcMain.handle("lessons:load", () => load());
  ipcMain.handle("lessons:save", (_e, store) => save(store));
  ipcMain.handle("lessons:append", (_e, entry) => append(entry));
  ipcMain.handle("lessons:where", () => ({ root: ROOT(), store: STORE(), sessions: SESSIONS() }));
  ipcMain.handle("lessons:reveal", () => {
    ensure();
    shell.openPath(ROOT());
    return { ok: true, path: ROOT() };
  });
  // Wipe: the history is a record of this person's work and they get to end it.
  ipcMain.handle("lessons:forget", () => {
    try {
      fs.rmSync(ROOT(), { recursive: true, force: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  });
}

module.exports = { register, load, save, append, ROOT, STORE, SESSIONS };
