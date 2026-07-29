// Proves the kernel really builds off the main thread — and that everything
// downstream of a build still works when the geometry lives in a worker.
//
//   node build-site.mjs && npx electron scripts/worker-check.cjs
//
// The money test is "responsive during a heavy build": a build big enough to
// have frozen the old app for many seconds is started WITHOUT awaiting it, and
// the page is asked to answer JavaScript and paint frames while it runs. On the
// old synchronous path those answers could not arrive until the build finished,
// which is exactly what the browser's "Page Unresponsive" dialog was reporting.
//
// Run with a visible window: requestAnimationFrame is throttled in a hidden or
// backgrounded page, and the frame count below is part of the evidence.

const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
// Tell main.cjs not to boot itself — this script drives createWindow() and
// serveBundle() directly. Must be set BEFORE the require, or the app opens its
// own window, registers the app:// handler first, and our registration throws.
process.env.BREPCODE_EMBED = "1";
const shellApp = require("../desktop/main.cjs");
// The page's autosave and slicer probes go over these; without them the boot
// path throws where a real run wouldn't.
require("../desktop/mail.cjs").register();
require("../desktop/recovery.cjs").register();
require("../desktop/slicer.cjs").register();
require("../desktop/claude.cjs").register();

// electron.exe is a GUI binary: when its stdout is redirected to a file by a
// non-console parent, console.log can vanish entirely. The log file is the
// reliable readout — every line lands there as it happens.
// Never run against the real profile: this harness is killed and restarted
// hard, which corrupts the cache it leaves behind, and it sets a debug flag in
// local storage that has no business surviving into the user's own app.
const sandboxData = path.join(app.getPath("temp"), "brepcode-worker-check");
try { fs.rmSync(sandboxData, { recursive: true, force: true }); } catch { /* locked leftovers */ }
app.setPath("userData", sandboxData);

const LOG = path.join(__dirname, "..", "worker-check.log");
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

// A model heavy enough that the old path froze for seconds: booleans against
// high-$fn curved primitives are the superlinear case.
const HEAVY = `
const r = 14;
let s = sphere({ r, $fn: 128 });
for (let i = 0; i < 3; i++) {
  s = difference(s, translate([i * 7 - 7, 0, 0], cylinder({ r: 3, h: 40, $fn: 64, center: true })));
}
return union(s, translate([0, 0, r], sphere({ r: 6, $fn: 128 })));
`.trim();

const SIMPLE = "return difference(cube([30, 30, 12]), translate([15, 15, -1], cylinder({ r: 6, h: 14, $fn: 48 })));";

// Past the 45s hold threshold on the estimator's own numbers (~97k triangles
// with a boolean), while still finishing inside a test's patience. Anything
// smaller no longer trips the gate, which is the point of the recalibration:
// a 2-second sphere used to be estimated at 49s and held.
const MONSTER = `return difference(
  sphere({ r: 30, $fn: 220 }),
  cylinder({ r: 4, h: 80, $fn: 64, center: true })
);`;

