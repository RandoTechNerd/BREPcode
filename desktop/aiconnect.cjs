// Settings > Connect your AI: one click writes the MCP entry that lets an AI
// app drive this window, for the four apps that can run a local MCP server.
//
// What "one click" has to survive, for someone who has never seen a JSON file:
//
//   * No Node. MCP clients start the server with whatever `command` the
//     config names. When `node` is not on PATH we name THIS app's own
//     executable with ELECTRON_RUN_AS_NODE=1, which is a Node runtime.
//   * A portable exe. The portable build unpacks into a fresh temp folder on
//     every launch, so resources/agent/mcp-server.mjs moves each time. The
//     server is copied to userData (stable, and refreshed on every start so
//     it always matches this build) and the config points there.
//   * Their own config. Every other entry, key and server in the file is
//     kept; a file we cannot parse is left alone and the copy-config fallback
//     offered instead; the previous file is kept beside it as .bak-brepcode.
//
// Status is three-valued: not set up, set up (our entry is in the file), and
// connected (an MCP server started by that app has said hello to the bridge
// in the last minute, see bridge.cjs /hello).

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SERVER = "brepcode";
const LIVE_MS = 60 * 1000;

// Where each app keeps its MCP servers, and the shape of the entry.
function clientDefs(env = {}) {
  const home = env.home || os.homedir();
  const platform = env.platform || process.platform;
  const appData = env.appData || process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const support = platform === "win32" ? appData
    : platform === "darwin" ? path.join(home, "Library", "Application Support")
      : path.join(home, ".config");
  return [
    { id: "claude-desktop", label: "Claude Desktop", key: "mcpServers",
      file: path.join(support, "Claude", "claude_desktop_config.json"),
      present: path.join(support, "Claude"),
      after: "Quit Claude Desktop completely (tray icon > Quit) and open it again." },
    { id: "claude-code", label: "Claude Code", key: "mcpServers",
      file: path.join(home, ".claude.json"),
      present: path.join(home, ".claude"),
      after: "Start a new claude session; /mcp lists brepcode." },
    { id: "cursor", label: "Cursor", key: "mcpServers",
      file: path.join(home, ".cursor", "mcp.json"),
      present: path.join(home, ".cursor"),
      after: "Cursor Settings > MCP shows brepcode; switch it on if it is off." },
    { id: "vscode", label: "VS Code", key: "servers", stdioType: true,
      file: path.join(support, "Code", "User", "mcp.json"),
      present: path.join(support, "Code"),
      after: "In Copilot Chat choose Agent mode; brepcode is under the tools button." },
  ];
}

// The command an MCP client should run. A real node on PATH starts fastest;
// otherwise this app's own runtime.
function nodeCommand(env = {}) {
  if (env.command) return { command: env.command, env: env.commandEnv || {} };
  try {
    const out = execFileSync(process.platform === "win32" ? "where" : "which", ["node"],
      { encoding: "utf8", timeout: 5000, windowsHide: true });
    const first = out.split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s));
    if (first) return { command: first, env: {} };
  } catch { /* no node on PATH */ }
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  return { command: exe, env: { ELECTRON_RUN_AS_NODE: "1" } };
}

function entryFor(def, serverPath, cmd) {
  return {
    ...(def.stdioType ? { type: "stdio" } : {}),
    command: cmd.command,
    args: [serverPath],
    env: { ...cmd.env, BREPCODE_CLIENT: def.id },
  };
}

function readJson(file) {
  if (!fs.existsSync(file)) return { data: {} };
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) return { data: {} };
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "it is not a JSON object" };
    return { data, text };
  } catch (e) {
    return { error: `it is not plain JSON (${e.message.slice(0, 80)}) — it may have comments in it` };
  }
}

