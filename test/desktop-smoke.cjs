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

const { app } = require("electron");
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
      await run("Object.keys(window.brepcodeDesktop).sort().join(',')") === "isDesktop,loadMail,saveMail,sendMail,testMail");

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

    // The draft fallback sets location.href to a mailto:. If the shell let that
    // navigate, the window would go blank; the handler in main.cjs has to catch
    // it. Check the app is still on its own page afterwards.
    await run("location.href = 'mailto:nobody@example.com?subject=smoke'").catch(() => {});
    await new Promise((r) => setTimeout(r, 800));
    check("a mailto: draft doesn't navigate the app away",
      (await run("location.href")).startsWith("app://"), await run("location.href"));
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
