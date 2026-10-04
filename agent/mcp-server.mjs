#!/usr/bin/env node
// BREPcode MCP server — lets Claude (Code or Desktop) drive a running BREPcode
// window while the user watches it change.
//
// Zero dependencies on purpose: it speaks MCP JSON-RPC on stdio and proxies to
// the app's localhost bridge (desktop/bridge.cjs, default 127.0.0.1:5757).
// An MCP client launches this file with whatever `node` it can find, so it has
// to run with nothing installed.
//
// Start the app with the bridge on:  BREPCODE_AGENT=1  (or pass --agent)

import http from "node:http";
import readline from "node:readline";

const PORT = process.env.BREPCODE_AGENT_PORT || 5757;
const BRIDGE = `http://127.0.0.1:${PORT}`;
const NOT_RUNNING =
  `BREPcode is not reachable on ${BRIDGE}. Almost always this means the app is simply not open — ask the user `
  + `to start BREPcode, then retry. The bridge is on by default, so no flag is needed. If the app IS open, it was `
  + `either started with --no-agent (or BREPCODE_AGENT=0), or it is an older build from before the bridge existed.`;

// Builds are the slow part and they are the whole point, so the client-side
// deadline has to be generous enough for a real one. It sits above the app's
// own ceiling so the app's clearer message ("the app did not answer") wins.
const LONG = new Set(["set_code", "build", "set_param", "save_stl"]);

function call(method, path, body) {
  return new Promise((resolve) => {
    const ms = LONG.has(body?.action) ? 11 * 60 * 1000 : 30000;
    const req = http.request(`${BRIDGE}${path}`, { method, headers: { "Content-Type": "application/json" }, timeout: ms }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.headers["content-type"]?.includes("image/png")) return resolve({ png: buf });
        try { resolve(JSON.parse(buf.toString() || "{}")); }
        catch { resolve({ error: "the app sent a reply that was not JSON" }); }
      });
    });
    req.on("error", () => resolve({ error: NOT_RUNNING }));
    req.on("timeout", () => { req.destroy(); resolve({ error: "the app timed out" }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Sent to the client on connect. Someone who installed the exe has no repo and
// so no CLAUDE.md — this is the only place a fresh assistant learns how to work
// here.
const INSTRUCTIONS = `BREPcode is a code-CAD app the human has open in front of you. Everything you change appears in their window immediately, and they can edit the code between your calls.

How to work:
1. Call get_state first, and again after they have touched anything. Never assume what is in the editor, they may have typed over it.
2. set_code replaces the whole editor and builds it, then returns the result. Read status.kind: "err" means it did NOT build and status.text is the kernel's complaint. Fix it and set_code again rather than reporting success.
3. Take a screenshot after a change that should look different. You are describing a picture they can already see, so say what happened in plain language; they cannot see your tool calls.
4. set_code pushes onto their undo stack, so they can Ctrl+Z anything you do. Small steps beat one big rewrite: they get to keep the good half.
5. Language: BREPcode's own DSL, OpenSCAD and JSCAD all work, the editor auto-detects. Units are millimetres. Prefer named parameters at the top of the file: they become sliders in the app, and set_param turns them without rewriting the text.
6. Before a screenshot, set_view to a named angle (home, top, front, right, left, up, down, opposite) so the picture comes from somewhere known rather than wherever the camera was left.
7. save_stl writes the built mesh to a path you choose. Ask before overwriting a file that already exists.

If a tool says BREPcode is not reachable, the app is almost certainly just closed. Ask them to open it; do not keep retrying.`;

const str = { type: "string" }, num = { type: "number" };

const TOOLS = [
  { name: "get_state", description: "What is in the BREPcode window right now: the editor's code, the model name, the build status and its message, the model's size in mm, and the named parameters with their values. Call this first, and again after the user may have typed.", inputSchema: { type: "object", properties: {} } },
  { name: "set_code", description: "Replace the editor's contents and build it. This is the main tool: the model on the user's screen changes as it runs. Returns the same fields as get_state, so check status.kind, where 'err' means the build FAILED and status.text says why. Goes through the app's own undo stack, so the user can Ctrl+Z it.", inputSchema: { type: "object", properties: { code: { ...str, description: "the complete new source: BREPcode DSL, OpenSCAD or JSCAD, millimetres" }, name: { ...str, description: "optional model name, used for exported filenames" } }, required: ["code"] } },
  { name: "build", description: "Rebuild whatever is in the editor now, without changing it. Use after the user says they have edited the code themselves.", inputSchema: { type: "object", properties: {} } },
  { name: "set_param", description: "Turn one of the model's named parameters, the same sliders the user sees, and rebuild. Cheaper and less disruptive than rewriting the source for a dimension change.", inputSchema: { type: "object", properties: { name: { ...str, description: "the parameter name from get_state.params" }, value: { description: "the new value" }, index: { ...num, description: "for a vector parameter, which component" } }, required: ["name", "value"] } },
  { name: "set_view", description: "Point the camera at a named angle before taking a screenshot, so the picture comes from somewhere known.", inputSchema: { type: "object", properties: { view: { ...str, enum: ["home", "top", "front", "right", "left", "up", "down", "opposite"] } }, required: ["view"] } },
  { name: "fit", description: "Frame the model in the viewport. Use when a part has grown or shrunk and is running off the edge of the view.", inputSchema: { type: "object", properties: {} } },
  { name: "screenshot", description: "A PNG of the BREPcode window as the user sees it. Take one after any change that should look different, and LOOK at it: a build can succeed and still be the wrong shape.", inputSchema: { type: "object", properties: {} } },
  { name: "save_stl", description: "Write the built model to an STL file. Fails if nothing has built yet. Ask the user before overwriting an existing file.", inputSchema: { type: "object", properties: { path: { ...str, description: "absolute path to write, ending in .stl" } }, required: ["path"] } },
];

const TEXT = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

async function runTool(name, args = {}) {
  if (name === "screenshot") {
    const r = await call("GET", "/screenshot");
    if (r.error) return TEXT(r);
    return { content: [{ type: "image", data: r.png.toString("base64"), mimeType: "image/png" }] };
  }
  if (name === "get_state") return TEXT(await call("GET", "/state"));
  if (name === "save_stl") {
    if (!args.path) return TEXT({ error: "save_stl needs a path" });
    return TEXT(await call("POST", "/command", { action: "get_stl", savePath: args.path }));
  }
  return TEXT(await call("POST", "/command", { action: name, ...args }));
}

// ---- MCP plumbing -------------------------------------------------------
// One JSON-RPC message per line on stdin, one per line on stdout. Notifications
// (no id) get no reply at all: answering one is a protocol error that some
// clients treat as a fatal handshake failure.
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
const fail = (id, message) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message } }) + "\n");

readline.createInterface({ input: process.stdin }).on("line", async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (id === undefined) return;                       // a notification
  try {
    if (method === "initialize") {
      return reply(id, {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "brepcode", version: "1.0.0" },
        instructions: INSTRUCTIONS,
      });
    }
    if (method === "tools/list") return reply(id, { tools: TOOLS });
    if (method === "tools/call") return reply(id, await runTool(params?.name, params?.arguments || {}));
    if (method === "ping") return reply(id, {});
    if (method === "resources/list") return reply(id, { resources: [] });
    if (method === "prompts/list") return reply(id, { prompts: [] });
    fail(id, `unknown method ${method}`);
  } catch (e) { fail(id, String(e?.message || e)); }
});
