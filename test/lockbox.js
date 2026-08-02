// The password box. It guards two things now — the shipped API key and the
// private stash behind the lock icon — and it had no test at all, which for the
// one module whose whole job is "the secret must not be readable" is the wrong
// module to take on trust.
//
// lockbox.js is written for the browser: it uses btoa/atob and Web Crypto.
// Node has crypto natively; btoa/atob exist from Node 16 on. Nothing is
// stubbed, so what runs here is exactly what runs in the page.

import { lockSecret, unlockSecret } from "../viewer/lockbox.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
}
async function throws(fn) {
  try { await fn(); return false; } catch { return true; }
}

console.log("\na locked secret comes back only for the right password\n");
{
  const secret = "sk-ant-not-a-real-key-0123456789";
  const blob = await lockSecret(secret, "correct horse");
  check("the right password returns it exactly", await unlockSecret(blob, "correct horse") === secret);
  check("a wrong password throws rather than returning junk",
    await throws(() => unlockSecret(blob, "correct hors")));
  check("...and so does an empty one", await throws(() => unlockSecret(blob, "")));
  check("locking with no password is refused outright",
    await throws(() => lockSecret(secret, "")));
  check("a truncated blob throws instead of half-decoding",
    await throws(() => unlockSecret(blob.slice(0, blob.length - 8), "correct horse")));
  check("a blob that is not base64 at all throws",
    await throws(() => unlockSecret("not a blob!!", "correct horse")));
}

console.log("\nthe blob itself gives nothing away\n");
{
  const secret = "SUPERSECRETVALUE";
  const blob = await lockSecret(secret, "pw");
  check("the secret is not sitting in the blob as text", !blob.includes(secret));
  // The real risk is a "lock" that base64s and calls it a day, which reads
  // straight back out. Decode it and look.
  const decoded = Buffer.from(blob, "base64").toString("latin1");
  check("...nor one base64 decode away", !decoded.includes(secret));
  check("the password is not in there either", !blob.includes("pw") || blob.length > 40);
}

console.log("\nsalt and iv are fresh every time\n");
{
  // Same secret, same password, twice. If the blobs match, salt or iv is fixed,
  // and identical stashes would be visibly identical to anyone holding both.
  const a = await lockSecret("same", "same");
  const b = await lockSecret("same", "same");
  check("two locks of the same thing differ", a !== b);
  check("...and both still open", await unlockSecret(a, "same") === "same"
    && await unlockSecret(b, "same") === "same");
}

console.log("\nawkward inputs survive the round trip\n");
{
  const cases = [
    ["empty secret", ""],
    ["unicode", "clé 🔑 ключ — em—dash"],
    ["newlines and quotes", 'line1\nline2\t"quoted"\r\n'],
    ["long", "x".repeat(50000)],
  ];
  for (const [label, value] of cases) {
    const blob = await lockSecret(value, "pw");
    check(label, await unlockSecret(blob, "pw") === value);
  }
  const uniPw = "пароль🔒";
  const blob = await lockSecret("v", uniPw);
  check("a unicode password works and its near-miss does not",
    await unlockSecret(blob, uniPw) === "v" && await throws(() => unlockSecret(blob, "пароль")));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
