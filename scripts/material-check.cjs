// Every way a colour, a material or a filament gets onto a model, on the
// built site (dist-site over http in a plain window: the website path):
//
//   the Material panel   preset chips, colour, generic filament, a spool, a
//                        spool over shapes with their own colours ("Change all
//                        to ...?", Yes / Cancel / take it off), texture, reset
//   right-click a piece  colour, clear colour, Filament row, Material list,
//                        clear material: written on the piece's own call
//   right-click a part   of an assembly: written on the part's entry
//                        (housing: { shape, color, finish }), a ...spread
//                        included, every copy at once
//   the code             finish("Titanium" | "ruby-red", ...), // filament:
//   a reload             the panel's spool comes back
//
//   node build-site.mjs && npx electron scripts/material-check.cjs     (npm run test:material)
const { app, BrowserWindow } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const SITE = path.join(__dirname, "..", "dist-site");
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
const check = (l, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${l}${!ok && d ? "  -- " + String(d).slice(0, 300) : ""}`); };

const PLAIN = `return group(cube(20), translate([30, 0, 0], cylinder({ r: 10, h: 20 })), translate([60, 10, 10], sphere({ r: 10 })));`;
const CALLS = `return group(colorize("#4caf50", cube(20)), translate([30, 0, 0], cube(20)), translate([60, 0, 0], cylinder({ r: 10, h: 20 })));`;
const ASM = `const copper = { color: "#c8702a", finish: "copper" };
const pin = translate([0, 0, 5], cylinder({ r: 2, h: 8 }));
const parts = {
  base: { shape: cube([40, 40, 5]), color: "#4caf50" },
  post: { shape: translate([15, 15, 5], cylinder({ r: 5, h: 20 })), ...copper },
  cap: { shape: translate([25, 25, 5], cube([12, 12, 4])), finish: "Titanium" },
};
["a", "b"].forEach((k, i) => { parts["pin_" + k] = { shape: translate([5 + 30 * i, 5, 0], pin), color: "#ff00ff" }; });
return assembly(parts);`;

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.whenReady().then(() => server.listen(0, "127.0.0.1", async () => {
  setTimeout(() => { console.log("  FAIL  timed out"); app.exit(1); }, 420000).unref?.();
  const win = new BrowserWindow({ width: 1400, height: 900, show: true, x: -3000, y: 0, webPreferences: { backgroundThrottling: false } });
  const run = (js) => win.webContents.executeJavaScript(js, true);
  const url = `http://127.0.0.1:${server.address().port}/index.html?kernel=nvidia`;
  const ready = async () => {
    for (let i = 0; i < 240; i++) { if (await run("!!(window.brepscript && document.getElementById('code'))").catch(() => false)) break; await wait(250); }
    await wait(3500);
    await run(`document.getElementById("mk")?.remove(); document.querySelector(".wl-card .wl-x")?.click(); true`);
  };
  const settle = async () => {
    await wait(700);
    for (let i = 0; i < 300; i++) { if (await run(`/^ok/.test(document.getElementById("status").className)`)) break; await wait(150); }
    await wait(700);
  };
  const setCode = async (src) => {
    await run(`(() => { const el = document.getElementById("code"); el.value = ${JSON.stringify(src)}; el.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await settle();
  };
  const code = () => run(`document.getElementById("code").value`);
  // every solid mesh's look: { fid, part, c, metal, t, env, op, finish }
  const looks = () => run(`JSON.stringify((() => { const out = []; const A = window.brepscript.assembly;
    window.brepscript.modelGroup.traverse((o) => { if (o.isMesh && o.userData.featureId && o.material && !Array.isArray(o.material)) { const m = o.material;
      out.push({ fid: o.userData.featureId, part: o.userData.asm != null ? A.instances[o.userData.asm]?.name : null, c: m.color.getHexString(),
        metal: +m.metalness.toFixed(2), t: +(m.transmission || 0).toFixed(2), env: !!m.envMap, op: +m.opacity.toFixed(2), finish: m.userData.finish || null }); } });
    return out; })())`).then(JSON.parse);
  const panelOpen = async () => { if (!(await run(`!!document.getElementById("mat-filament").closest(".open, [data-open], :not([hidden])")`))) {} await run(`(() => { const c = document.getElementById("mat-reset"); if (!c || c.offsetParent === null) document.getElementById("mat-btn").click(); })()`); await wait(1500); };
  const pickSpool = async (id) => { await run(`(() => { const s = document.getElementById("mat-filament"); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`); await wait(500); };
  const asking = () => run(`document.getElementById("yn-ask").classList.contains("open")`);
  const answer = async (yes) => { await run(`document.getElementById(${JSON.stringify(yes ? "yn-yes" : "yn-no")}).click(); true`); await settle(); };
  // right-click the first mesh whose look matches `pick` (a fid or a part name)
  const rightClick = async (sel) => {
    const ok = await run(`(() => { const T = window.brepscript.THREE || window.THREE; const cam = window.brepscript.camera; const A = window.brepscript.assembly;
      let target = null; window.brepscript.modelGroup.traverse((o) => { if (target || !o.isMesh || !o.userData.featureId) return;
        const part = o.userData.asm != null ? A.instances[o.userData.asm]?.name : null;
        if (${JSON.stringify(sel)}.part ? part === ${JSON.stringify(sel)}.part : o.userData.featureId === ${JSON.stringify(sel)}.fid) target = o; });
      if (!target) return null;
      const b = new T.Box3().setFromObject(target); const top = new T.Vector3((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, b.max.z - 0.01);
      const v = top.project(cam); const c = document.querySelector("canvas").getBoundingClientRect();
      const x = c.left + (v.x + 1) / 2 * c.width, y = c.top + (1 - v.y) / 2 * c.height;
      document.elementFromPoint(x, y).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
      return [x, y]; })()`);
    await wait(900);
    return ok && await run(`document.getElementById("shape-menu").classList.contains("open")`);
  };
  const menuSelect = async (id, value) => { await run(`(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event("change", { bubbles: true })); })()`); await wait(900); await settle(); };
  const menuClick = async (id) => { await run(`document.getElementById(${JSON.stringify(id)}).click(); true`); await wait(900); await settle(); };
  const closeMenu = () => run(`document.getElementById("shape-menu").classList.remove("open"); true`);
  const reset = async () => { await run(`document.getElementById("mat-reset").click(); true`); await wait(800); if (await asking()) await answer(false); };

  try {
    await win.loadURL(url);
    await ready();

    console.log("\nthe Material panel\n");
    await setCode(PLAIN);
    await panelOpen();
    await run(`[...document.querySelectorAll(".mat-preset")].find((b) => b.dataset.name === "Titanium").click(); true`);
    await wait(700);
    let L = await looks();
    check("a preset chip (Titanium) turns the model metal", L.every((l) => l.metal > 0.5), JSON.stringify(L[0]));
    await run(`[...document.querySelectorAll(".mat-preset")].find((b) => b.dataset.name === "PLA").click(); true`);
    await wait(700);
    L = await looks();
    check("...and PLA back to plastic", L.every((l) => l.metal < 0.3), JSON.stringify(L[0]));
    await pickSpool("petg");
    L = await looks();
    check("a generic filament (PETG) makes it see-through", L.every((l) => l.t > 0.3), JSON.stringify(L[0]));
    check("...with no question asked (nothing has its own colour)", !(await asking()));
    await pickSpool("ruby-red");
    L = await looks();
    check("a spool (Ruby Red) colours and clears every plain shape", L.every((l) => l.c === "c0182c" && l.t > 0.3 && l.env), JSON.stringify(L[0]));
    check("...still no question", !(await asking()));
    await run(`(() => { const s = document.getElementById("mat-texture"); s.value = [...s.options].find((o) => o.value !== "0").value; s.dispatchEvent(new Event("change", { bubbles: true })); })()`);
    await wait(500);
    check("a texture pattern is taken", await run(`document.getElementById("mat-texture").value !== "0"`));
    await reset();
    L = await looks();
    check("Reset to defaults puts every shape back to plain", L.every((l) => l.t === 0 && l.c !== "c0182c"), JSON.stringify(L[0]));
    check("...and the filament list back to None", await run(`document.getElementById("mat-filament").value === "opaque"`));

    console.log("\na spool over shapes with their own colours\n");
    await setCode(CALLS);
    await pickSpool("ruby-red");
    check("it asks to change all", await asking());
    await answer(false);
    check("Cancel leaves the code alone", !/finish\(/.test(await code()));
    L = await looks();
    check("...the coloured shape keeps its colour, the plain ones go Ruby Red", L.some((l) => l.c === "4caf50") && L.some((l) => l.c === "c0182c"), JSON.stringify(L.map((l) => l.c)));
    await pickSpool("gold-flake");
    check("another spool asks again", await asking());
    await answer(true);
    check("Yes writes finish(\"gold-flake\", ...) around the model", /return finish\("gold-flake", group\(/.test(await code()), (await code()).slice(-90));
    L = await looks();
    check("...every shape takes it, colourised one included", L.every((l) => l.finish === "gold-flake"), JSON.stringify(L.map((l) => l.finish)));
    await pickSpool("ruby-red");
    check("a different spool on top asks once more", await asking());
    await answer(true);
    check("...and swaps the name in place, not a second wrapper", /return finish\("ruby-red", group\(/.test(await code()) && !/finish\("gold-flake"/.test(await code()), (await code()).slice(-90));
    await pickSpool("opaque");
    check("None offers to take it off", await asking());
    await answer(true);
    check("...Yes takes it off", !/finish\(/.test(await code()));
    await reset();

    console.log("\nright-click a piece\n");
    await setCode(CALLS);
    const fids = (await looks()).map((l) => l.fid);
    const plainFid = (await looks()).find((l) => l.c !== "4caf50")?.fid;
    check("right-click opens the menu", await rightClick({ fid: plainFid }));
    await run(`document.querySelector("#sm-swatches button").click(); true`);
    await wait(900); await settle();
    let C = await code();
    check("a swatch writes colorize() on that piece's call", (C.match(/colorize\(/g) || []).length === 2, C);
    await rightClick({ fid: plainFid });
    await menuClick("sm-clear");
    check("Clear this shape's colour takes it off again", (( await code()).match(/colorize\(/g) || []).length === 1, await code());
    await rightClick({ fid: plainFid });
    await wait(600);
    await menuSelect("sm-filament", "ruby-red");
    C = await code();
    check("the Filament row writes finish(\"ruby-red\", ...) on the call", /finish\("ruby-red", (translate\(\[30, 0, 0\], cube\(20\)\)|cube\(20\))\)/.test(C), C);
    L = await looks();
    check("...and only that piece is Ruby Red, see-through", L.filter((l) => l.finish === "ruby-red").length >= 1 && L.some((l) => l.finish !== "ruby-red") && L.filter((l) => l.finish === "ruby-red").every((l) => l.t > 0.3 && l.env), JSON.stringify(L));
    await rightClick({ fid: plainFid });
    await run(`document.getElementById("sm-more").click(); true`);
    await wait(700);
    await menuSelect("sm-material", "Titanium");
    C = await code();
    check("the Material list writes finish(\"Titanium\", ...) in place", /finish\("Titanium", /.test(C) && !/ruby-red/.test(C), C);
    L = await looks();
    check("...and it looks metal", L.some((l) => l.finish === "Titanium" && l.metal > 0.5), JSON.stringify(L));
    await rightClick({ fid: plainFid });
    await menuClick("sm-matclear");
    check("Clear this piece's material takes finish() off", !/finish\(/.test(await code()), await code());
    await closeMenu();

    console.log("\nright-click a part of an assembly\n");
    await setCode(ASM);
    L = await looks();
    check("the assembly builds with its own looks (green base, copper post, titanium cap)",
      L.some((l) => l.part === "base" && l.c === "4caf50") && L.some((l) => l.part === "post" && l.finish === "copper") && L.some((l) => l.part === "cap" && l.finish === "Titanium"),
      JSON.stringify(L.map((l) => [l.part, l.c, l.finish])));
    check("right-click the base opens the menu", await rightClick({ part: "base" }));
    await wait(600);
    await menuSelect("sm-filament", "ruby-red");
    await wait(600); await settle();
    C = await code();
    check("the Filament row writes finish on the base's entry", /base: \{ shape: cube\(\[40, 40, 5\]\), color: "#4caf50", finish: "ruby-red" \}/.test(C), C.split("\n").find((l) => l.includes("base:")));
    check("...no hint (it went into the code)", await run(`document.getElementById("sm-fil-hint").hidden`));
    L = await looks();
    check("...and the base is Ruby Red", L.filter((l) => l.part === "base").every((l) => l.finish === "ruby-red"), JSON.stringify(L.filter((l) => l.part === "base")));
    await closeMenu();
    check("right-click the copper post (a ...spread)", await rightClick({ part: "post" }));
    await run(`document.querySelectorAll("#sm-swatches button")[5].click(); true`);
    await wait(900); await settle();
    C = await code();
    const postLine = C.split("\n").find((l) => l.includes("post:"));
    check("a colour on it writes color and clears the spread's finish", /\.\.\.copper, color: "#[0-9a-f]{6}", finish: null \}/.test(postLine), postLine);
    L = await looks();
    check("...and the post shows that colour, not copper", L.filter((l) => l.part === "post").every((l) => !l.finish), JSON.stringify(L.filter((l) => l.part === "post")));
    check("right-click the titanium cap", await rightClick({ part: "cap" }));
    await run(`document.getElementById("sm-more").click(); true`);
    await wait(500);
    if (await run(`document.getElementById("sm-matblock").hidden`)) { await run(`document.getElementById("sm-more").click(); true`); await wait(400); }
    await menuClick("sm-matclear");
    C = await code();
    check("Clear material takes finish off the cap's entry", /cap: \{ shape: translate\(\[25, 25, 5\], cube\(\[12, 12, 4\]\)\) \}/.test(C), C.split("\n").find((l) => l.includes("cap:")));
    await closeMenu();
    check("right-click a pin (its name is made in a loop)", await rightClick({ part: "pin_a" }));
    await wait(600);
    const before = await code();
    await menuSelect("sm-filament", "gold-flake");
    // no entry to write on; the shared pin call is the next best place, and
    // when even that is missing it stays on screen with a hint saying why
    const after = await code(), hintShown = await run(`!document.getElementById("sm-fil-hint").hidden`);
    check("...it goes on the shared pin call, or stays on screen with a hint (never both, never neither)",
      after !== before ? /finish\("gold-flake", cylinder\(/.test(after) && !hintShown : hintShown, JSON.stringify({ changed: after !== before, hintShown }));
    check("...the entries themselves are untouched", !/pin_.*finish/.test(after));
    L = await looks();
    check("...and it shows on screen", L.some((l) => l.part === "pin_a" && l.finish === "gold-flake"), JSON.stringify(L.filter((l) => l.part === "pin_a")));
    await closeMenu();

    console.log("\nthe code\n");
    await setCode(`return group(finish("Titanium", cube(20)), translate([30, 0, 0], finish("ruby-red", cube(20))));`);
    L = await looks();
    check("finish(\"Titanium\", ...) renders metal", L.some((l) => l.finish === "Titanium" && l.metal > 0.5), JSON.stringify(L));
    check("finish(\"ruby-red\", ...) renders see-through with depth", L.some((l) => l.finish === "ruby-red" && l.t > 0.3 && l.env && l.op < 1), JSON.stringify(L));
    await setCode(`// filament: gold-flake\nreturn cube(20);`);
    await wait(1500);
    check("// filament: gold-flake picks the spool in the panel", await run(`document.getElementById("mat-filament").value === "gold-flake"`),
      await run(`document.getElementById("mat-filament").value`));

    console.log("\na reload\n");
    await setCode(PLAIN);
    await pickSpool("ruby-red");
    await wait(800);
    await win.loadURL(url);
    await ready();
    await settle();
    await run(`document.getElementById("mat-btn").click(); true`);
    await wait(2500);
    check("the panel's spool comes back after a reload", await run(`document.getElementById("mat-filament").value === "ruby-red"`),
      await run(`document.getElementById("mat-filament").value`));
  } catch (e) { check("no harness error", false, e.stack || String(e)); }
  console.log(`\n${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
}));
