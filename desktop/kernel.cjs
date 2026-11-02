// The native Rust kernel, a small pool of utility processes per window
// (kernel-host.cjs).
//
// The page asks for ports once its build worker is listening; this spawns the
// window's kernel hosts if they aren't running and hands back one end of a
// fresh MessageChannel per host, each host getting the other. From then on the
// worker and the hosts talk directly: model data never passes through this
// process. Each host builds one thing at a time (the kernel is single-threaded),
// so the pool is what lets a model of separate parts build them side by side.
// POOL hosts, BREPCODE_KERNEL_HOSTS to change it; 1 is the old single host.
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
// Half the cores, at most four: each host is a whole kernel's worth of memory,
// and the page and the GPU still need a core while a build runs.
const POOL = (() => {
  const n = Number(process.env.BREPCODE_KERNEL_HOSTS);
  if (Number.isInteger(n) && n >= 1) return Math.min(n, 16);
  return Math.max(1, Math.min(4, Math.floor(require("node:os").cpus().length / 2)));
})();
const pools = new Map();      // webContents id -> { procs, killing }
const crashes = new Map();    // webContents id -> count

// The pool lives and dies as one: any host that stops takes the rest with it,
// and the worker drops to its wasm kernel exactly as it did with one host.
function poolFor(wc) {
  let pool = pools.get(wc.id);
  if (pool) return pool;
  pool = { procs: [], killing: false };
  pools.set(wc.id, pool);
  const down = (why) => {
    if (pool.killing || wc.isDestroyed()) return;
    kill(wc.id);
    if (!wc.isDestroyed()) wc.send("kernel-down", why);
  };
  for (let i = 0; i < POOL; i++) {
    const proc = utilityProcess.fork(HOST, [], { serviceName: "BREPcode kernel", stdio: "inherit" });
    pool.procs.push(proc);
    proc.on("message", (m) => {
      if (!m?.up || m.native) return;
      // up, but the addon didn't load (missing, wrong arch): wasm it is
      crashes.set(wc.id, CRASH_LIMIT);
      down(`native kernel not available (${m.info})`);
    });
    proc.on("exit", (code) => {
      if (pool.killing || wc.isDestroyed()) return;
      crashes.set(wc.id, (crashes.get(wc.id) || 0) + 1);
      down(`the native kernel stopped (exit ${code})`);
    });
  }
  if (!wc.__brepcodeKernelHooked) {
    wc.__brepcodeKernelHooked = true;
    wc.once("destroyed", () => { kill(wc.id); crashes.delete(wc.id); });
  }
  return pool;
}

function kill(id) {
  const pool = pools.get(id);
  if (!pool) return;
  pool.killing = true;
  pools.delete(id);
  for (const proc of pool.procs) { try { proc.kill(); } catch { /* already gone */ } }
}

function enabled() {
  return process.env.BREPCODE_NATIVE !== "0";
}

// The alpha build ships NVIDIA's kernel and defaults to it; the standard
// build has neither. brepcodeKernelDefault is a BUILD setting in package.json
// (electron-builder -c.extraMetadata.brepcodeKernelDefault=nvidia), and
// BREPCODE_KERNEL=nvidia|rust overrides it for a dev run.
function kernelConfig() {
  const fs = require("node:fs");
  const nvidia = [
    path.join(__dirname, "..", "native", "nvidia-kernel", "build", "Release", "brepcode_nvidia.node"),
    path.join(__dirname, "..", "vendor", "brep-kernel-nvidia", "brepcode_nvidia.node"),
    process.resourcesPath && path.join(process.resourcesPath, "app.asar.unpacked", "vendor", "brep-kernel-nvidia", "brepcode_nvidia.node"),
  ].some((f) => { try { return f && fs.existsSync(f); } catch { return false; } });
  let def = process.env.BREPCODE_KERNEL;
  if (def !== "nvidia" && def !== "rust") {
    try { def = require("../package.json").brepcodeKernelDefault; } catch { def = null; }
  }
  return { nvidia, kernelDefault: def === "nvidia" && nvidia ? "nvidia" : "rust" };
}

function register() {
  ipcMain.on("kernel:config", (e) => { e.returnValue = kernelConfig(); });
  ipcMain.on("kernel:port", (e) => {
    const wc = e.sender;
    if (!enabled() || (crashes.get(wc.id) || 0) >= CRASH_LIMIT) {
      wc.send("kernel-down", enabled() ? "the native kernel kept crashing; using the wasm kernel" : "native kernel turned off");
      return;
    }
    const pool = poolFor(wc);
    const mine = pool.procs.map((proc) => {
      const { port1, port2 } = new MessageChannelMain();
      proc.postMessage({ port: true }, [port1]);
      return port2;
    });
    wc.postMessage("kernel-port", null, mine);
  });
  ipcMain.on("kernel:reset", (e) => kill(e.sender.id));
}

module.exports = { register, enabled, kernelConfig };
