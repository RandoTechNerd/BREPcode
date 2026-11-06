// The filament picker, end to end on the built site (dist-site over http, a
// plain window, so the website path):
//  1. a spool picked in the Material panel on a model whose shapes have their
//     own colours asks "Change all to ...?"; Yes writes finish("spool", ...)
//     around the whole model and every piece takes it; the same spool again
//     does not ask
//  2. a generic filament after that offers to take it off; Cancel changes nothing
//  3. right-click a piece -> Filament row -> finish("spool", ...) on its call
//  4. a see-through finish() is shaded like the panel's filament (depth,
//     reflections, alpha), not as flat tinted plastic
//
//   node build-site.mjs && npx electron scripts/filament-check.cjs     (npm run test:filament)
const { app, BrowserWindow } = require("electron");
const http = require("node:http"); const fs = require("node:fs"); const path = require("node:path");
const SITE = path.join(__dirname, "..", "dist-site");
const OUT = path.join(require("node:os").tmpdir(), "brepcode-filament-check");
const MODELFILE = null;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => { const u = decodeURIComponent(new URL(req.url, "http://x").pathname); const f = path.join(SITE, u === "/" ? "index.html" : u);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${!ok && d ? "  -- " + d : ""}`); };
app.whenReady().then(() => server.listen(0, "127.0.0.1", async () => {
  setTimeout(() => { console.log("  FAIL  timed out"); app.exit(1); }, 240000).unref?.();
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1400, height: 900, show: true, x: -3000, y: 0, webPreferences: { backgroundThrottling: false } });
  const run = (js) => win.webContents.executeJavaScript(js, true);
  const shot = async (n) => { win.webContents.invalidate(); await wait(400); fs.writeFileSync(path.join(OUT, n), (await win.webContents.capturePage()).toPNG()); };
  win.webContents.on("console-message", (_e, l, m) => { if (l >= 3) console.log("  console:", m.slice(0, 200)); });
  const settle = async () => {
    await wait(700);
    for (let i = 0; i < 300; i++) { if (await run(`/^ok/.test(document.getElementById("status").className)`)) break; await wait(200); }
    await wait(600);
  };
  const mats = () => run(`JSON.stringify([...new Set((() => { const out = []; window.brepscript.modelGroup.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.userData.featureId) out.push(o.material.color.getHexString()); }); return out; })())])`).then(JSON.parse);
  const pick = (id) => run(`(() => { const s = document.getElementById("mat-filament"); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  try {
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html?kernel=nvidia`);
    for (let i = 0; i < 240; i++) { if (await run("!!(window.brepscript && document.getElementById('code'))").catch(() => false)) break; await wait(250); }
    await wait(4000);
    await run(`document.getElementById("mk")?.remove(); document.querySelector(".wl-card .wl-x")?.click(); true`);
    const model = MODELFILE ? fs.readFileSync(MODELFILE, "utf8")
      : `return group(colorize("#4caf50", cube(20)), translate([30, 0, 0], colorize("#888888", cube(20))), translate([60, 0, 0], cube(20)));`;
    await run(`(() => { const el = document.getElementById("code"); el.value = ${JSON.stringify(model)}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await settle();
    await run(`document.getElementById("mat-btn").click(); true`);
    await wait(2500);

    // 1
    await pick("ruby-red");
    await wait(500);
    const open = await run(`document.getElementById("yn-ask").classList.contains("open")`);
    const head = await run(`document.getElementById("yn-head").textContent`);
    check("a spool on a model with its own colours asks to change all", open && /Change all to Ruby Red/.test(head), head);
    await shot("ask.png");
    await run(`document.getElementById("yn-yes").click(); true`);
    await settle();
    const code1 = await run(`document.getElementById("code").value`);
    check("Yes writes finish(\"ruby-red\", ...) around the whole model", /return finish\("ruby-red", /.test(code1), code1.slice(-120));
    const m1 = await mats();
    check("...and every piece shows Ruby Red", m1.length === 1 && m1[0] === "c0182c", JSON.stringify(m1));
    await shot("all-ruby.png");
    const sh = JSON.parse(await run(`JSON.stringify((() => { let m = null; window.brepscript.modelGroup.traverse((o) => { if (!m && o.isMesh && o.userData.featureId) m = o.material; });
      return { t: m.transmission, env: !!m.envMap, op: m.opacity, thick: m.thickness }; })())`));
    check("...shaded see-through with depth and reflections", sh.t > 0 && sh.env && sh.op < 1 && sh.thick > 20, JSON.stringify(sh));
    // the same spool again: nothing to ask
    await pick("ruby-red");
    await wait(500);
    check("picking the same spool again does not ask", !(await run(`document.getElementById("yn-ask").classList.contains("open")`)));

    // 2
    await pick("opaque");
    await wait(500);
    const head2 = await run(`document.getElementById("yn-head").textContent`);
    check("a generic filament offers to take it off", await run(`document.getElementById("yn-ask").classList.contains("open")`) && /Take Ruby Red/.test(head2), head2);
    await run(`document.getElementById("yn-yes").click(); true`);
    await settle();
    const code2 = await run(`document.getElementById("code").value`);
    check("Yes takes finish() off again", !/finish\(/.test(code2), code2.slice(-120));
    // Cancel leaves the code alone
    await pick("gold-flake");
    await wait(500);
    await run(`document.getElementById("yn-no").click(); true`);
    await wait(800);
    check("Cancel leaves the code alone", (await run(`document.getElementById("code").value`)) === code2);

    if (!MODELFILE) {
      // 3: right-click the first cube
      await run(`document.getElementById("mat-close")?.click(); true`);
      const pt = await run(`(() => { const T = window.brepscript.THREE || window.THREE; const cam = window.brepscript.camera;
        const v = new T.Vector3(10, 10, 20).project(cam); const c = document.querySelector("canvas").getBoundingClientRect();
        return [c.left + (v.x + 1) / 2 * c.width, c.top + (1 - v.y) / 2 * c.height]; })()`);
      await run(`(() => { const [x, y] = ${JSON.stringify(pt)}; const el = document.elementFromPoint(x, y);
        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })); })()`);
      await wait(800);
      check("right-click opens the shape menu with a Filament row", await run(`document.getElementById("shape-menu").classList.contains("open") && !!document.getElementById("sm-filament")`));
      await wait(800);
      const nOpts = await run(`document.getElementById("sm-filament").options.length`);
      check("...listing the spools", nOpts > 5, String(nOpts));
      await shot("menu.png");
      await run(`(() => { const s = document.getElementById("sm-filament"); s.value = "gold-flake"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
      await wait(1500);
      await settle();
      const code3 = await run(`document.getElementById("code").value`);
      check("picking one writes finish(\"gold-flake\", ...) on that piece's call", /finish\("gold-flake", colorize\("#4caf50", cube\(20\)\)\)|colorize\("#4caf50", finish\("gold-flake", cube\(20\)\)\)|finish\("gold-flake", cube\(20\)\)/.test(code3), code3);
      const m3 = await mats();
      check("...and that piece turns gold", m3.some((c) => c !== "4caf50" && c !== "888888" && c !== "9fb4d6"), JSON.stringify(m3));
    }
  } catch (e) { check("no harness error", false, e.stack || String(e)); }
  console.log(`${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
}));
