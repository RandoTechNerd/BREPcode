// SMTP for the desktop build.
//
// A browser cannot open an SMTP connection — there are no raw sockets — so on
// the website the mail buttons hand off to the user's mail app via mailto. The
// desktop build has a Node process, so it can do the real thing: connect to the
// user's own provider and send, with the model attached, through their account.
// Nothing passes through anyone else's server.
//
// The password is the sensitive part and it is handled accordingly:
//   * encrypted with Electron's safeStorage, which uses the OS keychain (DPAPI
//     on Windows), so it is not readable by another user or a stray file grab;
//   * written to userData, not into the page's localStorage, which any script
//     running in the page could read;
//   * never sent back to the page — there is no IPC call that returns it.
//
// It is still an app password sitting on disk, so the UI says so plainly and
// points at Gmail's app-password flow rather than a real account password.

const { app, safeStorage, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const store = () => path.join(app.getPath("userData"), "mail.json");

function read() {
  try {
    return JSON.parse(fs.readFileSync(store(), "utf8"));
  } catch {
    return null;
  }
}

function decryptPass(saved) {
  if (!saved?.pass) return "";
  if (!saved.encrypted) return saved.pass;          // machine had no keychain
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("this machine's keychain is unavailable, so the saved password can't be read — re-enter it");
  }
  return safeStorage.decryptString(Buffer.from(saved.pass, "base64"));
}

// nodemailer is required lazily: it is only needed if the user actually sets up
// mail, and pulling it in at startup would slow every launch for everyone else.
function transportFor(cfg) {
  const nodemailer = require("nodemailer");
  const port = Number(cfg.port) || 587;
  return nodemailer.createTransport({
    host: cfg.host,
    port,
    // 465 is implicit TLS; 587 opens plain and upgrades with STARTTLS
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

// Turn a provider's terse failure into something a person can act on. "EAUTH"
// and "Invalid login" tell a user nothing about app passwords.
function explain(e) {
  const raw = String(e?.message || e);
  const code = e?.code || "";
  if (/EAUTH|Invalid login|Username and Password not accepted|535/i.test(raw + code)) {
    return "the server rejected that username or password. Gmail and Outlook need an APP PASSWORD, not your normal one — your account password will always fail here.";
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw + code)) {
    return `couldn't find the mail server "${e?.hostname || "that host"}" — check the SMTP host (Gmail is smtp.gmail.com).`;
  }
  if (/ECONNREFUSED|ETIMEDOUT|ESOCKET|Connection timeout/i.test(raw + code)) {
    return "couldn't reach the mail server. Check the port (587 for most, 465 for implicit TLS) and whether a firewall is blocking it.";
  }
  if (/self.signed|unable to verify|CERT/i.test(raw)) {
    return "the server's TLS certificate couldn't be verified.";
  }
  return raw.slice(0, 200);
}

function register() {
  ipcMain.handle("mail:save", (_e, cfg) => {
    try {
      if (!cfg?.host || !cfg?.user) throw new Error("SMTP host and username are both needed");
      const prev = read();
      // a blank password on save means "keep the one already stored"
      let pass = prev?.pass ?? "";
      let encrypted = prev?.encrypted ?? false;
      if (cfg.pass) {
        // Gmail shows app passwords in groups of four; pasting the spaces is
        // the obvious thing to do and would otherwise fail authentication.
        const clean = String(cfg.pass).replace(/\s+/g, "");
        if (safeStorage.isEncryptionAvailable()) {
          pass = safeStorage.encryptString(clean).toString("base64");
          encrypted = true;
        } else {
          pass = clean;
          encrypted = false;
        }
      }
      const next = {
        host: String(cfg.host).trim(),
        port: Number(cfg.port) || 587,
        user: String(cfg.user).trim(),
        from: String(cfg.from || cfg.user).trim(),
        pass,
        encrypted,
      };
      fs.mkdirSync(path.dirname(store()), { recursive: true });
      fs.writeFileSync(store(), JSON.stringify(next, null, 2), { mode: 0o600 });
      return { ok: true, encrypted };
    } catch (e) {
      return { ok: false, error: explain(e) };
    }
  });

  // deliberately no password field in the reply
  ipcMain.handle("mail:load", () => {
    const s = read();
    if (!s) return { ok: true, config: null };
    return {
      ok: true,
      config: { host: s.host, port: s.port, user: s.user, from: s.from, hasPass: !!s.pass, encrypted: !!s.encrypted },
    };
  });

  ipcMain.handle("mail:test", async () => {
    try {
      const s = read();
      if (!s) throw new Error("no mail settings saved yet");
      const t = transportFor({ ...s, pass: decryptPass(s) });
      await t.verify();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: explain(e) };
    }
  });

  ipcMain.handle("mail:send", async (_e, msg) => {
    try {
      const s = read();
      if (!s) throw new Error("no mail settings saved yet");
      if (!msg?.to) throw new Error("no recipient");
      const t = transportFor({ ...s, pass: decryptPass(s) });
      const info = await t.sendMail({
        from: s.from || s.user,
        to: msg.to,
        subject: msg.subject || "A model from BREPcode",
        text: msg.text || "",
        attachments: (msg.attachments || []).map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.contentBase64 || "", "base64"),
        })),
      });
      return { ok: true, id: info.messageId, accepted: info.accepted };
    } catch (e) {
      return { ok: false, error: explain(e) };
    }
  });
}

module.exports = { register };
