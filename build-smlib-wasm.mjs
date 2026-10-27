// Stages the SMLib kernel as WebAssembly for the website:
//   ../smlib-wasm (github.com/RandoTechNerd/smlib-wasm)  ->  vendor/brep-kernel-smlib/
//
// The same SMLib (from NVIDIA's open-source usd-brep) the desktop alpha runs
// as a native addon, compiled with Emscripten in its own repo. The worker
// (viewer/kernel-worker.js) runs it behind native/nvidia-kernel/adapter.cjs,
// exactly as the desktop does, when the kernel picker says "nvidia". The
// result is committed (as vendor/brep-kernel-rust is), so a site build needs
// no Emscripten.
//
//   node build-smlib-wasm.mjs           copy the smlib-wasm repo's dist/ here
//   node build-smlib-wasm.mjs --build   rebuild it there first (needs its Emscripten SDK)
//
// SMLIB_WASM=<dir> points at the smlib-wasm checkout (default: ../smlib-wasm
// beside this repo's main checkout).

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [process.env.SMLIB_WASM, join(here, "..", "smlib-wasm"), join(here, "..", "..", "smlib-wasm")].filter(Boolean);
const SRC = candidates.map((p) => resolve(p)).find((p) => existsSync(join(p, "src", "api.mjs")));
if (!SRC) {
  console.error(`build-smlib-wasm: no smlib-wasm checkout (looked in ${candidates.join(", ")}); set SMLIB_WASM`);
  process.exit(1);
}
const OUT = join(here, "vendor", "brep-kernel-smlib");

if (process.argv.includes("--build")) execFileSync(process.execPath, ["build.mjs"], { cwd: SRC, stdio: "inherit" });
for (const f of ["smlib.mjs", "smlib.wasm"]) {
  if (!existsSync(join(SRC, "dist", f))) { console.error(`build-smlib-wasm: ${SRC}/dist/${f} is missing: node build.mjs there first (or --build)`); process.exit(1); }
}

mkdirSync(OUT, { recursive: true });
copyFileSync(join(SRC, "dist", "smlib.mjs"), join(OUT, "smlib.mjs"));
copyFileSync(join(SRC, "dist", "smlib.wasm"), join(OUT, "smlib.wasm"));
copyFileSync(join(SRC, "LICENSE"), join(OUT, "LICENSE"));
copyFileSync(join(SRC, "THIRD_PARTY_NOTICES.md"), join(OUT, "THIRD_PARTY_NOTICES.md"));
// api.mjs sits beside the module here, not one folder up
writeFileSync(join(OUT, "api.mjs"), readFileSync(join(SRC, "src", "api.mjs"), "utf8").split('"../dist/smlib.mjs"').join('"./smlib.mjs"'));

let commit = "unknown";
try { commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: SRC }).toString().trim(); } catch { /* not a git checkout */ }
writeFileSync(join(OUT, "README.md"), `# vendor/brep-kernel-smlib

The SMLib B-rep kernel, based on NVIDIA's open-source usd-brep (SMLib +
SM_API, v1.0.1, Apache-2.0), compiled to WebAssembly in
https://github.com/RandoTechNerd/smlib-wasm (commit ${commit}). Staged here by
\`node build-smlib-wasm.mjs\`; don't edit these files by hand.

\`api.mjs\` gives the same functions as the desktop's native addon, so
\`native/nvidia-kernel/adapter.cjs\` runs on it unchanged (see
viewer/kernel-worker.js). See LICENSE and THIRD_PARTY_NOTICES.md.
`);
console.log(`build-smlib-wasm: ${OUT} from ${SRC} @ ${commit} (smlib.wasm ${(statSync(join(OUT, "smlib.wasm")).size / 1e6).toFixed(1)} MB)`);
