#!/usr/bin/env node
// Child process: measure an input STEP for an edit (src/selfcheck.js on its
// exact faces, read through OpenCASCADE so any file the kernel chain can
// open is measured) and say whether the Rust kernel reads it exactly.
//
//   node measurestep.mjs in.step  ->  stdout: one JSON line { ok, summary, size, holes }
import { readFileSync } from "node:fs";
import { initReplicad } from "./occ.mjs";
import { facesFromReplicad, measureFaces, measuredText } from "../../../src/selfcheck.js";

try {
  const r = await initReplicad();
  const shape = await r.importSTEP(new Blob([readFileSync(process.argv[2], "utf8")]));
  const m = measureFaces(facesFromReplicad(shape));
  process.stdout.write(JSON.stringify({ ok: true, summary: measuredText(m), size: m.size, holes: m.holes.length }) + "\n");
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(e?.message || e).slice(0, 400) }) + "\n");
}
process.exit(0);
