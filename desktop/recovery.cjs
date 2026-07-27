// Crash recovery for the desktop app.
//
// BREPcode never saved your work. Everything else was persisted — theme,
// material, grid, model name, AI settings — but the code itself lived only in
// a textarea, so a crash, a stray Ctrl+W or a power cut took it with no trace.
// The .bcode export fixed "I want to keep this"; this fixes "I did not get the
// chance to".
//
// Snapshots go in the OS temp directory ON PURPOSE. The user asked to be able
// to go and FIND the lost file, and temp is somewhere they can actually reach
// and clear out — unlike an opaque app-data blob. Losing them to a temp sweep
// is the correct outcome too: a recovery snapshot is a safety net, not a
// document, and the moment the user saves a real .bcode it stops mattering.

const { app, ipcMain } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DIR = path.join(os.tmpdir(), "BREPcode-recovery");
// Enough to cover "I was working all afternoon" without turning temp into an
// archive. Snapshots are deduped, so this is 20 genuinely different states.
const KEEP = 20;

function dir() {
  fs.mkdirSync(DIR, { recursive: true });
  return DIR;
}

// Newest first — the list a user scans is "what was I just doing".
function list() {
  let names = [];
  try { names = fs.readdirSync(dir()).filter((n) => n.endsWith(".bcode")); }
  catch { return []; }
  const out = [];
  for (const name of names) {
    try {
      const full = path.join(DIR, name);
      const st = fs.statSync(full);
      out.push({ name, path: full, size: st.size, saved: st.mtimeMs });
    } catch { /* vanished under us — a temp sweep is allowed to do that */ }
  }
  return out.sort((a, b) => b.saved - a.saved);
}

function prune() {
  for (const f of list().slice(KEEP)) {
    try { fs.unlinkSync(f.path); } catch { /* already gone */ }
  }
}

function register() {
  // { name, text } -> { ok, path } | { ok:false, error }
  // Autosave must never be able to break the app it is protecting, so every
  // failure here is reported and swallowed rather than thrown.
  ipcMain.handle("recovery:save", (_e, { name, text } = {}) => {
    try {
      if (!text || !String(text).trim()) return { ok: false, error: "nothing to save" };
      const stem = String(name || "model").replace(/[^\w.-]+/g, "_").slice(0, 60) || "model";
      // One file per session-and-name, overwritten in place. Writing a new file
      // per keystroke would bury the useful snapshot under hundreds of others.
      const file = path.join(dir(), `${stem}.bcode`);
      fs.writeFileSync(file, String(text), "utf8");
      prune();
      return { ok: true, path: file };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  ipcMain.handle("recovery:list", () => {
    try { return { ok: true, dir: DIR, files: list() }; }
    catch (e) { return { ok: false, error: String(e?.message || e), files: [] }; }
  });

  ipcMain.handle("recovery:read", (_e, file) => {
    try {
      // Only ever read out of our own folder — a renderer must not be able to
      // turn this into "read any file on the machine".
      const full = path.resolve(String(file || ""));
      if (path.dirname(full) !== path.resolve(DIR)) return { ok: false, error: "outside the recovery folder" };
      return { ok: true, text: fs.readFileSync(full, "utf8") };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // Show the folder itself, so "I know it's in there somewhere" has an answer.
  ipcMain.handle("recovery:reveal", async () => {
    try {
      const { shell } = require("electron");
      await shell.openPath(dir());
      return { ok: true, dir: DIR };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

module.exports = { register, DIR, list, KEEP };
