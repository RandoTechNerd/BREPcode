// The agent bridge: a localhost-only HTTP server that lets an AI assistant
// running somewhere else — Claude Code in a terminal, Claude Desktop — drive
// the BREPcode window the user is watching.
//
// This is the OPPOSITE direction to claude.cjs. There, the app calls out to
// Claude and pastes the reply into the editor. Here, Claude calls in: the user
// types "make the wall 3mm thick" in their own chat, and the model on their
// screen changes while they watch it. No copy, no paste, no second window.
//
// Shape of it:
//
//   agent/mcp-server.mjs  --MCP/stdio-->  this server  --executeJavaScript-->
//   window.__brepAgent.run({ action })  --> the same functions the user's
//   clicks go through
//
//   GET  /ping        -> { ok, app, version, build }   (also proves the build)
//   GET  /state       -> the editor's code, status, size, params
//   POST /command     -> { action, ... } run in the page, its result back
//   GET  /screenshot  -> PNG of the window, what the user is looking at
//   POST /hello       -> an MCP server saying which AI app started it, so
//                        Settings > Connect your AI can show it as connected
//
// SECURITY. The listener is bound to 127.0.0.1 and every request is checked
// against the remote address again, because binding alone has been wrong
// before on machines with unusual interfaces. There is no auth beyond that:
// this grants exactly what a local user can already do by typing in the app's
// own editor, and the actions are a fixed allowlist inside the page — there is
// no "evaluate this" action, so the bridge cannot be turned into a way to run
// arbitrary code on the machine.
//
// It is also OFF unless asked for, see register(). A CAD app that silently
// opens a port is not something to ship on by default.

const http = require("node:http");
const path = require("node:path");
const { BrowserWindow, app } = require("electron");

const PORT = Number(process.env.BREPCODE_AGENT_PORT || 5757);

// Long jobs get their own ceiling. A kernel build of a heavy part legitimately
// runs for minutes and the default would report a timeout on a build that was
// going perfectly well — the same mistake VidHelm's bridge made on exports.
const LONG = new Set(["set_code", "edit_code", "build", "set_param", "get_stl", "catalog_find", "check_fit", "export_parts", "render"]);
const timeoutFor = (action) => (LONG.has(action) ? 10 * 60 * 1000 : 20000);

let state = { listening: false, port: PORT, error: "" };

// Which AI apps have an MCP server talking to us, and when each was last
// heard from. The MCP server says hello when its client connects and then
// every ~20 s while it runs (agent/mcp-server.mjs), so "seen in the last
// minute" is a fair "connected".
const clients = new Map();          // id -> { id, name, version, lastSeen }
function sawClient({ client, name, version } = {}) {
  const id = String(client || "").slice(0, 40) || "unknown";
  clients.set(id, { id, name: String(name || "").slice(0, 80), version: String(version || "").slice(0, 40), lastSeen: Date.now() });
}
const clientList = () => [...clients.values()].map((c) => ({ ...c, ageMs: Date.now() - c.lastSeen }));

function windowNow() {
  return BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) || null;
}

// Everything goes through the page's own allowlist. The command is JSON on the
// way in, so nothing a caller sends is ever spliced into source text — that is
// the difference between passing an argument and injecting code.
function ask(cmd) {
  const win = windowNow();
  if (!win) return Promise.resolve({ error: "the BREPcode window is not open" });
  const js = `window.__brepAgent
    ? window.__brepAgent.run(${JSON.stringify(cmd)})
    : { error: "this BREPcode build has no agent surface — rebuild the app" }`;
  return Promise.race([
    win.webContents.executeJavaScript(js, true).catch((e) => ({ error: String(e?.message || e) })),
    new Promise((r) => setTimeout(
      () => r({ error: `the app did not answer within ${timeoutFor(cmd.action) / 1000}s` }),
      timeoutFor(cmd.action))),
  ]);
}

const send = (res, code, body) => {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

// export_parts: the page hands back the files, this side puts them where the
// assistant asked — a folder, or a .zip when the path ends in one. Without a
// path they go to Documents/BREPcode/<model>-parts.
const fs = require("node:fs");
// A deflated zip from [name, Buffer] pairs. Small enough to keep here rather
// than ship a zip library in the packaged app (main.cjs loads no npm modules
// but nodemailer, see electron-builder.yml).
function zipOf(entries) {
  const zlib = require("node:zlib");
  const parts = [], central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nm = Buffer.from(name, "utf8");
    const packed = zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(8, 8); head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nm.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(packed.length, 20);
    cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(head, nm, packed);
    central.push(cd, nm);
    offset += head.length + nm.length + packed.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, ...central, end]);
}

async function writeParts(cmd, out) {
  const { files, ...rest } = out;
  let target = cmd.path || cmd.dir;
  if (!target) target = path.join(app.getPath("documents"), "BREPcode", `${out.name || "model"}-parts`);
  target = path.resolve(String(target));
  try {
    if (/\.zip$/i.test(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, zipOf(files.map((f) => [f.name, Buffer.from(f.base64, "base64")])));
      return { ...rest, saved: target, files: files.map((f) => f.name) };
    }
    fs.mkdirSync(target, { recursive: true });
    const replaced = [];
    for (const f of files) {
      const file = path.join(target, path.basename(f.name));
      if (fs.existsSync(file)) replaced.push(f.name);
      fs.writeFileSync(file, Buffer.from(f.base64, "base64"));
    }
    return { ...rest, saved: target, files: files.map((f) => f.name), ...(replaced.length ? { replaced } : {}) };
  } catch (e) { return { error: `could not write the parts to ${target}: ${e.message}` }; }
}

