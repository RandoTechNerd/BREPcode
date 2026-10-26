// replicad (OpenCASCADE) in Node, for the drawings' hidden-line projections.
// Node cannot import the dual-format emscripten loader, so it is rewritten to
// CJS in the temp dir (the same shim test/blueprint.js uses).
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { _setReplicad } from "../../../viewer/curved.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
let ready = null;
export function initReplicad() {
  ready ??= (async () => {
    const dir = join(ROOT, "node_modules/replicad-opencascadejs/src");
    const src = readFileSync(join(dir, "replicad_single.js"), "utf8").replace(/export default Module;\s*$/, "module.exports = Module;");
    const loader = join(tmpdir(), `brepcode-replicad-${process.pid}.cjs`);
    writeFileSync(loader, src);
    const initOC = createRequire(import.meta.url)(loader);
    const replicad = await import("replicad");
    replicad.setOC(await initOC({ locateFile: () => join(dir, "replicad_single.wasm") }));
    _setReplicad(replicad);
    return replicad;
  })();
  return ready;
}
