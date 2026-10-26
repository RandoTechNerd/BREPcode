// The body of scripts/design-check.cjs (which loads this inside a guard, so a
// mistake here prints and exits instead of raising Electron's main-process
// error dialog). Drives Design mode in a real (offscreen) Electron window
// against the dev server, checks what it does, and captures screenshots.
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

module.exports = app.whenReady().then(async () => {
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
  const mouse = async (type, x, y, { modifiers = [], clickCount = 1 } = {}) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: "left", clickCount, modifiers });
    await wait(40);
  };
  const key = async (keyCode) => {
    win.webContents.focus();          // offscreen: keys go nowhere unfocused
    for (const type of ["keyDown", "char", "keyUp"]) {
      if (type === "char" && keyCode.length > 1) continue;
      win.webContents.sendInputEvent({ type, keyCode });
    }
    await wait(60);
  };
  const dblclick = async (x, y) => {
    await mouse("mouseMove", x, y);
    await mouse("mouseDown", x, y); await mouse("mouseUp", x, y);
    await mouse("mouseDown", x, y, { clickCount: 2 }); await mouse("mouseUp", x, y, { clickCount: 2 });
  };
  const codeText = () => run(`document.getElementById("code").value`);
  // the selected cube's world box, from its meshes
  const cubeBox = () => run(`(() => { const { THREE, modelGroup } = brepscript; const b = new THREE.Box3();
    for (const m of modelGroup.children) if (m.userData.featureId === "P.CU1") b.expandByObject(m);
    return [b.min.toArray(), b.max.toArray()]; })()`);
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

    say("\nhandle dots: constant on-screen size, ring, dwell arrows");
    const handles = () => run(`brepscript.handles()`);
    const sizes = (hs) => hs.map((h) => `${h.look}:${h.dotPx.toFixed(1)}/${h.hitPx.toFixed(1)}`).join(" ");
    const sameSize = (hs) => hs.length && hs.every((h) => Math.abs(h.hitPx - 20) < 0.6
      && Math.abs(h.dotPx - (h.look === "corner" ? 6 : 5)) < 0.3);
    // the gizmo off, so the dots are what is on the part
    await run(`document.querySelector('#dz-bar [data-tool="select"]').click()`);
    let hs = await handles();
    check("face dots ~5 px, corner dots ~6 px, ~20 px hit area", sameSize(hs) && hs.some((h) => h.look === "face") && hs.some((h) => h.look === "corner"), sizes(hs));
    const zoom = (k) => run(`(() => { const { camera, controls } = brepscript;
      camera.position.sub(controls.target).multiplyScalar(${k}).add(controls.target); controls.update(); })()`);
    await zoom(0.45);
    await wait(500);
    hs = await handles();
    check("…the same on screen zoomed in", sameSize(hs), sizes(hs));
    await shot("08-handles-zoomed-in");
    await zoom(1 / 0.45 * 1.9);
    await wait(500);
    hs = await handles();
    check("…and zoomed out", sameSize(hs), sizes(hs));
    await shot("09-handles-zoomed-out");
    await zoom(1 / 1.9);
    await wait(500);
    hs = await handles();
    // the +X face dot (the one a width drag uses), and a corner
    const fx0 = hs.filter((h) => h.kind === "face").sort((a, b) => b.x - a.x)[0];
    await mouse("mouseMove", fx0.x, fx0.y);
    await wait(250);
    hs = await handles();
    let on = hs.find((h) => h.ring);
    check("hovering a dot rings it", on && on.kind === "face" && hs.filter((h) => h.ring).length === 1, JSON.stringify(on));
    check("…no arrows before the dwell", on && on.arrows === 0);
    await wait(700);
    on = (await handles()).find((h) => h.ring);
    check("after ~600 ms a face dot shows two arrows (both ways along its normal)", on?.arrows === 2, JSON.stringify(on));
    await shot("10-handle-hover-arrows");
    const c0 = hs.find((h) => h.kind === "corner");
    await mouse("mouseMove", c0.x, c0.y);
    await wait(900);
    on = (await handles()).find((h) => h.ring);
    check("a box corner shows two arrows (width and depth)", on?.kind === "corner" && on.arrows === 2, JSON.stringify(on));
    await mouse("mouseMove", 800, 120);
    await wait(250);
    hs = await handles();
    check("leaving the dot drops the ring and arrows", hs.every((h) => !h.ring && h.arrows === 0));
    // drag-to-resize still writes the code: the +X face dot, pulled outwards
    const fd = (await handles()).filter((h) => h.kind === "face").sort((a, b) => b.x - a.x)[0];
    const before = await run(`document.getElementById("code").value`);
    await mouse("mouseMove", fd.x, fd.y);
    await mouse("mouseDown", fd.x, fd.y);
    for (let i = 1; i <= 6; i++) await mouse("mouseMove", fd.x + i * 12, fd.y);
    const grow = await run(`document.getElementById("handle-drag-label")?.textContent || ""`);
    check("while dragging out, a + distance label sits by the cursor", /^\+\d+\.\d mm$/.test(grow), grow);
    await shot("12-face-drag-label");
    await mouse("mouseUp", fd.x + 72, fd.y);
    check("…and goes away on release", await run(`getComputedStyle(document.getElementById("handle-drag-label")).display === "none"`));
    check("dragging a face dot resizes in the code", await built(`document.getElementById("code").value !== ${JSON.stringify(before)}`));
    await wait(600);
    const resized = await run(`document.getElementById("code").value`);
    // whichever side that dot is in this view, exactly one of the cube's sizes changed
    const dims = /const w = ([\d.]+);[\s\S]*cube\(\[w, ([\d.]+), ([\d.]+)\]/.exec(resized);
    check("…by rewriting one of the cube's sizes, nothing else",
      !!dims && [dims[1] !== "60", dims[2] !== "40", dims[3] !== "8"].filter(Boolean).length === 1
      && resized.replace(/-?[\d.]+/g, "#") === before.replace(/-?[\d.]+/g, "#"), resized.split("\n").slice(0, 5).join(" / "));
    // …and inwards shrinks it, with a minus label
    const sizesOf = (t) => /const w = ([\d.]+);[\s\S]*cube\(\[w, ([\d.]+), ([\d.]+)\]/.exec(t)?.slice(1).map(Number);
    const grown = sizesOf(resized);
    const fi = (await handles()).filter((h) => h.kind === "face").sort((a, b) => b.x - a.x)[0];
    await mouse("mouseMove", fi.x, fi.y);
    await mouse("mouseDown", fi.x, fi.y);
    for (let i = 1; i <= 4; i++) await mouse("mouseMove", fi.x - i * 10, fi.y);
    const shrink = await run(`document.getElementById("handle-drag-label")?.textContent || ""`);
    check("dragging the face in shows a minus label", /^−\d+\.\d mm$/.test(shrink), shrink);
    await mouse("mouseUp", fi.x - 40, fi.y);
    await built(`document.getElementById("code").value !== ${JSON.stringify(resized)}`);
    const shrunk = sizesOf(await run(`document.getElementById("code").value`));
    check("…and shrinks the shape in the code", !!grown && !!shrunk && shrunk.some((v, i) => v < grown[i]),
      `${grown?.join("x")} -> ${shrunk?.join("x")}`);
    // the pull was on the +X face, so it is w (x) that changed, not the 40 (y)
    check("the +X face dot edits w, the cube's x size", !!grown && grown[0] !== 60 && grown[1] === 40 && grown[2] === 8, grown?.join("x"));
    await setCode(PEGS);
    await built(`brepscript.design().steps.length >= 7 && document.getElementById("code").value.startsWith("const w = 60;")`);
    await wait(600);
    await run(`document.querySelector('#dz-bar [data-tool="move"]').click()`);
    await run(`[...document.querySelectorAll(".dz-row")].find((b) => b.querySelector(".dz-name").textContent === "cube").click()`);
    await wait(400);
    await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);
    await wait(500);

    say("\nhandle gestures");
    // select tool: no gizmo in the way of the dots and the body
    await run(`document.querySelector('#dz-bar [data-tool="select"]').click()`);
    await wait(300);
    const reselect = async () => {
      await run(`[...document.querySelectorAll(".dz-row")].find((b) => b.querySelector(".dz-name").textContent === "cube").click()`);
      await wait(400);
      await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);
      await wait(500);
    };
    const backToPegs = async () => {
      await setCode(PEGS);
      await built(`document.getElementById("code").value.startsWith("const w = 60;") && brepscript.design().steps.length >= 7`);
      await wait(500);
      await reselect();
    };

    // double-click a face dot: its number, typed back
    let px = (await handles()).filter((h) => h.kind === "face").sort((a, b) => b.x - a.x)[0];
    await dblclick(px.x, px.y);
    await wait(300);
    let boxVals = await run(`brepscript.designNumberBox()`);
    check("double-clicking the +X dot opens a box holding w's 60", JSON.stringify(boxVals) === `["60"]`, JSON.stringify(boxVals));
    await shot("13-number-box");
    await run(`(() => { const i = document.querySelector("#dz-num input"); i.value = "72"; i.focus(); })()`);
    await key("Return");
    check("Enter writes it at its exact range (const w = 72)", await built(`document.getElementById("code").value.startsWith("const w = 72;")`)
      && (await codeText()).replace("const w = 72;", "const w = 60;") === PEGS);
    check("…and the box closes", (await run(`brepscript.designNumberBox()`)) === null);
    await wait(600);
    await reselect();
    px = (await handles()).filter((h) => h.kind === "face").sort((a, b) => b.x - a.x)[0];
    await dblclick(px.x, px.y);
    await wait(300);
    const beforeEsc = await codeText();
    await run(`document.querySelector("#dz-num input").value = "5"`);
    await key("Escape");
    await wait(300);
    check("Esc cancels: box gone, code untouched", (await run(`brepscript.designNumberBox()`)) === null && (await codeText()) === beforeEsc);
    await backToPegs();

    // Alt-drag on the body: a free move in the screen plane, written by moveText
    const [bx, by] = await toScreen(`(() => { const m = brepscript.modelGroup.children.find((x) => x.userData.faceName === "P.CU1_PZ");
      const b = new THREE.Box3().setFromObject(m); return new THREE.Vector3(b.min.x + 16, b.min.y + 5, b.max.z); })()`);
    await mouse("mouseMove", bx, by, { modifiers: ["alt"] });
    await mouse("mouseDown", bx, by, { modifiers: ["alt"] });
    for (let i = 1; i <= 6; i++) await mouse("mouseMove", bx + i * 8, by - i * 6, { modifiers: ["alt"] });
    await mouse("mouseUp", bx + 48, by - 36, { modifiers: ["alt"] });
    check("Alt-drag on the body rebuilt", await built(`/translate\\(\\[[^\\]]+\\], union\\(/.test(document.getElementById("code").value)`));
    const free = /difference\(\n  translate\(\[(-?[\d.]+), (-?[\d.]+), (-?[\d.]+)\], union\(/.exec(await codeText());
    check("…as a free move: translate([dx, dy, dz], union(…)), not a resize", !!free && free.slice(1).filter((v) => +v !== 0).length >= 2
      && (await codeText()).includes("cube([w, 40, 8]") && (await codeText()).startsWith("const w = 60;"), free?.[0]);
    await backToPegs();

    // Alt-drag a corner dot: all three sizes, the opposite corner held
    const box0 = await cubeBox();
    const corner = (await handles()).filter((h) => h.kind === "corner").sort((a, b) => (b.x - b.y) - (a.x - a.y))[0];
    await mouse("mouseMove", corner.x, corner.y, { modifiers: ["alt"] });
    await mouse("mouseDown", corner.x, corner.y, { modifiers: ["alt"] });
    for (let i = 1; i <= 6; i++) await mouse("mouseMove", corner.x + i * 7, corner.y - i * 5, { modifiers: ["alt"] });
    await wait(200);
    const cornerLabel = await run(`document.getElementById("handle-drag-label")?.textContent || ""`);
    check("Alt-dragging a corner shows the box's three sizes", /^[\d.]+ × [\d.]+ × [\d.]+ mm$/.test(cornerLabel), cornerLabel);
    await shot("14-box-corner-alt-drag");
    await mouse("mouseUp", corner.x + 42, corner.y - 30, { modifiers: ["alt"] });
    check("the corner drag rebuilt", await built(`document.getElementById("code").value !== ${JSON.stringify(PEGS)}`));
    await wait(800);
    const after = await codeText();
    const box1 = await cubeBox();
    const moved = [0, 1, 2].map((a) => [Math.abs(box1[0][a] - box0[0][a]) > 0.05, Math.abs(box1[1][a] - box0[1][a]) > 0.05]);
    // on every axis that changed, exactly one side moved: the far side held
    const held = moved.every(([lo, hi]) => !(lo && hi));
    check("the box resized on more than one axis", moved.filter(([lo, hi]) => lo || hi).length >= 2, JSON.stringify({ box0, box1 }));
    check("…with the opposite corner where it was", held, JSON.stringify({ box0, box1 }));
    check("…still one cube([…]) call, no freeform()", !/freeform/.test(after) && (after.match(/cube\(/g) || []).length === 1,
      after.split("\n").slice(0, 6).join(" / "));
    // sizes and the holding translate went in as ONE history step
    await run(`document.getElementById("undo-btn").click()`);
    await wait(300);
    check("…as one undo step: one Back restores the code before the drag", (await codeText()) === PEGS);
    await backToPegs();
    await run(`document.querySelector('#dz-bar [data-tool="move"]').click()`);
    await reselect();

    say("\nface pre-selection");
    const [hx, hy] = await toScreen(`(() => { const m = brepscript.modelGroup.children.find((x) => x.userData.faceName === "P.CU1_PZ");
      const b = new THREE.Box3().setFromObject(m); return new THREE.Vector3(b.min.x + 16, b.min.y + 5, b.max.z); })()`);
    await mouse("mouseMove", hx, hy);
    await wait(300);
    check("the face under the pointer is pre-highlighted", (await run(`brepscript.design().hoverFace`)) === "P.CU1_PZ");
    await shot("11-face-prehighlight");

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
