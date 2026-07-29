// Why doesn't the build worker answer? Boots the packaged bundle and starts
// three workers of increasing ambition, so the failure is pinned to a layer:
//
//   1. plain module worker            -> is worker plumbing alive at all?
//   2. module worker + kernel import  -> does the kernel import in a worker?
//   3. the real kernel-worker.js      -> does OUR worker answer a ping?
//
//   npx electron scripts/worker-probe.cjs

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
process.env.BREPCODE_EMBED = "1";
const shellApp = require("../desktop/main.cjs");
require("../desktop/recovery.cjs").register();
require("../desktop/slicer.cjs").register();
require("../desktop/claude.cjs").register();
require("../desktop/mail.cjs").register();

const OUT = path.join(__dirname, "..", "dist-site");
const LOG = path.join(__dirname, "..", "worker-probe.log");
try { fs.writeFileSync(LOG, ""); } catch { /* best-effort */ }
const say = (l) => { console.log(l); try { fs.appendFileSync(LOG, l + "\n"); } catch { /* */ } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// The probe workers are written into the served bundle so they are same-origin
// and can use the same relative kernel path the real worker uses.
fs.writeFileSync(path.join(OUT, "probe-plain.js"),
  'self.postMessage("evaluated");\nself.onmessage = () => self.postMessage("pong-plain");\n');
fs.writeFileSync(path.join(OUT, "probe-kernel.js"), [
  'self.postMessage("evaluating");',
  'self.onmessage = () => self.postMessage("pong-kernel");',
  'import("./vendor/kernel/brep-kernel.js")',
  '  .then((m) => self.postMessage("imported PartHistory=" + typeof m.PartHistory))',
  '  .catch((e) => self.postMessage("import FAILED: " + (e && e.message)));',
].join("\n"));

app.whenReady().then(async () => {
  shellApp.serveBundle();
  const win = shellApp.createWindow();
  const run = (js) => win.webContents.executeJavaScript(js, true);
  win.webContents.on("console-message", (_e, _lvl, message, line, src) => {
    if (/\[kw\]|worker|import|failed|error/i.test(message)) say(`  page: ${message} (${src}:${line})`);
  });

  for (let i = 0; i < 120; i++) {
    try { if (await run("!!window.brepscript")) break; } catch { /* loading */ }
    await wait(500);
  }
  await wait(2000);

  const tryWorker = async (file, sendPing) => run(`(async () => {
    const out = [];
    const url = new URL(${JSON.stringify(file)}, location.href).href;
    let w;
    try { w = new Worker(url, { type: "module" }); }
    catch (e) { return { url, ctor: "THREW: " + (e && e.message) }; }
    await new Promise((done) => {
      const t = setTimeout(done, 25000);
      w.onmessage = (ev) => { out.push(String(ev.data).slice(0, 120)); if (out.length > 3) { clearTimeout(t); done(); } };
      w.onerror = (ev) => { out.push("onerror: " + [ev.message, ev.filename, ev.lineno].filter(Boolean).join(" @ ")); clearTimeout(t); done(); };
      ${sendPing ? 'setTimeout(() => w.postMessage({ id: 1, op: "ping" }), 1500);' : ""}
    });
    w.terminate();
    return { url, messages: out };
  })()`);

  say("1. plain worker:  " + JSON.stringify(await tryWorker("probe-plain.js", true)));
  say("2. kernel import: " + JSON.stringify(await tryWorker("probe-kernel.js", true)));
  say("3. real worker:   " + JSON.stringify(await tryWorker("kernel-worker.js", true)));
  say("app's own worker: " + JSON.stringify(await run("window.brepscript.workerInfo()")));

  app.exit(0);
});
