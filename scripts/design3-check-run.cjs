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
    check("…and there is a slider for it", await run(`import("/viewer/params.js").then((P) => P.findParams(document.getElementById("code").value).some((q) => q.name === "slotW"))`));
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
