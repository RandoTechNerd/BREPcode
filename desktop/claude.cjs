// Chat with Claude through the user's OWN Claude Code install.
//
// This is the difference between "paste an API key and get billed per token"
// and "you already pay for Claude — it just works". Claude Code ships a CLI
// (`claude`) that runs on the user's Pro/Max login; the desktop app detects it
// the same way it detects OrcaSlicer, and drives it headlessly:
//
//     claude -p --output-format json
//
// The web build can never do this — a page cannot run programs — so it is a
// desktop-only provider, and the chat's spark logo shows grey there.
//
// SECURITY. The renderer runs model code and, with chat on, AI-written text,
// so everything it sends here is treated as hostile:
//   - execFile with an argv array, never a shell — nothing is interpreted
//   - model / effort / session id are allowlisted before touching argv
//   - the prompt goes in on STDIN, so its size and content never meet the
//     Windows 32k command-line limit or anyone's quoting rules
//   - no tools are granted except Read, and only when an image is attached,
//     scoped to our own temp directory with --add-dir

const { execFile, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const IMG_DIR = path.join(os.tmpdir(), "BREPcode-chat-images");

// Node refuses to spawn .cmd/.bat directly (EINVAL — the shell-injection CVE
// fix), and npm installs `claude` AS a .cmd shim, so those must go through
// cmd.exe. That makes the command line dangerous for free text: cmd.exe
// re-parses it and & | ^ % would execute. So the rule is absolute — ARGV ONLY
// EVER CARRIES ALLOWLISTED TOKENS, and every piece of free text (the prompt
// AND the system instructions) travels on stdin, where no shell ever looks.
function runnerFor(exe, args) {
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(exe)) {
    return { file: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", exe, ...args] };
  }
  return { file: exe, args };
}

let cached = null;                     // { found, path, version } — probe once

function detect() {
  if (cached) return cached;
  let exe = null, version = null;
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which",
      ["claude"], { encoding: "utf8", timeout: 8000, windowsHide: true });
    // `where` can return several lines (claude, claude.cmd, claude.ps1) —
    // prefer the .cmd shim on Windows, since that is what a spawn can run.
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    exe = lines.find((l) => /\.cmd$/i.test(l)) || lines[0] || null;
  } catch { /* not on PATH; try the known install spots */ }
  if (!exe) {
    // PATH is where a CLI should be, but real installs miss it: the native
    // installer lands in ~/.local/bin, and npm's global bin is often absent
    // from the PATH a GUI app inherits — GUI apps get the boot-time
    // environment, not the shell's. Probing the known spots directly is the
    // same lesson the OrcaSlicer detection taught.
    const home = os.homedir();
    const candidates = [
      path.join(home, ".local", "bin", "claude.exe"),
      path.join(home, ".local", "bin", "claude"),
      process.env.APPDATA && path.join(process.env.APPDATA, "npm", "claude.cmd"),
    ].filter(Boolean);
    exe = candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch { return false; } }) || null;
  }
  if (exe) {
    try {
      const r = runnerFor(exe, ["--version"]);
      version = execFileSync(r.file, r.args,
        { encoding: "utf8", timeout: 15000, windowsHide: true }).trim();
    } catch { /* found but won't run — report found:false, it can't be driven */
      exe = null;
    }
  }
  cached = { found: !!exe, path: exe, version };
  return cached;
}

// One in flight at a time. The renderer's chat is serial anyway, and two
// concurrent CLI sessions writing the same session id would interleave badly.
let inflight = null;

