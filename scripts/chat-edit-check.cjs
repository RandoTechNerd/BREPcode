// The in-app chat's SEARCH/REPLACE edit blocks, in a REAL BREPcode window.
//
//   npx electron scripts/chat-edit-check.cjs
//
// Not part of `npm test`: it needs the Electron binary and opens a window. The
// AI is a stand-in: the desktop shell sends every API call through the
// "ai:relay" IPC handler, and this script registers its own, so the replies are
// canned and nothing is spent. Everything between the reply and the model on
// screen is the real app: parsing, applying, building, and the retry when an
// edit does not fit.

process.env.BREPCODE_EMBED = "1";     // don't let main.cjs boot itself

const { app, ipcMain } = require("electron");
const shellApp = require("../desktop/main.cjs");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const SRC = [
  "const WALL = 4;",
  "const TALL = 20;",
  "const box = cube([40, 30, TALL]);",
  "const cut = translate([WALL, WALL, WALL], cube([40 - 2 * WALL, 30 - 2 * WALL, TALL]));",
  "return difference(box, cut);",
].join("\n");

// What the stand-in AI says, one reply per request, and what it was asked.
const replies = [];
const asked = [];
const claudeJson = (text) => JSON.stringify({
  id: "msg_test", type: "message", role: "assistant", model: "claude-test",
  content: [{ type: "text", text }], stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 10 },
});

