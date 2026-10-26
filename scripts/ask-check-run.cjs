// "Ask about this…" in a real (offscreen) Electron window: right-click the
// model, Ask about this…, the pin and the chat chip; the built-in assistant
// drills a hole at the pin (Code mode); a connected AI (a stubbed fetch, so
// no key and no network) is sent the pinned spot and its reply edits that
// body (Design mode); get_state carries the same selection. Screenshots.
//
//   npm run serve                                       (port 5320)
//   npx electron scripts/design-check.cjs --ask [outDir]   (npm run test:ask)
//
// Loaded by design-check.cjs (the guard).

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const URL_ = process.env.BREPCODE_URL || "http://localhost:5320/viewer/";
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith("-")) || path.join(__dirname, "..", "..", "BREPcode-shots", "ask-about-this");
const W = 1600, H = 1000;
const LOG = path.join(__dirname, "..", "design-check.log");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${label}`); }
  else { fail++; say(`  FAIL  ${label}${detail ? `  — ${String(detail).slice(0, 500)}` : ""}`); }
};

app.commandLine.appendSwitch("force-device-scale-factor", "1");

const PLATE = `return difference(
  cube([40, 30, 10]),
  translate([5, 5, -1], cylinder({ r: 1, h: 12 })));`;

module.exports = app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(30);
  const run = (js) => win.webContents.executeJavaScript(js, true);
  const shot = async (name) => {
    await wait(500);
    const img = await win.webContents.capturePage();
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, img.toPNG());
    say(`  shot  ${file}`);
  };
  const mouse = async (type, x, y, button = "left") => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button, clickCount: 1 });
    await wait(40);
  };
  const click = async ([x, y]) => { await mouse("mouseMove", x, y); await mouse("mouseDown", x, y); await mouse("mouseUp", x, y); await wait(150); };
  // a right-click as the OS sends it: down, up, then the context menu event
  // (Windows raises it on release); dispatched here too in case the offscreen
  // window does not synthesise one
  const rightClick = async ([x, y], { dragTo = null } = {}) => {
    await mouse("mouseMove", x, y);
    await mouse("mouseDown", x, y, "right");
    if (dragTo) for (let i = 1; i <= 5; i++) await mouse("mouseMove", x + (dragTo[0] - x) * i / 5, y + (dragTo[1] - y) * i / 5, "right");
    const [ux, uy] = dragTo || [x, y];
    await mouse("mouseUp", ux, uy, "right");
    await wait(120);
    const open = await run(`document.getElementById("shape-menu").classList.contains("open")`);
    if (!open && !dragTo) {
      await run(`document.elementFromPoint(${ux}, ${uy}).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${ux}, clientY: ${uy}, button: 2 }))`);
    }
    await wait(250);
  };
  const codeText = () => run(`document.getElementById("code").value`);
  const builtOk = async (ms = 30000) => {
    for (let t = 0; t < ms; t += 250) {
      await wait(250);
      const st = await run(`document.getElementById("status")?.textContent || ""`);
      if (/solid/.test(st) && !/Building/.test(st)) return true;
    }
    return false;
  };
  const setCode = async (src) => {
    await run(`(() => { const c = document.getElementById("code"); c.value = ${JSON.stringify(src)};
      c.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await wait(700);
    await builtOk();
    await wait(500);
  };
  const toScreen = (p) => run(`brepscript.toScreen(${JSON.stringify(p)})`);
  const volume = () => run(`brepscript.modelVolume()`);
  const center = (sel) => run(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const send = async (text) => {
    await run(`(() => { const i = document.getElementById("chat-input"); i.value = ${JSON.stringify(text)}; i.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await click(await center("#chat-send"));
  };
  const until = async (js, ms = 20000) => {
    for (let t = 0; t < ms; t += 250) { if (await run(js).catch(() => false)) return true; await wait(250); }
    return false;
  };
  const view = (dir) => run(`(window.__brepAgent?.run({ action: "set_view", view: ${JSON.stringify(dir)} }))`);

  try {
    await win.loadURL(URL_);
    await run(`localStorage.setItem("brepcode-welcomed", "1"); localStorage.setItem("brepcode.mode", "code")`);
    await win.loadURL(URL_);
    for (let i = 0; i < 120 && !(await run("!!window.brepscript?.askAbout").catch(() => false)); i++) await wait(250);
    await wait(2500);
    await run(`document.getElementById("ai-provider").value = "builtin"; document.getElementById("ai-provider").dispatchEvent(new Event("change", { bubbles: true }))`);
    await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);
    await setCode(PLATE);
    await view("home");
    await wait(800);
    const vol0 = await volume();

    say("\nCode mode: right-click → Ask about this…");
    const top = await toScreen([20, 15, 10]);
    // a right-DRAG is a pan, and must not open the menu where it let go
    await rightClick(top, { dragTo: [top[0] + 60, top[1] + 30] });
    check("a right-drag (pan) opens no menu", !(await run(`document.getElementById("shape-menu").classList.contains("open")`)));
    await wait(600);
    check("…and moves nothing (the body drag is the left button's)", (await codeText()) === PLATE, await codeText());
    await view("home");
    await wait(600);
    await rightClick(top);
    check("a still right-click on the model opens the shape menu", await run(`document.getElementById("shape-menu").classList.contains("open")`));
    check("…with Ask about this… at the top", await run(`document.querySelector("#shape-menu .sm-item")?.id === "sm-ask"`));
    await shot("01-code-mode-right-click-menu");
    await click(await center("#sm-ask"));
    await wait(900);
    let sel = await run(`brepscript.selectionContext()`);
    check("the chat opens", await run(`document.getElementById("chat").classList.contains("open")`));
    check("the selection: the plate's top face, its point and normal", !!sel && sel.mode === "code" && sel.facing === "top"
      && Math.abs(sel.point[2] - 10) < 1e-6 && Math.abs(sel.point[0] - 20) < 0.5 && Math.abs(sel.point[1] - 15) < 0.5, JSON.stringify(sel));
    check("…the call that made it, its line and the body", sel?.call?.code === "cube([40, 30, 10])" && sel.call.line === 2 && sel.body?.name === "difference", JSON.stringify(sel?.call));
    check("…the edges around the face, by name (its four sides and the hole's rim)", sel?.edges?.length === 5 && sel.edges.every((e) => e.includes("|"))
      && sel.edges.some((e) => /CY\d+_S/.test(e)), JSON.stringify(sel?.edges));
    const pin = await run(`(() => { const p = document.getElementById("ask-pin"); const r = p.getBoundingClientRect(); return { hidden: p.hidden, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const at = await toScreen(sel.point);
    check("a pin sits on the clicked spot", !pin.hidden && Math.hypot(pin.x - at[0], pin.y - at[1]) < 3, JSON.stringify([pin, at]));
    check("the chip over the input names it", /Asking about top face of cube, line 2/.test(await run(`document.getElementById("chat-ask-chip").textContent`)));
    const gs = await run(`window.__brepAgent.run({ action: "get_state" })`);
    check("get_state.selection carries the same spot", gs.selection?.call?.code === "cube([40, 30, 10])" && gs.selection.face === sel.face && /drill/.test(gs.selection.howToEdit));
    await shot("02-code-mode-pinned");

    say("\nthe built-in assistant at the pin");
    await send("put a 5 mm hole here");
    check("the hole is written into the body's difference", await until(`document.getElementById("code").value.includes("drill([")`), await codeText());
    await builtOk();
    await wait(600);
    const c1 = await codeText();
    const drill1 = /drill\(\[([-\d.]+), ([-\d.]+), 10\], \[0, 0, 1\], \{ d: 5, through: true \}\)/.exec(c1);
    check("…as drill(point, normal, { d: 5, through: true }), one more argument line", !!drill1 && (c1.match(/difference\(/g) || []).length === 1
      && /cylinder\(\{ r: 1, h: 12 \}\)\),\n  drill\(/.test(c1), c1);
    const vol1 = await volume();
    check("…and the model lost a 5 mm through hole", Math.abs((vol0 - vol1) - Math.PI * 6.25 * 10) < 3, `${vol0} → ${vol1}`);
    check("the reply says where, and which body", /5 mm through hole at .* on the top face: .* in the difference\(\) on line 1/.test(await run(`[...document.querySelectorAll("#chat-msgs .msg")].map((m) => m.textContent).join("\\n")`)));
    check("the pin stays for a follow-up", !!(await run(`brepscript.selectionContext()`)));
    await shot("03-code-mode-hole-at-pin");

    say("\nDesign mode, a connected AI (stubbed fetch)");
    await run(`brepscript.clearSelectionContext()`);
    check("✕ / clear takes the pin and the chip away", await run(`document.getElementById("ask-pin").hidden && document.getElementById("chat-ask-chip").hidden`));
    await setCode(PLATE);
    await run(`document.querySelector('[data-mode="design"], #mode-design')?.click()`);
    if (!(await run(`document.body.classList.contains("design-mode")`))) {
      await run(`localStorage.setItem("brepcode.mode", "design")`);
      await win.loadURL(URL_);
      for (let i = 0; i < 120 && !(await run("!!window.brepscript?.askAbout").catch(() => false)); i++) await wait(250);
      await wait(2500);
      await setCode(PLATE);
    }
    check("Design mode is on", await run(`document.body.classList.contains("design-mode")`));
    // the editor card would cover the far side of the part in this window
    await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);
    await view("home");
    await wait(800);
    // the stub: whatever goes to an OpenAI-style endpoint is kept, and the
    // reply is a model that drills where the prompt said, into that body
    await run(`(() => {
      window.__askSent = [];
      const real = window.fetch;
      window.fetch = async (url, opt) => {
        const u = String(url?.url || url);
        if (!/chat\\/completions|\\/models/.test(u)) return real(url, opt);
        if (/\\/models/.test(u)) return new Response(JSON.stringify({ data: [{ id: "gpt-test" }] }), { headers: { "content-type": "application/json" } });
        const body = JSON.parse(opt.body);
        window.__askSent.push(body);
        const last = body.messages[body.messages.length - 1];
        const said = typeof last.content === "string" ? last.content : last.content.map((p) => p.text || "").join("");
        const p = /drill\\((\\[[^\\]]+\\]), (\\[[^\\]]+\\])/.exec(said.slice(said.indexOf("POINTING")));
        const code = "Here it is.\\n\\u0060\\u0060\\u0060js\\nreturn difference(\\n  cube([40, 30, 10]),\\n  translate([5, 5, -1], cylinder({ r: 1, h: 12 })),\\n  drill(" + p[1] + ", " + p[2] + ", { d: 3, depth: 6 }));\\n\\u0060\\u0060\\u0060";
        if (body.stream) {
          const sse = "data: " + JSON.stringify({ choices: [{ delta: { content: code } }] }) + "\\n\\ndata: [DONE]\\n\\n";
          return new Response(sse, { headers: { "content-type": "text/event-stream" } });
        }
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: code } }] }), { headers: { "content-type": "application/json" } });
      };
      const pv = document.getElementById("ai-provider");
      pv.value = "openai"; pv.dispatchEvent(new Event("change", { bubbles: true }));
      const k = document.getElementById("ai-key");
      k.value = "sk-test-stub"; k.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    const side = await toScreen([20, 0, 5]);
    await rightClick(side);
    check("Design mode: the same right-click menu", await run(`document.getElementById("shape-menu").classList.contains("open") && !!document.getElementById("sm-ask")`));
    await click(await center("#sm-ask"));
    await wait(900);
    sel = await run(`brepscript.selectionContext()`);
    check("…pins the front face (mode: design)", sel?.mode === "design" && sel.facing === "front (-Y)" && Math.abs(sel.point[1]) < 1e-6, JSON.stringify(sel));
    await shot("04-design-mode-pinned");
    await send("put an M3 hole here");
    check("the AI was asked", await until(`window.__askSent.length > 0`));
    const prompt = await run(`(() => { const b = window.__askSent[0]; const m = b.messages[b.messages.length - 1]; return typeof m.content === "string" ? m.content : m.content.map((p) => p.text || "").join(""); })()`);
    check("…with the pinned spot in its message", /THE USER IS POINTING AT A SPOT/.test(prompt) && /the front \(-Y\) face/.test(prompt) && prompt.includes(`face: ${sel.face}`), prompt.slice(-1500));
    check("…the call, its line, the edges and the drill to write", prompt.includes("made by the call on line 2") && prompt.includes("cube([40, 30, 10])")
      && sel.edges.every((e) => prompt.includes(JSON.stringify(e))) && /drill\(\[[-\d.]+, 0, [-\d.]+\], \[0, -1, 0\]/.test(prompt), prompt.slice(-1500));
    check("…after the user's own words", prompt.indexOf("put an M3 hole here") < prompt.indexOf("POINTING"));
    check("the reply's code lands in the editor (that body, one more drill)", await until(`document.getElementById("code").value.includes("{ d: 3, depth: 6 }")`), await codeText());
    await builtOk();
    await wait(800);
    check("…and builds", /solid/.test(await run(`document.getElementById("status").textContent`)));
    await shot("05-design-mode-ai-reply");
    await view("front");
    await wait(800);
    await shot("06-design-mode-hole-on-front");
  } catch (e) {
    check("ran to the end", false, e?.stack || e);
  } finally {
    await run(`(() => { const pv = document.getElementById("ai-provider"); pv.value = "builtin"; pv.dispatchEvent(new Event("change", { bubbles: true }));
      const k = document.getElementById("ai-key"); k.value = ""; k.dispatchEvent(new Event("input", { bubbles: true })); })()`).catch(() => {});
    say(`\n${pass} passed, ${fail} failed`);
    try { fs.appendFileSync(LOG, lines.join("\n") + "\n"); } catch { /* console has it */ }
    app.exit(fail ? 1 : 0);
  }
});