function ask({ system, prompt, model, effort, resume, imagePath } = {}) {
  const d = detect();
  if (!d.found) return Promise.resolve({ ok: false, error: "Claude Code isn't installed (or isn't on PATH). Install it from claude.com/code, sign in once, and restart BREPcode." });
  if (inflight) return Promise.resolve({ ok: false, error: "Still working on the previous message." });

  const args = ["-p", "--output-format", "json"];
  // Allowlists, because these become argv — and argv may pass through cmd.exe
  // (see runnerFor). A model name is letters, digits, dots and dashes;
  // anything else is refused rather than sanitised.
  if (model && /^[\w.-]{1,64}$/.test(String(model))) args.push("--model", String(model));
  if (resume && /^[\w-]{1,64}$/.test(String(resume))) args.push("--resume", String(resume));
  if (imagePath) {
    // Only a path WE minted (see saveImage) is accepted — the renderer cannot
    // point Read at an arbitrary directory.
    const full = path.resolve(String(imagePath));
    if (full.startsWith(IMG_DIR + path.sep) && fs.existsSync(full)) {
      args.push("--add-dir", IMG_DIR, "--allowedTools", "Read");
    } else {
      imagePath = null;
    }
  }

  const env = { ...process.env };
  // Effort maps to the thinking budget. Medium is Claude Code's own default,
  // so it stays untouched; the numbers are budgets, not magic.
  const eff = String(effort || "medium");
  if (eff === "low") env.MAX_THINKING_TOKENS = "1024";
  if (eff === "high") env.MAX_THINKING_TOKENS = "16000";

  // The system instructions ride on stdin with the prompt, not on argv.
  // --append-system-prompt would be the purer channel, but free text on a
  // command line that may pass through cmd.exe is exactly the injection this
  // module promises not to allow — and models follow a labelled preamble fine.
  const stdinPayload = system
    ? `<system-instructions>\n${String(system).slice(0, 32000)}\n</system-instructions>\n\n${String(prompt || "")}`
    : String(prompt || "");

  const r = runnerFor(d.path, args);
  inflight = new Promise((resolve) => {
    const child = execFile(r.file, r.args, {
      encoding: "utf8",
      timeout: 300000,                 // five minutes, then a clean kill
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      env,
    }, (err, stdout, stderr) => {
      inflight = null;
      const friendly = (raw) => {
        const t = String(raw || "");
        if (/log\s*in|login|authenticat|OAuth|API key/i.test(t)) {
          return "Claude Code isn't signed in. Open a terminal, run `claude`, sign in once, then try again.";
        }
        if (/usage limit|rate limit|overloaded/i.test(t)) {
          return "Claude is at its usage limit right now — try again in a little while.";
        }
        return t.slice(0, 300) || "Claude Code returned nothing.";
      };
      // The CLI prints a JSON envelope even for many failures — prefer it.
      let json = null;
      try { json = JSON.parse(stdout); } catch { /* not JSON — fall through */ }
      if (json && typeof json.result === "string" && !json.is_error) {
        resolve({ ok: true, text: json.result, sessionId: json.session_id || null,
          costUsd: json.total_cost_usd ?? null });
        return;
      }
      if (json && json.is_error) { resolve({ ok: false, error: friendly(json.result || stderr) }); return; }
      if (err) { resolve({ ok: false, error: friendly(stderr || err.message) }); return; }
      resolve({ ok: false, error: friendly(stderr || stdout) });
    });
    child.stdin.on("error", () => { /* EPIPE if it died instantly — the callback reports it */ });
    child.stdin.end(stdinPayload);
  });
  return inflight;
}

// Park an attached image where ask() is allowed to Read it. The name is minted
// here — the renderer only supplies bytes, never a path.
function saveImage(ext, base64) {
  const safeExt = /^(png|jpe?g|gif|webp)$/i.test(String(ext)) ? String(ext).toLowerCase() : "png";
  const bytes = Buffer.from(String(base64 || ""), "base64");
  if (!bytes.length) return { ok: false, error: "empty image" };
  if (bytes.length > 12 * 1024 * 1024) return { ok: false, error: "image too large (12MB max)" };
  fs.mkdirSync(IMG_DIR, { recursive: true });
  // A tidy rolling window — chat images are transient by nature.
  try {
    const old = fs.readdirSync(IMG_DIR).map((n) => path.join(IMG_DIR, n))
      .map((f) => ({ f, t: fs.statSync(f).mtimeMs })).sort((a, b) => b.t - a.t).slice(20);
    for (const { f } of old) fs.unlinkSync(f);
  } catch { /* cleanup is best-effort */ }
  const file = path.join(IMG_DIR, `chat-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${safeExt}`);
  fs.writeFileSync(file, bytes);
  return { ok: true, path: file };
}

function register() {
  const { ipcMain } = require("electron");
  ipcMain.handle("claude:info", () => {
    try { return { ok: true, ...detect() }; }
    catch (e) { return { ok: false, found: false, error: String(e?.message || e) }; }
  });
  ipcMain.handle("claude:ask", (_e, opts) => ask(opts || {}));
  ipcMain.handle("claude:saveImage", (_e, { ext, base64 } = {}) => {
    try { return saveImage(ext, base64); }
    catch (e) { return { ok: false, error: String(e?.message || e) }; }
  });
}

module.exports = { register, detect, saveImage, IMG_DIR };
