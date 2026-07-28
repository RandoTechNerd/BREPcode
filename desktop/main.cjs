// BREPcode desktop shell.
//
// The app itself is the same static bundle the website ships (dist-site/) — this
// only wraps it in a window. It is deliberately thin: no node integration in the
// page, no extra APIs, so the desktop build and the web build stay identical in
// behaviour and there is only ever one thing to test.
//
// Files are served over a custom `app://` scheme rather than file://, because
// file:// gives every module an opaque origin: ES module imports and
// WebAssembly.instantiateStreaming both refuse to load there. A registered
// standard scheme behaves like a real origin without opening a port, so there's
// no firewall prompt and nothing to collide with a dev server.

const { app, BrowserWindow, protocol, net, shell, Menu, nativeTheme } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const mail = require("./mail.cjs");
const recovery = require("./recovery.cjs");
const slicer = require("./slicer.cjs");
const claude = require("./claude.cjs");

const ROOT = path.join(__dirname, "..", "dist-site");

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
}]);

function resolveRequest(url) {
  // app://bundle/viewer/x.js -> <ROOT>/viewer/x.js, with the root as a floor so
  // a crafted ../ can't escape the bundle.
  const { pathname } = new URL(url);
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  const target = path.resolve(ROOT, rel || "index.html");
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

// `hidden` lets the smoke test open the same window without showing it.
// Everything that matters — the sandbox flags, the preload, the navigation
// rules — stays here, so the test drives the real configuration rather than a
// copy of it that could drift.
function createWindow({ hidden = false } = {}) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0f16",     // matches the viewer, so no white flash
    title: "BREPcode",
    // Without this the window — and so the taskbar button — carries Electron's
    // own icon, because a window with no icon of its own inherits the running
    // executable's. In a packaged build electron-builder stamps the icon into
    // BREPcode.exe and it would be right anyway; in a dev run the executable is
    // electron.exe, so the window has to say what it is.
    icon: path.join(__dirname, "icon.png"),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      // the ONLY channel from page to main — see preload.cjs for what it exposes
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  // hidden is for the smoke test, which drives the page without a visible window
  if (!hidden) win.once("ready-to-show", () => win.show());
  win.loadURL("app://bundle/index.html");

  // Anything aimed at a new window is a real link — hand it to the OS browser
  // rather than opening a second chrome-less Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  // Same rule for navigation in the main frame. Without this a `mailto:` from
  // the Email tab's draft fallback would try to navigate the window itself and
  // leave the app blank; here it opens the user's mail client and the app stays
  // where it was. Anything not app:// is refused outright.
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith("app://")) return;
    e.preventDefault();
    if (/^(https?|mailto):/.test(url)) shell.openExternal(url);
  });
  return win;
}

// The title bar, menu strip and menu popups are drawn by Windows, not by us, so
// they cannot be styled with CSS — they follow whatever theme the OS thinks the
// app wants. The viewer is dark, so a machine set to light mode got a white menu
// bar sitting directly above a black 3D view. Declaring the app dark makes
// Windows render its own chrome to match.
//
// Set before the window exists, so the frame is drawn dark from the first paint
// rather than flashing light.
nativeTheme.themeSource = "dark";

// Windows groups taskbar buttons, and decides which icon and which name they
// carry, by AppUserModelID. Left unset, every Electron app on the machine
// shares Electron's default identity — so BREPcode's button could sit under
// "Electron", and pinning it would pin the wrong thing. Matches the appId in
// electron-builder.yml so the dev run and the installed app are one identity.
// Must be set before any window exists.
if (process.platform === "win32") app.setAppUserModelId("com.randotechnerd.brepcode");

