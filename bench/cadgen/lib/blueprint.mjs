#!/usr/bin/env node
// Child process: the app's own 3-view blueprint (viewer/curved.js) of an
// exact STEP, as a PNG, for the look-compare pass. The same drawing the
// user gets from the Blueprint button, drawn from the solid that is scored.
//
//   node blueprint.mjs in.step out.png [title] [x,y,z]   ->  stdout: one JSON line
// x,y,z: the measured size; OCCT's own bounding box is loose on curved parts.
import { readFileSync } from "node:fs";
import { initReplicad } from "./occ.mjs";
import { svgToPNG, closeBrowser } from "./drawing.mjs";
import { curvedDrawingSVG } from "../../../viewer/curved.js";

const [stepPath, outPath, title = "candidate", sizeArg] = process.argv.slice(2);
const size = sizeArg ? sizeArg.split(",").map(Number) : undefined;
try {
  const r = await initReplicad();
  const shape = await r.importSTEP(new Blob([readFileSync(stepPath, "utf8")]));
  const svg = await curvedDrawingSVG(null, { shape, title, size });
  // the blueprint is sized ~1000 units wide: render it at ~1500 px
  await svgToPNG(svg, outPath, { scale: 1.5 });
  await closeBrowser();
  process.stdout.write(JSON.stringify({ ok: true }) + "\n");
} catch (e) {
  await closeBrowser().catch(() => {});
  process.stdout.write(JSON.stringify({ ok: false, error: String(e?.message || e).slice(0, 500) }) + "\n");
}
process.exit(0);
