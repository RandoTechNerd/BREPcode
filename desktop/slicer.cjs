// "Open this model in my slicer" — the thing a web page fundamentally cannot do.
//
// The browser can only hand you a downloaded .3mf. The desktop app can write the
// file and ask the OS to open it, which is one click instead of four.
//
// It deliberately does NOT look up the slicer's version. It used to, to stamp
// into the 3MF, and that whole idea turned out to be self-inflicted — see the
// note in exporters.js. Finding the exe is all that is left, and all that was
// ever needed.

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Where an installer install records itself.
function fromRegistry() {
  const roots = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ];
  for (const root of roots) {
    let out = "";
    try {
      out = execFileSync("reg", ["query", root, "/s", "/f", "Orca", "/t", "REG_SZ"],
        { encoding: "utf8", timeout: 8000, windowsHide: true });
    } catch { continue; }
    if (!/OrcaSlicer/i.test(out)) continue;
    const loc = /InstallLocation\s+REG_SZ\s+(.+)/i.exec(out)?.[1]?.trim();
    const icon = /DisplayIcon\s+REG_SZ\s+(.+?)(?:,\d+)?\s*$/im.exec(out)?.[1]?.trim();
    const exe = [icon, loc && path.join(loc, "orca-slicer.exe")]
      .find((p) => p && /\.exe$/i.test(p) && exists(p));
    if (exe) return { exe };
  }
  return {};
}

const exists = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

// ...and where it actually lands when nothing registered it, which is the
// case for a portable or forked build.
function exeFromDisk() {
  const bases = [
    process.env.ProgramFiles, process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
  ].filter(Boolean);
  for (const base of bases) {
    for (const dir of ["OrcaSlicer", "OrcaSlicer-nightly"]) {
      for (const exe of ["orca-slicer.exe", "OrcaSlicer.exe"]) {
        const full = path.join(base, dir, exe);
        if (exists(full)) return full;
      }
    }
  }
  return null;
}

function detect() {
  const reg = process.platform === "win32" ? fromRegistry() : {};
  return { exe: reg.exe || exeFromDisk() || null };
}

function register() {
  const { ipcMain, shell } = require("electron");
  // Only "is there something to open this with", so the button can say the
  // right thing. We deliberately do NOT report a version — see the note in
  // exporters.js about why the 3MF carries no slicer metadata.
  ipcMain.handle("slicer:info", () => {
    try {
      const d = detect();
      return { ok: true, found: !!d.exe, exe: d.exe };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), found: false };
    }
  });

  // { name, base64 } -> writes a .3mf to temp and opens it.
  ipcMain.handle("slicer:open", async (_e, { name, base64 } = {}) => {
    try {
      if (!base64) return { ok: false, error: "nothing to open" };
      const stem = String(name || "model").replace(/[^\w.-]+/g, "_").slice(0, 60) || "model";
      const dir = path.join(os.tmpdir(), "BREPcode-slicer");
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${stem}.3mf`);
      fs.writeFileSync(file, Buffer.from(base64, "base64"));

      const { exe } = detect();
      if (exe) {
        // Launch it directly rather than via the shell: the user may well have
        // .3mf associated with Bambu Studio or PrusaSlicer, and "open in Orca"
        // should open Orca.
        const { spawn } = require("node:child_process");
        spawn(exe, [file], { detached: true, stdio: "ignore", windowsHide: false }).unref();
        return { ok: true, file, via: "orca" };
      }
      // No Orca: hand it to whatever the OS uses for .3mf. Still one click.
      const err = await shell.openPath(file);
      if (err) return { ok: false, error: err, file };
      return { ok: true, file, via: "default app" };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}

module.exports = { register, detect };
