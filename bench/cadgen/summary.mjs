#!/usr/bin/env node
// What a generator run did, without ground truth: per task, how many samples
// produced a STEP that passes cadgenbench's validity gate (run.mjs gates
// every candidate with lib/validity.py), how many edits fell back to the
// unedited input, and the AI calls, cost and time per sample.
//
//   node bench/cadgen/summary.mjs pub-v1 [pub-v1-rerun ...]   later runs win per sample
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const runs = process.argv.slice(2);
if (!runs.length) { console.error("usage: summary.mjs <run> [more runs...]"); process.exit(1); }
const logs = new Map();
for (const run of runs) {
  const dir = join(HERE, "results", run);
  for (const id of readdirSync(dir)) {
    const p = join(dir, id, "log.json");
    if (existsSync(p)) logs.set(id, { ...JSON.parse(readFileSync(p, "utf8")), run, hasStep: existsSync(join(dir, id, "output.step")) });
  }
}
const all = [...logs.values()].sort((a, b) => a.id.localeCompare(b.id));
const pct = (n, d) => `${n}/${d} (${d ? Math.round((100 * n) / d) : 0}%)`;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const out = {};
console.log(`\n${"task".padEnd(11)} samples  valid STEP       edited (no fallback)  calls  $/sample  s/sample  self-check=1`);
for (const task of ["generation", "editing"]) {
  const L = all.filter((l) => l.task === task);
  if (!L.length) continue;
  const valid = L.filter((l) => l.ok && l.hasStep).length;
  const real = L.filter((l) => l.ok && l.hasStep && !l.fallback).length;
  const sc = L.filter((l) => l.selfCheck != null);
  const row = {
    samples: L.length, valid, notFallback: real, calls: +mean(L.map((l) => l.attempts)).toFixed(2),
    cost: +mean(L.map((l) => l.cost)).toFixed(2), seconds: Math.round(mean(L.map((l) => l.seconds))),
    selfCheckPerfect: sc.filter((l) => l.selfCheck === 1).length, selfChecked: sc.length,
    totalCost: +L.reduce((s, l) => s + l.cost, 0).toFixed(2),
  };
  out[task] = row;
  console.log(`${task.padEnd(11)} ${String(row.samples).padEnd(8)} ${pct(valid, L.length).padEnd(16)} ${(task === "editing" ? pct(real, L.length) : "-").padEnd(21)} ${String(row.calls).padEnd(6)} ${row.cost.toFixed(2).padEnd(9)} ${String(row.seconds).padEnd(9)} ${row.selfCheckPerfect}/${row.selfChecked}`);
}
const lanes = all.filter((l) => l.task === "editing").map((l) => l.fallback ? (l.importError ? "fallback: unreadable" : "fallback: edit never built") : "edited");
out.editing && (out.editing.outcomes = Object.fromEntries([...new Set(lanes)].map((k) => [k, lanes.filter((x) => x === k).length])));
console.log(`\ntotal $${all.reduce((s, l) => s + l.cost, 0).toFixed(2)}, ${all.length} samples`);
if (out.editing) console.log("editing outcomes:", JSON.stringify(out.editing.outcomes));
writeFileSync(join(HERE, "results", runs[0], "summary.json"), JSON.stringify({ runs, ...out, samples: all.map((l) => ({ id: l.id, task: l.task, ok: l.ok && l.hasStep, fallback: l.fallback, kept: l.kept, selfCheck: l.selfCheck, look: l.look, calls: l.attempts, cost: +l.cost.toFixed(3), seconds: l.seconds, run: l.run })) }, null, 1));
process.exit(0);
