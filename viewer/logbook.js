// A log file, written to a folder you choose, so someone can read it later.
//
// The app has never written logs. That was defensible while everything it did
// was visible on screen, and it stopped being defensible the first time a
// model failed to import three different ways across an afternoon and there
// was nothing to look at afterwards but memory. "Check the logs" was answered
// with "there are none".
//
// Three constraints shaped this:
//
//   IT IS OFF, AND HIDDEN, UNTIL ASKED FOR. A log carries the model source —
//   that is most of what makes it useful — so it lives behind the same lock as
//   the private stash rather than in the open where it could be switched on
//   without the implication being obvious.
//
//   IT WRITES WHERE YOU POINT IT. A file in browser storage is no use to
//   anyone; the point is a real path someone else can open. The File System
//   Access API gives exactly that — a folder handle, granted by the user, that
//   survives reloads.
//
//   IT NEVER COSTS THE APP ANYTHING. Every call is fire-and-forget, batched,
//   and wrapped: a logger that can break a build is worse than no logger.

const DB = "brepcode-logbook", STORE = "handles", KEY = "folder";
const ON_KEY = "brepcode-log-on";

export const supported = () => typeof window !== "undefined"
  && typeof window.showDirectoryPicker === "function";

// The directory handle cannot go in localStorage — it is not JSON. IndexedDB
// stores it structurally, which is the whole reason permission survives a
// reload instead of asking again every session.
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function putHandle(h) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(h, KEY);
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function getHandle() {
  try {
    const db = await idb();
    return await new Promise((res, rej) => {
      const t = db.transaction(STORE, "readonly");
      const q = t.objectStore(STORE).get(KEY);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  } catch { return null; }
}

let dir = null;             // FileSystemDirectoryHandle
let on = false;
let queue = [];
let flushing = false;
let timer = null;
let dropped = 0;            // entries lost while no folder was granted

export function enabled() { return on && !!dir; }
export function folderName() { return dir ? dir.name : null; }

// A day per file. Small enough to open, and the name says which run it is.
function fileName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `brepcode-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`;
}

export async function chooseFolder() {
  if (!supported()) throw new Error("this browser cannot write to a folder — Chrome or Edge can");
  const h = await window.showDirectoryPicker({ id: "brepcode-logs", mode: "readwrite" });
  const perm = await h.requestPermission({ mode: "readwrite" });
  if (perm !== "granted") throw new Error("write permission was not granted");
  dir = h;
  await putHandle(h).catch(() => {});
  return h.name;
}

// Re-attach on load. Permission is remembered per origin, but the browser may
// still want it re-confirmed — asking without a user gesture throws, so a
// refusal here is normal and simply means "not yet".
export async function restore() {
  const h = await getHandle();
  if (!h) return null;
  try {
    const p = await h.queryPermission({ mode: "readwrite" });
    if (p === "granted") { dir = h; return h.name; }
  } catch { /* handle went stale — the folder moved or was removed */ }
  return null;
}

export async function reconnect() {
  const h = dir || await getHandle();
  if (!h) return null;
  const p = await h.requestPermission({ mode: "readwrite" });
  if (p !== "granted") return null;
  dir = h;
  return h.name;
}

export function setEnabled(v) {
  on = !!v;
  try { localStorage.setItem(ON_KEY, on ? "1" : "0"); } catch { /* private mode */ }
  if (!on) queue = [];
}
export function wasEnabled() {
  try { return localStorage.getItem(ON_KEY) === "1"; } catch { return false; }
}

const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 23);

// One line per event, tab-separated, with any extra detail as JSON at the end.
// Grep-able by eye and by tool, which is the point — a log nobody can scan is
// a file, not a log.
export function log(kind, message, detail) {
  if (!on) return;
  let line = `${stamp()}\t${kind}\t${message}`;
  if (detail !== undefined) {
    try { line += `\t${typeof detail === "string" ? detail : JSON.stringify(detail)}`; }
    catch { line += "\t[detail could not be serialised]"; }
  }
  queue.push(line);
  if (!dir) { dropped++; if (queue.length > 500) queue.splice(0, queue.length - 500); return; }
  if (queue.length >= 40) return void flush();
  if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 2000);
}

export async function flush() {
  if (flushing || !dir || !queue.length) return;
  flushing = true;
  const batch = queue;
  queue = [];
  try {
    const fh = await dir.getFileHandle(fileName(), { create: true });
    // Append rather than rewrite: a session that overwrote the day's file
    // would destroy exactly the history someone came looking for.
    const existing = await fh.getFile();
    const w = await fh.createWritable({ keepExistingData: true });
    await w.write({ type: "write", position: existing.size, data: batch.join("\n") + "\n" });
    await w.close();
  } catch (e) {
    // Put them back so nothing is lost to a transient failure, but never grow
    // without bound if the folder has gone away for good.
    queue = batch.concat(queue).slice(-500);
    console.warn("[logbook] could not write:", e);
  } finally {
    flushing = false;
  }
}

// For the case where no folder can be granted at all — the log is still
// collected in memory and can be saved by hand.
export function pending() { return queue.length; }
export function drain() {
  const text = queue.join("\n") + (queue.length ? "\n" : "");
  queue = [];
  return text;
}
export function lostBeforeFolder() { return dropped; }