app.whenReady().then(async () => {
  shellApp.serveBundle();
  const win = shellApp.createWindow();       // visible: rAF must actually run
  const run = (js) => win.webContents.executeJavaScript(js, true);
  win.webContents.on("did-fail-load", (_e, code, desc, url) =>
    say(`  ..    load failed ${code} ${desc} — ${url}`));
  win.webContents.on("render-process-gone", (_e, d) => say(`  ..    renderer gone: ${JSON.stringify(d)}`));
  win.webContents.on("console-message", (_e, _lvl, message, line, src) => {
    if (/\[kw\]|\[page\]|error|failed|worker|refused/i.test(message)) say(`  ..    page: ${message} (${src}:${line})`);
  });

  // Type code into the editor exactly the way a person does, then wait for the
  // build to settle. Returns the status-bar text.
  const setCode = async (src) => run(`(async () => {
    const el = document.getElementById("code");
    el.value = ${JSON.stringify(src)};
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  // The status bar's CLASS is the build verdict (ok / err / busy); the text is
  // the detail. Reading both means an error is seen as an error rather than
  // waited on until the test's own timeout.
  const status = () => run(
    `document.getElementById("status").className + "|" + document.getElementById("status-text").textContent`);
  const settle = async (limitMs = 120000) => {
    const t = Date.now();
    while (Date.now() - t < limitMs) {
      const s = await status();
      if (/^ok\|/.test(s) || /^err\|/.test(s)) return s;
      await wait(250);
    }
    return `TIMED OUT: ${await status()}`;
  };

  // A hung executeJavaScript (a page that never finished loading) used to look
  // exactly like a slow build: no output, no error, forever. Say so instead.
  const watchdog = setTimeout(() => {
    say("  FAIL  the harness itself timed out (10 min) — the page never got going");
    app.exit(1);
  }, 600000);
  watchdog.unref?.();

  // executeJavaScript never settles while a frame is still loading, so the
  // boot poll has to be raced against a timeout of its own.
  const runOrNull = (js, ms = 4000) => Promise.race([
    run(js).catch((e) => `THREW: ${e.message}`),
    new Promise((r) => setTimeout(() => r("TIMEOUT"), ms)),
  ]);

  try {
    let booted = null;
    for (let i = 0; i < 90; i++) {
      booted = await runOrNull("!!(window.brepscript && document.getElementById('code'))");
      if (booted === true) break;
      if (i % 8 === 7) say(`  ..    still booting (${i * 0.5 | 0}s): ${JSON.stringify(booted)}`);
      await wait(500);
    }
    check("the app booted", booted === true, JSON.stringify(booted));
    if (booted !== true) throw new Error("the page never booted");

    // Turn the worker's narration on and reload into it. Setting it via local
    // storage rather than a second loadURL avoids racing the first navigation,
    // which aborted the load outright often enough to look like a hang.
    await run(`localStorage.setItem("brepcode-worker-debug", "1")`);
    win.webContents.reload();
    for (let i = 0; i < 90; i++) {
      booted = await runOrNull("!!(window.brepscript && document.getElementById('code'))");
      if (booted === true) break;
      await wait(500);
    }
    check("...and comes back with worker tracing on", booted === true, JSON.stringify(booted));
    await wait(2500);

    // ---- 1. the worker exists and does the building ----------------------
    await setCode(SIMPLE);
    const first = await settle(45000);
    check("a plain model builds", /1 solid/.test(first), first);
    let info = await run("window.brepscript.workerInfo()");
    check("...in the worker, not on the main thread", info.live && info.proven && info.holdsModel,
      JSON.stringify(info));

    // The geometry that reached the screen has to be real geometry, not a
    // ghost: triangles on screen, a bounding box with the model's own size.
    const shown = await run(`(() => {
      const g = window.brepscript.modelGroup;
      let tris = 0, meshes = 0, ids = new Set();
      g.traverse((o) => { if (!o.isMesh) return;
        meshes++; ids.add(o.userData.featureId);
        const b = o.geometry;
        tris += (b.index ? b.index.count : b.attributes.position.count) / 3;
      });
      const bb = new window.brepscript.THREE.Box3().setFromObject(g);
      return { tris, meshes, ids: [...ids],
               size: bb.isEmpty() ? null : ["x","y","z"].map((a) => +(bb.max[a] - bb.min[a]).toFixed(2)) };
    })()`);
    check("real triangles reached the screen", shown.tris > 20 && shown.meshes > 1, JSON.stringify(shown));
    check("...at the size the code asked for", String(shown.size) === "30,30,12", String(shown.size));
    check("...and every face carries a feature id (click-to-select works)",
      shown.ids.length > 0 && !shown.ids.includes(null), JSON.stringify(shown.ids));

    // ---- 2. THE test: the page answers while the kernel is busy ----------
    //
    // Start the heavy build and do NOT await it. If the kernel were on this
    // thread, none of the probes below could run until it finished.
    await setCode(HEAVY);
    // Measure across the WHOLE build rather than a fixed window: a 50ms timer
    // and requestAnimationFrame run until the status bar stops saying "busy",
    // and the worst gap between ticks is the evidence. On the old synchronous
    // path that gap WAS the build.
    const probe = await run(`(async () => {
      const t0 = performance.now();
      let ticks = 0, frames = 0, worst = 0, last = performance.now();
      const busy = () => document.getElementById("status").className === "busy";
      const running = (now) => now - t0 < 1500 || busy();     // 1.5s covers the input debounce
      let typed = null;
      await new Promise((done) => {
        const tick = () => {
          const now = performance.now();
          worst = Math.max(worst, now - last);
          last = now;
          ticks++;
          // Mid-build, put characters in the editor the way a person would.
          // No input event: this is about the app still ACCEPTING typing, not
          // about starting another build.
          if (typed === null && now - t0 > 2000 && busy()) {
            const el = document.getElementById("code");
            el.focus();
            el.setRangeText("// typed mid-build\\n", 0, 0, "end");
            typed = el.value.startsWith("// typed mid-build");
          }
          if (now - t0 > 90000 || !running(now)) return done();
          setTimeout(tick, 50);
        };
        const frame = () => { frames++; if (running(performance.now())) requestAnimationFrame(frame); };
        tick(); requestAnimationFrame(frame);
      });
      return { ms: Math.round(performance.now() - t0), ticks, frames, typed,
               worstGapMs: Math.round(worst),
               status: document.getElementById("status").className + "|"
                     + document.getElementById("status-text").textContent };
    })()`);
    check("the test model really is a slow build", probe.ms > 2500, `${probe.ms}ms`);
    check("the page keeps running timers for the whole build",
      probe.ticks > probe.ms / 100, JSON.stringify(probe));
    check("...and keeps painting frames throughout", probe.frames > probe.ms / 40, JSON.stringify(probe));
    // The old failure mode was one gap as long as the build. Anything under half
    // a second is ordinary scheduling; the browser's hang threshold is ~20s.
    check("...with no multi-second stall", probe.worstGapMs < 500, `worst gap ${probe.worstGapMs}ms`);

    // Typing during the build must land — the editor is the thing that felt
    // broken.
    check("typing lands while the kernel works", probe.typed === true, String(probe.typed));

    const heavy = await settle();
    check("the heavy model finishes and reports triangles", /triangles/.test(heavy), heavy);
    const heavyTris = +(heavy.match(/([\d]+) triangles/)?.[1] || 0);
    check("...and it really is a heavy one", heavyTris > 3000, `${heavyTris} triangles`);

    // ---- 3. exports still work with the solids in the worker -------------
    info = await run("window.brepscript.workerInfo()");
    check("the worker is still holding the built solids", info.holdsModel, JSON.stringify(info));

    const stl = await run("window.brepscript.exportSTL()");
    check("STL comes back out of the worker",
      typeof stl === "string" && /^solid/.test(stl) && /facet normal/.test(stl),
      String(stl).slice(0, 60));
    const facets = (stl.match(/facet normal/g) || []).length;
    check("...with the same triangle count that's on screen",
      Math.abs(facets - heavyTris) <= 2, `stl ${facets} vs screen ${heavyTris}`);

    const step = await run("window.brepscript.facetedSTEP('worker-check')");
    check("faceted STEP is written in the worker too",
      typeof step === "string" && /ISO-10303/.test(step), String(step).slice(0, 60));

    // 3MF/OBJ ride the same STL text through the exporters module.
    const obj = await run(`(async () => {
      const exp = await import("./exporters.js");
      const t = await window.brepscript.exportSTL();
      return exp.stlToObj(t, "worker-check").slice(0, 40);
    })()`);
    check("OBJ conversion still gets valid STL text", /^#|^v /m.test(obj), obj);

    // ---- 3b. imported meshes travel to the worker ------------------------
    //
    // An import rides in the history as its whole STL text, and cutting WITH an
    // import needs the clone patch — which the worker had to grow its own copy
    // of, because it has its own module instances. Both are invisible until an
    // import is actually used as a boolean tool: the subtract silently does
    // nothing and the model looks merely wrong.
    const TETRA = [
      "solid t",
      "facet normal 0 0 0", "outer loop", "vertex 0 0 0", "vertex 8 0 0", "vertex 0 8 0", "endloop", "endfacet",
      "facet normal 0 0 0", "outer loop", "vertex 0 0 0", "vertex 0 8 0", "vertex 0 0 8", "endloop", "endfacet",
      "facet normal 0 0 0", "outer loop", "vertex 0 0 0", "vertex 0 0 8", "vertex 8 0 0", "endloop", "endfacet",
      "facet normal 0 0 0", "outer loop", "vertex 8 0 0", "vertex 0 0 8", "vertex 0 8 0", "endloop", "endfacet",
      "endsolid t",
    ].join("\n");
    await run(`window.brepscript.dsl.registerImport("tetra.stl", ${JSON.stringify(TETRA)})`);
    await setCode('return importedMesh("tetra.stl");');
    const imported = await settle(60000);
    check("an imported mesh builds through the worker", /^ok\|/.test(imported), imported);
    const impTris = await run(`(() => { let t = 0;
      window.brepscript.modelGroup.traverse((o) => { if (!o.isMesh) return;
        const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; });
      return t; })()`);
    check("...with its triangles on screen", impTris >= 4, `${impTris} triangles`);

    await setCode('return difference(cube([20, 20, 20]), translate([0, 0, 0], importedMesh("tetra.stl")));');
    const cutByImport = await settle(60000);
    check("...and cutting WITH an import still removes material", /^ok\|/.test(cutByImport), cutByImport);
    const cutTris = await run(`(() => { let t = 0;
      window.brepscript.modelGroup.traverse((o) => { if (!o.isMesh) return;
        const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; });
      return t; })()`);
    // A plain box is 12 triangles; the corner bite has to add faces.
    check("...(the cut really happened, not a silent no-op)", cutTris > 12, `${cutTris} triangles`);

    // ---- 3ba. a hole is part of the thing it was bored out of -------------
    //
    // The walls and floor of a hole belong to the CUTTER, which has no colour,
    // so they used to come out default grey: in the viewer a drilled hole
    // looked like a disc sitting ON the surface (indistinguishable from the
    // drill bit being left behind), and in a colour 3MF the hole's interior
    // became its own colour group — an entire extra filament for a hole.
    await setCode(`return difference(
  colorize("#1e2a78", cube([60, 60, 12])),
  drill([30, 30, 12], [0, 0, 1], { d: 14, depth: 6 })
);`);
    const drilled = await settle(60000);
    check("a drilled hole builds", /^ok\|/.test(drilled), drilled);
    const holeColours = await run(`(() => {
      const by = {};
      window.brepscript.modelGroup.traverse((o) => {
        if (!o.isMesh) return;
        const c = "#" + o.material.color.getHexString();
        by[c] = (by[c] || 0) + 1;
      });
      return by;
    })()`);
    check("...and takes the colour of the part it was cut from",
      Object.keys(holeColours).length === 1 && Object.keys(holeColours)[0] === "#1e2a78",
      JSON.stringify(holeColours));

    // Through a two-colour assembly, the hole takes the colour of the block it
    // actually passes through — not whichever was coloured first.
    await setCode(`return difference(
  group(
    colorize("#c0392b", cube([40, 40, 12])),
    colorize("#1e2a78", translate([45, 0, 0], cube([40, 40, 12])))
  ),
  drill([20, 20, 12], [0, 0, 1], { d: 10, through: true })
);`);
    const twoTone = await settle(60000);
    check("a hole through a two-colour assembly builds", /^ok\|/.test(twoTone), twoTone);
    const holeSide = await run(`(() => {
      const out = [];
      window.brepscript.modelGroup.traverse((o) => {
        if (!o.isMesh) return;
        const c = o.geometry.boundingBox.getCenter(new window.brepscript.THREE.Vector3());
        out.push({ fid: o.userData.featureId, colour: "#" + o.material.color.getHexString(), x: +c.x.toFixed(1) });
      });
      return { colours: [...new Set(out.map((r) => r.colour))],
               cutFaces: out.filter((r) => r.fid && /CY/.test(r.fid)).map((r) => r.colour) };
    })()`);
    check("...the hole is the colour of the block it passes through",
      holeSide.cutFaces.length > 0 && holeSide.cutFaces.every((c) => c === "#c0392b"),
      JSON.stringify(holeSide));
    check("...and no third colour appears", holeSide.colours.length === 2, JSON.stringify(holeSide.colours));

    // ---- 3bb. a preview stays up until the build is ready to replace it ---
    //
    // A mesh too dense for the kernel shows as a view-only preview. Building
    // something from it used to clear that preview the instant the build
    // STARTED, so a heavy model (a four-colour Benchy) left the user looking at
    // an empty scene for the whole build — which reads as "it lost my model".
    // The swap has to happen at the end, with no frame in between showing
    // neither.
    const dropped = await run(`(async () => {
      const N = 200000;                       // over MESH_REFUSE, so: view-only
      const buf = new ArrayBuffer(84 + N * 50);
      const dv = new DataView(buf); dv.setUint32(80, N, true);
      for (let i = 0; i < N; i++) {
        const o = 84 + i * 50, a = (i % 400) * 0.1, b = Math.floor(i / 400) * 0.1;
        const pts = [a, b, 0, a + 0.09, b, 0, a, b + 0.09, 1.5];
        for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, pts[k], true);
      }
      const dt = new DataTransfer();
      dt.items.add(new File([buf], "huge-benchy.stl", { type: "model/stl" }));
      window.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
      window.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (/view-only preview/.test(document.getElementById("status-text").textContent)) break;
      }
      let tris = 0;
      window.brepscript.scene.traverse((o) => { if (!o.isMesh || !o.geometry?.attributes?.position) return;
        const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; });
      return { status: document.getElementById("status-text").textContent,
               sceneTris: Math.round(tris),
               model: window.brepscript.modelGroup.children.length };
    })()`);
    check("an oversized mesh shows as a view-only preview",
      /view-only preview/.test(dropped.status), dropped.status);
    check("...with its triangles on screen and no model built",
      dropped.sceneTris > 150000 && dropped.model === 0, JSON.stringify(dropped));

    const swap = await run(`(async () => {
      const B = window.brepscript;
      const el = document.getElementById("code");
      el.value = "let s = sphere({ r: 17, $fn: 128 });\\n"
        + "for (let i = 0; i < 3; i++) s = difference(s, translate([i * 7 - 7, 0, 0], cylinder({ r: 3.1, h: 44, $fn: 64, center: true })));\\n"
        + "return s;";
      el.dispatchEvent(new Event("input", { bubbles: true }));
      const sceneTris = () => { let t = 0;
        B.scene.traverse((o) => { if (!o.isMesh || !o.geometry?.attributes?.position) return;
          const g = o.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; });
        return t; };
      const busy = () => document.getElementById("status").className === "busy";
      // Every busy message, not just the first: the input handler puts a "…"
      // placeholder up before rebuild() gets as far as saying anything real.
      let sawBusy = false, blank = 0, heldPreview = 0;
      const busyTexts = new Set();
      const t0 = performance.now();
      await new Promise((done) => {
        const tick = () => {
          const now = performance.now();
          if (busy()) { sawBusy = true; busyTexts.add(document.getElementById("status-text").textContent); }
          if (sawBusy && busy()) {
            const t = sceneTris();
            // still the big preview? good. nothing at all? that's the bug.
            if (t > 150000) heldPreview++;
            else if (B.modelGroup.children.length === 0) blank++;
          }
          if (now - t0 > 120000 || (sawBusy && !busy())) return done();
          setTimeout(tick, 100);
        };
        tick();
      });
      return { blank, heldPreview, busyText: [...busyTexts].join(" ⟂ "), afterTris: Math.round(sceneTris()),
               afterModel: B.modelGroup.children.length, afterVisible: B.modelGroup.visible,
               status: document.getElementById("status-text").textContent };
    })()`);
    check("the preview stays on screen for the whole build",
      swap.heldPreview > 3 && swap.blank === 0, JSON.stringify(swap));
    check("...and the status says so while it waits",
      /preview stays until it's ready/.test(swap.busyText), swap.busyText);
    check("...then the built model replaces it",
      swap.afterModel > 0 && swap.afterVisible && /\bsolid/.test(swap.status), JSON.stringify(swap));
    check("...with the preview's triangles gone, not left underneath",
      swap.afterTris < 100000, `${swap.afterTris} triangles left in the scene`);

    // ---- 3c. the negatives overlay builds on its own key ------------------
    await setCode("return difference(cube([30, 30, 12]), translate([15, 15, -1], cylinder({ r: 6, h: 14, $fn: 32 })));");
    await settle(60000);
    await run(`document.getElementById("neg-btn").click()`);
    let negs = 0;
    for (let i = 0; i < 60; i++) {
      negs = await run(`(() => { let n = 0;
        window.brepscript.scene.traverse((o) => { if (o.isLineSegments && o.userData.featureId) n++; });
        return n; })()`);
      if (negs > 0) break;
      await wait(500);
    }
    check("the negative-shape overlay builds too (its own worker key)", negs > 0, `${negs} outlines`);
    const afterNeg = await run("window.brepscript.workerInfo()");
    check("...without evicting the model the exporters read", afterNeg.holdsModel, JSON.stringify(afterNeg));
    await run(`document.getElementById("neg-btn").click()`);

    // ---- 3d. "press Build" must have a Build to press --------------------
    //
    // A model heavy enough to be worth confirming waits behind a Build button.
    // That button used to exist only inside the chat bubble — while the same
    // code path brings the EDITOR forward — so the status bar said "press
    // Build" with the only button behind another card. A prompt you cannot
    // obey is worse than no prompt.
    const held = await run(`(async () => {
      const r = await window.brepscript.applyGeneratedCode(${JSON.stringify(MONSTER)});
      const btn = document.getElementById("build-now-btn");
      const bar = document.getElementById("build-bar");
      const code = document.getElementById("code").getBoundingClientRect();
      const bb = bar.getBoundingClientRect();
      return {
        detail: r.detail,
        status: document.getElementById("status-text").textContent,
        headerHidden: bar.hidden,
        headerVisible: btn.offsetParent !== null,
        headerText: btn.textContent,
        note: document.getElementById("build-bar-note").textContent,
        // the bar spans the editor and sits under the code it will build
        underTheCode: Math.abs(bb.top - code.bottom) < 4 && bb.width > code.width * 0.9,
        chatButtons: [...document.querySelectorAll("#chat-msgs button")].map((b) => b.textContent),
        codeInEditor: document.getElementById("code").value.trim() === ${JSON.stringify(MONSTER.trim())},
      };
    })()`);
    check("a monster model is held behind a Build button",
      /held behind the Build button/.test(held.detail || ""), JSON.stringify(held.detail));
    check("...and that button is actually ON SCREEN",
      held.headerVisible === true && held.headerHidden === false, JSON.stringify(held));
    check("...labelled as a build, with the estimate",
      /Build/.test(held.headerText) && /\d+s/.test(held.headerText), held.headerText);
    check("...spanning the editor, directly under the code",
      held.underTheCode === true, JSON.stringify(held.note));
    check("...with a copy in the chat too",
      held.chatButtons.some((t) => /Build/.test(t)), JSON.stringify(held.chatButtons));
    check("...the code waiting in the editor, unbuilt", held.codeInEditor === true);
    check("...and the status pointing at where the button is",
      /press ▶ Build under the code/.test(held.status), held.status);

    // Pressing it must build that code, and retire the button.
    const pressed = await run(`(async () => {
      document.getElementById("build-now-btn").click();
      await new Promise((r) => setTimeout(r, 300));
      return document.getElementById("status").className;
    })()`);
    check("...pressing it starts the build", pressed === "busy", pressed);
    const afterHold = await settle(180000);
    check("...which finishes", /^ok\|/.test(afterHold), afterHold);
    const gone = await run(`(() => {
      const btn = document.getElementById("build-now-btn");
      return { hidden: document.getElementById("build-bar").hidden, visible: btn.offsetParent !== null,
               chat: [...document.querySelectorAll("#chat-msgs button")].map((b) => b.textContent) };
    })()`);
    check("...and the Build button retires itself", gone.hidden === true && gone.visible === false,
      JSON.stringify(gone));

    // A held build that the user walks away from must not leave a button
    // offering to build code that is no longer in the editor.
    await run(`window.brepscript.applyGeneratedCode(${JSON.stringify(MONSTER)})`);
    await setCode("return cube([12, 12, 12]);");
    await settle(60000);
    const stale = await run(`(() => { const b = document.getElementById("build-now-btn");
      return { hidden: document.getElementById("build-bar").hidden,
               visible: b.offsetParent !== null }; })()`);
    check("...and editing the code retires it too", stale.hidden === true, JSON.stringify(stale));

    // ---- 4. a build error is reported as a build error -------------------
    // A worker must not turn "your model is broken" into "the worker died and
    // we quietly rebuilt it on the main thread" — nor into a build that never
    // comes back.
    await setCode("return sphere({ r: -5 });");
    const bad = await settle(30000);
    check("an impossible model settles instead of hanging", !/TIMED OUT/.test(bad), bad);
    const afterBad = await run("window.brepscript.workerInfo()");
    check("...and the worker survives it", afterBad.live && !afterBad.out, JSON.stringify(afterBad));

    // ---- 5. cancellation: a superseded build is dropped, not queued ------
    await setCode(HEAVY);
    // Well into the build: a run that has only just started is deliberately
    // left to finish (respawning a worker costs more than letting it end), so
    // the cancel path only engages once the build is worth killing.
    await wait(3000);
    const before = (await run("window.brepscript.workerInfo()")).epoch;
    await setCode(SIMPLE);                    // supersede it immediately
    const quick = await settle(30000);
    const after = await run("window.brepscript.workerInfo()");
    check("a superseded heavy build is cancelled, not queued",
      after.epoch > before, `epoch ${before} -> ${after.epoch}`);
    check("...and the newer model is what ends up on screen", /1 solid/.test(quick), quick);
    check("...with the worker healthy afterwards", after.live && after.holdsModel, JSON.stringify(after));

    // ---- 6. the fallback path still builds ------------------------------
    await run("window.brepscript.disableWorker()");
    await setCode(SIMPLE.replace("[30, 30, 12]", "[24, 18, 9]"));
    const fell = await settle(60000);
    check("with the worker disabled the old synchronous path still builds",
      /1 solid/.test(fell), fell);
    const fbInfo = await run("window.brepscript.workerInfo()");
    check("...and it knows the geometry is local now", fbInfo.out && !fbInfo.hasModel, JSON.stringify(fbInfo));
    const fbStl = await run("window.brepscript.exportSTL()");
    check("...and STL export still works from the main thread",
      typeof fbStl === "string" && /facet normal/.test(fbStl), String(fbStl).slice(0, 40));
    const fbSize = await run(`(() => {
      const bb = new window.brepscript.THREE.Box3().setFromObject(window.brepscript.modelGroup);
      return ["x","y","z"].map((a) => +(bb.max[a] - bb.min[a]).toFixed(2)).join(",");
    })()`);
    check("...producing the same geometry the worker would have", fbSize === "24,18,9", fbSize);
  } catch (e) {
    fail++;
    say(`  FAIL  the run threw — ${e.message}`);
  }

  clearTimeout(watchdog);
  say(`\nworker check: ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
