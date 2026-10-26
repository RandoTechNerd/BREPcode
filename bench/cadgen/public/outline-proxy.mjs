#!/usr/bin/env node
// An outline proxy for public samples with no ground truth: each run's
// output.step drawn in the sample's main views (from one run's layout pass,
// so every run is measured on the same crops) and compared with the drawing
// (src/silhouette.js). Sections are left out: their cut positions are in each
// run's own frame. Mean IoU per run and sample.
//
//   node bench/cadgen/public/outline-proxy.mjs <inputs dir> <views run dir> <run dir> [<run dir>...]
import { readFileSync, existsSync, mkdtempSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import * as api from "../../../index.js";
import { build } from "../../../src/render.js";
import { compareView } from "../../../src/silhouette.js";
import { viewRects } from "../../../src/imageread.js";
import { readPGM } from "../lib/pgm.mjs";

const [inputs, viewsRun, ...runs] = process.argv.slice(2);
const PY = process.env.CGB_PYTHON || new URL("../.venv/bin/python", import.meta.url).pathname;
const TILES = new URL("../lib/tiles.py", import.meta.url).pathname;
const out = {};
for (const id of Object.keys(JSON.parse(readFileSync(join(viewsRun, "generation.json"), "utf8")).logs.reduce((m, l) => (m[l.id] = 1, m), {}))) {
  const log = JSON.parse(readFileSync(join(viewsRun, id, "log.json"), "utf8"));
  const views = (log.views || []).filter((v) => v.right && v.up && !v.cut && !/detail|section/i.test(v.name));
  if (!views.length) continue;
  const size = execFileSync(PY, ["-I", TILES, join(inputs, id, "input.png"), "--size"]).toString().trim().split(/\s+/).map(Number);
  const rects = viewRects(views, size[0], size[1]);
  const dir = mkdtempSync(join(tmpdir(), "proxy-"));
  execFileSync(PY, ["-I", TILES, join(inputs, id, "input.png"), "--gray", dir, JSON.stringify(rects)]);
  for (const run of runs) {
    const step = join(run, id, "output.step");
    if (!existsSync(step)) continue;
    api.registerImport(`${id}.step`, readFileSync(step, "utf8"));
    const r = await build(api.importedSolid(`${id}.step`), { engine: "split" });
    const faces = r.solids.flatMap((s) => s.faces);
    const ious = rects.map((rc) => { const { gray, w, h } = readPGM(join(dir, `${rc.name}.pgm`)); return compareView(gray, w, h, faces, views.find((v) => v.name === rc.label)); })
      .map((c) => c.iou).filter((v) => v != null);
    (out[id] ??= {})[basename(run)] = ious.length ? +(ious.reduce((a, b) => a + b, 0) / ious.length).toFixed(3) : null;
  }
  console.log(id, JSON.stringify(out[id]));
}
process.exit(0);
