// Design mode phase 2 in a real (offscreen) Electron window: every feature
// dialog, press-pull and the rotate/scale gizmo against the dev server, with
// the code each one writes checked and a screenshot of each.
//
//   npm run serve                                   (port 5320)
//   npx electron scripts/design-check.cjs --phase2 [outDir]   (npm run test:design2)
//
// Loaded by design-check.cjs (the guard: a failure prints and exits 1, never
// Electron's modal error dialog).

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const URL_ = process.env.BREPCODE_URL || "http://localhost:5320/viewer/";
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith("-")) || path.join(__dirname, "..", "..", "BREPcode-shots", "design-phase2");
const W = 1600, H = 1000;
const LOG = path.join(__dirname, "..", "design-check.log");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${label}`); }
  else { fail++; say(`  FAIL  ${label}${detail ? `  — ${String(detail).slice(0, 400)}` : ""}`); }
};

const PLATE = `const w = 60;
return difference(
  union(
    cube([w, 40, 8], { id: "base" }),
    translate([10, 10, 8], cube([15, 20, 6]))),
  translate([45, 20, -1], cylinder({ r: 5, h: 10 })));`;

app.commandLine.appendSwitch("force-device-scale-factor", "1");

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
  const mouse = async (type, x, y, { modifiers = [], clickCount = 1 } = {}) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: "left", clickCount, modifiers });
    await wait(40);
  };
  const codeText = () => run(`document.getElementById("code").value`);
  const setCode = async (src) => {
    await run(`(() => { const c = document.getElementById("code"); c.value = ${JSON.stringify(src)};
      c.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    for (let t = 0; t < 30000; t += 250) {
      await wait(250);
      if (await run(`!!brepscript.featureSites?.() && /solid/.test(document.getElementById("status")?.textContent || "")`)) break;
    }
    await wait(600);
  };
  const toScreen = (p) => run(`brepscript.toScreen(${JSON.stringify(p)})`);
  // a click on the model at a world point, as the open dialog takes it
  const pickWorld = async (p) => { const [x, y] = await toScreen(p); await mouse("mouseMove", x, y); await mouse("mouseDown", x, y); await mouse("mouseUp", x, y); await wait(150); };
  const dlg = () => run(`brepscript.featureDialog()?.debug() ?? null`);
  const settle = async (ms = 25000) => {
    await wait(450);                     // past the dialog's preview debounce
    for (let t = 0; t < ms; t += 250) {
      await wait(250);
      const d = await dlg();
      if (!d || (d.ok !== null || /Click|Select|Pick/.test(d.status))) return d;
    }
    return dlg();
  };
  const set = (k, v) => run(`brepscript.featureDialog().set(${JSON.stringify(k)}, ${JSON.stringify(v)})`);
  const open = async (id) => { await run(`brepscript.openFeature(${JSON.stringify(id)})`); await wait(400); };
  const okBtn = async () => { await run(`document.querySelector("#dz-dlg .ok").click()`); await wait(1500); };
  const selectRow = async (name) => {
    await run(`[...document.querySelectorAll(".dz-row")].find((b) => b.querySelector(".dz-name").textContent === ${JSON.stringify(name)})?.click()`);
    await wait(400);
  };
  const histLen = () => run(`document.getElementById("undo-btn").disabled ? 0 : 1`);

  try {
    await win.loadURL(URL_);
    await run(`localStorage.setItem("brepcode-welcomed", "1"); localStorage.setItem("brepcode.mode", "design"); localStorage.setItem("brepcode.ribbon", "1")`);
    await win.loadURL(URL_);
    for (let i = 0; i < 120 && !(await run("!!window.brepscript?.openFeature").catch(() => false)); i++) await wait(250);
    await wait(2500);
    await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);

    say("\nreview fixes");
    await setCode(PLATE);
    await selectRow("cube");
    check("(a) a pick in Design mode leaves the code card closed", !(await run(`document.getElementById("panel").classList.contains("open")`)));
    check("(b) the hint speaks of dots, arrows, Alt-drag and double-click",
      /face dot[\s\S]*Alt-drag[\s\S]*double-click/.test(await run(`document.getElementById("hint").textContent`)));
    const gh = (await run(`brepscript.design()`)).gizmoHandles;
    check("(c) the move gizmo is arrows only (no centre square or plane squares)", gh && gh.translate.every((n) => ["X", "Y", "Z"].includes(n)), JSON.stringify(gh));
    await shot("00-ribbon-and-move-gizmo");

    say("\nfillet: edges picked on the model");
    const before = await codeText();
    await open("fillet");
    await pickWorld([30, 0.6, 8]);       // the base's top front edge
    await settle();
    await pickWorld([59.4, 22, 8]);      // its top right edge
    let d = await settle();
    check("two edges picked, by name", d.state.edges.length === 2 && d.state.edges.every((e) => /\|/.test(e.name)), JSON.stringify(d.state.edges));
    check("the preview wrote one fillet() around the body and built", d.ok === true && /^return fillet\(\{ r: 2, edges: \["P\.CU1_[A-Z]+\|P\.CU1_[A-Z]+\[0\]", "P\.CU1_[A-Z]+\|P\.CU1_[A-Z]+\[0\]"\] \}, difference\(/m.test(d.text), d.text);
    check("…and the timeline shows the Fillet step", await run(`[...document.querySelectorAll(".dt-step")].some((b) => /Fillet/.test(b.textContent))`));
    await set("amount", 3);
    d = await settle();
    check("changing the radius rebuilds the preview", /r: 3,/.test(d.text) && d.ok === true, d.text);
    await shot("01-fillet-dialog");
    await okBtn();
    const afterFillet = await codeText();
    check("OK keeps it: the code has the fillet", /fillet\(\{ r: 3, edges: \[/.test(afterFillet) && afterFillet !== before);
    await run(`document.getElementById("undo-btn").click()`);
    await wait(1500);
    check("one Ctrl+Z takes it back exactly", (await codeText()) === before);
    await run(`document.getElementById("redo-btn").click()`);
    await wait(1500);

    say("\nreview repro: a second click on an edge whose fillet is previewing");
    await setCode(`return difference(cube([30, 30, 12]), translate([15, 15, -1], cylinder({ r: 5, h: 14 })));`);
    await open("fillet");
    await pickWorld([15, 0.5, 12]);         // the top front edge
    d = await settle();
    check("first click: the top front edge, previewed", d.ok === true && d.state.edges.length === 1 && d.state.edges[0].name === "P.CU1_NY|P.CU1_PZ[0]", JSON.stringify(d.state.edges));
    await pickWorld([15, 0.59, 11.41]);     // same place: now the preview's rounded face (45° on r 2)
    d = await settle();
    check("second click on the preview's round: that edge toggles off, no blend-face name picked", d.state.edges.length === 0, JSON.stringify(d.state.edges));
    check("…through the preview-face path (its round mapped back to the edge), nothing failed", d.lastPick?.preview === true && !/refused/.test(d.status), JSON.stringify(d.lastPick));
    await pickWorld([15, 0.5, 12]);
    await set("amount", 2);
    d = await settle();
    check("…pick it again: back to one edge, built", d.ok === true && d.state.edges.length === 1, JSON.stringify(d));
    await run(`brepscript.featureDialog().cancel()`);
    await wait(1500);

    say("\nchamfer: Cancel restores the text");
    const pre = await codeText();
    await open("chamfer");
    await pickWorld([30, 39.4, 8]);
    d = await settle();
    check("chamfer previews", d.ok === true && /chamfer\(\{ d: 1, edges:/.test(d.text), d.text);
    await shot("02-chamfer-dialog");
    await run(`brepscript.featureDialog().cancel()`);
    await wait(2500);
    check("Cancel puts the code back exactly", (await codeText()) === pre);

    say("\nextrude a face");
    await setCode(PLATE);
    await open("extrude");
    await pickWorld([17, 20, 14]);       // the boss's top
    await set("h", 8);
    d = await settle();
    check("extrude join: union(body, linearExtrude({ h: 8, on }, polygon)) builds", d.ok === true && /^return union\(difference\(/m.test(d.text) && /linearExtrude\(\{ h: 8, on: \{ origin: \[0, 0, 14\], normal: \[0, 0, 1\] \} \}, polygon\(\[(\[(10|25), (10|30)\](, )?){4}\]\)\)/.test(d.text), d.text);
    await shot("03-extrude-join");
    await run(`document.querySelector('#dz-dlg .seg[data-k="op"] button[data-v="cut"]').click()`);
    await set("h", 4);
    d = await settle();
    check("…switched to cut, it cuts into the face", d.ok === true && /reverse: true, proud: 0\.5/.test(d.text), d.text);
    await shot("04-extrude-cut");
    await okBtn();

    say("\nhole: counterbore where you click");
    await setCode(PLATE);
    await open("hole");
    await pickWorld([50, 32, 8]);
    await run(`document.querySelector('#dz-dlg .seg[data-k="kind"] button[data-v="counterbore"]').click()`);
    await set("through", true);
    d = await settle();
    check("the hole joins the body's difference() as one drill() line", d.ok === true
      && /\),\n  drill\(\[50, 3[12](\.\d)?, 8\], \[0, 0, 1\], \{ d: 5, through: true, cbore: \{ d: 9, depth: 3 \} \}\)\);$/.test(d.text), d.text);
    await shot("05-hole-counterbore");
    await okBtn();

    say("\nshell");
    await setCode(`return cube([40, 30, 20]);`);
    await selectRow("cube");
    await open("shell");
    await pickWorld([20, 15, 20]);       // the top: leave it open
    d = await settle();
    check("shelled({ wall: 2, open: \"top\" }, …) builds", d.ok === true && d.text === `return shelled({ wall: 2, open: "top" }, cube([40, 30, 20]));`, d.text);
    await shot("06-shell");
    await okBtn();

    say("\nmirror, linear and circular patterns");
    await setCode(`return cube([30, 10, 10]);`);
    await selectRow("cube");
    await open("mirror");
    d = await settle();
    check("mirror defaults to the YZ plane at the shape's far side", d.ok === true && /^return mirrored\(\{ normal: \[1, 0, 0\], at: 30 \}, cube/.test(d.text), d.text);
    await shot("07-mirror");
    await okBtn();
    await setCode(`return difference(cube([60, 20, 5]), translate([8, 10, -1], cylinder({ r: 2, h: 7 })));`);
    await selectRow("cylinder");
    await open("linear");
    await set("count", 5); await set("space", 11);
    d = await settle();
    check("a hole patterned 5 times along X", d.ok === true && /linearPattern\(\{ count: 5, step: \[11, 0, 0\] \}, translate\(\[8, 10, -1\], cylinder/.test(d.text), d.text);
    await shot("08-linear-pattern");
    await okBtn();
    await setCode(`return translate([20, 0, 0], cube([5, 5, 5]));`);
    await selectRow("cube");
    await open("circular");
    await set("count", 8);
    d = await settle();
    check("8 copies around Z", d.ok === true && /^return circularPattern\(\{ count: 8, axis: \[0, 0, 1\], center: \[0, 0, 0\] \}, translate/.test(d.text), d.text);
    await shot("09-circular-pattern");
    await okBtn();

    say("\ncombine");
    await setCode(`return group(\n  cube([20, 20, 10]),\n  translate([10, 10, 0], cylinder({ r: 5, h: 20 })));`);
    await selectRow("cube");
    await open("combine");
    await pickWorld([10, 5.2, 18]);      // the cylinder's side, above the box
    await run(`document.querySelector('#dz-dlg .seg[data-k="op"] button[data-v="difference"]').click()`);
    d = await settle();
    check("the cylinder moves into difference(box, cylinder)", d.ok === true && d.text === `return group(\n  difference(cube([20, 20, 10]), translate([10, 10, 0], cylinder({ r: 5, h: 20 }))));`, d.text);
    await shot("10-combine-cut");
    await okBtn();

    say("\nrevolve a face");
    await setCode(`return cube([10, 20, 5]);`);
    await open("revolve");
    await pickWorld([5, 0, 2.5]);        // the -Y face, at y = 0
    const zIx = await run(`[...document.querySelectorAll('#dz-dlg select[data-k="axis"] option')].findIndex((o) => o.textContent === "world Z")`);
    await set("axis", String(zIx));
    await run(`document.querySelector('#dz-dlg .seg[data-k="op"] button[data-v="new"]').click()`);
    d = await settle();
    check("revolve({ angle: 360, on }, polygon) as a new body builds", d.ok === true && /revolve\(\{ angle: 360, on: \{ origin: \[0, 0, [\d.]+\], normal: \[0, -1, 0\], x: \[1, 0, 0\] \} \}, polygon/.test(d.text), d.text);
    await shot("11-revolve");
    await okBtn();

    say("\npress-pull");
    await setCode(PLATE);
    await run(`document.querySelector('#dz-bar [data-tool="presspull"]').click()`);
    await wait(800);
    let [x, y] = await toScreen([17, 20, 14]);
    await mouse("mouseMove", x, y); await mouse("mouseDown", x, y);
    for (let k = 1; k <= 6; k++) await mouse("mouseMove", x, y - k * 12);
    let pp = (await run(`brepscript.design()`)).pressPull;
    check("dragging the boss's top shows a signed distance", pp?.dragging && pp.d > 0, JSON.stringify(pp));
    check("…with a +mm label at the cursor", /^\+\d+ mm/.test(await run(`document.getElementById("dz-pp-label").textContent`)));
    await shot("12-presspull-drag-out");
    await mouse("mouseUp", x, y - 72);
    await wait(2500);
    const grown = await codeText();
    check("release: the boss's height number grows", /cube\(\[15, 20, (\d+)\]\)/.test(grown) && +/cube\(\[15, 20, (\d+)\]\)/.exec(grown)[1] > 6, grown);
    // and down, past the boss: it cuts on into the base
    await setCode(PLATE);
    [x, y] = await toScreen([17, 20, 14]);
    const [, y2] = await toScreen([17, 20, 3]);
    await mouse("mouseMove", x, y); await mouse("mouseDown", x, y);
    for (let k = 1; k <= 8; k++) await mouse("mouseMove", x, y + (y2 - y) * k / 8);
    check("pushed past the boss the label says cut", /−\d+ mm cut/.test(await run(`document.getElementById("dz-pp-label").textContent`)));
    await shot("13-presspull-past-cuts");
    await mouse("mouseUp", x, y2);
    await wait(2500);
    const cut = await codeText();
    check("release: the boss's outline cuts on through, as one more tool of the body's difference()", /\),\n  linearExtrude\(\{ h: \d+, reverse: true, proud: 0\.5, on: \{ origin: \[0, 0, 14\]/.test(cut), cut);

    say("\nrotate and scale gizmo modes");
    await setCode(PLATE);
    await selectRow("cube");
    await run(`document.querySelector('#dz-bar [data-tool="rotate"]').click()`);
    await wait(500);
    d = await run(`brepscript.design()`);
    check("rotate mode: rings about X, Y, Z only", d.gizmoMode === "rotate" && d.gizmoHandles.rotate.every((n) => ["X", "Y", "Z"].includes(n)), JSON.stringify(d.gizmoHandles));
    await shot("14-rotate-gizmo");
    await run(`document.querySelector('#dz-bar [data-tool="scale"]').click()`);
    await wait(500);
    d = await run(`brepscript.design()`);
    check("scale mode: the centre dot only (uniform)", d.gizmoMode === "scale" && d.gizmoHandles.scale.join() === "XYZ", JSON.stringify(d.gizmoHandles));
    await shot("15-scale-gizmo");
    await run(`document.querySelector('#dz-bar [data-tool="move"]').click()`);

    say("\na failed feature is red in the timeline, with the kernel's reason");
    await setCode(`return fillet({ r: 2, edges: ["P.CU9_PX|P.CU9_PZ[0]"] }, cube([40, 30, 10]));`);
    await wait(1500);
    d = await run(`brepscript.design()`);
    check("the failure reaches the timeline", !!d.failure && /no edge/.test(d.failure.reason), JSON.stringify(d.failure));
    check("…as a red step", await run(`!!document.querySelector(".dt-step.fail")`));
    check("…on the Fillet that failed, not on the Box before it", await run(`/Fillet/.test(document.querySelector(".dt-step.fail")?.textContent || "")`),
      await run(`document.querySelector(".dt-step.fail")?.textContent`));
    await shot("16-failed-step");

    say("\nCode mode");
    await setCode(PLATE);
    await run(`brepscript.setMode("code")`);
    await wait(400);
    check("every Design element is hidden", await run(`[...document.querySelectorAll(".dz-ui")].every((e) => getComputedStyle(e).display === "none" || e.hidden)`));
    await shot("17-code-mode");
  } catch (e) {
    fail++;
    say(`  FAIL  harness: ${e?.stack || e}`);
  }
  say(`\n${pass} passed, ${fail} failed`);
  fs.writeFileSync(LOG, lines.join("\n") + "\n");
  app.exit(fail ? 1 : 0);
});