function serveBundle() {
  protocol.handle("app", (req) => {
    const file = resolveRequest(req.url);
    if (!file) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// Boot only when we ARE the app — not when test/desktop-smoke.cjs has required
// this file for createWindow() and is doing its own setup.
//
// This used to say `require.main === module`, and it silently stopped being
// true: package.json is "type": "module", so Electron 43 loads even a .cjs
// entry through the ESM loader and require.main is undefined. Every boot step
// hung off that condition, so the app started, created no window, registered no
// IPC, printed nothing, and sat there as three live processes with no error to
// show for it. An explicit flag, set by the one caller that needs it, cannot
// rot the same way.
// A file the OS handed us — double-clicked in Explorer, "Open with", or
// dropped on the exe. Windows passes it as a bare argv entry, so pick out the
// one that is an existing .bcode path rather than trusting position: argv also
// carries Electron's own flags, and in a dev run the script path too.
function fileFromArgv(argv) {
  for (const a of (argv || []).slice(1)) {
    if (typeof a !== "string" || a.startsWith("-")) continue;
    if (!/\.bcode$/i.test(a)) continue;
    try { if (fs.statSync(a).isFile()) return a; } catch { /* not a path */ }
  }
  return null;
}

// Hand it to the page, waiting for the load to finish if it is still starting —
// a double-click launches the app and delivers the file in the same breath.
function sendFileToWindow(win, file) {
  if (!win || !file) return;
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return; }
  const payload = { name: path.basename(file), text };
  if (win.webContents.isLoading()) {
    win.webContents.once("did-finish-load", () => win.webContents.send("open-file", payload));
  } else {
    win.webContents.send("open-file", payload);
  }
}

// Without this, every double-click starts a whole new app. With it, the second
// launch hands its file to the window that is already open and exits.
const EMBEDDED = process.env.BREPCODE_EMBED === "1";

// The lock carries our exe path, so the FIRST instance can tell whether the
// second launch was the same program or a different build — double-clicking a
// new BREPcode.exe while an old one runs silently fronts the OLD window, and
// during testing that reads as "the new build doesn't work". It cost a real
// evening of chasing a bug that was fixed three builds earlier.
if (!EMBEDDED && !app.requestSingleInstanceLock({ execPath: process.execPath })) app.quit();

if (!EMBEDDED) app.on("second-instance", (_e, argv, _cwd, extra) => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const otherExe = extra?.execPath;
  if (otherExe && path.resolve(otherExe) !== path.resolve(process.execPath)) {
    const { dialog } = require("electron");
    dialog.showMessageBox(win, {
      type: "warning",
      title: "You're still in the old BREPcode",
      message: "A different BREPcode.exe was just launched, but this older one was already running — so you're looking at the OLD build.",
      detail: `Running now:
${process.execPath}

You launched:
${otherExe}

Close this window, then start the new one again. (Check ⓘ About — the version tooltip names the exact build.)`,
    });
    return;                       // don't route a file into the wrong build
  }
  sendFileToWindow(win, fileFromArgv(argv));
});

if (!EMBEDDED) app.whenReady().then(() => {
  mail.register();          // SMTP over IPC; a browser cannot do this at all
  recovery.register();      // crash snapshots into the OS temp folder
  slicer.register();        // "open this in my slicer" — impossible from a web page
  claude.register();        // chat via the user's own Claude Code login
  serveBundle();

  // A stock menu on Windows just adds noise; keep the accelerators that matter.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "File",
      submenu: [{ role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "toggleDevTools" }, { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
        { type: "separator" }, { role: "togglefullscreen" },
      ],
    },
  ]));

  const win = createWindow();
  sendFileToWindow(win, fileFromArgv(process.argv));   // launched by double-click
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// macOS delivers an opened document through this event instead of argv.
app.on("open-file", (e, file) => {
  e.preventDefault();
  const win = BrowserWindow.getAllWindows()[0];
  if (win) sendFileToWindow(win, file);
});

app.on("window-all-closed", () => {
  if (!EMBEDDED && process.platform !== "darwin") app.quit();
});

// Exported so test/desktop-smoke.cjs can open the REAL window — same sandbox
// flags, same preload, same navigation rules — instead of a lookalike that
// could drift from it. Requiring this file still boots the app as before.
module.exports = { createWindow, serveBundle };
