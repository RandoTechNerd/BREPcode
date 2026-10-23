// Builds NVIDIA's SMLib kernel for the desktop ALPHA:
//   native/nvidia-kernel  ->  vendor/brep-kernel-nvidia/brepcode_nvidia.node
//
// The kernel source is fetched at a pinned release (native/nvidia-kernel/
// fetch-upstream.mjs) and compiled straight into one Node addon with node-gyp,
// so Windows and macOS build it the same way and NVIDIA's own build tooling is
// never needed. A first build is ~10 min (235 kernel files); node-gyp only
// recompiles what changed after that.
//
//   node build-nvidia.mjs           build and stage it (the alpha)
//   node build-nvidia.mjs --clean   remove the staged addon (the standard
//                                   build ships without NVIDIA's kernel)

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const DIR = "native/nvidia-kernel";
const OUT_DIR = "vendor/brep-kernel-nvidia";
const OUT = join(OUT_DIR, "brepcode_nvidia.node");

if (process.argv.includes("--clean")) {
  rmSync(OUT_DIR, { recursive: true, force: true });
  console.log("build-nvidia: no NVIDIA kernel in this build");
  process.exit(0);
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { cwd: DIR, stdio: "inherit", ...opts });
  if (r.status !== 0) { console.error(`build-nvidia: ${cmd} ${args.join(" ")} failed`); process.exit(1); }
};

run(process.execPath, ["fetch-upstream.mjs"]);
// node-gyp ships inside npm; use that one rather than whatever is on PATH
let gyp;
try { gyp = createRequire(import.meta.url).resolve("node-gyp/bin/node-gyp.js"); }
catch { gyp = join(dirname(process.execPath), "node_modules", "npm", "node_modules", "node-gyp", "bin", "node-gyp.js"); }
if (!existsSync(gyp)) { console.error("build-nvidia: node-gyp not found (it comes with npm)"); process.exit(1); }
const arch = process.env.npm_config_arch || process.arch;
run(process.execPath, [gyp, "configure", "--release", `--arch=${arch}`]);
run(process.execPath, [gyp, "build", "--release", "-j", "max"]);
mkdirSync(OUT_DIR, { recursive: true });
copyFileSync(join(DIR, "build", "Release", "brepcode_nvidia.node"), OUT);
console.log(`build-nvidia: ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
