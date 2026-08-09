// Showing the 3-view blueprint from the desktop app.
//
// On the website the Blueprint button opens a browser tab, because a browser
// has tabs. The exe does not: window.open is denied outright in main.cjs, on
// purpose — a second chrome-less Electron window pretending to be a tab is a
// worse experience than the real thing.
//
// So the exe hands the drawing to the operating system instead. An .svg on
// Windows opens in whatever the user set as their default, which is nearly
// always a browser — an actual tab, in an actual browser, which is what was
// asked for. It just gets there by a different road.
//
// The file goes in a folder of our own under temp for the same reason recovery
// snapshots do: a drawing is something you look at and throw away, and temp is
// a place the OS is allowed to clean up behind us.

const { ipcMain, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DIR = path.join(os.tmpdir(), "BREPcode-drawings");
// A drawing is a look, not a document. Keep a handful so a user can compare
// two revisions side by side, and let the rest go.
const KEEP = 8;

function dir() {
  fs.mkdirSync(DIR, { recursive: true });
  return DIR;
}

function prune() {
  let files = [];
  try {
    files = fs.readdirSync(DIR)
      .filter((n) => n.endsWith(".svg"))
      .map((n) => {
        const full = path.join(DIR, n);
        return { full, at: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.at - a.at);
  } catch { return; }
  for (const f of files.slice(KEEP)) {
    try { fs.unlinkSync(f.full); } catch { /* already swept */ }
  }
}

function register() {
  // { name, svg } -> { ok, path } | { ok:false, error }
  ipcMain.handle("blueprint:open", async (_e, { name, svg } = {}) => {
    try {
      const text = String(svg || "");
      // Refuse anything that is not actually a drawing. This handler ends in
      // "hand a file to the OS and let it decide what to run", so what goes in
      // has to be exactly what it claims to be.
      if (!/^\s*<(\?xml|svg)\b/i.test(text)) return { ok: false, error: "not an SVG" };
      const stem = String(name || "drawing").replace(/[^\w.-]+/g, "_").slice(0, 60) || "drawing";
      const file = path.join(dir(), `${stem}.svg`);
      fs.writeFileSync(file, text, "utf8");
      prune();
      // openPath resolves to "" on success and to a message on failure — it
      // does not throw, so the empty string is the thing to test.
      const err = await shell.openPath(file);
      if (err) return { ok: false, error: err, path: file };
      return { ok: true, path: file };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

module.exports = { register, DIR, KEEP };