app.whenReady().then(async () => {
  try { ipcMain.removeHandler("ai:relay"); } catch { /* not registered */ }
  ipcMain.handle("ai:relay", async (_e, req) => {
    let body = {};
    try { body = JSON.parse(req?.body || "{}"); } catch { /* not ours */ }
    // The chat also checks the key and searches for prior art through the same
    // relay; only the modelling request itself gets a canned reply.
    if (!(req?.body || "").includes("THE USER'S REQUEST, VERBATIM")) {
      return { ok: true, status: 200, text: req?.method === "GET" ? JSON.stringify({ data: [{ id: "claude-sonnet-5-5", type: "model", display_name: "Claude Sonnet 5.5" }], has_more: false }) : claudeJson("[]") };
    }
    asked.push(body);
    const text = replies.shift() ?? "I only build models.";
    return { ok: true, status: 200, text: claudeJson(text) };
  });
  shellApp.serveBundle();
  const win = shellApp.createWindow();
  const js = (src) => win.webContents.executeJavaScript(src, true);

  for (let i = 0; i < 200; i++) {
    try { if (await js("!!window.__brepAgent")) break; } catch { /* still loading */ }
    await wait(250);
  }
  await wait(3000);

  // Ask the chat something only the AI answers, and wait for it to settle: the
  // relay has been called `calls` times and no build is running.
  async function ask(text, calls) {
    const before = asked.length;
    await js(`(() => {
      const card = document.getElementById("chat");
      if (!card.classList.contains("open")) document.getElementById("chat-btn").click();
      const p = document.getElementById("ai-provider");
      p.value = "claude"; p.dispatchEvent(new Event("change"));
      document.getElementById("ai-model").value = "claude-sonnet-5-5";
      document.getElementById("ai-key").value = "sk-ant-test-not-a-real-key";
      const input = document.getElementById("chat-input");
      input.value = ${JSON.stringify(text)};
      document.getElementById("chat-send").click();
      return true;
    })()`);
    for (let i = 0; i < 240 && asked.length < before + calls; i++) await wait(250);
    // then let the reply apply and the build finish
    for (let i = 0; i < 120; i++) {
      await wait(250);
      const s = await js(`window.__brepAgent.run({ action: "get_state" }).then((s) => s.status.kind)`);
      if (s !== "busy" && i > 4) break;
    }
    return js(`window.__brepAgent.run({ action: "get_state" })`);
  }
  const chatText = () => js(`document.getElementById("chat-log")?.innerText || document.getElementById("chat").innerText`);

  try {
    const s0 = await js(`window.__brepAgent.run(${JSON.stringify({ action: "set_code", code: SRC, name: "chat-edit-test" })})`);
    check("the starting model built", s0.built && s0.status.kind !== "err", JSON.stringify(s0.status));

    // 1. Two edit blocks, one fenced and one bare, as a model writes them.
    replies.push([
      "Wider box and a thicker wall.",
      "```",
      "<<<<<<< SEARCH",
      "const WALL = 4;",
      "=======",
      "const WALL = 6;",
      ">>>>>>> REPLACE",
      "```",
      "<<<<<<< SEARCH",
      "const box = cube([40, 30, TALL]);",
      "const cut = translate([WALL, WALL, WALL], cube([40 - 2 * WALL, 30 - 2 * WALL, TALL]));",
      "=======",
      "const box = cube([70, 30, TALL]);",
      "const cut = translate([WALL, WALL, WALL], cube([70 - 2 * WALL, 30 - 2 * WALL, TALL]));",
      ">>>>>>> REPLACE",
    ].join("\n"));
    const s1 = await ask("engrave a little star constellation along the rim please", 1);
    const sys = JSON.stringify(asked[0]?.system || "");
    check("the AI was asked (not the local rule engine)", asked.length === 1, `${asked.length} calls`);
    check("...and offered edit blocks, with a model on screen", /SMALL CHANGES AS EDITS/.test(sys));
    check("the edit blocks were applied to the code", (s1.code || "").includes("const WALL = 6;") && s1.code.includes("cube([70, 30, TALL])"), s1.code);
    check("...and nothing else changed", s1.code === SRC.replace("WALL = 4", "WALL = 6").replace(/40/g, "70"), s1.code);
    check("...and it built at the new size", s1.built && s1.status.kind !== "err" && Math.abs(s1.size?.[0] - 70) < 0.5, JSON.stringify({ st: s1.status, size: s1.size }));
    const log1 = await chatText();
    check("the chat shows the prose, not the markers", /Wider box and a thicker wall/.test(log1) && !/<<<<<<< SEARCH/.test(log1), log1.slice(-300));

    // 2. An edit that does not match: nothing applies, the model is told why
    //    and asked for the complete code, and that reply builds.
    const FULL = SRC.replace("TALL = 20", "TALL = 33");
    replies.push(["Taller.", "<<<<<<< SEARCH", "const TALL = 999;", "=======", "const TALL = 33;", ">>>>>>> REPLACE"].join("\n"));
    replies.push(["Here is the complete model.", "```js", FULL, "```"].join("\n"));
    const before = s1.code;
    const s2 = await ask("make the whole thing a little bit taller for my shelf", 2);
    const retry = asked[asked.length - 1];
    const lastUser = JSON.stringify(retry?.messages?.slice(-3) || []);
    check("a missed edit goes back to the AI", asked.length === 3, `${asked.length} calls`);
    check("...saying which edit and asking for the complete model", /could not be applied/.test(lastUser) && /not found/.test(lastUser) && /complete model/.test(lastUser), lastUser.slice(0, 400));
    check("...and the complete reply is what landed", s2.code === FULL && Math.abs(s2.size?.[2] - 33) < 0.5, JSON.stringify({ code: s2.code === FULL, size: s2.size, before: before === s2.code }));
    const log2 = await chatText();
    check("the user was told the edit didn't fit", /edits didn't fit the code/.test(log2), log2.slice(-400));

    // 3. A plain full-code reply still works exactly as before.
    const FULL2 = SRC.replace("TALL = 20", "TALL = 12");
    replies.push(["Shorter.", "```js", FULL2, "```"].join("\n"));
    const s3 = await ask("now go back down to something short and squat", 1);
    check("a whole-file reply still applies", s3.code === FULL2 && Math.abs(s3.size?.[2] - 12) < 0.5, JSON.stringify(s3.size));
  } catch (e) {
    check("the run completed", false, String(e?.stack || e));
  }

  console.log(`\n  ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
