// The MCP server's protocol, checked without Electron.
//
// This half is what an MCP client sees BEFORE the app is involved: the
// handshake, the tool list, and what happens when BREPcode is not running.
// That last one matters most — the failure a user actually hits is "I asked
// Claude and nothing happened", and the only thing standing between that and a
// silent hang is this server answering with a sentence that says what to do.
//
// The live half (a real window, a real build) is scripts/agent-check.cjs,
// which needs the Electron binary and so cannot live in `npm test`.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SERVER = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "agent", "mcp-server.mjs");

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// Talk to it the way a client does: one JSON-RPC object per line, replies
// matched by id. A port nothing is listening on is the point of the exercise,
// so this deliberately does NOT start the app.
function session(messages) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SERVER], {
      stdio: ["pipe", "pipe", "inherit"],
      // A port that is certainly closed, so "not running" is guaranteed rather
      // than dependent on whether the developer happens to have BREPcode open.
      env: { ...process.env, BREPCODE_AGENT_PORT: "5999" },
    });
    const out = [];
    let buf = "";
    proc.stdout.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try { out.push(JSON.parse(line)); } catch { /* not ours */ }
        if (out.length === messages.filter((m) => m.id !== undefined).length) {
          proc.kill();
          resolve(out);
        }
      }
    });
    proc.on("error", reject);
    setTimeout(() => { proc.kill(); reject(new Error("mcp server did not answer in 30s")); }, 30000);
    for (const m of messages) proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  });
}

const out = await session([
  { id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } },
  // A notification: no id, and so no reply. If the server answers it, the count
  // below goes wrong and this test says so — which is the bug that stops some
  // clients completing their handshake at all.
  { method: "notifications/initialized" },
  { id: 2, method: "tools/list" },
  { id: 3, method: "tools/call", params: { name: "get_state", arguments: {} } },
]);

const byId = Object.fromEntries(out.map((m) => [m.id, m]));

check("initialize answers with a protocol version", !!byId[1]?.result?.protocolVersion,
  JSON.stringify(byId[1]));
check("initialize declares the tools capability", !!byId[1]?.result?.capabilities?.tools);
check("initialize carries working instructions", (byId[1]?.result?.instructions || "").includes("get_state"));
check("a notification gets no reply", out.length === 3, `got ${out.length} replies`);

const tools = byId[2]?.result?.tools || [];
const names = tools.map((t) => t.name);
for (const want of ["get_state", "set_code", "build", "set_param", "set_view", "fit", "screenshot", "save_stl", "catalog_find", "catalog_list"]) {
  check(`tools/list offers ${want}`, names.includes(want), names.join(","));
}
// A tool with no description is a tool the model will not pick correctly.
check("every tool has a description and a schema",
  tools.every((t) => t.description?.length > 20 && t.inputSchema?.type === "object"));
check("set_code requires its code argument",
  tools.find((t) => t.name === "set_code")?.inputSchema?.required?.includes("code"));

// The one that matters: the app is NOT running, and the answer has to explain
// itself rather than hang or come back as an empty object.
const text = byId[3]?.result?.content?.[0]?.text || "";
check("a call with the app shut says so", /not reachable/i.test(text), text.slice(0, 120));
// The bridge is on by default now, so the overwhelmingly likely cause is that
// the app is closed. The message has to lead with that rather than sending
// people off to add a flag they do not need — and it must still name the two
// things that genuinely do turn it off, for the rare case.
check("...and leads with the likely cause", /not open|is closed|start BREPcode/i.test(text), text.slice(0, 200));
check("...and still names the real opt-outs", /--no-agent/.test(text) && /BREPCODE_AGENT=0/.test(text), text.slice(0, 300));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
