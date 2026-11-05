// Proves an assembly works in the real app, from the GUI and over MCP:
// the PrintMotor housing + twelve coil pods (examples/printmotor-pods.js)
// builds on the native kernel pool, explodes, fit-checks (clear, then a
// deliberate clash between neighbouring pods), exports its parts, renders a
// product shot, and the Connect-your-AI buttons write a config an MCP server
// can actually be started from.
//
//   node build-site.mjs && npx electron scripts/assembly-check.cjs     (npm run test:assembly)
//
// The bridge runs on its own port (5767) and Connect writes into a throwaway
// home folder, so the BREPcode you have open and your real AI app settings
// are never touched.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

process.env.BREPCODE_EMBED = "1";
process.env.BREPCODE_AGENT = "1";
process.env.BREPCODE_AGENT_PORT = process.env.BREPCODE_AGENT_PORT || "5767";
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "brepcode-asm-home-"));
process.env.BREPCODE_AICONNECT_HOME = FAKE_HOME;

const { app, session } = require("electron");
const sandboxData = path.join(app.getPath("temp"), "brepcode-assembly-check");
try { fs.rmSync(sandboxData, { recursive: true, force: true }); } catch { /* locked leftovers */ }
app.setPath("userData", sandboxData);

const shellApp = require("../desktop/main.cjs");
const bridge = require("../desktop/bridge.cjs");
require("../desktop/kernel.cjs").register();
require("../desktop/aiconnect.cjs").register();

