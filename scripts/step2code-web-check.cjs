// "Open as code" for a STEP file on the WEBSITE path (viewer/stepcode.js,
// the kernel worker's "step2code" op): the built site (dist-site) served over
// http in a plain window, no desktop preload. Two STEP files are made here on
// the Rust kernel (src/stepexport.js) and handed to the page's own file input:
//
//   a counterbored bracket -> every body rebuilt as code, drill() and dials
//   in the editor, the hint says so, and the code builds
//   a part nothing can rebuild -> kept as the file's own solid: importedSolid
//   in the code, its STEP registered, and the code still builds
//
// and "Import as a mesh" still opens a STEP the old way.
//
//   node build-site.mjs && npx electron scripts/step2code-web-check.cjs   (npm run test:step2codeweb)
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const SITE = path.join(ROOT, "dist-site");
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
const seen = [];
const check = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${!ok && d ? "  -- " + d : ""}`); };

const BRACKET = `return difference(union(cube([40, 30, 5]), translate([5, 5, 5], cube([30, 20, 8]))), translate([20, 15, -1], cylinder({ r: 2, h: 20 })), translate([20, 15, 10], cylinder({ r: 4, h: 5 })), translate([3, 3, -1], cylinder({ r: 1.5, h: 10 })));`;
const ODD = `return rotate([20, 30, 0], difference(cube([10, 10, 10]), translate([5, 5, 5], sphere({ r: 6.5 }))));`;

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.whenReady().then(() => server.listen(0, "127.0.0.1", async () => {
  setTimeout(() => { console.log("  FAIL  timed out"); app.exit(1); }, 300000).unref?.();
  try {
    const { runEditorCode } = await import(pathToFileURL(path.join(ROOT, "src/runcode.js")).href);
    const { build } = await import(pathToFileURL(path.join(ROOT, "src/render.js")).href);
    const { exactSTEP } = await import(pathToFileURL(path.join(ROOT, "src/stepexport.js")).href);
    const stepOf = async (src, name) => exactSTEP(await build(runEditorCode(src).shape, { engine: "split" }), name);
    const files = { bracket: await stepOf(BRACKET, "bracket"), odd: await stepOf(ODD, "odd") };

    const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { backgroundThrottling: false } });
    const run = (js) => win.webContents.executeJavaScript(js, true);
    win.webContents.on("console-message", (_e, level, msg) => { if (level >= 3 && /step2code|stepcode|step/i.test(msg)) console.log("  [page]", msg.slice(0, 300)); });
    await win.loadURL(`http://127.0.0.1:${server.address().port}/index.html`);
    for (let i = 0; i < 240; i++) { if (await run("!!(window.brepscript && document.getElementById('code'))").catch(() => false)) break; await wait(250); }
    for (let i = 0; i < 160; i++) { if (await run(`/^ok/.test(document.getElementById("status").className)`).catch(() => false)) break; await wait(250); }
    await wait(1500);
    await run(`document.getElementById("mk")?.remove(); true`);
    const status = () => run(`document.getElementById("status").className + "|" + document.getElementById("status-text").textContent`);
    const give = (name, text) => run(`(() => { const input = document.getElementById("import-file"); const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, { type: "application/step" }));
      input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    const answer = async (yes) => {
      for (let i = 0; i < 80; i++) { if (await run(`document.getElementById("yn-ask")?.classList.contains("open")`)) break; await wait(100); }
      const head = await run(`document.getElementById("yn-head")?.textContent || ""`);
      await run(`document.getElementById(${JSON.stringify(yes ? "yn-yes" : "yn-no")}).click(); true`);
      return head;
    };
    // every status the page shows on the way (a warning can be painted over
    // by the next step), so a failure says what it was
    seen.length = 0;
    const settle = async (t0, re = /^ok\|/) => {
      let s = "";
      while (Date.now() - t0 < 120000) {
        s = await status();
        if (seen[seen.length - 1] !== s) seen.push(s);
        if (Date.now() - t0 > 1500 && /^(ok|err)/.test(s)) break;
        await wait(100);
      }
      return s;
    };

    if (process.env.PROBE) console.log("  probe:", await run(`import("./viewer/stepcode.js").then(() => "imports fine", (e) => "import failed: " + e.message)`));
    // 1. the bracket: every body as code
    let t0 = Date.now();
    await give("bracket.step", files.bracket);
    const head = await answer(true);
    check("a STEP file asks to open as code", /Open bracket\.step as editable code\?/.test(head), head);
    let s = await settle(t0);
    const codeText = await run(`document.getElementById("code").value`);
    const hint = await run(`document.getElementById("hint")?.textContent || ""`);
    console.log(`  ..    opened in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    check("the code is the converter's", /^\/\/ Converted from STEP: bracket\./.test(codeText), codeText.slice(0, 200));
    check("...rebuilt, not kept", /1 of 1 body rebuilt as code/.test(codeText) && !/importedSolid/.test(codeText), (codeText.match(/kept as the file's solid \((.*)\)\./) || [, codeText])[1]);
    check("...with the counterbore as one drill()", /drill\(\[20, 15, t1 \+ t2\], \[0, 0, 1\], \{ d: holeD2, through: true, cbore: \{ d: 8, depth: 3 \} \}\)/.test(codeText), codeText);
    check("...and the small hole as another", /drill\(\[3, 3, t1\], \[0, 0, 1\], \{ d: holeD1, through: true \}\)/.test(codeText), codeText);
    check("the hint says what was rebuilt", /bracket\.step: 1 of 1 body rebuilt as code \(1 extruded\), each checked against the file/.test(hint), hint);
    check("the code builds", /^ok\|/.test(s), s);

    // 2. a body nothing can rebuild: kept as the file's solid
    t0 = Date.now();
    await give("odd.step", files.odd);
    await answer(true);
    s = await settle(t0);
    const code2 = await run(`document.getElementById("code").value`);
    const hint2 = await run(`document.getElementById("hint")?.textContent || ""`);
    check("a body with no exact rebuild is kept as an importedSolid", /return importedSolid\("odd-odd\.step"\)/.test(code2), code2);
    check("...its STEP is registered", await run(`typeof window.brepscript?.listImports === "function" ? window.brepscript.listImports().includes("odd-odd.step") : null`) !== false);
    check("...the hint says it stays the file's solid", /One stays the file's own exact solid/.test(hint2), hint2);
    check("...and the code builds", /^ok\|/.test(s), s);

    // 3. an assembly (test/fixtures/step2code-assembly.step, written by
    // test/step2code.js): one part placed twice, the second moved and turned.
    // The part is written once and each copy placed, and the worker found the
    // second copy where its placement puts it.
    t0 = Date.now();
    await give("asm.step", fs.readFileSync(path.join(ROOT, "test/fixtures/step2code-assembly.step"), "utf8"));
    await answer(true);
    s = await settle(t0);
    const code4 = await run(`document.getElementById("code").value`);
    check("an assembly: both copies rebuilt as code", /2 of 2 bodies rebuilt as code/.test(code4), code4);
    check("...the part written once, the copy moved and turned", /const cube_Part = \(\) => /.test(code4) && /translate\(\[50, 0, 0\], rotate\(\[0, 0, 90\], cube_Part\(\)\)\)/.test(code4), code4);
    check("...and it builds", /^ok\|/.test(s), s);

    // 4. "Import as a mesh": the old way
    t0 = Date.now();
    await give("bracket.step", files.bracket);
    await answer(false);
    s = await settle(t0);
    const code3 = await run(`document.getElementById("code").value`);
    check("Import as a mesh still imports it as a mesh", /importedMesh\("bracket\.step"[,)]/.test(code3) && /^ok\|/.test(s), `${s} | ${code3.slice(0, 160)}`);
  } catch (e) { check("no harness error", false, e.stack || String(e)); }
  if (fail) console.log("  statuses seen:\n    " + seen.join("\n    "));
  console.log(`${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
}));
