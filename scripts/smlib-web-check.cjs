// Proves the WEBSITE's SMLib path, which the desktop checks never touch: the
// built site (dist-site) served over http and opened in a plain window, so
// there is no desktop preload and no native kernel, with SMLib picked. The
// PrintMotor assembly (examples/printmotor-hairpin.js, 32 parts) must build
// part by part on the SMLib helper workers (viewer/kernel-worker.js), with
// every part on SMLib and the first part on screen before the last.
//
//   node build-site.mjs && npx electron scripts/smlib-web-check.cjs     (npm run test:smlibweb)
//
// It prints the wall time and each part's kernel time, so a slow part shows.
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "dist-site");
const MODEL = fs.readFileSync(path.join(__dirname, "..", "examples", "printmotor-hairpin.js"), "utf8");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm",
  ".json": "application/json", ".css": "text/css", ".woff": "font/woff", ".woff2": "font/woff2", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const f = path.join(SITE, u === "/" ? "index.html" : u);
  if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${!ok && d ? "  -- " + d : ""}`); };

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.whenReady().then(() => server.listen(0, "127.0.0.1", async () => {
  setTimeout(() => { console.log("  FAIL  timed out"); app.exit(1); }, 300000).unref?.();
  try {
    const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { backgroundThrottling: false } });
    const run = (js) => win.webContents.executeJavaScript(js, true);
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html?kernel=nvidia`);
    for (let i = 0; i < 240; i++) { if (await run("!!(window.brepscript && document.getElementById('code'))").catch(() => false)) break; await wait(250); }
    for (let i = 0; i < 160; i++) { if (await run(`/^ok/.test(document.getElementById("status").className)`).catch(() => false)) break; await wait(250); }
    await wait(2000);                       // SMLib in, the starter model built
    check("the page has no native kernel (the website path)", await run("typeof window.brepcodeDesktop?.nativeKernelPort !== 'function'"));
    await run(`document.getElementById("mk")?.remove(); true`);
    const t0 = Date.now();
    await run(`(() => { const el = document.getElementById("code"); el.value = ${JSON.stringify(MODEL)};
      el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    let first = null, status = "";
    while (Date.now() - t0 < 240000) {
      status = await run(`document.getElementById("status").className + "|" + document.getElementById("status-text").textContent`);
      if (first == null && /of \d+ parts/.test(status)) first = Date.now() - t0;
      if (Date.now() - t0 > 1500 && /^(ok|err)\|/.test(status)) break;
      await wait(100);
    }
    const total = Date.now() - t0;
    const st = JSON.parse(await run(`JSON.stringify(window.brepscript.lastWorkerBuild?.stats || {})`));
    console.log(`  ..    ${(total / 1000).toFixed(1)} s total, first part at ${first == null ? "-" : (first / 1000).toFixed(1) + " s"}, ${st.parts} parts on ${st.hosts} helpers`);
    console.log(`  ..    part kernel ms: ${(st.pieceMs || []).join(" ")}`);
    check("the motor built", /^ok\|/.test(status), status);
    check("on SMLib's WebAssembly build", st.kernel === "nvidia" && st.wasm === true, JSON.stringify({ kernel: st.kernel, wasm: st.wasm }));
    check("every part on SMLib (nothing refused to Rust)", !st.nvidiaRefused, st.nvidiaRefused);
    check("its parts spread over more than one helper", st.hosts > 1, `hosts ${st.hosts}`);
    check("the first part reached the screen before the last", first != null && first < total, `first ${first}, total ${total}`);
  } catch (e) { check("no harness error", false, e.stack || String(e)); }
  console.log(`${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
}));