const ROOT = path.join(__dirname, "..");
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), "brepcode-asm-out-"));
const LOG = path.join(ROOT, "assembly-check.log");
try { fs.writeFileSync(LOG, ""); } catch { /* best-effort */ }
const say = (line) => { console.log(line); try { fs.appendFileSync(LOG, line + "\n"); } catch { /* best-effort */ } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${label}`); }
  else { fail++; say(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// An MCP client, the way Claude Desktop runs one: the server file as a child,
// JSON-RPC on its stdin/stdout.
function mcpClient(clientId) {
  const child = spawn(process.execPath, [path.join(ROOT, "agent", "mcp-server.mjs")], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", BREPCODE_CLIENT: clientId },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let buf = "", id = 0;
  const waiting = new Map();
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      try { const m = JSON.parse(line); waiting.get(m.id)?.(m); waiting.delete(m.id); } catch { /* not ours */ }
    }
  });
  const rpc = (method, params) => new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
  });
  const tool = async (name, args = {}) => {
    const r = await rpc("tools/call", { name, arguments: args });
    const content = r.result?.content || [];
    const text = content.find((c) => c.type === "text")?.text;
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { json, image: content.find((c) => c.type === "image") || null };
  };
  return { rpc, tool, kill: () => child.kill() };
}

const pngSize = (buf) => (buf.length > 24 && buf.toString("ascii", 1, 4) === "PNG" ? [buf.readUInt32BE(16), buf.readUInt32BE(20)] : null);
function stlInfo(file) {
  const b = fs.readFileSync(file);
  const n = b.readUInt32LE(80);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let t = 0; t < n; t++) {
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k < 3; k++) {
        const x = b.readFloatLE(84 + t * 50 + 12 + v * 12 + k * 4);
        if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x;
      }
    }
  }
  return { tris: n, bytesOk: b.length === 84 + n * 50, min: mn, size: mx.map((x, k) => x - mn[k]) };
}

app.whenReady().then(async () => {
  // GUI downloads land in OUT instead of a save dialog
  const downloads = [];
  session.defaultSession.on("will-download", (_e, item) => {
    const file = path.join(OUT, "gui-" + item.getFilename());
    item.setSavePath(file);
    item.once("done", (_ev, state) => downloads.push({ file, state }));
  });
  shellApp.serveBundle();
  bridge.register();
  const win = shellApp.createWindow();
  const run = (js) => win.webContents.executeJavaScript(js, true);
  const agent = (cmd) => run(`window.__brepAgent.run(${JSON.stringify(cmd)})`);
  const statusNow = () => run(`document.getElementById("status").className + "|" + document.getElementById("status-text").textContent`);
  const settle = async (ms = 300000) => {
    const t = Date.now();
    await wait(400);
    while (Date.now() - t < ms) { const s = await statusNow(); if (!/^busy\|/.test(s)) return s; await wait(250); }
    return "TIMEOUT";
  };
  // what the window looks like at a step, for a person to check by eye
  const snap = async (name) => {
    // a fresh profile opens on the "What do you want to build?" door and
    // the welcome card, over everything
    await run(`document.getElementById("mk")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      document.querySelectorAll(".wl-x").forEach((x) => x.click());`);
    await wait(500);
    await run(`document.getElementById("mk")?.remove()`);
    win.webContents.invalidate();
    await wait(400);
    try { fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG()); } catch { /* proof only */ }
  };
  const nextDownload = async (n, ms = 120000) => { const t = Date.now(); while (downloads.length < n && Date.now() - t < ms) await wait(200); return downloads[n - 1]; };
  const watchdog = setTimeout(() => { say("  FAIL  the harness timed out (15 min)"); app.exit(1); }, 15 * 60 * 1000);
  watchdog.unref?.();
  win.webContents.on("console-message", (_e, _l, msg) => { if (/error|refused|failed/i.test(msg)) say(`  ..    page: ${String(msg).slice(0, 200)}`); });

  let mcp = null;
  try {
    for (let i = 0; i < 200; i++) {
      try { if (await run("!!(window.__brepAgent && window.brepscript && window.brepscript.assembly)")) break; } catch { /* loading */ }
      await wait(250);
    }
    await settle();
    await wait(2500);                       // the native kernel pool connects a moment after boot

    // ---- build it ---------------------------------------------------------
    const SRC = fs.readFileSync(path.join(ROOT, "examples", "printmotor-pods.js"), "utf8");
    const t0 = Date.now();
    const s1 = await agent({ action: "set_code", code: SRC, name: "printmotor" });
    const buildS = (Date.now() - t0) / 1000;
    say(`  ..    built in ${buildS.toFixed(1)} s: ${s1.status?.text}`);
    const wb = JSON.parse(await run("JSON.stringify(window.brepscript.lastWorkerBuild || null)"));
    say(`  ..    worker: lane ${wb?.engine} parts ${wb?.stats?.parts} hosts ${wb?.stats?.hosts} native ${wb?.stats?.native}`);
    check("the PrintMotor assembly builds", s1.built && s1.status?.kind === "ok", `${s1.status?.kind}: ${s1.status?.text || s1.error}`);
    check("on the exact lane", s1.engine?.lane === "exact", JSON.stringify(s1.engine));
    check("13 solids: the housing and 12 pods", /\b13 solids\b/.test(s1.status?.text || ""), s1.status?.text);
    check("as separate parts, built in pieces", (wb?.stats?.parts || 0) >= 2, JSON.stringify(wb?.stats));
    check("get_state lists the two named parts", JSON.stringify(s1.assembly?.parts?.map((p) => [p.name, p.count])) === '[["housing",1],["coil_pod",12]]',
      JSON.stringify(s1.assembly));
    check("the Parts button shows for an assembly", await run(`!document.getElementById("parts-btn").hidden`));

    // ---- GUI: parts card, explode ----------------------------------------
    await run(`document.getElementById("parts-btn").click()`);
    check("the Parts card opens with both parts listed", await run(`document.getElementById("parts").classList.contains("open")
      && document.querySelectorAll("#parts-list li").length === 2`));
    const moved = await run(`(() => { const s = document.getElementById("parts-explode"); s.value = "1";
      s.dispatchEvent(new Event("input", { bubbles: true }));
      return window.brepscript.modelGroup.children.filter((m) => m.position.length() > 1).length; })()`);
    check("the explode slider moves the parts apart", moved > 12, `${moved} meshes moved`);
    const podOut = await run(`(() => { const m = window.brepscript.modelGroup.children.find((x) => x.userData.asm === 1);
      return [m.position.x, m.position.y, m.position.z].map((v) => Math.round(v)); })()`);
    check("a pod slides out along its own spoke", podOut[0] === 40 && Math.abs(podOut[2]) < 1, JSON.stringify(podOut));
    await run(`(() => { const s = document.getElementById("parts-explode"); s.value = "0"; s.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    check("and back together at 0", await run(`window.brepscript.modelGroup.children.every((m) => m.position.length() < 1e-9)`));

    // ---- GUI: switch a part off and on -------------------------------------
    const shownPods = () => run(`window.brepscript.modelGroup.children.filter((m) => m.isMesh && m.userData.asm >= 1 && m.visible).length`);
    const podsShown0 = await shownPods();
    check("every part has a show/hide box, ticked", await run(`[...document.querySelectorAll("#parts-list li")].every((li) => li.querySelector("input.vis")?.checked)`));
    await run(`(() => { const b = document.querySelectorAll("#parts-list li")[1].querySelector("input.vis"); b.click(); })()`);
    check("unticking coil_pod hides all 12 pods", (await shownPods()) === 0, `${await shownPods()} still shown`);
    check("...greys its row and keeps the housing", await run(`document.querySelectorAll("#parts-list li")[1].classList.contains("off")
      && window.brepscript.modelGroup.children.some((m) => m.userData.asm === 0 && m.visible)`));
    await run(`document.querySelectorAll("#parts-list li")[1].querySelector(".nm").click()`);
    check("clicking the name brings them back", podsShown0 > 0 && (await shownPods()) === podsShown0, `${await shownPods()} of ${podsShown0} shown`);

    // ---- touch: two-finger twist rolls the view ------------------------------
    {
      // Pointer events with pointerType "touch", the way a touchscreen's
      // fingers reach the page (CDP touch input is never acknowledged in a
      // hidden test window).
      const touch = (type, ang) => run(`(() => {
        const type = ${JSON.stringify(type)}, ang = ${ang};
        const c = document.querySelector("canvas"), r = c.getBoundingClientRect();
        const cx = r.x + r.width * 0.55, cy = r.y + r.height * 0.6;
        for (const i of [0, 1]) {
          const x = cx + Math.cos(ang + i * Math.PI) * 80, y = cy + Math.sin(ang + i * Math.PI) * 80;
          (type === "pointerdown" ? c : window).dispatchEvent(new PointerEvent(type, {
            pointerId: 70 + i, pointerType: "touch", isPrimary: i === 0, clientX: x, clientY: y, bubbles: true, buttons: type === "pointerup" ? 0 : 1 }));
        }
      })()`);
      const before = JSON.parse(await run(`JSON.stringify(window.__brepCam())`));
      await touch("pointerdown", 0);
      for (let k = 1; k <= 12; k++) { await touch("pointermove", k * 0.06); await wait(16); }
      await touch("pointerup", 0.72);
      await wait(200);
      const after = JSON.parse(await run(`JSON.stringify(window.__brepCam())`));
      const look = (c) => { const v = c.target.map((t, i) => t - c.pos[i]); const l = Math.hypot(...v); return v.map((x) => x / l); };
      const lb = look(before), la = look(after);
      const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const roll = Math.acos(Math.min(1, Math.max(-1, dot(before.up, after.up)))) * 180 / Math.PI;
      say(`  ..    twist: up turned ${roll.toFixed(1)} deg, view direction kept ${dot(lb, la).toFixed(4)}`);
      check("a two-finger twist turns the part in the screen plane", roll > 25 && roll < 60 && dot(lb, la) > 0.999, `roll ${roll}`);
      await run(`window.brepscript.snapView?.("home") ?? document.querySelector('[data-view="home"]')?.click()`).catch(() => {});
    }

    // ---- GUI: check fit ---------------------------------------------------
    await run(`document.getElementById("parts-fit").click()`);
    const sf = await settle();
    const fitText = await run(`document.getElementById("parts-out").textContent`);
    say(`  ..    GUI fit: ${sf} / ${fitText}`);
    check("GUI Check fit: clear", /Fit is clear/.test(fitText), fitText);

    // ---- MCP --------------------------------------------------------------
    mcp = mcpClient("claude-desktop");
    const init = await mcp.rpc("initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "claude-ai", version: "test" } });
    check("MCP server starts on this app's own runtime (no Node needed)", !!init.result?.serverInfo, JSON.stringify(init).slice(0, 200));
    const tools = (await mcp.rpc("tools/list", {})).result?.tools?.map((t) => t.name) || [];
    check("MCP offers check_fit, export_parts, render, explode", ["check_fit", "export_parts", "render", "explode"].every((t) => tools.includes(t)), tools.join());

    const f1 = (await mcp.tool("check_fit")).json;
    say(`  ..    MCP fit: clear ${f1?.clear}, ${f1?.pairsChecked}/${f1?.pairsTotal} pairs, ${f1?.clashes?.length} clashes`);
    check("MCP check_fit: clear", f1?.clear === true && f1.parts === 13, JSON.stringify(f1).slice(0, 300));
    check("...after really testing the neighbouring pods", f1?.pairsChecked >= 24, `${f1?.pairsChecked} pairs`);

    const dir = path.join(OUT, "mcp-parts");
    const ex = (await mcp.tool("export_parts", { path: dir })).json;
    say(`  ..    export: ${JSON.stringify(ex?.files)} step=${ex?.step} skipped=${JSON.stringify(ex?.skipped)}`);
    check("MCP export_parts wrote the folder", ex?.saved === dir && fs.existsSync(path.join(dir, "parts.csv")), JSON.stringify(ex).slice(0, 300));
    const csv = fs.existsSync(path.join(dir, "parts.csv")) ? fs.readFileSync(path.join(dir, "parts.csv"), "utf8") : "";
    check("parts.csv: housing ×1, coil_pod ×12", /\nhousing,1,/.test(csv) && /\ncoil_pod,12,/.test(csv), csv);
    for (const n of ["housing", "coil_pod"]) {
      const f = path.join(dir, `${n}.stl`);
      const info = fs.existsSync(f) ? stlInfo(f) : null;
      check(`${n}.stl is a whole binary STL on the bed`, info && info.bytesOk && Math.abs(info.min[2]) < 1e-3,
        info ? `min z ${info.min[2]}, ${info.tris} tris` : "missing");
      if (n === "coil_pod" && info) {
        check("the pod prints flat: 21.7 × 52.5 × 18 mm", Math.abs(info.size[0] - 21.7) < 0.05 && Math.abs(info.size[1] - 52.5) < 0.05
          && Math.abs(info.size[2] - 18) < 0.05, info.size.map((v) => v.toFixed(2)).join(" × "));
      }
      if (n === "housing" && info) check("the housing is 132 × 132 × 70 mm", Math.abs(info.size[2] - 70) < 0.05 && Math.abs(info.size[0] - 132) < 0.1, info.size.join());
    }
    check("exact lane: a STEP per part", ex?.step === true && ["housing", "coil_pod"].every((n) => fs.existsSync(path.join(dir, `${n}.step`))
      && /^ISO-10303-21/.test(fs.readFileSync(path.join(dir, `${n}.step`), "utf8"))), JSON.stringify(ex?.skipped));
    const zipPath = path.join(OUT, "mcp-parts.zip");
    const exz = (await mcp.tool("export_parts", { path: zipPath, step: false })).json;
    const zb = fs.existsSync(zipPath) ? fs.readFileSync(zipPath) : Buffer.alloc(0);
    check("...or a .zip of the same", exz?.saved === zipPath && zb.readUInt32LE(0) === 0x04034b50 && zb.includes("coil_pod.stl"), JSON.stringify(exz).slice(0, 200));

    const shot = path.join(OUT, "mcp-shot.png");
    const r1 = await mcp.tool("render", { preset: "studio", width: 1200, height: 900, savePath: shot });
    check("MCP render returns the PNG as an image", r1.image?.mimeType === "image/png" && r1.image.data.length > 1000);
    check("...and saved it", fs.existsSync(shot) && JSON.stringify(pngSize(fs.readFileSync(shot))) === "[1200,900]");
    const cut = path.join(OUT, "mcp-cutaway.png");
    await mcp.tool("render", { preset: "metal", cutaway: true, explode: 0.4, savePath: cut });
    check("a metal cutaway renders too", fs.existsSync(cut) && fs.statSync(cut).size > 10000);
    // white studio background: the corner pixel is white
    const corner = await run(`(async () => { const r = await window.__brepAgent.run({ action: "render", width: 200, height: 150 });
      const img = new Image(); img.src = "data:image/png;base64," + r.png; await img.decode();
      const c = document.createElement("canvas"); c.width = 200; c.height = 150; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      return Array.from(g.getImageData(2, 2, 1, 1).data); })()`);
    check("the shot is on a white background", corner[0] > 245 && corner[1] > 245 && corner[2] > 245, JSON.stringify(corner));
    const ex2 = (await mcp.tool("explode", { amount: 0.5 })).json;
    check("MCP explode moves the view", ex2?.explode === 0.5 && (await run(`window.brepscript.assembly.explode`)) === 0.5);
    await mcp.tool("explode", { amount: 0 });

    // ---- a real clash -------------------------------------------------------
    const e1 = (await mcp.tool("edit_code", { edits: [{ old: "const podClear = 0.35;", new: "const podClear = -1.2;" }] })).json;
    check("pods made too wide still build", e1?.built && e1.status?.kind === "ok", `${e1?.status?.kind}: ${e1?.status?.text || e1?.error}`);
    const f2 = (await mcp.tool("check_fit")).json;
    const c0 = f2?.clashes?.[0];
    say(`  ..    clash fit: ${f2?.clashes?.length} clashes, total ${f2?.totalOverlap} mm³, first ${c0 && `${c0.a} ↔ ${c0.b} ${c0.volume}`}`);
    check("check_fit finds the twelve neighbour clashes", f2?.clashes?.length === 12, `${f2?.clashes?.length}`);
    check("...named by part, with a volume in mm³", /^coil_pod #\d+$/.test(c0?.a || "") && /^coil_pod #\d+$/.test(c0?.b || "") && c0.volume > 0.5, JSON.stringify(c0));
    check("...and painted red on the model", (await run(`window.brepscript.assembly.clashMeshes`)) === 12);
    await snap("clash-view.png");
    await mcp.tool("edit_code", { edits: [{ old: "const podClear = -1.2;", new: "const podClear = 0.35;" }] });
    check("putting it back clears the paint", (await run(`window.brepscript.assembly.clashMeshes`)) === 0);

    // ---- GUI: export + product shot ----------------------------------------
    await run(`document.getElementById("parts-export").click()`);
    const d1 = await nextDownload(1, 300000);
    const gz = d1 ? fs.readFileSync(d1.file) : Buffer.alloc(0);
    check("GUI Export parts downloads a zip with every part", d1?.state === "completed" && /-parts\.zip$/.test(d1.file)
      && gz.includes("housing.stl") && gz.includes("coil_pod.stl") && gz.includes("parts.csv"), JSON.stringify(d1));
    await run(`document.getElementById("parts-cutaway").checked = true; document.getElementById("parts-preset").value = "copper";
      document.getElementById("parts-shot").click()`);
    const d2 = await nextDownload(2);
    check("GUI Product shot downloads a PNG", d2?.state === "completed" && !!pngSize(fs.readFileSync(d2.file)), JSON.stringify(d2));

    // ---- Connect your AI ----------------------------------------------------
    // the MCP server above said hello as claude-desktop; set it up through the
    // Settings button and it should read as connected
    await run(`document.getElementById("about-btn").click()`);
    await run(`window.brepscript.paintAiConnect()`);
    await wait(500);
    check("Settings lists the four AI apps", await run(`document.querySelectorAll("#set-ai-rows .ai-row[data-ai]").length`) === 4);
    for (const id of ["claude-desktop", "claude-code", "cursor", "vscode"]) {
      await run(`document.querySelector('#set-ai-rows .ai-row[data-ai="${id}"] .ai-go').click()`);
      await wait(700);
    }
    const st = await run(`window.brepcodeDesktop.aiStatus()`);
    say(`  ..    connect: ${st.clients.map((c) => `${c.id}=${c.state}`).join(", ")}`);
    check("all four are set up", st.clients.every((c) => c.configured), JSON.stringify(st.clients.map((c) => [c.id, c.state, c.problem])));
    check("Claude Desktop shows connected (its MCP server is running)", st.clients.find((c) => c.id === "claude-desktop")?.connected === true);
    check("the dot turns green", await run(`!!document.querySelector('#set-ai-rows .ai-row[data-ai="claude-desktop"] .ai-dot.live')`));
    await run(`document.getElementById("set-ai").scrollIntoView()`);
    await snap("connect-view.png");
    // each written config really starts a server that reaches this app
    for (const c of st.clients) {
      const cfg = JSON.parse(fs.readFileSync(c.file, "utf8"));
      const e = (cfg.mcpServers || cfg.servers).brepcode;
      const out = await new Promise((resolve) => {
        const ch = spawn(e.command, e.args, { env: { ...process.env, ...e.env }, stdio: ["pipe", "pipe", "ignore"] });
        let got = "";
        ch.stdout.on("data", (d) => { got += d; if (got.includes("\n")) { ch.kill(); resolve(got); } });
        setTimeout(() => { ch.kill(); resolve(got); }, 15000);
        ch.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_state", arguments: {} } }) + "\n");
      });
      check(`${c.label}'s config starts a server that reaches the app`, /coil_pod/.test(out), out.slice(0, 160));
    }
  } catch (e) {
    check("no harness error", false, e.stack || String(e));
  }
  mcp?.kill();
  say(`  ..    outputs in ${OUT}`);
  say(`${pass} passed, ${fail} failed`);
  try { fs.rmSync(FAKE_HOME, { recursive: true, force: true }); } catch { /* fine */ }
  app.exit(fail ? 1 : 0);
});
