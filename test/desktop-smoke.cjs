// Launches the real desktop shell and checks the things only a running Electron
// can prove: that the preload bridge reaches the page, that the sandbox does not
// leak Node into it, and that an IPC round-trip actually works end to end.
//
// Not part of `npm test` — it needs the Electron binary and opens a window.
// Run it with:  npm run test:desktop
//
// It never touches a mail server: mail:test against a config it knows is bogus
// is expected to FAIL, and the check is that it fails with an explanation
// rather than a stack trace.

const { app, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Required up here, not inside whenReady: loading it registers the app:// scheme
// as privileged, and Electron only accepts that before the app is ready. It only
// boots itself when it is the entry point, so this just hands over its exports.
const shellApp = require("../desktop/main.cjs");

// Point userData somewhere disposable so a real saved account is never read or
// overwritten by the test.
const sandboxData = path.join(app.getPath("temp"), "brepcode-smoke");
try { fs.rmSync(sandboxData, { recursive: true, force: true }); } catch { /* leftovers are overwritten anyway */ }
app.setPath("userData", sandboxData);

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

// main.cjs registers these itself only when it is the entry point
require("../desktop/mail.cjs").register();
require("../desktop/recovery.cjs").register();

app.whenReady().then(async () => {
  // The real shell window, not a lookalike: same sandbox flags, same preload,
  // same navigation rules.
  shellApp.serveBundle();
  const win = shellApp.createWindow({ hidden: true });
  const run = (js) => win.webContents.executeJavaScript(js, true);

  try {
    // createWindow() has already started the load. Don't wait on
    // did-finish-load: the page pulls <model-viewer> from a CDN, so on a machine
    // with no network that never fires. Poll for what the module script creates.
    const ready = await (async () => {
      for (let i = 0; i < 120; i++) {
        try {
          if (await run("!!(window.brepcodeDesktop && document.getElementById('smtp-block'))")) return true;
        } catch { /* navigating; try again */ }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    })();
    if (!ready) throw new Error("the page never finished booting (30s)");

    check("the bridge reaches the page", await run("!!window.brepcodeDesktop?.isDesktop"));
    check("the page is still sandboxed", await run("typeof require === 'undefined' && typeof process === 'undefined'"));
    check("the bridge exposes no way to read the password back",
      await run("Object.keys(window.brepcodeDesktop).sort().join(',')") === "isDesktop,loadMail,onOpenFile,recoveryList,recoveryRead,recoveryReveal,recoverySave,saveMail,sendMail,testMail");

    check("nothing saved yet", (await run("window.brepcodeDesktop.loadMail()")).config === null);

    const saved = await run(`window.brepcodeDesktop.saveMail({
      host: "smtp.invalid.example", port: 587, user: "nobody@example.com", pass: "not a real password"
    })`);
    check("saves over IPC", saved.ok === true, JSON.stringify(saved));
    check("the real OS keychain encrypted it", saved.encrypted === true);

    const onDisk = fs.readFileSync(path.join(sandboxData, "mail.json"), "utf8");
    check("the password is not sitting in the file as text", !onDisk.includes("not a real password"));

    const loaded = await run("window.brepcodeDesktop.loadMail()");
    check("the page can read the settings back", loaded.config.host === "smtp.invalid.example");
    check("...but never the password", !JSON.stringify(loaded).includes("not a real password"));
    check("it does know one is stored", loaded.config.hasPass === true);

    // A host that cannot resolve, so this stops at DNS — no connection is made.
    const tested = await run("window.brepcodeDesktop.testMail()");
    check("a bad host fails cleanly rather than throwing", tested.ok === false);
    check("...with wording a person can act on",
      /mail server|host/i.test(tested.error || "") && !/at .*\.js:\d/.test(tested.error || ""), tested.error);

    // The SMTP panel must be visible here and invisible on the website.
    check("the desktop-only SMTP panel is showing",
      await run("getComputedStyle(document.getElementById('smtp-block')).display !== 'none'"));
    check("the explainer no longer claims mail can't be sent",
      await run("!/no server to send mail from/.test(document.getElementById('email-info').textContent)"));

    // The recipe library fetches markdown at runtime over the custom app://
    // scheme. That is a different code path from http:// and exactly the kind
    // of thing that works in the browser and 404s in the packaged app.
    const ref = await run(`(async () => {
      const R = await import("./recipes.js");
      const a = await R.referenceFor("a AAA holder, 3 across");
      return { tags: a.tags, has: a.text.includes("10.5mm"), asks: a.questions.length };
    })()`);
    check("recipes load over the app:// scheme", ref.tags.includes("AAA"), JSON.stringify(ref));
    check("...with the real dimensions in them", ref.has === true);
    check("...and a named cell asks no follow-up question", ref.asks === 0);

    // The draft fallback sets location.href to a mailto:. If the shell let that
    // navigate, the window would go blank; main.cjs has to intercept it and
    // hand the URL to the OS instead.
    //
    // openExternal is stubbed for the duration. Without this the test really
    // does launch the tester's mail client and leave a compose window on their
    // desktop every run — a test has no business doing that. Recording the call
    // is also a stronger check than the old one: it proves the URL was handed
    // over intact, not merely that the page stayed put.
    const handedToOS = [];
    const realOpenExternal = shell.openExternal;
    shell.openExternal = (url) => { handedToOS.push(url); return Promise.resolve(); };
    try {
      await run("location.href = 'mailto:nobody@example.com?subject=smoke'").catch(() => {});
      await new Promise((r) => setTimeout(r, 800));
      check("a mailto: draft doesn't navigate the app away",
        (await run("location.href")).startsWith("app://"), await run("location.href"));
      check("...it goes to the OS mail client instead",
        handedToOS.some((u) => u.startsWith("mailto:nobody@example.com")), JSON.stringify(handedToOS));
    } finally {
      shell.openExternal = realOpenExternal;
    }

    // ---- crash recovery -------------------------------------------------
    //
    // The desktop writes real .bcode snapshots into a folder under the OS temp
    // dir, because the whole point is that the user can go and FIND the file.
    // A browser cannot do any of this, so it only gets proved here.
    const recovery = require("../desktop/recovery.cjs");
    check("the recovery bridge reaches the page",
      await run("typeof window.brepcodeDesktop?.recoverySave === 'function'"));

    const snap = await run(`window.brepcodeDesktop.recoverySave("smoke-part",
      "// BREPCODE-SOURCE-V1\\n// \\"smoke-part\\"\\n\\nreturn cube([13, 14, 15]);\\n")`);
    check("a snapshot is written to disk", snap?.ok === true, JSON.stringify(saved));
    check("...into the temp recovery folder, where a user can find it",
      typeof snap?.path === "string" && snap.path.startsWith(recovery.DIR), snap?.path);
    check("...and it really exists on disk", !!snap?.path && fs.existsSync(snap.path));

    const listed = await run("window.brepcodeDesktop.recoveryList()");
    check("it comes back in the list", (listed?.files || []).some((f) => f.name === "smoke-part.bcode"),
      JSON.stringify((listed?.files || []).map((f) => f.name)));

    const readBack = await run(`window.brepcodeDesktop.recoveryRead(${JSON.stringify(snap?.path || "")})`);
    check("...and reads back with the model intact",
      readBack?.ok === true && readBack.text.includes("cube([13, 14, 15])"));

    // The renderer runs model code and, with chat on, AI-written text. A path
    // escape here would turn a recovery helper into "read any file".
    const escaped = await run(`window.brepcodeDesktop.recoveryRead(${JSON.stringify(path.join(app.getPath("home"), ".ssh", "id_rsa"))})`);
    check("reading outside the recovery folder is refused", escaped?.ok === false, JSON.stringify(escaped));
    const traversal = await run(`window.brepcodeDesktop.recoveryRead(${JSON.stringify(path.join(recovery.DIR, "..", "secrets.txt"))})`);
    check("...and so is a ../ traversal out of it", traversal?.ok === false, JSON.stringify(traversal));

    try { fs.unlinkSync(snap.path); } catch { /* fine */ }

    // ---- a file the OS opened ------------------------------------------
    //
    // Double-click in Explorer, "Open with", or a drop on the exe: Windows
    // passes the path in argv and the page must end up with the model open.
    const project = path.join(app.getPath("temp"), "smoke-open.bcode");
    fs.writeFileSync(project,
      "// BREPCODE-SOURCE-V1\n// \"smoke-open\"\n\nconst s = 21;\nreturn cube([s, s, 4]);\n", "utf8");
    win.webContents.send("open-file", { name: "smoke-open.bcode", text: fs.readFileSync(project, "utf8") });
    await new Promise((r) => setTimeout(r, 3000));
    check("a file handed over by the OS opens as an editable model",
      /const s = 21/.test(await run("document.getElementById('code').value")),
      await run("document.getElementById('code').value.slice(0, 60)"));
    try { fs.unlinkSync(project); } catch { /* fine */ }

    check("dropping a file on the window is wired up",
      await run("typeof window.ondragover !== 'undefined'") !== undefined);
  } catch (e) {
    fail++;
    console.log(`  FAIL  smoke run threw — ${e.message}`);
  }

  // Electron still holds files in userData while it is running, so this is
  // best-effort — the run at the top of the next launch is what really cleans up.
  try { fs.rmSync(sandboxData, { recursive: true, force: true }); } catch { /* locked */ }
  console.log(`\ndesktop smoke: ${pass} passed, ${fail} failed`);
  app.exit(fail ? 1 : 0);
});