// Write through a temp file and a rename, so an app reading the file at the
// same moment sees the old file or the new one, never half of one.
function writeJson(file, data, oldText) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (oldText != null) { try { fs.writeFileSync(file + ".bak-brepcode", oldText); } catch { /* best effort */ } }
  const tmp = `${file}.brepcode-${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

function create({ serverSource, userData, liveClients = () => [], env = {} } = {}) {
  const defs = clientDefs(env);
  const stableServer = path.join(userData, "agent", "mcp-server.mjs");

  // Copy the server out of the app to a place that does not move.
  function installServer() {
    fs.mkdirSync(path.dirname(stableServer), { recursive: true });
    const src = fs.readFileSync(serverSource);
    let same = false;
    try { same = fs.readFileSync(stableServer).equals(src); } catch { /* not there yet */ }
    if (!same) fs.writeFileSync(stableServer, src);
    return stableServer;
  }

  const ours = (e) => !!e && Array.isArray(e.args) && e.args.some((a) => typeof a === "string" && /mcp-server\.mjs$/.test(a));

  function snippet(id) {
    const def = defs.find((d) => d.id === id);
    if (!def) throw new Error(`unknown AI app "${id}"`);
    const entry = entryFor(def, stableServer, nodeCommand(env));
    return { file: def.file, text: JSON.stringify({ [def.key]: { [SERVER]: entry } }, null, 2) };
  }

  function status() {
    const live = liveClients();
    return defs.map((def) => {
      let configured = false, problem = null;
      const r = readJson(def.file);
      if (r.error) problem = `${path.basename(def.file)}: ${r.error}`;
      else configured = ours(r.data?.[def.key]?.[SERVER]);
      const seen = live.find((c) => c.id === def.id && c.ageMs < LIVE_MS);
      return {
        id: def.id, label: def.label, file: def.file, after: def.after,
        installed: fs.existsSync(def.present) || fs.existsSync(def.file),
        configured, connected: !!seen, problem,
        state: seen ? "connected" : configured ? "set up" : "not set up",
      };
    });
  }

  function connect(id) {
    const def = defs.find((d) => d.id === id);
    if (!def) throw new Error(`unknown AI app "${id}"`);
    const server = installServer();
    const r = readJson(def.file);
    if (r.error) {
      return { ok: false, error: `Did not touch ${def.file}: ${r.error}. Use "Copy config" and paste the brepcode entry in yourself.` };
    }
    const data = r.data;
    data[def.key] = { ...(data[def.key] || {}), [SERVER]: entryFor(def, server, nodeCommand(env)) };
    writeJson(def.file, data, r.text ?? null);
    return { ok: true, file: def.file, after: def.after };
  }

  function disconnect(id) {
    const def = defs.find((d) => d.id === id);
    if (!def) throw new Error(`unknown AI app "${id}"`);
    const r = readJson(def.file);
    if (r.error) return { ok: false, error: `Did not touch ${def.file}: ${r.error}.` };
    if (!r.data?.[def.key]?.[SERVER]) return { ok: true, file: def.file, removed: false };
    delete r.data[def.key][SERVER];
    writeJson(def.file, r.data, r.text ?? null);
    return { ok: true, file: def.file, removed: true };
  }

  // On every start: keep the copied server current with this build, and
  // re-point entries we wrote earlier if the command they name has gone (a
  // portable exe moved, node uninstalled). Entries anyone else wrote are
  // never touched.
  function refresh() {
    let server;
    try { server = installServer(); } catch { return []; }
    const fixed = [];
    for (const def of defs) {
      const r = readJson(def.file);
      const e = r.data?.[def.key]?.[SERVER];
      if (r.error || !ours(e)) continue;
      if (e.args.includes(server) && e.command && fs.existsSync(e.command)) continue;
      r.data[def.key][SERVER] = entryFor(def, server, nodeCommand(env));
      try { writeJson(def.file, r.data, r.text); fixed.push(def.id); } catch { /* leave it */ }
    }
    return fixed;
  }

  return { status, connect, disconnect, snippet, refresh, installServer, defs, stableServer };
}

// IPC for the Settings screen. The page names an app id from the fixed list;
// every path is decided here.
function register() {
  const { ipcMain, app } = require("electron");
  const bridge = require("./bridge.cjs");
  // BREPCODE_AICONNECT_HOME points every config at a throwaway folder, so
  // the live check (scripts/assembly-check.cjs) can press Connect for real
  // without touching this machine's own Claude/Cursor/VS Code settings.
  const fake = process.env.BREPCODE_AICONNECT_HOME;
  const conn = create({
    serverSource: bridge.mcpServerPath(),
    userData: app.getPath("userData"),
    liveClients: () => bridge.clients(),
    env: fake ? { home: fake, appData: path.join(fake, "AppData", "Roaming") } : {},
  });
  try { conn.refresh(); } catch { /* never block startup on this */ }
  const bridgeOn = () => bridge.status().listening;
  ipcMain.handle("ai:status", () => ({ bridge: bridgeOn(), port: bridge.PORT, clients: conn.status() }));
  ipcMain.handle("ai:connect", (_e, id) => { try { return conn.connect(String(id)); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle("ai:disconnect", (_e, id) => { try { return conn.disconnect(String(id)); } catch (e) { return { ok: false, error: e.message }; } });
  ipcMain.handle("ai:snippet", (_e, id) => {
    try { conn.installServer(); return { ok: true, ...conn.snippet(String(id)) }; } catch (e) { return { ok: false, error: e.message }; }
  });
  return conn;
}

module.exports = { create, register, clientDefs, nodeCommand, SERVER };
