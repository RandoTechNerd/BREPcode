// A tiny password-locked secret box, built on the browser's Web Crypto.
//
// The point: you can ship an API key to someone (your dad) without putting the
// key in the bundle as readable text. lockSecret() encrypts the key WITH a
// password (AES-GCM, key stretched from the password via PBKDF2). Only the
// resulting ciphertext blob is embedded. Without the password, the blob is
// useless — there's no plaintext key sitting in the code to grep out.
//
// Honesty about the limit: once the RIGHT password unlocks it, the key lives
// in the running page and rides on the network request to the AI provider, so
// a determined person who has the password (or who instruments the page after
// unlocking) can read it. For "let my dad try it" this is fine. For real
// secret-keeping, a tiny server proxy that holds the key is the only true fix.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}
function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// plaintext + password -> base64 blob (salt[16] · iv[12] · ciphertext)
export async function lockSecret(plaintext, password) {
  if (!password) throw new Error("a password is required");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, enc.encode(plaintext)));
  const blob = new Uint8Array(salt.length + iv.length + ct.length);
  blob.set(salt, 0);
  blob.set(iv, salt.length);
  blob.set(ct, salt.length + iv.length);
  return b64encode(blob);
}

// base64 blob + password -> plaintext (throws if the password is wrong)
export async function unlockSecret(blob, password) {
  const bytes = b64decode(blob);
  const salt = bytes.subarray(0, 16);
  const iv = bytes.subarray(16, 28);
  const ct = bytes.subarray(28);
  const key = await deriveKey(password, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return dec.decode(pt);
  } catch {
    throw new Error("wrong password");
  }
}
