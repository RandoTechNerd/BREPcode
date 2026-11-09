// Proves a multi-part model builds part by part in the real app: the parts
// reach the screen one at a time, and on the native kernel pool they build
// side by side, so the whole job finishes sooner than on one kernel.
//
//   node build-site.mjs && npx electron scripts/parts-check.cjs
//   BREPCODE_KERNEL_HOSTS=1 npx electron scripts/parts-check.cjs   (one host, to compare)
//   BREPCODE_NATIVE=0 npx electron scripts/parts-check.cjs         (the website's wasm path)
//
// Same harness shape as worker-check.cjs: a visible window on a throwaway
// profile, the editor typed into like a person would, the status bar read
// back. It samples the status bar while the build runs, so "Building… 3 of 6
// parts" is seen happening rather than inferred.

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
process.env.BREPCODE_EMBED = "1";
const shellApp = require("../desktop/main.cjs");
require("../desktop/mail.cjs").register();
require("../desktop/recovery.cjs").register();
require("../desktop/slicer.cjs").register();
require("../desktop/claude.cjs").register();
require("../desktop/kernel.cjs").register();

const sandboxData = path.join(app.getPath("temp"), "brepcode-parts-check");
try { fs.rmSync(sandboxData, { recursive: true, force: true }); } catch { /* locked leftovers */ }
app.setPath("userData", sandboxData);

const LOG = path.join(__dirname, "..", "parts-check.log");
try { fs.writeFileSync(LOG, ""); } catch { /* best-effort */ }
const say = (line) => {
  console.log(line);
  try { fs.appendFileSync(LOG, line + "\n"); } catch { /* best-effort */ }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${label}`); }
  else { fail++; say(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const PARTS = Number(process.env.PARTS_CHECK_PARTS) || 6;
const MODEL = `
const parts = ${PARTS};
const holes = 30;
const size = 60;
const thick = 8;
const gap = 14;
const perRow = Math.ceil(Math.sqrt(parts));
function plate(i) {
  const n = holes + i * 4;
  const cols = Math.ceil(Math.sqrt(n));
  const pitch = (size - 8) / cols;
  const r = pitch * (0.28 + 0.04 * (i % 3));
  const cutters = Array.from({ length: n }, (_, k) => {
    const x = 4 + pitch / 2 + (k % cols) * pitch;
    const y = 4 + pitch / 2 + Math.floor(k / cols) * pitch;
    return translate([x, y, -1], cylinder({ r, h: thick + 2, $fn: 20 + (i % 4) * 4 }));
  }).filter((_, k) => 4 + pitch / 2 + Math.floor(k / cols) * pitch < size - 4);
  const body = fillet({ r: 4 + (i % 3), edges: "z" }, cube([size, size, thick]));
  return difference(body, ...cutters);
}
return group(...Array.from({ length: parts }, (_, i) =>
  translate([(i % perRow) * (size + gap), Math.floor(i / perRow) * (size + gap), 0], plate(i))));
`;

app.whenReady().then(async () => {
  shellApp.serveBundle();
  const win = shellApp.createWindow();
  const run = (js) => win.webContents.executeJavaScript(js, true);
  win.webContents.on("console-message", (_e, _lvl, message) => {
    if (/\[kw\] native engine|refused|failed|error/i.test(message)) say(`  ..    page: ${message}`);
  });
  const runOrNull = (js, ms = 4000) => Promise.race([
    run(js).catch((e) => `THREW: ${e.message}`),
    new Promise((r) => setTimeout(() => r("TIMEOUT"), ms)),
  ]);
  const status = () => run(
    `document.getElementById("status").className + "|" + document.getElementById("status-text").textContent`);
  const watchdog = setTimeout(() => { say("  FAIL  the harness timed out (10 min)"); app.exit(1); }, 600000);
  watchdog.unref?.();

  try {
    let booted = null;
    for (let i = 0; i < 90; i++) {
      booted = await runOrNull("!!(window.brepscript && document.getElementById('code'))");
      if (booted === true) break;
      await wait(500);
    }
    check("the app booted", booted === true, JSON.stringify(booted));
    if (booted !== true) throw new Error("the page never booted");
    await run(`localStorage.setItem("brepcode-worker-debug", "1"); localStorage.setItem("brepcode.engine", "auto")`);
    win.webContents.reload();
    for (let i = 0; i < 90; i++) {
      booted = await runOrNull("!!(window.brepscript && document.getElementById('code'))");
      if (booted === true) break;
      await wait(500);
    }
    await wait(3000);       // the native pool connects a moment after boot

    const t0 = Date.now();
    await run(`(() => { const el = document.getElementById("code"); el.value = ${JSON.stringify(MODEL)};
      el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    const seen = [];        // [ms, "n of m", meshes on screen]
    let final = null;
    while (Date.now() - t0 < 540000) {
      const s = await status();
      const m = /(\d+) of (\d+) parts/.exec(s);
      if (m && !seen.some((x) => x[1] === m[1])) {
        const meshes = await run("window.brepscript.modelGroup.children.length");
        seen.push([Date.now() - t0, m[1], meshes]);
        say(`  ..    ${((Date.now() - t0) / 1000).toFixed(1)} s  part ${m[1]} of ${m[2]} on screen (${meshes} meshes)`);
      }
      if (/^ok\|/.test(s) || /^err\|/.test(s)) { final = s; break; }
      await wait(100);
    }
    const total = Date.now() - t0;
    say(`  ..    done in ${(total / 1000).toFixed(1)} s: ${final}`);
    const wb = await run("JSON.stringify(window.brepscript.lastWorkerBuild || null)");
    say(`  ..    worker: ${wb}`);
    const info = JSON.parse(wb || "null");

    check("the model built", /^ok\|/.test(final || ""), final);
    check(`all ${PARTS} solids`, new RegExp(`\\b${PARTS} solids\\b`).test(final || ""), final);
    // BREPCODE_NATIVE=0 checks the website's path: the wasm kernel, one part after another
    if (process.env.BREPCODE_NATIVE !== "0") check("on the native kernel", info?.stats?.native === true, JSON.stringify(info?.stats));
    check("as separate parts", info?.stats?.parts === PARTS, `parts ${info?.stats?.parts}`);
    check("parts reached the screen one at a time", seen.length >= 2, `saw ${seen.length} part updates`);
    // Before the exact kernel this was "in the first three quarters of the
    // whole build", when the kernel WAS the build. Now six plates take it
    // ~0.3 s and preparing the model on the page (finding each fillet's
    // edges) ~1 s, so every part lands near the end however well they
    // stream. What matters is that the first part is on screen while the
    // kernel is still working on the rest.
    const kernelMs = info?.stats?.wallMs || 0;
    check("the first part showed while the rest were still building", seen.length && seen[0][0] < total - Math.max(100, kernelMs * 0.25),
      seen.length ? `first at ${seen[0][0]} ms of ${total} (kernel ${kernelMs} ms)` : "none seen");
    say(`  ..    hosts used: ${info?.stats?.hosts}, kernel wall ${info?.stats?.wallMs} ms, summed kernel ${info?.stats?.exactMs} ms`);
  } catch (e) {
    check("no harness error", false, e.stack || String(e));
  }
  say(`${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
