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

const { app, BrowserWindow, protocol, net, shell, Menu } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0b0f16",     // matches the viewer, so no white flash
    title: "BREPcode",
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  win.loadURL("app://bundle/index.html");

  // Anything aimed at a new window is a real link — hand it to the OS browser
  // rather than opening a second chrome-less Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  return win;
}

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const file = resolveRequest(req.url);
    if (!file) return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

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
  if (process.platform !== "darwin") app.quit();
});
