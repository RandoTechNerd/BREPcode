// Drive a REAL BREPcode window through the agent bridge, the way Claude does.
//
//   npm run test:agent          (npx electron scripts/agent-check.cjs)
//
// Not part of `npm test` — it needs the Electron binary and opens a window.
// The window is VISIBLE on purpose, the same lesson gizmo-check.cjs records:
// requestAnimationFrame is suspended in a hidden page, so the render loop never
// runs and a screenshot proves nothing.
//
// It exercises the whole chain end to end — HTTP in, executeJavaScript, the
// page's own rebuild(), and the answer back out — because every part of that
// chain has a way of looking fine on its own and failing together.

const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.BREPCODE_EMBED = "1";     // don't let main.cjs boot itself
process.env.BREPCODE_AGENT = "1";     // ...but do turn the bridge on

const { app } = require("electron");
const shellApp = require("../desktop/main.cjs");
const bridge = require("../desktop/bridge.cjs");

const PORT = bridge.PORT;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// Same HTTP the MCP server speaks, so this tests the surface rather than a
// convenient shortcut past it.
const call = (method, urlPath, body) => new Promise((resolve, reject) => {
  const req = http.request(`http://127.0.0.1:${PORT}${urlPath}`,
    { method, headers: { "Content-Type": "application/json" }, timeout: 120000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        if (res.headers["content-type"]?.includes("image/png")) return resolve({ png: buf });
        try { resolve(JSON.parse(buf.toString() || "{}")); } catch { resolve({ raw: buf.toString().slice(0, 200) }); }
      });
    });
  req.on("error", reject);
  req.on("timeout", () => { req.destroy(); reject(new Error("bridge timed out")); });
  if (body) req.write(JSON.stringify(body));
  req.end();
});

// The on/off decision, checked directly. It runs before any window exists
// because it is pure argument parsing — and because getting it wrong in the
// "off" direction means a silent port on every machine that installs the app.
function checkWanted() {
  const on = {}, off = { BREPCODE_AGENT: "0" };
  check("the bridge is ON by default", bridge.wanted([], {}) === true);
  check("--no-agent turns it off", bridge.wanted(["x", "--no-agent"], {}) === false);
  check("BREPCODE_AGENT=0 turns it off", bridge.wanted([], off) === false);
  check("--agent still turns it on", bridge.wanted(["x", "--agent"], off) === true);
  // An argument is the more deliberate act of the two, so a shortcut must be
  // able to override a machine-wide environment setting in both directions.
  check("an argument beats the environment", bridge.wanted(["x", "--no-agent"], { BREPCODE_AGENT: "1" }) === false);
  check("...and the other way round", bridge.wanted(["x", "--agent"], on) === true);
}