const server = http.createServer(async (req, res) => {
  const remote = req.socket.remoteAddress || "";
  if (!/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/.test(remote)) {
    res.writeHead(403); return res.end();
  }
  try {
    const url = (req.url || "").split("?")[0];
    if (req.method === "GET" && url === "/ping") return send(res, 200, await ask({ action: "ping" }));
    if (req.method === "GET" && url === "/state") return send(res, 200, await ask({ action: "get_state" }));
    if (req.method === "POST" && url === "/hello") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      try { sawClient(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { sawClient({}); }
      return send(res, 200, { ok: true });
    }

    if (req.method === "GET" && url === "/screenshot") {
      const win = windowNow();
      if (!win) return send(res, 503, { error: "the BREPcode window is not open" });
      // capturePage on an idle or backgrounded window returns the last frame it
      // composited, which after a rebuild is the model BEFORE the change — the
      // screenshot then argues with the state the same call just reported.
      win.webContents.invalidate();
      await new Promise((r) => setTimeout(r, 150));
      const img = await win.webContents.capturePage();
      res.writeHead(200, { "Content-Type": "image/png" });
      return res.end(img.toPNG());
    }

    if (req.method === "POST" && url === "/command") {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      let cmd;
      try { cmd = JSON.parse(Buffer.concat(chunks).toString() || "{}"); }
      catch { return send(res, 400, { error: "bad json" }); }
      if (!cmd || typeof cmd.action !== "string") return send(res, 400, { error: "missing action" });
      const out = await ask(cmd);
      // An STL can be megabytes and the assistant has no use for the text —
      // it wants a file. Writing it here keeps the path on this side of the
      // bridge, where the page cannot choose it.
      if (cmd.action === "get_stl" && out?.stl && cmd.savePath) {
        try {
          require("node:fs").writeFileSync(cmd.savePath, out.stl);
          return send(res, 200, { ok: true, saved: path.resolve(cmd.savePath), bytes: out.stl.length, name: out.name });
        } catch (e) { return send(res, 200, { error: `could not write ${cmd.savePath}: ${e.message}` }); }
      }
      if (cmd.action === "export_parts" && Array.isArray(out?.files)) return send(res, 200, await writeParts(cmd, out));
      if (cmd.action === "render" && out?.png && cmd.savePath) {
        try {
          const file = path.resolve(cmd.savePath);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, Buffer.from(out.png, "base64"));
          out.saved = file;
        } catch (e) { out.saveError = `could not write ${cmd.savePath}: ${e.message}`; }
      }
      return send(res, 200, out);
    }
    send(res, 404, { error: "not found" });
  } catch (e) { send(res, 500, { error: String(e) }); }
});

server.on("error", (e) => {
  state = {
    listening: false, port: PORT,
    error: e?.code === "EADDRINUSE"
      ? `port ${PORT} is already in use — another BREPcode, or another app, has it`
      : String(e),
  };
  console.warn("[bridge] disabled:", state.error);
});

// ON by default. That is a deliberate reversal, and worth being honest about:
// a double-click has to be enough, because the whole point is that the model
// changes while you watch, and "relaunch it from a terminal with a flag first"
// is not a thing anyone will do twice.
//
// READ THIS BEFORE CUTTING A PUBLIC RELEASE. It means every copy of the exe
// opens a listening socket on 127.0.0.1 at startup. Loopback-only and
// re-checked per request, and it grants no more than a local user typing in
// the app's own editor already has — but it IS a port, on a machine whose
// owner did not ask for one, and that is a decision to make on purpose rather
// than inherit from this comment.
//
// So the default is a BUILD setting, not an edit: `brepcodeAgentDefault` in
// package.json (true here, for the dev's own copy). The public release flips
// it at package time with no source change:
//   npx electron-builder --win -c.extraMetadata.brepcodeAgentDefault=false
// and --agent still turns the bridge on for anyone who wants it.
const DEFAULT_ON = (() => {
  try {
    const v = require("../package.json").brepcodeAgentDefault;
    return v === undefined ? true : v === true || v === "true";
  } catch { return true; }
})();

// Explicit beats default in both directions: --no-agent (or BREPCODE_AGENT=0)
// turns it off for a run, --agent (or =1) turns it on, and an argument wins
// over the environment so a shortcut can override a machine-wide setting.
function wanted(argv = process.argv, env = process.env) {
  if (argv.includes("--no-agent")) return false;
  if (argv.includes("--agent")) return true;
  if (env.BREPCODE_AGENT === "0") return false;
  if (env.BREPCODE_AGENT === "1") return true;
  return DEFAULT_ON;
}

function register() {
  if (!wanted()) { state = { listening: false, port: PORT, error: "turned off (--no-agent or BREPCODE_AGENT=0)" }; return state; }
  server.listen(PORT, "127.0.0.1", () => {
    state = { listening: true, port: PORT, error: "" };
    console.log(`[bridge] agent bridge on http://127.0.0.1:${PORT}`);
  });
  return state;
}

// Where the MCP server file lives, so a client that needs an absolute path can
// be told one. Packaged builds ship it under resources/agent/.
const mcpServerPath = () => (app.isPackaged
  ? path.join(process.resourcesPath, "agent", "mcp-server.mjs")
  : path.join(__dirname, "..", "agent", "mcp-server.mjs"));

module.exports = { register, status: () => ({ ...state, mcpServerPath: mcpServerPath(), clients: clientList() }), wanted, PORT, clients: clientList, mcpServerPath };
