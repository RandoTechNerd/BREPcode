#!/usr/bin/env node
// Builds the hand-made references for public samples (public/ref/*.mjs) into
// public/data/gt/<id>/ in the evaluator's layout, so `score.mjs --gt` can give
// a CAD Score on a public drawing. They are a person's reading of the drawing,
// NOT the benchmark's private ground truth: use them for before/after, never
// as a leaderboard estimate.
//
//   node bench/cadgen/public/make-ref.mjs
import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPart } from "../lib/part.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
for (const file of readdirSync(join(HERE, "ref")).filter((f) => f.endsWith(".mjs"))) {
  const id = basename(file, ".mjs").split("-")[0];
  const part = { id, ...(await import(pathToFileURL(join(HERE, "ref", file)).href)).default };
  const gt = await buildPart(part);
  const dir = join(HERE, "data/gt", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "ground_truth.step"), gt.step);
  for (const j of gt.jigs) writeFileSync(join(dir, j.name), j.step);
  const size = gt.bbox.max.map((v, i) => +(v - gt.bbox.min[i]).toFixed(3));
  writeFileSync(join(dir, "truth.json"), JSON.stringify({ id, title: part.title, size, center: gt.center, features: gt.features }, null, 1));
  console.log(`${id}: ok  size ${size.join(" x ")}  ${gt.jigs.length} jigs`);
}
process.exit(0);