app.whenReady().then(async () => {
  checkWanted();
  shellApp.serveBundle();
  bridge.register();
  const win = shellApp.createWindow();

  // Wait for the page, then for the starter model to have finished building —
  // asking for state mid-boot reads a status that is about to change anyway.
  for (let i = 0; i < 200; i++) {
    try { if (await win.webContents.executeJavaScript("!!window.__brepAgent", true)) break; } catch { /* still loading */ }
    await wait(250);
  }
  await wait(4000);

  try {
    const ping = await call("GET", "/ping");
    check("ping answers", ping.ok === true, JSON.stringify(ping));
    check("ping names the build", !!ping.build, JSON.stringify(ping));
    console.log(`        running build: ${ping.version} ${ping.build}`);

    const s0 = await call("GET", "/state");
    check("state returns the editor's code", typeof s0.code === "string" && s0.code.length > 0);
    check("the starter model built", s0.built === true && s0.status.kind !== "err", JSON.stringify(s0.status));

    // A deliberately parametric model, so set_param has something real to turn.
    // `const`, not a bare assignment: a bare `wall = 4;` makes the dialect
    // sniffer read the whole file as OpenSCAD, where translate() takes no
    // second argument — so it builds nothing and the failure looks like the
    // bridge dropped the code. It is also what makes `wall` a dial: params.js
    // only lifts top-level const declarations with a simple value.
    const SRC = [
      "const wall = 4;",
      "const tall = 20;",
      "difference(",
      "  cube([40, 30, tall]),",
      "  translate([wall, wall, -1], cube([40 - 2 * wall, 30 - 2 * wall, tall]))",
      ");",
    ].join("\n");
    const s1 = await call("POST", "/command", { action: "set_code", code: SRC, name: "bridge-test-box" });
    check("set_code built the new model", s1.built === true && s1.status.kind !== "err",
      `${s1.status?.kind}: ${s1.status?.text || s1.error}`);
    check("set_code put the code in the editor", (s1.code || "").includes("wall = 4"));
    check("the model is the size it should be",
      Array.isArray(s1.size) && Math.abs(s1.size[0] - 40) < 0.5 && Math.abs(s1.size[1] - 30) < 0.5,
      JSON.stringify(s1.size));
    check("the name was taken", s1.name === "bridge-test-box", s1.name);
    check("the parameter is exposed as a dial",
      (s1.params || []).some((p) => p.name === "wall"), JSON.stringify(s1.params));

    // Turning the dial must change the SOLID, not just a number somewhere —
    // an inner wall of 10 leaves a 20x10 hole, so the outside stays 40x30 and
    // the proof has to come from the source the app rebuilt.
    const s2 = await call("POST", "/command", { action: "set_param", name: "wall", value: 10 });
    check("set_param rebuilt without error", s2.built === true && s2.status.kind !== "err",
      `${s2.status?.kind}: ${s2.status?.text || s2.error}`);
    check("set_param rewrote the source", /wall\s*=\s*10/.test(s2.code || ""), (s2.code || "").slice(0, 60));

    // THE ONE THAT MATTERS, and the one the first version of this file failed to
    // make: a dial that changes the bounding box, checked against what the call
    // ITSELF reported rather than a later poll. setParam does not build — it
    // rewrites the number, dispatches an input event, and lets the editor's own
    // debounced path rebuild. An implementation that starts its own rebuild()
    // races that one and answers with the build BEFORE the change. The model on
    // screen was right and the reported height was a step behind, which is the
    // worst shape a bug can take: confident and wrong.
    const s3 = await call("POST", "/command", { action: "set_param", name: "tall", value: 45 });
    check("set_param reports the size it just built, not the one before",
      Array.isArray(s3.size) && Math.abs(s3.size[2] - 45) < 0.5,
      `reported ${JSON.stringify(s3.size)}, expected z=45`);
    check("...and the status line agrees", /45\.0 mm/.test(s3.status?.text || ""), s3.status?.text);

    // Asking for the value it already has dispatches no input event, so no
    // build is coming: waiting for one would sit here until the timeout.
    const s4 = await call("POST", "/command", { action: "set_param", name: "tall", value: 45 });
    check("setting a dial to the value it already has returns at once",
      s4.ok === true && Math.abs(s4.size[2] - 45) < 0.5, JSON.stringify(s4.size));

    // A build that fails must SAY it failed. Reporting success on a broken
    // model is the one failure mode that wastes the user's whole session.
    //
    // Note what is NOT used here: an unclosed `cube([10, 10,` builds fine,
    // because forgiving mode repairs it — the first attempt at this test
    // "failed" by succeeding. A call to something that does not exist is the
    // kind of wrong no auto-fix can paper over.
    const bad = await call("POST", "/command", { action: "set_code", code: "notAShape([10, 10, 10])" });
    check("a broken model reports err", bad.status?.kind === "err", JSON.stringify(bad.status));
    check("...with something to act on", (bad.status?.text || "").length > 3, bad.status?.text);

    // Put a good model back before the picture is taken.
    await call("POST", "/command", { action: "set_code", code: SRC, name: "bridge-test-box" });
    const view = await call("POST", "/command", { action: "set_view", view: "front" });
    check("set_view accepted", view.ok === true, JSON.stringify(view));
    await wait(600);

    const shot = await call("GET", "/screenshot");
    check("screenshot is a PNG", shot.png?.slice(0, 4).toString("hex") === "89504e47");
    check("screenshot is not a blank frame", (shot.png?.length || 0) > 20000, `${shot.png?.length} bytes`);
    const shotPath = path.join(os.tmpdir(), "brepcode-agent-check.png");
    if (shot.png) { fs.writeFileSync(shotPath, shot.png); console.log(`        screenshot: ${shotPath}`); }

    const stlPath = path.join(os.tmpdir(), "brepcode-agent-check.stl");
    try { fs.rmSync(stlPath); } catch { /* first run */ }
    const stl = await call("POST", "/command", { action: "get_stl", savePath: stlPath });
    check("save_stl wrote a file", stl.ok === true && fs.existsSync(stlPath), JSON.stringify(stl).slice(0, 160));
    check("...and it is a real mesh", (fs.statSync(stlPath).size || 0) > 1000, `${stl.bytes} bytes`);

    // An unknown action must not crash the page or hang the caller.
    const nope = await call("POST", "/command", { action: "definitely_not_a_thing" });
    check("an unknown action is refused politely", /unknown action/.test(nope.error || ""), JSON.stringify(nope));
    const after = await call("GET", "/ping");
    check("the app survived it", after.ok === true);
  } catch (e) {
    check("the run completed", false, String(e?.message || e));
  }

  console.log(`\n  ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
