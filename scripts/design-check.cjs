// Drive Design mode in a real (offscreen) Electron window against the dev
// server, check what it does, and capture screenshots of it.
//
//   npm run serve                      (in another terminal; port 5320)
//   npx electron scripts/design-check.cjs [outDir]
//
// Offscreen rendering keeps requestAnimationFrame running without a visible
// window (a hidden one suspends it, see gizmo-check.cjs). The gizmo drag goes
// in as real mouse input (sendInputEvent): TransformControls captures the
// pointer, which a synthetic PointerEvent cannot do.

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const URL_ = process.env.BREPCODE_URL || "http://localhost:5320/viewer/";
const OUT = process.argv[2] || path.join(__dirname, "..", "..", "BREPcode-shots", "design-phase1");
const W = 1600, H = 1000;
const LOG = path.join(__dirname, "..", "design-check.log");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; say(`  PASS  ${label}`); }
  else { fail++; say(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const PEGS = `const w = 60;
const peg = (x) => translate([x, 20, 8], cylinder({ r: 4, h: 12, id: "peg" }));
return fillet({ r: 1, edges: "z" }, difference(
  union(
    cube([w, 40, 8], { id: "base" }),
    peg(10), peg(50)),
  translate([30, 20, -1], cylinder({ r: 6, h: 10 }))));`;

app.commandLine.appendSwitch("force-device-scale-factor", "1");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(30);
  const run = (js) => win.webContents.executeJavaScript(js, true);
  const shot = async (name) => {
    await wait(400);
    const img = await win.webContents.capturePage();
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${name}.png`);
    fs.writeFileSync(file, img.toPNG());
    say(`  shot  ${file}`);
  };
  const mouse = async (type, x, y) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1 });
    await wait(40);
  };
  const built = async (pred = "true", ms = 30000) => {
    for (let t = 0; t < ms; t += 250) {
      try { if (await run(`!!(window.brepscript?.featureSites?.() && (${pred}))`)) return true; } catch { /* still loading */ }
      await wait(250);
    }
    return false;
  };
  const setCode = (src) => run(`(() => { const c = document.getElementById("code"); c.value = ${JSON.stringify(src)};
    c.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  // a world point to window pixels
  const toScreen = (expr) => run(`(() => { const { THREE, camera, renderer } = brepscript;
    const p = (${expr}).clone().project(camera); const r = renderer.domElement.getBoundingClientRect();
    return [r.left + (p.x + 1) / 2 * r.width, r.top + (1 - p.y) / 2 * r.height]; })()`);

  try {
    await win.loadURL(URL_);
    await run(`localStorage.setItem("brepcode-welcomed", "1"); localStorage.setItem("brepcode.mode", "design"); localStorage.setItem("brepcode.ribbon", "0")`);
    await win.loadURL(URL_);
    for (let i = 0; i < 120 && !(await run("!!window.brepscript?.design").catch(() => false)); i++) await wait(250);
    await wait(2500);
    await setCode(PEGS);
    check("the model builds", await built(`brepscript.design().steps.length >= 7`));
    await wait(800);

    say("\nshell");
    const st = await run(`brepscript.design()`);
    check("Design mode is on", st.active);
    check("browser rows for every call", st.rows.length === 10, String(st.rows.length));
    check("every timeline step links to code", st.steps.every((s) => s.linked), JSON.stringify(st.steps));
    check("the shell is on screen", await run(`["dz-bar", "dz-side", "dz-time"].every((id) => getComputedStyle(document.getElementById(id)).display !== "none")`));

    say("\nbrowser click = select");
    await run(`[...document.querySelectorAll(".dz-row")].find((b) => b.querySelector(".dz-name").textContent === "cube").click()`);
    await wait(500);
    let d = await run(`brepscript.design()`);
    check("the cube row selects the cube", d.selectedFid === "P.CU1", d.selectedFid);
    check("…its call is selected in the editor", await run(`(() => { const c = document.getElementById("code"); return c.value.slice(c.selectionStart, c.selectionEnd); })()`) === `cube([w, 40, 8], { id: "base" })`);
    check("…and the gizmo is on it", d.gizmo === "P.CU1");
    // the code card covers the right of the stage; fold it so the shots show the model
    await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);
    await wait(600);
    await shot("01-browser-timeline-gizmo");

    say("\nface pick");
    // the cube's top, front left: clear of the pegs and the gizmo
    const [fx, fy] = await toScreen(`(() => { const m = brepscript.modelGroup.children.find((x) => x.userData.faceName === "P.CU1_PZ");
      const b = new THREE.Box3().setFromObject(m); return new THREE.Vector3(b.min.x + 16, b.min.y + 5, b.max.z); })()`);
    await mouse("mouseMove", fx, fy);
    await mouse("mouseDown", fx, fy);
    await mouse("mouseUp", fx, fy);
    await wait(600);
    d = await run(`brepscript.design()`);
    check("a click on the model picks the face", d.face?.name === "P.CU1_PZ", JSON.stringify(d.face));
    check("…with the edges around it, fillet-style names", d.face?.edges.length >= 4 && d.face.edges.every((e) => /\|.*\[\d+\]$/.test(e)), JSON.stringify(d.face?.edges));
    await shot("02-face-and-edges");

    say("\nmove gizmo");
    const [ox, oy] = await toScreen(`brepscript.scene.getObjectByName("design-move-proxy").position`);
    const [ax, ay] = await toScreen(`brepscript.scene.getObjectByName("design-move-proxy").position.clone().add(new THREE.Vector3(9, 0, 0))`);
    await mouse("mouseMove", ax, ay);
    await mouse("mouseMove", ax + 1, ay);
    await mouse("mouseDown", ax + 1, ay);
    const step = [(ax - ox), (ay - oy)];
    const len = Math.hypot(...step) || 1;
    for (let i = 1; i <= 8; i++) await mouse("mouseMove", ax + 1 + step[0] / len * i * 12, ay + step[1] / len * i * 12);
    await wait(300);
    await shot("03-gizmo-dragging");
    await mouse("mouseUp", ax + 1 + step[0] / len * 96, ay + step[1] / len * 96);
    check("the release rebuilt", await built(`/translate\\(\\[\\d/.test(document.getElementById("code").value.split("difference(")[1] || "")`));
    await wait(800);
    const codeNow = await run(`document.getElementById("code").value`);
    const mv = /difference\(\n  translate\(\[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\], union\(/.exec(codeNow);
    check("the move was written as translate([dx, dy, dz], union(…)) (the cube is the union's main shape)",
      !!mv && +mv[1] > 1 && +mv[2] === 0 && +mv[3] === 0, codeNow);
    check("…once, not also as a body drag", (codeNow.match(/translate\(/g) || []).length === 3, codeNow);
    d = await run(`brepscript.design()`);
    check("the selection and gizmo survive the rebuild", d.selectedFid === "P.CU1" && d.gizmo === "P.CU1", JSON.stringify(d));
    await shot("04-after-move");

    say("\npattern member");
    await run(`[...document.querySelectorAll(".dz-row")].find((b) => b.querySelector(".dz-pat")).click()`);
    await wait(500);
    d = await run(`brepscript.design()`);
    check("the ×2 row selects a peg", /^P\.CY/.test(d.selectedFid || ""), d.selectedFid);
    check("…and says a move moves both", /moves all 2/.test(await run(`document.getElementById("dz-sel").textContent`)));
    await shot("05-pattern-member");

    say("\nribbon");
    await run(`document.querySelector("#dz-bar .dz-more").click()`);
    await wait(300);
    check("the toolbar expands to the ribbon", await run(`document.getElementById("dz-bar").classList.contains("ribbon")`));
    await shot("06-ribbon");
    await run(`document.querySelector("#dz-bar .dz-more").click()`);

    say("\nCode mode");
    await run(`brepscript.setMode("code")`);
    await wait(400);
    check("every Design element is hidden", await run(`[...document.querySelectorAll(".dz-ui")].every((e) => getComputedStyle(e).display === "none")`));
    d = await run(`brepscript.design()`);
    check("…and the gizmo is off", !d.active && d.gizmo === null, JSON.stringify(d));
    await shot("07-code-mode");
  } catch (e) {
    fail++;
    say(`  FAIL  harness: ${e?.stack || e}`);
  }
  say(`\n${pass} passed, ${fail} failed`);
  fs.writeFileSync(LOG, lines.join("\n") + "\n");
  app.exit(fail ? 1 : 0);
});
