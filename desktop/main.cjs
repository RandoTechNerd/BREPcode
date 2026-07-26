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
const mail = require("./mail.cjs");

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

function serveBundle() {
  protocol.handle("app", (req) => {
    const file = resolveRequest(req.url);
    if (!file) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// Only boot when this file is the entry point. test/desktop-smoke.cjs requires
// it for createWindow() and does its own setup; without this guard that would
// pop a second, visible window.
if (require.main === module) app.whenReady().then(() => {
  mail.register();          // SMTP over IPC; a browser cannot do this at all
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

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (require.main === module && process.platform !== "darwin") app.quit();
});

// Exported so test/desktop-smoke.cjs can open the REAL window — same sandbox
// flags, same preload, same navigation rules — instead of a lookalike that
// could drift from it. Requiring this file still boots the app as before.
module.exports = { createWindow, serveBundle };
