// The case builder in a real (offscreen) Electron window against the dev
// server: /case opens it, a preset fills the grid, a real mouse drag paints a
// lidded box, Build puts caseKit() in the editor and the parts on the plate.
//
//   npm run serve                      (in another terminal; port 5320)
//   npx electron scripts/casebuilder-check.cjs [outDir]
//
// Real mouse input (sendInputEvent) for the painting, so pointer capture and
// the drag rectangle are exercised the way a person's hand would.

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const URL_ = process.env.BREPCODE_URL || "http://localhost:5320/viewer/";
const OUT = process.argv[2] || path.join(__dirname, "..", "..", "BREPcode-shots", "case-builder");
const W = 1500, H = 950;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

app.commandLine.appendSwitch("force-device-scale-factor", "1");
process.on("unhandledRejection", (e) => { console.error("  FAIL  unhandled:", e); app.exit(1); });

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(30);
  const errors = [];
  // the kernel's Node-side `import("node:module")` is refused by every page
  // load, builder or not (viewer/vendor/kernel/node-module-shim.js covers it)
  win.webContents.on("console-message", (_e, level, msg) => { if (level >= 3 && !/node:module/.test(msg)) errors.push(msg); });
  const run = (js) => win.webContents.executeJavaScript(js, true);
  const shot = async (name) => {
    await wait(500);
    const img = await win.webContents.capturePage();
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, img.toPNG());
    console.log(`  shot  ${file}`);
  };
  const mouse = async (type, x, y) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
    await wait(50);
  };
  const until = async (js, ms = 30000) => {
    for (let t = 0; t < ms; t += 250) {
      try { if (await run(js)) return true; } catch { /* loading */ }
      await wait(250);
    }
    return false;
  };

  await win.loadURL(`${URL_}index.html?case=1`);
  check("/case opens the builder", await until(`!!document.getElementById("cb")`, 40000));
  check("the ?case=1 flag comes off the address", await run(`!/case=1/.test(location.search)`));
  check("the credits are on screen", await run(`/Chris Agocs/.test(document.querySelector(".cb-credit").textContent)
    && /Unemployed Architect/.test(document.querySelector(".cb-credit").textContent)`));

  // size: 160 x 110 x 60 outside -> 10 x 6 squares
  await run(`(() => { for (const [id, v] of [["cb-w", 160], ["cb-d", 110], ["cb-hh", 60]]) {
    const i = document.getElementById(id); i.value = v; i.dispatchEvent(new Event("input", { bubbles: true })); } })()`);
  const read = await run(`document.getElementById("cb-read").textContent`);
  check("160 x 110 reads as 10 x 6 squares", /10 × 6/.test(read), read);
  await run(`document.querySelector('[data-preset="small"]').click()`);
  const cells = await run(`document.querySelectorAll("#cb-grid .cb-reg").length`);
  check("a preset paints the grid", cells >= 1, `${cells} regions`);
  await shot("1-builder-preset");

  // paint a 3 x 2 lidded box with a real drag, top-left of the grid
  await run(`document.querySelector('#cb-brushes [data-k="lidbox"]').click()`);
  const g = await run(`(() => { const r = document.getElementById("cb-grid").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const cs = g.w / 10;
  await mouse("mouseMove", g.x + cs * 0.5, g.y + cs * 0.5);
  await mouse("mouseDown", g.x + cs * 0.5, g.y + cs * 0.5);
  await mouse("mouseMove", g.x + cs * 1.5, g.y + cs * 1.2);
  await mouse("mouseMove", g.x + cs * 2.5, g.y + cs * 1.5);
  await mouse("mouseUp", g.x + cs * 2.5, g.y + cs * 1.5);
  const sum = await run(`document.getElementById("cb-sum").textContent`);
  check("the drag painted one lidded box", /1 lidded box/.test(sum), sum);
  // a separator frame, one big piece, bottom-right 4 x 3
  await run(`document.querySelector('#cb-brushes [data-k="frame"]').click()`);
  await run(`document.querySelectorAll('#cb-split button')[1].click()`);
  await mouse("mouseMove", g.x + cs * 5.5, g.y + cs * 3.5);
  await mouse("mouseDown", g.x + cs * 5.5, g.y + cs * 3.5);
  await mouse("mouseMove", g.x + cs * 8.5, g.y + cs * 5.5);
  await mouse("mouseUp", g.x + cs * 8.5, g.y + cs * 5.5);
  const sum2 = await run(`document.getElementById("cb-sum").textContent`);
  check("then a separator frame", /1 separator frame/.test(sum2), sum2);
  await shot("2-builder-painted");

  await run(`document.getElementById("cb-build").click()`);
  check("Build closes the builder", await until(`!document.getElementById("cb")`, 5000));
  check("the editor holds caseKit()", await until(`/caseKit\\(/.test(document.getElementById("code").value)`, 10000));
  const ok = await until(`!!document.getElementById("cb-done")`, 180000);
  check("the parts build and the download card appears", ok);
  const status = await run(`document.getElementById("status")?.textContent || ""`);
  check("the build reports no error", !/error|fail/i.test(status), status);
  await shot("3-parts-on-plate");

  await run(`document.querySelector('#cb-done [data-a="3mf"]').click()`);
  await wait(800);
  const fmt = await run(`(() => { const m = document.querySelector("#exp-list .sel"); return (document.getElementById("export-modal")?.hidden === false || !!m) + " " + (document.getElementById("mesh-variant")?.value || ""); })()`);
  check("Download 3MF opens Export on parts laid out", /true 3mf-parts/.test(fmt), fmt);
  await shot("4-export");
  await run(`document.querySelector("[data-close], .exp-close, #exp-close")?.click?.()`);

  // the Toolbox row reopens the builder on the same layout
  await run(`document.getElementById("case-row").click()`);
  check("Toolbox > Case builder reopens it", await until(`!!document.getElementById("cb")`, 5000));
  const again = await run(`document.getElementById("cb-sum").textContent`);
  check("it reopens on the layout that was built", /1 lidded box/.test(again) && /1 separator frame/.test(again), again);

  check("no console errors", !errors.length, errors.slice(0, 3).join(" | "));
  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
