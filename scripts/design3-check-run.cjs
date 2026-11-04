// Design mode phase 3 in a real (offscreen) Electron window: the sketcher.
// Draws with real mouse clicks, constrains and dimensions, finishes into the
// code, drives a sketch dim from a slider-style param edit, edits a sketch in
// place, revolves one, and makes two lines tangent to a circle then trims
// them to a teardrop; checks the code and the model, and screenshots.
//
//   npm run serve                                         (port 5320)
//   npx electron scripts/design-check.cjs --phase3 [outDir]   (npm run test:design3)
//
// Loaded by design-check.cjs (the guard).

const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const URL_ = process.env.BREPCODE_URL || "http://localhost:5320/viewer/";
const OUT = process.argv.find((a, i) => i >= 2 && !a.startsWith("-")) || path.join(__dirname, "..", "..", "BREPcode-shots", "design-phase3");
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
  const mouse = async (type, x, y, { clickCount = 1 } = {}) => {
    win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: "left", clickCount });
    await wait(40);
  };
  const click = async ([x, y]) => { await mouse("mouseMove", x, y); await mouse("mouseDown", x, y); await mouse("mouseUp", x, y); await wait(120); };
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
  const skScreen = (uv) => run(`brepscript.sketcher().toScreen(${JSON.stringify(uv)})`);
  const sk = () => run(`brepscript.sketcher()?.debug() ?? null`);
  const volume = () => run(`brepscript.modelVolume()`);

  try {
    // a service worker left by an earlier run serves the app's files from its
    // cache: the check would test old code
    await win.webContents.session.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
    await win.loadURL(URL_);
    await run(`localStorage.setItem("brepcode-welcomed", "1"); localStorage.setItem("brepcode.mode", "design"); localStorage.setItem("brepcode.ribbon", "1")`);
    await win.loadURL(URL_);
    for (let i = 0; i < 120 && !(await run("!!window.brepscript?.openSketch").catch(() => false)); i++) await wait(250);
    await wait(2500);
    await run(`document.getElementById("panel").classList.contains("open") && document.getElementById("open-btn").click()`);
    await setCode(`return cube([60, 40, 8]);`);

    say("\nstart: pick the plane or a face");
    await run(`document.querySelector('#dz-bar [data-tool="sketch"]').click()`);
    await wait(800);
    check("the chooser offers XY / XZ / YZ (or a face)", await run(`["XY", "XZ", "YZ"].every((p) => !!document.querySelector('#dz-sk [data-plane="' + p + '"]'))`));
    await shot("01-sketch-chooser");
    await click(await toScreen([30, 20, 8]));        // the plate's top face
    await wait(900);
    let d = await sk();
    check("a click on the top face opens the sketch on it (z = 8, square on)", !!d && typeof d.on === "object" && d.on.origin[2] === 8 && d.on.normal[2] === 1, JSON.stringify(d?.on));
    const camDir = await run(`(() => { const { camera, controls } = brepscript; const v = camera.position.clone().sub(controls.target).normalize(); return [v.x, v.y, v.z]; })()`);
    check("…the view looks straight down at it", Math.abs(camDir[2] - 1) < 1e-3, JSON.stringify(camDir));
    check("…with a grid", await run(`!!brepscript.scene.getObjectByName("design-sketch")?.children[0]?.children.length`));

    say("\ndraw with the mouse");
    await run(`brepscript.sketcher().tool("rect")`);
    await click(await skScreen([10, 10]));
    await click(await skScreen([40, 30]));
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([50, 20]));
    await click(await skScreen([54, 20]));
    await run(`brepscript.sketcher().tool("line")`);
    await click(await skScreen([5, 35]));
    const mid = await skScreen([55, 35]);
    await mouse("mouseMove", mid[0], mid[1]);
    await shot("02-line-rubber-band");
    await click(mid);
    await run(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await run(`brepscript.sketcher().tool("construction")`);
    await click(await skScreen([25, 35]));
    d = await sk();
    check("rectangle, circle and a line: 6 curves, the line now construction", d.sk.curves.length === 6 && d.sk.curves[5].construction === true, JSON.stringify(d.sk.curves));
    check("the rectangle came with its level and plumb constraints", d.sk.constraints.filter((c) => c.type === "horizontal").length >= 2 && d.sk.constraints.filter((c) => c.type === "vertical").length === 2);
    check("one closed profile (the circle is an island, the line construction)", d.problem === null, d.problem);
    await shot("03-drawn");

    say("\nconstrain and dimension");
    await run(`brepscript.sketcher().dimension([{ curve: 0 }], 34, "slotW")`);
    await run(`brepscript.sketcher().dimension([{ curve: 1 }], 16)`);
    d = await sk();
    const P = d.sk.points;
    const c0 = d.sk.curves[0].ids, c1 = d.sk.curves[1].ids;
    check("the width dim (34) re-solves the rectangle", Math.abs(Math.hypot(P[c0[1]][0] - P[c0[0]][0], P[c0[1]][1] - P[c0[0]][1]) - 34) < 1e-4, JSON.stringify(P));
    check("…and the height dim (16)", Math.abs(Math.hypot(P[c1[1]][0] - P[c1[0]][0], P[c1[1]][1] - P[c1[0]][1]) - 16) < 1e-4);
    check("the dims are labelled on the sketch, the named one as slotW = 34", await run(`[...document.querySelectorAll(".dz-dim")].some((e) => e.textContent === "slotW = 34")`));
    await run(`brepscript.sketcher().select([{ point: ${c0[0]} }])`);
    await run(`document.querySelector('#dz-sk [data-con="fixed"]').click()`);
    d = await sk();
    check("Fixed from the palette pins the selected corner", d.sk.constraints.some((c) => c.type === "fixed" && c.ids[0] === c0[0]));
    await shot("04-dimensions-and-constraints");

    say("\nfinish: a pocket cut into the face");
    await run(`(() => { const s = document.querySelector('#dz-sk select[data-k="op"]'); s.value = "cut"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await run(`(() => { const s = document.querySelector('#dz-sk input[data-k="h"]'); s.value = "4"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    const v0 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const code = await codeText();
    check("the code: the param, the sketch above the return, the cut in the body",
      /^const slotW = 34;\n/.test(code) && /const sketch1 = sketch\(\{\n  on: \{ origin: \[0, 0, 8\], normal: \[0, 0, 1\] \},/.test(code)
      && /\["distance", \d+, \d+, slotW\]/.test(code) && /return difference\(cube\(\[60, 40, 8\]\), linearExtrude\(\{ h: 4, reverse: true, proud: 0\.5 \}, sketch1\)\);/.test(code), code);
    const v1 = await volume();
    check("the model lost the pocket and the round hole (34 x 16 x 4 + π·4²·4)", Math.abs((v0 - v1) - (34 * 16 * 4 + Math.PI * 16 * 4)) < 15, `${v0} -> ${v1}`);
    await run(`brepscript.setView?.("home")`);
    await shot("05-finished-pocket");

    say("\nthe dim is a slider: change the param");
    await setCode(code.replace("const slotW = 34;", "const slotW = 20;"));
    const v2 = await volume();
    check("slotW 34 → 20: the sketch re-solves and the pocket narrows", Math.abs((v2 - v1) - 14 * 16 * 4) < 15, `${v1} -> ${v2}`);
    check("…and there is a slider for it", await run(`import("./params.js").then((P) => P.findParams(document.getElementById("code").value).some((q) => q.name === "slotW"))`));
    await shot("06-param-slider");

    say("\nedit the sketch in place");
    const before = await codeText();
    await run(`document.querySelector('#dz-bar [data-tool="sketch"]').click()`);
    await wait(800);
    check("the chooser lists sketch1 to edit", await run(`[...document.querySelectorAll("#dz-sk [data-edit]")].some((b) => b.textContent === "sketch1")`));
    await run(`[...document.querySelectorAll("#dz-sk [data-edit]")].find((b) => b.textContent === "sketch1").click()`);
    await wait(900);
    d = await sk();
    check("it opens with its curves and its named dim", d && d.sk.curves.length === 6 && d.sk.dims.some((x) => x.name === "slotW" && x.value === 20), JSON.stringify(d?.sk.dims));
    await run(`brepscript.sketcher().dimension([{ curve: 1 }], 12)`);
    await shot("07-editing-sketch");
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const after = await codeText();
    check("the call was rewritten in place (same declaration, new dim, nothing else added)",
      (after.match(/sketch\(\{/g) || []).length === 1 && /\["distance", \d+, \d+, 12\]/.test(after) && after.split("\n").at(-1) === before.split("\n").at(-1), after);

    say("\nreview repro: the default model, R, then two clicks");
    const DEFAULT = `difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),\n)`;
    await setCode(DEFAULT);
    await run(`document.querySelector('#dz-bar [data-tool="sketch"]').click()`);
    await wait(800);
    await click(await toScreen([15, 26, 12]));       // the top face, beside the hole
    await wait(900);
    check("the sketch opens on the top face", (await sk())?.on?.origin?.[2] === 12);
    const key = async (keyCode) => { win.webContents.focus(); for (const type of ["keyDown", "char", "keyUp"]) win.webContents.sendInputEvent({ type, keyCode }); await wait(80); };
    await key("R");
    check("R picks the rectangle tool", (await sk()).tool === "rect", (await sk()).tool);
    let n0 = (await sk()).sk.curves.length;
    await click([640, 330]);
    await click([960, 560]);
    d = await sk();
    check("two clicks draw the rectangle", d.sk.curves.length === n0 + 4 && d.sk.curves.slice(-4).every((c) => c.kind === "line"), JSON.stringify(d.sk.curves));
    await shot("10-default-model-rect-two-clicks");
    // a press-drag draws too (a circle, from its centre out)
    await key("C");
    n0 = d.sk.curves.length;
    const [cx, cy] = await skScreen([4, 4]), [rx, ry] = await skScreen([4, 6.5]);
    await mouse("mouseMove", cx, cy); await mouse("mouseDown", cx, cy);
    for (let k = 1; k <= 6; k++) await mouse("mouseMove", cx + (rx - cx) * k / 6, cy + (ry - cy) * k / 6);
    await mouse("mouseUp", rx, ry);
    await wait(150);
    d = await sk();
    check("a press-drag draws a circle (centre where it went down)", d.sk.curves.length === n0 + 1 && d.sk.curves.at(-1).kind === "circle", JSON.stringify(d.sk.curves.at(-1)));
    // a key that comes from the code editor while its card is closed is still the sketcher's
    await run(`document.getElementById("code").dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true, cancelable: true }))`);
    check("a key from the hidden code editor still picks a tool (L: line)", (await sk()).tool === "line", (await sk()).tool);
    check("…and typed nothing into the code", (await codeText()) === DEFAULT);
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    d = await sk();
    check("rectangle and circle make a closed profile", d.problem === null, d.problem);
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("Finish builds", await builtOk());
    const fin = await codeText();
    check("Finish writes const sketch1 = sketch({…}) and the extrude joined to the body (the bare-expression model gets its return)",
      /^const sketch1 = sketch\(\{\n  on: \{ origin: \[0, 0, 12\], normal: \[0, 0, 1\] \},/.test(fin) && /\nreturn union\(difference\(/.test(fin) && /linearExtrude\(\{ h: 10 \}, sketch1\)\)/.test(fin), fin);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "finished-default-model.bcode.js"), fin);
    say(`  code  ${path.join(OUT, "finished-default-model.bcode.js")}`);
    await shot("11-default-model-finished");

    say("\nrevolve a sketch about a construction line");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XZ"]').click()`);
    await wait(700);
    await run(`brepscript.sketcher().tool("rect")`);
    await click(await skScreen([10, 0]));
    await click(await skScreen([14, 6]));
    await run(`brepscript.sketcher().tool("line")`);
    await click(await skScreen([0, -2]));
    await click(await skScreen([0, 10]));
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await run(`brepscript.sketcher().tool("construction")`);
    await click(await skScreen([0, 4]));
    await run(`(() => { const s = document.querySelector('#dz-sk select[data-k="feat"]'); s.value = "revolve"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await run(`(() => { const s = document.querySelector('#dz-sk select[data-k="axis"]'); s.value = s.options[1].value; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await shot("08-revolve-sketch");
    const vb = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const rc = await codeText();
    check("revolve({ angle: 360, axis: [i, j] }, sketch1) as a new body", /group\(cube\(\[4, 4, 4\]\), revolve\(\{ angle: 360, axis: \[\d+, \d+\] \}, sketch1\)\)/.test(rc), rc);
    const vr = await volume();
    check("…a ring of π(14² − 10²)·6", Math.abs((vr - vb) - Math.PI * 96 * 6) < 40, `${vb} -> ${vr}`);
    await shot("09-revolved-ring");

    say("\ntangent: a line and a circle, made tangent, trimmed to a teardrop (the user report)");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([10, 0]));
    await click(await skScreen([15, 0]));
    await run(`brepscript.sketcher().tool("line")`);
    await click(await skScreen([-12, 0.5]));
    await click(await skScreen([18, 7]));
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await click(await skScreen([-12, 0.5]));
    await click(await skScreen([18, -6]));
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    d = await sk();
    check("a circle and two lines from one point", d.sk.curves.length === 3 && d.sk.curves[1].ids[0] === d.sk.curves[2].ids[0], JSON.stringify(d.sk.curves));
    const gapOf = (s, li) => {
      const P = s.points, [a, b] = s.curves[li].ids.map((k) => P[k]), C = P[s.curves[0].ids[0]];
      const r = s.curves[0].kind === "circle" ? s.curves[0].r : Math.hypot(P[s.curves[0].ids[1]][0] - C[0], P[s.curves[0].ids[1]][1] - C[1]);
      const u = [b[0] - a[0], b[1] - a[1]];
      return Math.abs(Math.abs((C[0] - a[0]) * u[1] - (C[1] - a[1]) * u[0]) / Math.hypot(...u) - r);
    };
    // select by clicking: the line, then Shift + the circle's far side; Tangent from the palette
    const shiftClick = async ([x, y]) => {
      win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(x), y: Math.round(y) });
      for (const type of ["mouseDown", "mouseUp"]) win.webContents.sendInputEvent({ type, x: Math.round(x), y: Math.round(y), button: "left", clickCount: 1, modifiers: ["shift"] });
      await wait(150);
    };
    for (const li of [1, 2]) {
      const s0 = (await sk()).sk;
      const [a, b] = s0.curves[li].ids.map((k) => s0.points[k]);
      await click(await skScreen([a[0] + (b[0] - a[0]) * 0.25, a[1] + (b[1] - a[1]) * 0.25]));
      const C = s0.points[s0.curves[0].ids[0]];
      await shiftClick(await skScreen([C[0] + 5, C[1]]));
      await run(`document.querySelector('#dz-sk [data-con="tangent"]').click()`);
      await wait(200);
      d = await sk();
      check(`line ${li} made tangent to the circle from the palette`, /Tangent added/.test(d.msg) && gapOf(d.sk, li) < 1e-3, `${d.msg} gap ${gapOf(d.sk, li)}`);
    }
    await shot("12-tangent-lines");
    // trim with the mouse: each line's overhang, then the circle's near side
    await run(`brepscript.sketcher().tool("trim")`);
    for (const li of [1, 2]) {
      const s0 = (await sk()).sk;
      const t = s0.constraints.find((c) => c.type === "tangent" && c.ids[0] === s0.curves[li].ids[0] && c.ids[1] === s0.curves[li].ids[1]).ids[3];
      const T = s0.points[t], B = s0.points[s0.curves[li].ids[1]];
      await click(await skScreen([(T[0] + B[0]) / 2, (T[1] + B[1]) / 2]));
    }
    {
      const s0 = (await sk()).sk;
      const C = s0.points[s0.curves[0].ids[0]];
      await click(await skScreen([C[0] - 5, C[1]]));
    }
    d = await sk();
    check("trimmed: one arc and two lines, a closed teardrop, still tangent", d.sk.curves.length === 3 && d.sk.curves[0].kind === "arc"
      && d.problem === null && gapOf(d.sk, 1) < 1e-3 && gapOf(d.sk, 2) < 1e-3, JSON.stringify({ c: d.sk.curves, p: d.problem }));
    await shot("13-trimmed-teardrop");
    // a rule's symbol removes it
    const glyphs = await run(`[...document.querySelectorAll(".dz-glyph")].map((e) => { const b = e.getBoundingClientRect(); return { t: e.title, x: b.left + b.width / 2, y: b.top + b.height / 2 }; })`);
    check("each tangent has its symbol on screen", glyphs.filter((g) => /^Tangent/.test(g.t) && g.x > 0 && g.x < W && g.y > 0 && g.y < H).length === 2, JSON.stringify(glyphs));
    const vb2 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const tc = await codeText();
    check("the tangents are in the code", (tc.match(/\["tangent", /g) || []).length === 2, tc);
    const vt = await volume();
    // the teardrop: hull of the R5 circle and the apex 22 mm off, extruded 10
    check("…and the model grew by the teardrop (about 1,500 mm³)", vt - vb2 > 1000 && vt - vb2 < 2200, `${vb2} -> ${vt}`);
    await shot("14-teardrop-built");

    say("\nthe forum report: four lines, a circle, shift-pick the circle and the right line, Tangent");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    check("the model fades while the sketch is open", await run(`brepscript.modelGroup ? [...(function* walk(o) { yield o; for (const c of o.children) yield* walk(c); })(brepscript.modelGroup)].filter((m) => m.isMesh).every((m) => [m.material].flat().every((x) => x.opacity <= 0.3)) : true`));
    await run(`brepscript.sketcher().tool("line")`);
    for (const p of [[-14, -8], [6, -8], [6, 8], [-14, 8], [-14, -8]]) await click(await skScreen(p));
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([16, 0]));
    await click(await skScreen([21, 0]));
    await run(`brepscript.sketcher().tool("select")`);
    await click(await skScreen([16, 5]));                // the circle's top
    await shiftClick(await skScreen([6, 0]));           // the right-hand line
    await run(`document.querySelector('#dz-sk [data-con="tangent"]').click()`);
    await wait(200);
    d = await sk();
    const rightGap = (s) => { const P = s.points, C = P[s.curves[4].ids[0]]; return Math.abs(Math.abs(C[0] - P[s.curves[1].ids[0]][0]) - 5); };
    check("Tangent added: the right line touches the circle, still plumb, still closed", /Tangent added/.test(d.msg) && rightGap(d.sk) < 1e-3 && d.problem === null, `${d.msg} ${rightGap(d.sk)}`);
    check("the panel says how much is left to lock it", await run(`/to lock it/.test(document.querySelector("#dz-sk .dof")?.textContent || "")`));
    await shot("15-forum-report-tangent");

    say("\na rule that fights: refused, named, one click to fix");
    await run(`brepscript.sketcher().select([{ point: ${d.sk.curves[4].ids[0]} }])`);
    await run(`document.querySelector('#dz-sk [data-con="fixed"]').click()`);
    await run(`brepscript.sketcher().dimension([{ curve: 0 }], 20)`);
    await run(`brepscript.sketcher().select([{ point: ${d.sk.curves[0].ids[0]} }])`);
    await run(`document.querySelector('#dz-sk [data-con="fixed"]').click()`);
    // the box's left corner and the circle are pinned now: a 12 wide box can't reach the circle
    const nCons = (await sk()).sk.constraints.length;
    await run(`brepscript.sketcher().dimension([{ curve: 0 }], 12)`);
    d = await sk();
    const blocked = await run(`document.querySelectorAll("#dz-sk [data-fix]").length`);
    check("a width that can't fit is refused (nothing changed) with fix buttons", blocked > 0 && d.sk.constraints.length === nCons && /can't be added/.test(d.msg), d.msg);
    check("…the blocking rules are red on the sketch", await run(`document.querySelectorAll(".dz-glyph.bad, .dz-dim.bad").length`) > 0);
    await shot("16-rule-refused");
    const fix = await run(`(() => { const b = document.querySelector("#dz-sk [data-fix]").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    await click(fix);
    d = await sk();
    check("one click on a fix: that rule goes, the change is made, every rule met", /removed/.test(d.msg) && (await run(`document.querySelectorAll(".dz-glyph.bad").length`)) === 0, d.msg);

    say("\nundo and redo inside the sketch (Fusion's keys)");
    const ctrl = async (keyCode, shift = false) => {
      win.webContents.focus();
      for (const type of ["keyDown", "keyUp"]) win.webContents.sendInputEvent({ type, keyCode, modifiers: ["control", ...(shift ? ["shift"] : [])] });
      await wait(150);
    };
    const k0 = (await sk()).sk.constraints.length;
    await ctrl("Z");
    const k1 = (await sk()).sk.constraints.length;
    await ctrl("Y");
    const k2 = (await sk()).sk.constraints.length;
    check("Ctrl+Z takes the last change back, Ctrl+Y puts it again", k1 !== k0 && k2 === k0, `${k0} -> ${k1} -> ${k2}`);
    const opened = await run(`(() => { const got = []; const o = window.open; window.open = (u) => { got.push(u); return null; }; document.querySelector("#dz-sk h3 .help").click(); window.open = o; return got; })()`);
    check("the panel's ? opens the Design help at the sketch section", opened[0] === "design-help.html#sketch", JSON.stringify(opened));
    await run(`brepscript.sketcher().cancel()`);
    await wait(300);
    check("cancelling brings the model back to full strength", await run(`[...(function* walk(o) { yield o; for (const c of o.children) yield* walk(c); })(brepscript.modelGroup)].filter((m) => m.isMesh).every((m) => [m.material].flat().every((x) => x.opacity > 0.3))`));

    say("\nthe user's screenshot: a circle, three lines ending about on it; tangent both sides, trim, a cone");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([0, 0]));
    await click(await skScreen([10.6, 0]));
    await run(`brepscript.sketcher().tool("line")`);
    for (const p of [[-9, -5], [-4.5, -16], [5, -16], [9.5, -5.5]]) await click(await skScreen(p));
    await run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    await run(`brepscript.sketcher().tool("select")`);
    d = await sk();
    check("a circle and three lines", d.sk.curves.length === 4 && d.sk.curves[0].kind === "circle", JSON.stringify(d.sk.curves));
    const sideGap = (s, li) => {
      const P = s.points, [a, b] = s.curves[li].ids.map((k) => P[k]), C = P[s.curves[0].ids[0]];
      const r = s.curves[0].kind === "circle" ? s.curves[0].r : Math.hypot(P[s.curves[0].ids[1]][0] - C[0], P[s.curves[0].ids[1]][1] - C[1]);
      const u = [b[0] - a[0], b[1] - a[1]];
      return Math.abs(Math.abs((C[0] - a[0]) * u[1] - (C[1] - a[1]) * u[0]) / Math.hypot(...u) - r);
    };
    for (const li of [1, 3]) {
      const s0 = (await sk()).sk, C = s0.points[s0.curves[0].ids[0]], r = s0.curves[0].r;
      const [a, b] = s0.curves[li].ids.map((k) => s0.points[k]);
      await click(await skScreen([C[0], C[1] + r]));                               // the circle's top
      await shiftClick(await skScreen([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));   // the side line's middle
      await run(`document.querySelector('#dz-sk [data-con="tangent"]').click()`);
      await wait(200);
      d = await sk();
      check(`side ${li}: Tangent added, the line touching the circle`, /Tangent added/.test(d.msg) && sideGap(d.sk, li) < 1e-3, `${d.msg} ${sideGap(d.sk, li)}`);
    }
    await shot("17-cone-tangent");
    await run(`brepscript.sketcher().tool("trim")`);
    {
      const s0 = (await sk()).sk, C = s0.points[s0.curves[0].ids[0]];
      await click(await skScreen([C[0], C[1] - s0.curves[0].r]));
    }
    d = await sk();
    check("trimming the circle's lower part leaves a closed cone, still tangent", d.sk.curves[0].kind === "arc" && d.problem === null && sideGap(d.sk, 1) < 1e-3 && sideGap(d.sk, 3) < 1e-3, JSON.stringify({ c: d.sk.curves, p: d.problem }));
    await shot("18-cone-trimmed");
    const vc0 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const vc1 = await volume();
    check("…a cone about 4,200 mm³ beside the cube", vc1 - vc0 > 3500 && vc1 - vc0 < 5000, `${vc0} -> ${vc1}`);
    await shot("19-cone-built");

    say("\ngetting rid of the sample cube");
    const DEFAULT2 = await run(`document.getElementById("code").defaultValue`);
    await setCode(DEFAULT2);
    const trashAt = () => run(`(() => { const b = document.querySelector("#dz-side .dz-clear").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    await click(await trashAt());
    await wait(900);
    check("the Browser's trash clears the starter cube at once (no question: it's a sample)", (await codeText()) === "" && !(await run(`!!document.getElementById("dz-confirm")`)));
    const ctrlKey = async (keyCode) => { win.webContents.focus(); for (const type of ["keyDown", "keyUp"]) win.webContents.sendInputEvent({ type, keyCode, modifiers: ["control"] }); await wait(900); };
    await ctrlKey("Z");
    check("Ctrl+Z brings it back", (await codeText()).trim() === DEFAULT2.trim());
    await setCode(`return cube([20, 10, 5]);`);
    await click(await trashAt());
    await wait(300);
    check("on a real model the trash asks first", await run(`!!document.querySelector("#dz-confirm .go")`));
    await shot("20-clear-confirm");
    const goAt = await run(`(() => { const b = document.querySelector("#dz-confirm .go").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`);
    await click(goAt);
    await wait(900);
    check("…Clear model empties it", (await codeText()) === "");
    await ctrlKey("Z");
    check("…and Ctrl+Z brings it back", (await codeText()).trim() === "return cube([20, 10, 5]);");
    // a file dropped with "keep" ticked goes beside the model
    await run(`(() => {
      const v = [[0,0,0],[10,0,0],[10,10,0],[0,10,0],[0,0,10],[10,0,10],[10,10,10],[0,10,10]];
      const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
      const stl = "solid t\\n" + f.map((t) => "facet normal 0 0 0\\nouter loop\\n" + t.map((i) => "vertex " + v[i].join(" ")).join("\\n") + "\\nendloop\\nendfacet").join("\\n") + "\\nendsolid t\\n";
      const dt = new DataTransfer(); dt.items.add(new File([stl], "beside.stl"));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    })()`);
    await wait(1500);
    check("dropping onto a real model offers to keep it", await run(`!!document.querySelector(".fz-keep")`));
    await run(`document.querySelector(".fz-keep").checked = true; document.querySelector('.fz-opt[data-a="open"]').click()`);
    await wait(2500);
    check("…kept: the model and the new part side by side", /group\(\s*cube\(\[20, 10, 5\]\),\s*translate\(\[\d+, 0, 0\], importedMesh\("beside\.stl"/.test(await codeText()), await codeText());
    // a sketch on the XY plane, finished as a New body, replaces the starter
    await setCode(DEFAULT2);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([0, 0]));
    await click(await skScreen([6, 0]));
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    const nb = await codeText();
    check("a New body sketched beside the starter cube replaces it (the cube was a sample)", !/cube\(\[30, 30, 12\]\)/.test(nb) && /return linearExtrude\(\{ h: 10 \}, sketch1\);/.test(nb), nb);

    say("\ndeleting the last shape (the user's screenshot: the starter's cube, or difference(cube) once its hole was deleted)");
    await setCode(DEFAULT2);
    await click(await toScreen([15, 0, 6]));          // the starter cube's front face
    await wait(300);
    win.webContents.focus();
    for (const type of ["keyDown", "keyUp"]) win.webContents.sendInputEvent({ type, keyCode: "Delete" });
    await wait(900);
    check("click the starter cube, press Delete: the plate is empty", (await codeText()) === "", await codeText());
    await setCode(`difference(\n  cube([30, 30, 12]),\n)`);
    const menu = await run(`(() => {
      const n = [...document.querySelectorAll("#dz-tree .dz-name")].find((e) => /cube/.test(e.textContent));
      const r = n.getBoundingClientRect();
      n.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5, button: 2 }));
      return [...document.querySelectorAll("#dz-ctx button")].map((b) => b.textContent + (b.disabled ? " [off]" : ""));
    })()`);
    check("right-click the last shape in the Browser: Delete is offered (it empties the plate)", menu.includes("Delete (the last shape: empties the plate)"), JSON.stringify(menu));
    await run(`[...document.querySelectorAll("#dz-ctx button")].find((b) => /^Delete/.test(b.textContent)).click()`);
    await wait(900);
    check("…and does it", (await codeText()) === "", await codeText());

    say("\nthe user's pac-man screenshot: an arc, two radius lines, and three more lines below sharing one");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    const esc2 = () => run(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
    // left of the origin: the sketch panel and the editor sit over the right
    const PC = [-25, 0], PS = [-17, 8.8], PE = [-13.1, 0], PP3 = [-11.2, -11.7], PP4 = [-13.1, -19];
    await run(`brepscript.sketcher().tool("arc")`);
    for (const p of [PC, PS, PE]) await click(await skScreen(p));
    await run(`brepscript.sketcher().tool("line")`);
    for (const chain of [[PC, PS], [PC, PE], [PC, PP3, PP4]]) { for (const p of chain) await click(await skScreen(p)); await esc2(); }
    const info = () => run(`import("./design/sketch-model.js").then((M) => { const i = M.profileInfo(brepscript.sketcher().debug().sk); const area = (p) => { let a = 0; for (let k = 0; k < p.length; k++) { const [x1, y1] = p[k], [x2, y2] = p[(k + 1) % p.length]; a += x1 * y2 - x2 * y1; } return Math.abs(a) / 2; };
      return { problem: i.problem, strays: i.strays, loose: i.loose.length, loops: i.loops.length, area: i.loops.reduce((t, l) => t + area(l.pts) - l.holes.reduce((u, h) => u + area(h), 0), 0) }; })`);
    let pi = await info();
    check("the pac-man with a line hanging off it: closed, the hanging line left out with a red loose end", pi.problem === null && pi.strays.length === 1 && pi.loose === 1 && pi.loops === 1, JSON.stringify(pi));
    await shot("21-pacman-loose-end");
    await click(await skScreen(PP4));
    await click(await skScreen(PE));
    await esc2(); await esc2();
    pi = await info();
    // (the line from the centre crosses the last one, as in the screenshot:
    // the shape below is a bow-tie, its bottom triangle its own island)
    check("…drawn back to the arc's end (the screenshot): all of it shaded, nothing left out", pi.problem === null && pi.strays.length === 0 && pi.loose === 0 && pi.loops >= 1, JSON.stringify(pi));
    const shaded = pi.area;
    await shot("22-pacman-closed");
    const vp0 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const vp1 = await volume();
    check("…and builds to the shaded area x 10", Math.abs((vp1 - vp0) - shaded * 10) / (shaded * 10) < 0.01, `${vp0} -> ${vp1}, shaded ${shaded}`);

    say("\ntwo closed shapes connected (a user report): a circle drawn over a rectangle's edge");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    await run(`brepscript.sketcher().tool("rect")`);
    await click(await skScreen([-30, -5]));
    await click(await skScreen([-12, 5]));
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([-12, 0]));
    await click(await skScreen([-6, 0]));
    pi = await info();
    check("a rectangle and a circle over its edge: one shaded shape", pi.problem === null && pi.loops === 1 && pi.strays.length === 0, JSON.stringify(pi));
    const shaded2 = pi.area;
    await shot("23-rect-and-circle");
    const vr0 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const vr1 = await volume();
    check("…one solid, the overlap counted once (the shaded area x 10)", Math.abs((vr1 - vr0) - shaded2 * 10) / (shaded2 * 10) < 0.01, `${vr0} -> ${vr1}, shaded ${shaded2}`);

    say("\nTier 1: inference while drawing, fillet (F), slot, polygon, by real clicks");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    check("the panel has Draw and Modify rows with the new tools", await run(`["centerRect", "arc3", "tangentArc", "slot", "polygon", "fillet", "mirror", "pattern"].every((t) => !!document.querySelector('#dz-sk [data-tool="' + t + '"]'))`));
    check("…and the new rules", await run(`["midpoint", "collinear", "concentric", "symmetric"].every((t) => !!document.querySelector('#dz-sk [data-con="' + t + '"]'))`));
    await run(`brepscript.sketcher().tool("rect")`);
    await click(await skScreen([-30, -8]));
    await click(await skScreen([-12, 8]));
    await run(`brepscript.sketcher().tool("line")`);
    const midAt = await skScreen([-21.3, -7.8]);
    await mouse("mouseMove", midAt[0], midAt[1]);
    await wait(200);
    const tag = await run(`(() => { const t = document.querySelector(".dz-infer"); return t && getComputedStyle(t).display !== "none" ? t.textContent : null; })()`);
    check("hovering near the bottom edge's middle with Line: the tag says Midpoint", tag === "Midpoint", String(tag));
    await shot("24-infer-midpoint");
    await click(midAt);
    await click(await skScreen([-21, 20]));
    await key("Escape");
    d = await sk();
    check("…the line drawn from there keeps a Midpoint rule", d.sk.constraints.some((k) => k.type === "midpoint"), JSON.stringify(d.sk.constraints));
    await run(`brepscript.sketcher().tool("select")`);
    // undo that line: the rest builds on the plain rectangle
    await ctrlKey("Z");
    await key("F");
    d = await sk();
    check("F picks the sketch Fillet", d.tool === "fillet", d.tool);
    await click(await skScreen([-12.3, 7.7]));
    await wait(300);
    d = await sk();
    check("…a click on a corner rounds it (radius 3)", d.sk.curves.filter((c) => c.kind === "arc").length === 1 && /Rounded/.test(d.msg), d.msg);
    await run(`document.querySelector('#dz-sk [data-tool="slot"]').click()`);
    await click(await skScreen([-6, -14]));
    await click(await skScreen([6, -14]));
    await click(await skScreen([0, -11]));
    await run(`document.querySelector('#dz-sk [data-tool="polygon"]').click()`);
    await click(await skScreen([-26, -15]));
    await click(await skScreen([-22, -15]));
    pi = await info();
    check("rounded rectangle, slot and hexagon: three shaded shapes, nothing left out", pi.problem === null && pi.loops === 3 && pi.strays.length === 0, JSON.stringify(pi));
    const shaded3 = pi.area;
    const want3 = (288 - (9 - Math.PI * 9 / 4)) + (72 + Math.PI * 9) + 1.5 * Math.sqrt(3) * 16;
    check("…the shaded area is what the shapes add up to", Math.abs(shaded3 - want3) / want3 < 0.01, `${shaded3} vs ${want3}`);
    await shot("25-fillet-slot-polygon");
    const vt0 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const vt1 = await volume();
    check("…to the shaded area x 10", Math.abs((vt1 - vt0) - shaded3 * 10) / (shaded3 * 10) < 0.01, `${vt0} -> ${vt1}, shaded ${shaded3}`);

    say("\nTier 1: pick regions, box select, a drag the rules can't follow, by real mouse");
    await setCode(`return cube([4, 4, 4]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    await run(`brepscript.sketcher().tool("rect")`);
    await click(await skScreen([-30, -8]));
    await click(await skScreen([-12, 8]));
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([-12, 0]));
    await click(await skScreen([-8, 0]));
    await run(`document.querySelector('#dz-sk [data-tool="regions"]').click()`);
    await click(await skScreen([-9.5, 0.5]));
    pi = await info();
    check("Pick regions: a click in the bulge leaves it out; the rest is the rectangle", pi.problem === null && Math.abs(pi.area - 288) < 0.5, JSON.stringify(pi));
    await shot("26-pick-regions");
    await click(await skScreen([-9.5, 0.5]));
    pi = await info();
    check("…clicked again, it is back", Math.abs(pi.area - (288 + Math.PI * 8)) < 0.5, JSON.stringify(pi));
    // box select: left to right takes what is wholly inside (the four sides,
    // not the circle sticking out); right to left anything it touches
    await run(`brepscript.sketcher().tool("select")`);
    const drag = async (a, b) => {
      await mouse("mouseMove", a[0], a[1]); await mouse("mouseDown", a[0], a[1]);
      for (let k = 1; k <= 6; k++) await mouse("mouseMove", a[0] + (b[0] - a[0]) * k / 6, a[1] + (b[1] - a[1]) * k / 6);
      await mouse("mouseUp", b[0], b[1]); await wait(200);
    };
    await drag(await skScreen([-33, 11]), await skScreen([-11, -11]));
    d = await sk();
    check("a box dragged left to right: the four sides (wholly inside), not the circle", /4 curves selected \(wholly inside/.test(d.msg), d.msg);
    await drag(await skScreen([-11, -11]), await skScreen([-33, 11]));
    d = await sk();
    check("…right to left: the circle too (it touches)", /5 curves selected \(touching/.test(d.msg), d.msg);
    // a fixed corner pulled: put back, and said why
    await run(`brepscript.sketcher().select([{ point: brepscript.sketcher().debug().sk.points.findIndex((p) => p[0] === -30 && p[1] === -8) }])`);
    await run(`brepscript.sketcher().constrain("fixed")`);
    await drag(await skScreen([-30, -8]), await skScreen([-36, -14]));
    d = await sk();
    check("dragging a Fixed corner: it stays, and the panel says the rules hold it", d.sk.points.some((p) => p[0] === -30 && p[1] === -8) && /rules hold that point/.test(d.msg), d.msg);
    // a free corner pulled: the rectangle follows, still a rectangle
    await drag(await skScreen([-12, 8]), await skScreen([-10, 10]));
    d = await sk();
    const xs = [...new Set(d.sk.points.map((p) => Math.round(p[0] * 1000) / 1000))];
    check("dragging a free corner: it moves, and the rectangle stays square", d.sk.points.some((p) => Math.abs(p[0] + 10) < 0.6 && Math.abs(p[1] - 10) < 0.6) && (await run(`import("./design/sketch-model.js").then((M) => M.unmet(brepscript.sketcher().debug().sk).length)`)) === 0, JSON.stringify(xs));
    // both sides dimensioned too: that corner is held now; pulled, it goes back
    await run(`(() => { const s = brepscript.sketcher(), k = s.debug().sk; k.curves.forEach((c, i) => { if (c.kind === "line" && i < 4) s.dimension([{ curve: i }], i % 2 ? 16 : 18); }); })()`);
    await wait(300);
    const held = (await sk()).sk.points.findIndex((p, i) => i < 4 && p[0] > -20 && p[1] > 0);
    const at0 = (await sk()).sk.points[held];
    await drag(await skScreen(at0), await skScreen([at0[0] + 4, at0[1] + 4]));
    d = await sk();
    check("dragging a corner the dims hold: put back, and said why", Math.hypot(d.sk.points[held][0] - at0[0], d.sk.points[held][1] - at0[1]) < 1e-6 && /rules hold that point/.test(d.msg), `${JSON.stringify(at0)} -> ${JSON.stringify(d.sk.points[held])} ${d.msg}`);
    await run(`document.querySelector("#dz-sk .cancel").click()`);
    await wait(400);

    say("\nTier 1: Project (P) the face's edges into a sketch on it");
    await setCode(`return cube([20, 10, 5]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await click(await toScreen([10, 5, 5]));
    await wait(900);
    await key("P");
    await wait(300);
    d = await sk();
    const proj = d.sk.curves.filter((c) => c.construction && c.kind === "line");
    check("P projects the top face's four edges as fixed construction lines", proj.length === 4 && /Projected 4 edges/.test(d.msg), `${proj.length} ${d.msg}`);
    await run(`brepscript.sketcher().tool("line")`);
    const mids = proj.map((c) => c.ids.map((k) => d.sk.points[k])).map(([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    const pmid = (await Promise.all(mids.map((m) => skScreen([m[0] + 0.2, m[1] + 0.15])))).sort((a, b) => a[0] - b[0])[0];
    await mouse("mouseMove", pmid[0], pmid[1]);
    await wait(200);
    check("…and the line tool snaps to them (the edge's midpoint)", (await run(`document.querySelector(".dz-infer")?.textContent`)) === "Midpoint", String(await run(`document.querySelector(".dz-infer")?.textContent`)));
    await run(`document.querySelector("#dz-sk .cancel").click()`);
    await wait(400);

    say("\nTier 2: an offset plane, a two-sided extrude, Properties");
    await setCode(`return cube([20, 20, 10]);`);
    await run(`brepscript.openSketch()`);
    await wait(700);
    await run(`(() => { const i = document.querySelector('#dz-sk [data-plane-k="d"]'); i.value = "25"; i.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await run(`document.querySelector('#dz-sk [data-plane="XY"]').click()`);
    await wait(700);
    d = await sk();
    check("Offset 25 then XY: the sketch is on a construction plane 25 up", typeof d.on === "object" && d.on.origin[2] === 25 && d.on.normal[2] === 1, JSON.stringify(d.on));
    check("…and says so", /construction plane/.test(await run(`document.querySelector("#dz-sk h3 small").textContent`)));
    await run(`brepscript.sketcher().tool("circle")`);
    await click(await skScreen([-20, 0]));
    await click(await skScreen([-16, 0]));
    await run(`(() => { const s = document.querySelector('#dz-sk select[data-k="dir"]'); s.value = "two"; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await run(`(() => { const i = document.querySelector('#dz-sk input[data-k="h"]'); i.value = "6"; i.dispatchEvent(new Event("change", { bubbles: true })); const j = document.querySelector('#dz-sk input[data-k="h2"]'); j.value = "4"; j.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    const v20 = await volume();
    await run(`document.querySelector("#dz-sk .ok").click()`);
    await wait(800);
    check("it builds", await builtOk());
    const code2 = await codeText();
    check("…written as one extrude 10 long starting 4 below the plane", /linearExtrude\(\{ h: 10, start: -4 \}/.test(code2), code2);
    const bb = null;
    const v21 = await volume();
    check("…a disc r 4, 10 tall (from z 21 to 31)", Math.abs((v21 - v20) - Math.PI * 16 * 10) / (Math.PI * 160) < 0.02, `${v20} -> ${v21} ${JSON.stringify(bb)}`);
    await run(`document.querySelector('#dz-bar [data-tool="properties"]').click()`);
    await wait(900);
    const props = await run(`document.getElementById("dz-props")?.innerText || ""`);
    const vol = /Volume\s+([\d,.]+)/.exec(props)?.[1]?.replace(/,/g, "");
    check("Properties: the volume, as the viewer measures it", vol && Math.abs(+vol - v21) / v21 < 0.01, props.slice(0, 200));
    check("…the mass in PLA (1.24 g/cm³), 2 bodies", /Mass\s+[\d.]+\s*g/.test(props) && /Bodies\s+2/.test(props), props);
    await shot("27-properties");
    await run(`document.querySelector("#dz-props .x").click()`);

    say("\nAssemblies: the exploded view, and its video");
    await setCode(`return group(cube([20, 20, 10]), translate([10, 10, 10], cylinder({ r: 5, h: 12 })), translate([30, 0, 0], cube([8, 8, 8])));`);
    await run(`document.querySelector('#dz-bar [data-tool="explode"]').click()`);
    await wait(900);
    check("Explode opens with the three parts", /3 parts/.test(await run(`document.getElementById("dz-explode")?.innerText || ""`)));
    const pos0 = await run(`brepscript.modelMeshes().filter((m) => m.isMesh).map((m) => m.position.toArray().join(","))`);
    await run(`(() => { const r = document.querySelector('#dz-explode input[type=range]'); r.value = "100"; r.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await wait(300);
    const pos1 = await run(`brepscript.modelMeshes().filter((m) => m.isMesh).map((m) => m.position.toArray().join(","))`);
    check("…at 100% every part has moved apart", pos1.every((p, i) => p !== pos0[i] || p !== "0,0,0") && pos1.some((p, i) => p !== pos0[i]), JSON.stringify(pos1.slice(0, 4)));
    await shot("28-exploded");
    check("…and the code is unchanged", /^return group\(cube/.test((await codeText()).trim()));
    await run(`document.querySelector('#dz-explode [data-a="in"]').click()`);
    await wait(1000);
    const pos2 = await run(`brepscript.modelMeshes().filter((m) => m.isMesh).map((m) => m.position.toArray().join(","))`);
    check("Collapse: every part back where it was", JSON.stringify(pos2) === JSON.stringify(pos0), JSON.stringify(pos2.slice(0, 4)));
    // the video: the download is caught into the shots folder
    const saved = new Promise((resolve) => {
      win.webContents.session.once("will-download", (_e, item) => {
        const to = path.join(OUT, item.getFilename());
        item.setSavePath(to);
        item.once("done", (_ev, state) => resolve({ to, state }));
      });
      setTimeout(() => resolve(null), 40000);
    });
    const loadedBefore = await run(`performance.getEntriesByType("resource").some((r) => /explode-video\\.js/.test(r.name))`);
    check("the video code is not loaded until asked for", !loadedBefore);
    await run(`document.querySelector('#dz-explode [data-a="video"]').click()`);
    const got = await saved;
    check("Save video: a WebM is made and saved", got?.state === "completed" && fs.existsSync(got.to) && fs.statSync(got.to).size > 20000, JSON.stringify(got) + " " + (got ? fs.statSync(got.to).size : ""));
    if (got) say(`  video ${got.to}`);
    await wait(600);
    const pos3 = await run(`brepscript.modelMeshes().filter((m) => m.isMesh).map((m) => m.position.toArray().join(","))`);
    check("…and afterwards the parts and the view are back", JSON.stringify(pos3) === JSON.stringify(pos0));
    await run(`document.querySelector("#dz-explode .x").click()`);

    say("\nTier 3: the Parameters table with formulas, and Suppress");
    await setCode(`const width = 40;\nconst depth = width / 2;\nreturn difference(cube([width, depth, 6]), translate([10, 10, -1], cylinder({ r: 4, h: 8 })));`);
    await run(`document.querySelector('#dz-bar [data-tool="parameters"]').click()`);
    await wait(900);
    const ptxt = await run(`document.getElementById("dz-params")?.innerText || ""`);
    check("Parameters lists width and depth (= 20, a formula)", /width/.test(ptxt) && /depth/.test(ptxt) && /20\b/.test(ptxt), ptxt.slice(0, 200));
    const vq0 = await volume();
    await run(`(() => { const i = document.querySelector('#dz-params input[data-p="width"]'); i.focus(); i.value = "60"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
    await wait(500);
    check("width = 60 (Enter): it builds", await builtOk());
    const vq1 = await volume();
    const want = (w) => w * (w / 2) * 6 - Math.PI * 16 * 6;
    check("…and depth followed its formula (60 x 30)", Math.abs(vq1 - want(60)) / want(60) < 0.01 && Math.abs(vq0 - want(40)) / want(40) < 0.01, `${vq0} -> ${vq1}`);
    await run(`(() => { const [n, v] = document.querySelectorAll('#dz-params .add input'); n.value = "hole"; v.value = "depth / 5"; document.querySelector('#dz-params .go').click(); })()`);
    await wait(500);
    await builtOk();
    check("Add: hole = depth / 5 goes under depth in the code", /const depth = width \/ 2;\nconst hole = depth \/ 5;/.test(await codeText()), await codeText());
    await run(`(() => { const i = document.querySelector('#dz-params input[data-p="width"]'); i.focus(); i.value = "alert(1)"; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); })()`);
    await wait(300);
    check("…a formula that isn't arithmetic is refused, in red", /width:/.test(await run(`document.querySelector("#dz-params .note.err")?.textContent || ""`)) && /const width = 60;/.test(await codeText()));
    await shot("29-parameters");
    await run(`document.querySelector("#dz-params .x").click()`);
    // suppress the hole from the Browser's right-click menu
    const vs0 = await volume();
    await run(`(() => { const row = [...document.querySelectorAll("#dz-tree .dz-row")].find((r) => r.querySelector(".dz-name")?.textContent === "cylinder"); row?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 120, clientY: 220 })); })()`);
    await wait(300);
    const hasSup = await run(`!!document.querySelector('#dz-ctx [data-k="suppress"]:not(:disabled)')`);
    check("right-click the cylinder in the Browser: Suppress is offered", hasSup, await run(`document.getElementById("dz-ctx")?.innerText || "no menu"`));
    if (hasSup) {
      await run(`document.querySelector('#dz-ctx [data-k="suppress"]').click()`);
      await wait(500);
      check("…Suppress: it builds", await builtOk());
      const vs1 = await volume();
      check("…the hole is gone from the model (the plate is solid) and suppress( ) is in the code", vs1 - vs0 > Math.PI * 16 * 6 * 0.95 && /suppress\(translate/.test(await codeText()), `${vs0} -> ${vs1}`);
    }

    say("\nCode mode");
    await run(`brepscript.setMode("code")`);
    await wait(400);
    check("every Design element is hidden", await run(`[...document.querySelectorAll(".dz-ui")].every((e) => getComputedStyle(e).display === "none" || e.hidden)`));
  } catch (e) {
    fail++;
    say(`  FAIL  harness: ${e?.stack || e}`);
  }
  say(`\n${pass} passed, ${fail} failed`);
  fs.writeFileSync(LOG, lines.join("\n") + "\n");
  app.exit(fail ? 1 : 0);
});
