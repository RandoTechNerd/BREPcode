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
const LONG = new Set(["set_code", "edit_code", "build", "set_param", "save_stl", "catalog_find", "check_fit", "export_parts", "render"]);

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
2. Two ways to change the code. edit_code makes targeted find-and-replace edits to the code that is there now and builds it: use it for any change to an existing model (a size, a hole, a fillet, one more part), quoting each "old" exactly as get_state showed it, with enough surrounding lines that it matches once. set_code replaces the whole editor: keep it for a new model or a rewrite that touches most of the file. Both return the result. Read status.kind: "err" means it did NOT build and status.text is the kernel's complaint. Fix it (an edit_code on the broken line is usually enough) rather than reporting success. If edit_code refuses because an "old" did not match, call get_state and quote the code as it is now.
3. Take a screenshot after a change that should look different. You are describing a picture they can already see, so say what happened in plain language; they cannot see your tool calls.
4. edit_code and set_code push onto their undo stack, so they can Ctrl+Z anything you do. Small steps beat one big rewrite: they get to keep the good half.
5. Language: BREPcode's own DSL, OpenSCAD and JSCAD all work, the editor auto-detects. Units are millimetres. Prefer named parameters at the top of the file: they become sliders in the app, and set_param turns them without rewriting the text.
6. Before a screenshot, set_view to a named angle (home, top, front, right, left, up, down, opposite) so the picture comes from somewhere known rather than wherever the camera was left.
7. save_stl writes the built mesh to a path you choose. Ask before overwriting a file that already exists.
8. The app has a CATALOG of 200+ tested, printable designs (phone stands, hooks, clips, boxes, planters, …), each with every size a slider. For a request that sounds like a real thing ("a phone stand for my iPhone 16", "a hook for my yoga mat", "a cable clip for 3 cables") call catalog_find FIRST, with apply: true to put it on screen; write the part yourself with set_code only when it says found: false. A catalog model's code starts with a header line ("From the BREPcode catalog: <id>.") and const dials: keep those lines when you edit it, so the user's own chat follow-ups ("wider", "for a Pixel 9") keep working. catalog_list shows what is covered.
9. Build EXACT. get_state.engine.lane says which kernel built the model: "exact" is the fast Rust B-rep kernel (true curves, STEP-clean), "mesh" means a hull/roundedGrow/tube/texture step turned it into triangles (hull({ exact: true }, ...) stays exact over equal corner cylinders, coaxial discs, 2 or 8 equal spheres or a few flat-sided pieces), "js" means the exact kernel refused a step and the slow fallback built it. Prefer exact constructions: a rounded box is fillet({ r, edges: "z" }, cube([x, y, z])), a rounded-off cylinder fillets its top rim then its bottom rim, a taper is cylinder({ r1, r2 }), never a hole down a revolve() axis (use cones), overlapping cutters one difference() at a time. Exact solids cost per FACE, so curves stay curves: an arc between two radii is a ring intersected with two rotated box corners, a curved outline is path2d with bezierTo (6 curves per side is plenty), never a polygon of 20+ sampled points (12 such windows took 44 s, as true arcs 4 s). Build fast first. Slower, finer forms (dense outlines, polyhedron, a mesh verb for an organic surface) are only for a revision the user explicitly asks to be finer or a closer match: change only the part they named, put the fineness in a const dial, and tell them roughly what it adds to the build time. When get_state.exactAdvice is set, the model left the exact lane for an avoidable reason: rewrite it as that says, keeping every size.
10. "Ask about this": when get_state.selection is set, the user right-clicked a spot on the model to talk about it. "Here", "this", "this face" mean that spot: selection.point and .normal (world mm, normal pointing out), .face, .edges (the names fillet()/chamfer() take), .call (the call that made it, with its line and exact text) and .body (its body's outermost call). Edit that call or body, not the whole model: a hole there is drill(point, normal, { d, depth | through: true }) added as one more argument of the body's difference(), rounding the face is fillet({ r, edges }, body).

11. A machine of several printed parts is an ASSEMBLY, not one shape: return assembly({ pod: { shape, color, count: 12, place: polar(12, { at: [45, 0, 28], rotate: [90, 0, 90] }) }, housing: { shape, color, print: "flip" } }). List the parts INSIDE OUT, shaft and core first, housing and lid last: they build onto the screen in that order, and the order never changes the build time. Model each part in the frame it PRINTS in; place moves its copies to where they sit in the machine (polar(n, …), a function (shape, i) => translate(…, rotate(…, shape)), or { translate, rotate }); print turns it for the bed ("asis", "flip", "side", "placed" or [rx, ry, rz]). get_state.assembly lists the parts. Then check_fit (every pair of parts intersected, overlaps in mm³ by name, painted red on screen: fix them before printing), export_parts (one STL per part in print pose on the bed + parts.csv, STEP per part when the exact lane built it) and render (a white-studio product shot PNG, metal/copper/matte, optional cutaway). explode slides the parts apart on screen.

If a tool says BREPcode is not reachable, the app is almost certainly just closed. Ask them to open it; do not keep retrying.`;

const str = { type: "string" }, num = { type: "number" };

const TOOLS = [
  { name: "get_state", description: "What is in the BREPcode window right now: the editor's code, the model name, the build status and its message, the model's size in mm, the named parameters with their values, and selection: the spot the user right-clicked to ask about (point, normal, face, edges, the call that made it and its body), or null. Call this first, and again after the user may have typed.", inputSchema: { type: "object", properties: {} } },
  { name: "set_code", description: "Replace the editor's contents and build it. This is the main tool: the model on the user's screen changes as it runs. Returns the same fields as get_state, so check status.kind, where 'err' means the build FAILED and status.text says why. Goes through the app's own undo stack, so the user can Ctrl+Z it.", inputSchema: { type: "object", properties: { code: { ...str, description: "the complete new source: BREPcode DSL, OpenSCAD or JSCAD, millimetres" }, name: { ...str, description: "optional model name, used for exported filenames" } }, required: ["code"] } },
  { name: "edit_code", description: "Change part of the editor's code without rewriting it: one or more exact find-and-replace edits, applied in order, then a build. Prefer this to set_code for any change to an existing model. Each 'old' must match the current code EXACTLY ONCE (whitespace included); if one matches zero or several times, nothing is changed and the error says which edit and why, so call get_state and quote the code as it is now. Returns the same fields as get_state plus edited (how many edits applied); status.kind 'err' means the build FAILED. Goes through the app's own undo stack, so the user can Ctrl+Z it.", inputSchema: { type: "object", properties: { edits: { type: "array", minItems: 1, description: "the replacements, applied in order, each against the result of the one before", items: { type: "object", properties: { old: { ...str, description: "exact text currently in the editor, with enough surrounding lines to be unique" }, new: { ...str, description: "what replaces it (empty string deletes it)" } }, required: ["old", "new"] } }, name: { ...str, description: "optional new model name" } }, required: ["edits"] } },
  { name: "build", description: "Rebuild whatever is in the editor now, without changing it. Use after the user says they have edited the code themselves.", inputSchema: { type: "object", properties: {} } },
  { name: "set_param", description: "Turn one of the model's named parameters, the same sliders the user sees, and rebuild. Cheaper and less disruptive than rewriting the source for a dimension change.", inputSchema: { type: "object", properties: { name: { ...str, description: "the parameter name from get_state.params" }, value: { description: "the new value" }, index: { ...num, description: "for a vector parameter, which component" } }, required: ["name", "value"] } },
  { name: "set_view", description: "Point the camera at a named angle before taking a screenshot, so the picture comes from somewhere known.", inputSchema: { type: "object", properties: { view: { ...str, enum: ["home", "top", "front", "right", "left", "up", "down", "opposite"] } }, required: ["view"] } },
  { name: "fit", description: "Frame the model in the viewport. Use when a part has grown or shrunk and is running off the edge of the view.", inputSchema: { type: "object", properties: {} } },
  { name: "screenshot", description: "A PNG of the BREPcode window as the user sees it. Take one after any change that should look different, and LOOK at it: a build can succeed and still be the wrong shape.", inputSchema: { type: "object", properties: {} } },
  { name: "save_stl", description: "Write the built model to an STL file. Fails if nothing has built yet. Ask the user before overwriting an existing file.", inputSchema: { type: "object", properties: { path: { ...str, description: "absolute path to write, ending in .stl" } }, required: ["path"] } },
  { name: "catalog_find", description: "Ask the app's catalog of 200+ tested, printable designs for a plain-words request ('a phone stand for my iPhone 16', 'a hook for my yoga mat', 'a cable clip for 3 cables'). Returns found:true with the family, title, what it was sized for, a question to relay if one is open, the dial values and the code; or found:false with suggestions. With apply:true the design is put on screen (undoable) and the state comes back. Call this BEFORE writing a common thing yourself with set_code.", inputSchema: { type: "object", properties: { text: { ...str, description: "the user's request, in their words" }, apply: { type: "boolean", description: "put the design on screen now (default false)" } }, required: ["text"] } },
  { name: "check_fit", description: "For an assembly() model: intersect every pair of assembled parts and report each overlap with both part names and its volume in mm³ (and where it is), largest first. The clashes are painted red in the user's view. clear:true means nothing overlaps. Run it after any change to an assembly and fix every clash before export_parts.", inputSchema: { type: "object", properties: { minVolume: { ...num, description: "ignore overlaps smaller than this many mm³ (default 0.01)" } } } },
  { name: "export_parts", description: "For an assembly() model: write one binary STL per part (not per copy) in its print orientation, centred on the bed with its lowest point at z=0, plus parts.csv (name, quantity, bounding box, volume, print setting). When the exact kernel built the model it also writes a true-curve STEP per part (step: true forces it, false skips it). path is a folder, or a file ending in .zip; without one it goes to Documents/BREPcode/<model>-parts. Existing files of the same name in that folder are replaced: ask first.", inputSchema: { type: "object", properties: { path: { ...str, description: "absolute folder path, or an absolute path ending in .zip" }, step: { description: "\"auto\" (default), true or false" } } } },
  { name: "render", description: "A product shot of what is on screen: the assembled view (or the exploded one) re-lit on a white studio background with a soft floor shadow, returned as a PNG and optionally saved. preset: studio (each part's own finish from assembly(), else matte in its colour), metal, copper or matte for every part. cutaway: true cuts a 90° wedge out of the side facing the camera and shows the cut faces in red. Set the camera first with set_view.", inputSchema: { type: "object", properties: { preset: { ...str, enum: ["studio", "metal", "copper", "matte"] }, cutaway: { type: "boolean" }, width: { ...num, description: "pixels, default 1600" }, height: { ...num, description: "pixels, default 1200" }, view: { ...str, enum: ["home", "top", "front", "right", "left", "up", "down", "opposite"] }, explode: { ...num, description: "0..1, explode for this shot only" }, savePath: { ...str, description: "optional absolute path ending in .png" } } } },
  { name: "explode", description: "For an assembly() model: slide its parts apart on screen, 0 (assembled) to 1 (fully exploded). Each copy moves away from the middle, or along the explode vector its part was given in assembly().", inputSchema: { type: "object", properties: { amount: { ...num, description: "0..1" } }, required: ["amount"] } },
  { name: "catalog_list", description: "What the catalog covers: every family's id, title, names and example requests, or one category's (desk, wall, storage, kitchen, bathroom, garage, garden, electronics, home, fitness, gaming, pets, travel, kids, printer, vehicle, decor, access).", inputSchema: { type: "object", properties: { category: { ...str, description: "optional category id" } } } },
];

const TEXT = (v) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });

async function runTool(name, args = {}) {
  if (name === "screenshot") {
    const r = await call("GET", "/screenshot");
    if (r.error) return TEXT(r);
    return { content: [{ type: "image", data: r.png.toString("base64"), mimeType: "image/png" }] };
  }
  if (name === "get_state") return TEXT(await call("GET", "/state"));
  if (name === "render") {
    const r = await call("POST", "/command", { action: "render", ...args });
    if (r.error || !r.png) return TEXT(r);
    const { png, ...info } = r;
    return { content: [{ type: "image", data: png, mimeType: "image/png" }, { type: "text", text: JSON.stringify(info) }] };
  }
  if (name === "save_stl") {
    if (!args.path) return TEXT({ error: "save_stl needs a path" });
    return TEXT(await call("POST", "/command", { action: "get_stl", savePath: args.path }));
  }
  return TEXT(await call("POST", "/command", { action: name, ...args }));
}

// ---- who is connected ----------------------------------------------------
// Settings > Connect your AI in the app shows which AI apps are talking to
// it. Each config the app writes names its client in BREPCODE_CLIENT; a
// hand-written one is guessed from the client's own name. Said on connect
// and every 20 s after, quietly: the app being closed is not an error here.
const CLIENT = process.env.BREPCODE_CLIENT || "";
let clientInfo = null;
function guessClient(info) {
  const n = String(info?.name || "").toLowerCase();
  if (/claude-code|claude code/.test(n)) return "claude-code";
  if (/claude/.test(n)) return "claude-desktop";
  if (/cursor/.test(n)) return "cursor";
  if (/visual studio code|vscode|copilot/.test(n)) return "vscode";
  return n.replace(/[^a-z0-9-]+/g, "-").slice(0, 40) || "unknown";
}
function hello(info) {
  if (info) clientInfo = info;
  const body = JSON.stringify({ client: CLIENT || guessClient(clientInfo), name: clientInfo?.name || "", version: clientInfo?.version || "" });
  const req = http.request(`${BRIDGE}/hello`, { method: "POST", headers: { "Content-Type": "application/json" }, timeout: 3000 }, (res) => res.resume());
  req.on("error", () => {});
  req.on("timeout", () => req.destroy());
  req.end(body);
}
setInterval(() => { if (clientInfo) hello(); }, 20000).unref();

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
      hello(params?.clientInfo);
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
