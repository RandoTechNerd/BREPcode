#!/usr/bin/env node
// Score a candidate folder against the practice ground truth with
// cadgenbench's own open evaluator (the code the leaderboard runs).
//
//   node bench/cadgen/score.mjs <run>            results/<run>/<sample>/output.step
//   node bench/cadgen/score.mjs <dir> --force    any folder laid out the same way
//
// Needs the evaluator venv (bench/cadgen/README.md: setup) and, for its
// renders, an X server: it runs under xvfb-run when DISPLAY is unset.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const target = argv.find((a) => !a.startsWith("--"));
if (!target) { console.error("usage: score.mjs <run|dir> [--force] [--workers N]"); process.exit(1); }
const dir = existsSync(join(HERE, "results", target)) ? join(HERE, "results", target) : resolve(target);
const data = process.env.CADGENBENCH_DATA_DIR || join(HERE, "practice/data");
const bin = process.env.CGB_BIN || join(HERE, ".venv/bin/cadgenbench");
const workers = argv.includes("--workers") ? argv[argv.indexOf("--workers") + 1] : "3";

// every GT sample gets a folder, so a sample with no output scores 0 (missing)
for (const id of readdirSync(join(data, "gt"))) mkdirSync(join(dir, id), { recursive: true });

const cmd = [bin, "evaluate", dir, "--workers", workers, ...(argv.includes("--force") ? ["--force"] : [])];
const r = process.env.DISPLAY
  ? spawnSync(cmd[0], cmd.slice(1), { env: { ...process.env, CADGENBENCH_DATA_DIR: data }, encoding: "utf8", maxBuffer: 1 << 28 })
  : spawnSync("xvfb-run", ["-a", ...cmd], { env: { ...process.env, CADGENBENCH_DATA_DIR: data }, encoding: "utf8", maxBuffer: 1 << 28 });
if (r.status !== 0) console.error((r.stderr || "").split("\n").filter((l) => !l.includes("eval:phase")).slice(-15).join("\n"));

const rows = [];
for (const id of readdirSync(join(data, "gt")).sort()) {
  const p = join(dir, id, "result.json");
  const j = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { status: "missing", cad_score: 0 };
  rows.push({
    id, status: j.status, cad: j.cad_score ?? 0,
    shape: j.gt_metrics?.shape_similarity_score, iou: j.gt_metrics?.volume_iou ?? j.gt_metrics?.shape_volume_iou,
    iface: j.interface_metrics?.score, topo: j.topology_metrics?.score,
    betti: j.topology_metrics ? `${(j.topology_metrics.candidate?.betti ?? Object.values(j.topology_metrics.candidate || {})).join?.(",") ?? ""} vs ${(j.topology_metrics.gt?.betti ?? Object.values(j.topology_metrics.gt || {})).join?.(",") ?? ""}` : "",
  });
}
const f = (v) => (v == null ? "  -  " : v.toFixed(3));
console.log(`\n${"sample".padEnd(22)} status   CAD    shape  iface  topo`);
for (const x of rows) console.log(`${x.id.padEnd(22)} ${String(x.status).padEnd(8)} ${f(x.cad)}  ${f(x.shape)}  ${f(x.iface)}  ${f(x.topo)}`);
const mean = (k) => rows.reduce((s, x) => s + (x[k] ?? 0), 0) / rows.length;
console.log(`${"MEAN".padEnd(22)} ${String(rows.filter((x) => x.status === "valid").length + "/" + rows.length).padEnd(8)} ${f(mean("cad"))}  ${f(mean("shape"))}  ${f(mean("iface"))}  ${f(mean("topo"))}`);
writeFileSync(join(dir, "scores.json"), JSON.stringify({ mean: { cad: mean("cad"), shape: mean("shape"), interface: mean("iface"), topology: mean("topo") }, rows }, null, 1));
process.exit(0);
