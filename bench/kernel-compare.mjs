// Compare two kernel-bench.mjs runs (same mode) case by case.
//
//   node bench/kernel-compare.mjs old.json new.json [--md out.md] [--label-a 0.9.0 --label-b 0.11.0]
//
// Prints a summary and writes a Markdown section: totals, geometric-mean
// speed ratio, wins/losses, cases that changed outcome or output, and the
// biggest moves either way. Ratio = new time / old time (below 1 = faster).

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const [fa, fb] = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const LA = opt("--label-a", "A"), LB = opt("--label-b", "B");
const A = JSON.parse(readFileSync(fa, "utf8")), B = JSON.parse(readFileSync(fb, "utf8"));
const mode = A.meta.mode;
const byId = new Map(B.results.map((r) => [r.id, r]));
const pairs = A.results.map((a) => [a, byId.get(a.id)]).filter(([, b]) => b);

const both = pairs.filter(([a, b]) => a.ok && b.ok);
// tiny cases are noise; the ratio stats use cases where either side took >= 2 ms
const timed = both.filter(([a, b]) => Math.max(a.ms, b.ms) >= 2);
const ratios = timed.map(([a, b]) => b.ms / a.ms);
const gmean = Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / Math.max(1, ratios.length));
const sumA = both.reduce((s, [a]) => s + a.ms, 0), sumB = both.reduce((s, [, b]) => s + b.ms, 0);
const faster = ratios.filter((r) => r < 0.95).length, slower = ratios.filter((r) => r > 1.05).length;
const fixed = pairs.filter(([a, b]) => !a.ok && b.ok), broke = pairs.filter(([a, b]) => a.ok && !b.ok);
const failBoth = pairs.filter(([a, b]) => !a.ok && !b.ok);

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms.toFixed(1)} ms`);
const pct = (r) => `${r < 1 ? "" : "+"}${((r - 1) * 100).toFixed(0)}%`;
const lines = [];
const P = (s = "") => lines.push(s);

P(`| | ${LA} | ${LB} |`);
P(`|---|---:|---:|`);
P(`| Cases built | ${pairs.filter(([a]) => a.ok).length} / ${pairs.length} | ${pairs.filter(([, b]) => b.ok).length} / ${pairs.length} |`);
P(`| Total time, cases both built | ${fmt(sumA)} | ${fmt(sumB)} |`);
P();
P(`- **Geometric-mean time ratio** ${LB}/${LA}: **${gmean.toFixed(3)}** over ${ratios.length} cases (${pct(gmean)}; below 1 means ${LB} is faster).`);
P(`- **Total time ratio**: ${(sumB / sumA).toFixed(3)} (${pct(sumB / sumA)}).`);
P(`- ${LB} faster by more than 5% on ${faster} cases, slower by more than 5% on ${slower}, within 5% on ${ratios.length - faster - slower}.`);
if (fixed.length) P(`- **Built by ${LB} only (${fixed.length})**: ${fixed.map(([a]) => a.id).join(", ")}.`);
if (broke.length) P(`- **Built by ${LA} only (${broke.length})**: ${broke.map(([a]) => a.id).join(", ")}.`);
if (failBoth.length) P(`- Failed on both (${failBoth.length}): ${failBoth.map(([a]) => a.id).join(", ")}.`);

if (mode === "models") {
  const volDiff = both.filter(([a, b]) => Math.abs(a.vol - b.vol) > 1e-3 * Math.max(1, Math.abs(a.vol)));
  const laneDiff = both.filter(([a, b]) => a.lane !== b.lane);
  P(`- Output agreement: volume within 0.1% on ${both.length - volDiff.length} / ${both.length}; same lane on ${both.length - laneDiff.length} / ${both.length}.`);
  if (volDiff.length) P(`- Volume changed: ${volDiff.map(([a, b]) => `${a.id} (${a.vol.toFixed(1)} -> ${b.vol.toFixed(1)})`).join("; ")}.`);
  if (laneDiff.length) P(`- Lane changed: ${laneDiff.map(([a, b]) => `${a.id} (${a.lane} -> ${b.lane})`).join("; ")}.`);
}
P();
const moves = timed.map(([a, b]) => ({ id: a.id, a: a.ms, b: b.ms, r: b.ms / a.ms }));
const table = (title, rows) => {
  if (!rows.length) return;
  P(`**${title}**`); P();
  P(`| Case | ${LA} | ${LB} | Change |`); P(`|---|---:|---:|---:|`);
  for (const m of rows) P(`| ${m.id} | ${fmt(m.a)} | ${fmt(m.b)} | ${pct(m.r)} |`);
  P();
};
if (mode === "models") {
  table("Biggest speedups", moves.filter((m) => m.r < 0.95).sort((x, y) => x.r - y.r).slice(0, 10));
  table("Biggest slowdowns", moves.filter((m) => m.r > 1.05).sort((x, y) => y.r - x.r).slice(0, 10));
  table("Slowest cases (absolute)", [...moves].sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b)).slice(0, 10));
  for (const [title, list, side] of [[`Failures on ${LA}`, pairs.filter(([a]) => !a.ok), 0], [`Failures on ${LB}`, pairs.filter(([, b]) => !b.ok), 1]]) {
    if (!list.length) continue;
    P(`**${title}**`); P();
    for (const p of list) P(`- ${p[side].id}: ${String(p[side].error).replace(/\|/g, "/").slice(0, 220)}`);
    P();
  }
} else {
  P(`| STL | KB | ${LA} time | ${LB} time | ${LA} result | ${LB} result |`);
  P(`|---|---:|---:|---:|---|---|`);
  const res = (r) => (r.ok
    ? `${r.backend?.replace(/_/g, " ")}: ${r.faces} faces (${r.planes}P ${r.cylinders}C ${r.cones}K ${r.spheres}S ${r.tori}T ${r.bsplines}B), ${r.triangles ? Math.round(100 * r.analyticTris / r.triangles) : 0}% of triangles exact`
    : `FAIL: ${String(r.error).replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 120)}`);
  for (const [a, b] of pairs) P(`| ${a.id} | ${a.kb} | ${a.ok ? fmt(a.ms) : "-"} | ${b.ok ? fmt(b.ms) : "-"} | ${res(a)} | ${res(b)} |`);
  P();
  P(`P plane, C cylinder, K cone, S sphere, T torus, B B-spline surface. "% exact" = source triangles absorbed into analytic faces, from the converter's own report.`);
  P();
}
const md = lines.join("\n");
console.log(md);
const out = opt("--md", null);
if (out) writeFileSync(out, md + "\n");
