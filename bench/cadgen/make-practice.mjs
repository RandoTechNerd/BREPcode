#!/usr/bin/env node
// Builds the private practice set in cadgenbench's local layout:
//   bench/cadgen/practice/data/inputs/<id>/{input.png, description.yaml}
//   bench/cadgen/practice/data/gt/<id>/{ground_truth.step, jig_*.step, truth.json, drawing.svg}
// from the part definitions in bench/cadgen/practice/parts/*.mjs.
//
//   node bench/cadgen/make-practice.mjs            all parts
//   node bench/cadgen/make-practice.mjs p01 p07    just these
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPart } from "./lib/part.mjs";
import { drawingSVG, svgToPNG, closeBrowser } from "./lib/drawing.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PARTS = join(HERE, "practice/parts"), DATA = join(HERE, "practice/data");
const only = process.argv.slice(2);
const files = readdirSync(PARTS).filter((f) => f.endsWith(".mjs")).sort()
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)));

let failed = 0;
for (const file of files) {
  const id = basename(file, ".mjs");
  const t0 = Date.now();
  try {
    const part = { id, ...(await import(pathToFileURL(join(PARTS, file)).href)).default };
    const gt = await buildPart(part);
    const gtDir = join(DATA, "gt", id), inDir = join(DATA, "inputs", id);
    mkdirSync(gtDir, { recursive: true }); mkdirSync(inDir, { recursive: true });
    writeFileSync(join(gtDir, "ground_truth.step"), gt.step);
    for (const j of gt.jigs) writeFileSync(join(gtDir, j.name), j.step);
    const svg = await drawingSVG(gt.step, { ...part, features: gt.features, dims: gt.dims, leaders: gt.leaders }, gt.bbox);
    writeFileSync(join(gtDir, "drawing.svg"), svg);
    await svgToPNG(svg, join(inDir, "input.png"));
    writeFileSync(join(inDir, "description.yaml"),
      "description: >\n  Reproduce the geometry as accurately as possible from the drawing.\n\ninput_files:\n  - input.png\n\ninput_type: text+image\ntask_type: generation\n");
    const size = gt.bbox.max.map((v, i) => +(v - gt.bbox.min[i]).toFixed(3));
    writeFileSync(join(gtDir, "truth.json"), JSON.stringify({ id, title: part.title, size, center: gt.center, features: gt.features }, null, 1));
    console.log(`${id}: ok  size ${size.join(" x ")}  ${gt.jigs.length} jigs  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (e) {
    failed++;
    console.log(`${id}: FAILED  ${e?.stack || e}`);
  }
}
await closeBrowser();
process.exit(failed ? 1 : 0);
