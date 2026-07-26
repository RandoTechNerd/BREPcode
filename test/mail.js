// Desktop SMTP. The one thing here that must not break is the promise made in
// the UI: the password is stored encrypted and can never be read back out to
// the page. These run the real module against a stubbed Electron and a stubbed
// nodemailer, so the config handling, the "keep the existing password" rule and
// the error wording are all covered without touching a mail server.
import Module from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "brepmail-"));

// ---- stubs ---------------------------------------------------------------
const handlers = {};
let keychain = true;                 // flipped to test the no-keychain path
let lastTransport = null, sendResult = null, verifyResult = null;

const electron = {
  app: { getPath: () => userData },
  ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } },
  safeStorage: {
    isEncryptionAvailable: () => keychain,
    // reversible stand-in for DPAPI: the point is that what lands on disk is
    // not the password, and that decrypt is the only way back
    encryptString: (s) => Buffer.from("ENC:" + s, "utf8"),
    decryptString: (b) => {
      const s = b.toString("utf8");
      if (!s.startsWith("ENC:")) throw new Error("not encrypted by this keychain");
      return s.slice(4);
    },
  },
};
const nodemailer = {
  createTransport: (cfg) => {
    lastTransport = cfg;
    return {
      verify: async () => { if (verifyResult) throw verifyResult; return true; },
      sendMail: async (m) => {
        if (sendResult) throw sendResult;
        lastTransport.sent = m;
        return { messageId: "<test@brepcode>", accepted: [m.to] };
      },
    };
  },
};

const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return electron;
  if (request === "nodemailer") return nodemailer;
  return realLoad.call(this, request, parent, isMain);
};

const { register } = (await import("../desktop/mail.cjs")).default
  ?? await import("../desktop/mail.cjs");
register();

const call = (ch, arg) => handlers[ch](null, arg);
const onDisk = () => JSON.parse(fs.readFileSync(path.join(userData, "mail.json"), "utf8"));

// ---- the IPC surface is exactly what the preload exposes, no more ---------
check("registers exactly the four documented channels",
  Object.keys(handlers).sort().join(",") === "mail:load,mail:save,mail:send,mail:test",
  Object.keys(handlers).join(","));

// ---- saving --------------------------------------------------------------
let r = call("mail:save", { host: "", user: "me@x.com", pass: "abcd" });
check("refuses a save with no host", r.ok === false && /host/i.test(r.error), JSON.stringify(r));

r = call("mail:save", { host: "smtp.gmail.com", port: "587", user: "me@x.com", pass: "abcd efgh ijkl mnop" });
check("saves a valid config", r.ok === true, JSON.stringify(r));

let disk = onDisk();
check("password is encrypted on disk", disk.encrypted === true && !/abcd/.test(disk.pass), disk.pass);
check("app-password spaces are stripped",
  Buffer.from(disk.pass, "base64").toString("utf8") === "ENC:abcdefghijklmnop",
  Buffer.from(disk.pass, "base64").toString("utf8"));
check("port coerced to a number", disk.port === 587 && typeof disk.port === "number", String(disk.port));
check("from defaults to the username", disk.from === "me@x.com", disk.from);

// ---- the promise the UI makes: the page can never read the password ------
r = call("mail:load");
check("load returns the config", r.ok === true && r.config.host === "smtp.gmail.com");
check("load NEVER returns the password",
  !("pass" in r.config) && !JSON.stringify(r.config).includes("abcd"), JSON.stringify(r.config));
check("load reports that a password exists without revealing it", r.config.hasPass === true);

// ---- editing the host must not wipe the stored password ------------------
r = call("mail:save", { host: "smtp.office365.com", port: 587, user: "me@x.com", pass: "" });
check("blank password on save keeps the stored one",
  r.ok === true && onDisk().pass === disk.pass, onDisk().pass);
check("the other fields still updated", onDisk().host === "smtp.office365.com");

// ---- no keychain: still works, but honestly flagged ----------------------
keychain = false;
call("mail:save", { host: "smtp.gmail.com", user: "me@x.com", pass: "plain-pw" });
check("without a keychain it stores plainly rather than failing", onDisk().pass === "plain-pw");
check("...and says so, so the UI can warn", onDisk().encrypted === false);
check("load surfaces the unencrypted state", call("mail:load").config.encrypted === false);
keychain = true;

// ---- transport wiring ----------------------------------------------------
call("mail:save", { host: "smtp.gmail.com", port: 587, user: "me@x.com", pass: "pw1" });
await call("mail:test");
check("587 uses STARTTLS, not implicit TLS",
  lastTransport.secure === false && lastTransport.requireTLS === true, JSON.stringify(lastTransport));
check("the decrypted password reaches the transport", lastTransport.auth.pass === "pw1", lastTransport.auth.pass);

call("mail:save", { host: "smtp.gmail.com", port: 465, user: "me@x.com", pass: "pw1" });
await call("mail:test");
check("465 uses implicit TLS", lastTransport.secure === true, JSON.stringify(lastTransport));

// ---- sending -------------------------------------------------------------
r = await call("mail:send", { to: "", subject: "x" });
check("refuses to send with no recipient", r.ok === false && /recipient/i.test(r.error), JSON.stringify(r));

const stl = Buffer.from("solid test\nendsolid test\n", "utf8");
r = await call("mail:send", {
  to: "you@x.com", subject: "A part", text: "body",
  attachments: [{ filename: "model.stl", contentBase64: stl.toString("base64") }],
});
check("sends", r.ok === true && r.accepted[0] === "you@x.com", JSON.stringify(r));
const sent = lastTransport.sent;
check("attachment survives the base64 round-trip",
  Buffer.compare(sent.attachments[0].content, stl) === 0, String(sent.attachments[0].content));
check("attachment keeps its filename", sent.attachments[0].filename === "model.stl");
check("From is the configured account, not the recipient", sent.from === "me@x.com", sent.from);

// ---- error wording: a person has to be able to act on these --------------
verifyResult = Object.assign(new Error("Invalid login: 535-5.7.8 Username and Password not accepted"), { code: "EAUTH" });
r = await call("mail:test");
check("a rejected login explains app passwords",
  r.ok === false && /app password/i.test(r.error), r.error);

verifyResult = Object.assign(new Error("getaddrinfo ENOTFOUND smtp.gmial.com"), { code: "ENOTFOUND", hostname: "smtp.gmial.com" });
r = await call("mail:test");
check("a typo'd host names the host it couldn't find",
  r.ok === false && r.error.includes("smtp.gmial.com"), r.error);

verifyResult = Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" });
r = await call("mail:test");
check("a blocked port mentions the port and the firewall",
  r.ok === false && /port/i.test(r.error) && /firewall/i.test(r.error), r.error);

verifyResult = null;
sendResult = new Error("Message failed: 552 size limit exceeded");
r = await call("mail:send", { to: "you@x.com" });
check("an unrecognised failure passes the server's own words through",
  r.ok === false && r.error.includes("552"), r.error);
sendResult = null;

// ---- nothing saved yet ---------------------------------------------------
fs.rmSync(path.join(userData, "mail.json"));
check("load with nothing saved is not an error", call("mail:load").ok === true && call("mail:load").config === null);
r = await call("mail:send", { to: "you@x.com" });
check("sending before setup explains itself", r.ok === false && /settings/i.test(r.error), r.error);

Module._load = realLoad;
fs.rmSync(userData, { recursive: true, force: true });

console.log(`\nmail: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
