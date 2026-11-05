// Settings > Connect your AI (desktop/aiconnect.cjs), against a throwaway home
// folder so no real config is touched.
//
// What must hold for someone who will never open these files themselves:
//   * each of the four apps gets an entry in the shape it reads (VS Code's
//     "servers" with type stdio, everyone else's "mcpServers");
//   * everything else in their file survives, and the old file is kept;
//   * a file we cannot parse is left exactly as it was;
//   * the entry points at a copy of the server that does not move, and names
//     a command that exists;
//   * "connected" comes from a real MCP server process saying hello.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { create } = require("../desktop/aiconnect.cjs");
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}

const home = fs.mkdtempSync(path.join(os.tmpdir(), "brepcode-aiconnect-"));
const appData = path.join(home, "AppData", "Roaming");
const userData = path.join(appData, "BREPcode");
const env = { home, appData, platform: "win32", command: process.execPath, commandEnv: {} };
let live = [];
const conn = create({ serverSource: path.join(ROOT, "agent", "mcp-server.mjs"), userData, liveClients: () => live, env });
const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const file = (id) => conn.defs.find((d) => d.id === id).file;

console.log("\nconnect writes the entry each app reads\n");
{
  // Claude Desktop with a config of its own already there
  fs.mkdirSync(path.dirname(file("claude-desktop")), { recursive: true });
  fs.writeFileSync(file("claude-desktop"), JSON.stringify({ theme: "dark", mcpServers: { other: { command: "x" } } }));
  const before = conn.status().find((c) => c.id === "claude-desktop");
  check("before: not set up", before.state === "not set up" && before.installed);
  const r = conn.connect("claude-desktop");
  check("connect says ok", r.ok, JSON.stringify(r));
  const cfg = read(file("claude-desktop"));
  const e = cfg.mcpServers.brepcode;
  check("their other settings survive", cfg.theme === "dark" && cfg.mcpServers.other?.command === "x");
  check("the entry runs a command that exists", fs.existsSync(e.command), e.command);
  check("...on the copied server, outside the app", e.args[0] === conn.stableServer && fs.existsSync(e.args[0]));
  check("the copy is byte-identical to the app's server",
    fs.readFileSync(e.args[0]).equals(fs.readFileSync(path.join(ROOT, "agent", "mcp-server.mjs"))));
  check("it says which app it is for", e.env.BREPCODE_CLIENT === "claude-desktop");
  check("the old file is kept beside it", fs.existsSync(file("claude-desktop") + ".bak-brepcode"));
  check("after: set up", conn.status().find((c) => c.id === "claude-desktop").state === "set up");

  conn.connect("vscode");
  const vs = read(file("vscode"));
  check("VS Code gets servers{} with type stdio", vs.servers?.brepcode?.type === "stdio" && !vs.mcpServers);
  conn.connect("cursor");
  check("Cursor gets ~/.cursor/mcp.json", read(path.join(home, ".cursor", "mcp.json")).mcpServers.brepcode.args.length === 1);
  fs.writeFileSync(file("claude-code"), JSON.stringify({ numStartups: 40, projects: { a: { allowedTools: [] } } }));
  conn.connect("claude-code");
  const cc = read(file("claude-code"));
  check("Claude Code's ~/.claude.json keeps its own keys", cc.numStartups === 40 && cc.projects.a && cc.mcpServers.brepcode);
  check("connecting twice changes nothing", (() => {
    const t = fs.readFileSync(file("cursor"), "utf8"); conn.connect("cursor"); return fs.readFileSync(file("cursor"), "utf8") === t;
  })());
}

console.log("\nit refuses to guess\n");
{
  const f = file("vscode");
  const commented = '{\n  // my servers\n  "servers": {}\n}\n';
  fs.writeFileSync(f, commented);
  const r = conn.connect("vscode");
  check("a file with comments is not rewritten", !r.ok && fs.readFileSync(f, "utf8") === commented, r.error);
  check("...and the error points at Copy config", /Copy config/.test(r.error || ""));
  check("status says it cannot read it", !!conn.status().find((c) => c.id === "vscode").problem);
  const snip = conn.snippet("vscode");
  check("Copy config is valid JSON in VS Code's shape", JSON.parse(snip.text).servers.brepcode.type === "stdio");
  let threw = false;
  try { conn.connect("chatgpt"); } catch { threw = true; }
  check("an app it does not know is refused", threw);
}

console.log("\nremove and refresh\n");
{
  const r = conn.disconnect("cursor");
  check("remove takes out only brepcode", r.removed && !read(file("cursor")).mcpServers.brepcode);
  // a portable exe that has moved: the command no longer exists
  const cfg = read(file("claude-desktop"));
  cfg.mcpServers.brepcode.command = path.join(home, "gone", "BREPcode.exe");
  fs.writeFileSync(file("claude-desktop"), JSON.stringify(cfg));
  const fixed = conn.refresh();
  check("refresh re-points an entry whose command has gone", fixed.includes("claude-desktop")
    && fs.existsSync(read(file("claude-desktop")).mcpServers.brepcode.command), fixed.join());
  check("refresh leaves someone else's server alone", read(file("claude-desktop")).mcpServers.other.command === "x");
}

console.log("\nconnected means a real MCP server said hello\n");
{
  const hellos = [];
  const fake = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      if (req.url === "/hello") hellos.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200, { "Content-Type": "application/json" }); res.end("{}");
    });
  });
  await new Promise((r) => fake.listen(0, "127.0.0.1", r));
  const port = fake.address().port;
  const e = read(file("claude-desktop")).mcpServers.brepcode;
  const child = spawn(e.command, e.args, { env: { ...process.env, ...e.env, BREPCODE_AGENT_PORT: String(port) }, stdio: ["pipe", "pipe", "inherit"] });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", clientInfo: { name: "claude-ai", version: "1" } } }) + "\n");
  for (let i = 0; i < 50 && !hellos.length; i++) await new Promise((r) => setTimeout(r, 100));
  child.kill();
  fake.close();
  check("the copied server, run as the config says, says hello on connect", hellos.length >= 1, JSON.stringify(hellos));
  check("...naming the app from its config", hellos[0]?.client === "claude-desktop" && hellos[0]?.name === "claude-ai");
  live = [{ id: "claude-desktop", ageMs: 2000 }, { id: "cursor", ageMs: 5 * 60 * 1000 }];
  const st = conn.status();
  check("a hello in the last minute shows as connected", st.find((c) => c.id === "claude-desktop").state === "connected");
  check("an old one does not", st.find((c) => c.id === "cursor").state !== "connected");
}

fs.rmSync(home, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
