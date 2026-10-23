// The native Rust kernel, one utility process per window (kernel-host.cjs).
//
// The page asks for a port once its build worker is listening; this spawns the
// window's kernel host if it isn't running and hands back one end of a fresh
// MessageChannel, the host getting the other. From then on the worker and the
// host talk directly: model data never passes through this process.
//
// Two ways a host goes away, both ending with the worker on its wasm kernel:
//   - the page cancels a long build (it terminates its worker; a native call
//     can't be interrupted, so the host is killed with it and respawned on the
//     next port request, which costs well under a second);
//   - the host crashes or exits: the page is told, the worker drops the port,
//     and the next port request respawns it. After CRASH_LIMIT crashes in one
//     window the native kernel is left off for that window's session.
//
// BREPCODE_NATIVE=0 in the environment turns it off entirely.

const { ipcMain, utilityProcess, MessageChannelMain, webContents } = require("electron");
const path = require("node:path");

const HOST = path.join(__dirname, "kernel-host.cjs");
const CRASH_LIMIT = 3;
const hosts = new Map();      // webContents id -> { proc, killing }
const crashes = new Map();    // webContents id -> count

function hostFor(wc) {
  let h = hosts.get(wc.id);
  if (h) return h;
  const proc = utilityProcess.fork(HOST, [], { serviceName: "BREPcode kernel", stdio: "inherit" });
  h = { proc, killing: false, native: null };
  hosts.set(wc.id, h);
  proc.on("message", (m) => {
    if (!m?.up) return;
    h.native = m.native;
    // up, but the addon didn't load (missing, wrong arch): wasm it is
    if (!m.native) {
      kill(wc.id);
      crashes.set(wc.id, CRASH_LIMIT);
      if (!wc.isDestroyed()) wc.send("kernel-down", `native kernel not available (${m.info})`);
    }
  });
  proc.on("exit", (code) => {
    if (hosts.get(wc.id) === h) hosts.delete(wc.id);
    if (h.killing || wc.isDestroyed()) return;
    crashes.set(wc.id, (crashes.get(wc.id) || 0) + 1);
    wc.send("kernel-down", `the native kernel stopped (exit ${code})`);
  });
  if (!wc.__brepcodeKernelHooked) {
    wc.__brepcodeKernelHooked = true;
    wc.once("destroyed", () => { kill(wc.id); crashes.delete(wc.id); });
  }
  return h;
}

function kill(id) {
  const h = hosts.get(id);
  if (!h) return;
  h.killing = true;
  hosts.delete(id);
  try { h.proc.kill(); } catch { /* already gone */ }
}

function enabled() {
  return process.env.BREPCODE_NATIVE !== "0";
}

function register() {
  ipcMain.on("kernel:port", (e) => {
    const wc = e.sender;
    if (!enabled() || (crashes.get(wc.id) || 0) >= CRASH_LIMIT) {
      wc.send("kernel-down", enabled() ? "the native kernel kept crashing; using the wasm kernel" : "native kernel turned off");
      return;
    }
    const h = hostFor(wc);
    const { port1, port2 } = new MessageChannelMain();
    h.proc.postMessage({ port: true }, [port1]);
    wc.postMessage("kernel-port", null, [port2]);
  });
  ipcMain.on("kernel:reset", (e) => kill(e.sender.id));
}

module.exports = { register, enabled };
