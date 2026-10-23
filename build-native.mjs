// Builds the native Rust kernel for the desktop app:
//   rust/brepcode-native  ->  vendor/brep-kernel-native/brepcode_native.node
//
// `npm run desktop:build` runs this first. Cargo only rebuilds when the crate
// changed (a first build is ~12 min, mostly the kernel's fat LTO). Without
// cargo it keeps whatever .node is already there, and without one of those
// the exe still works: kernel-host.cjs reports the addon missing and the build
// worker stays on the wasm kernel.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const CRATE = "rust/brepcode-native";
const OUT_DIR = "vendor/brep-kernel-native";
const OUT = join(OUT_DIR, "brepcode_native.node");
const lib = { win32: "brepcode_native.dll", darwin: "libbrepcode_native.dylib" }[process.platform] || "libbrepcode_native.so";
const built = join(CRATE, "target", "release", lib);

const cargo = spawnSync("cargo", ["--version"], { encoding: "utf8", shell: process.platform === "win32" });
if (cargo.status !== 0) {
  console.warn(existsSync(OUT)
    ? `build-native: no cargo here; keeping the existing ${OUT}`
    : "build-native: no cargo and no prebuilt addon; the desktop app will use the wasm kernel only");
  process.exit(0);
}
const r = spawnSync("cargo", ["build", "--release"], { cwd: CRATE, stdio: "inherit", shell: process.platform === "win32" });
if (r.status !== 0) {
  console.error("build-native: cargo build failed");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(built, OUT);
console.log(`build-native: ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
