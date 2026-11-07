// Judge in-browser model results (from scripts/webllm-eval-page.js) on the
// real kernel against scripts/webllm-eval.json: does each part build, and is
// it the size, the holes and the hollowness that was asked for?
//
//   node scripts/webllm-eval-check.mjs [--set webllm-eval-heldout.json] results.json [more.json ...]
//
// A request with no code (the catalog asked a question, the model handed back
// its example) counts as not right. Prints one line per request and a score
// per run, so two harnesses can be compared on the same requests.

import { readFileSync } from "node:fs";
import { buildCode, metrics, judge } from "./mesh-metrics.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--set");
const setName = at >= 0 ? args.splice(at, 2)[1] : "webllm-eval.json";
const set = JSON.parse(readFileSync(new URL(`./${setName}`, import.meta.url), "utf8")).requests;
const runs = Object.assign({}, ...args.map((f) => JSON.parse(readFileSync(f, "utf8"))));

for (const [label, rows] of Object.entries(runs)) {
  let built = 0, right = 0, secs = 0;
  console.log(`\n${label}`);
  for (const row of rows) {
    const want = set[row.i]?.want || {};
    let verdict;
    if (!row.code) verdict = `no code (${row.path}${row.note ? `: ${row.note}` : ""})`;
    else {
      const b = await buildCode(row.code);
      if (!b.ok) verdict = `FAILED: ${b.error}`;
      else {
        built++;
        const bad = judge(metrics(b.tris), want);
        if (!bad.length) { right++; verdict = "RIGHT"; } else verdict = `wrong: ${bad.join("; ")}`;
      }
    }
    secs += (row.ms || 0) / 1000;
    console.log(`  ${String(row.i).padStart(2)} ${String(Math.round((row.ms || 0) / 1000)).padStart(3)}s  ${(row.path || "").padEnd(22)} ${verdict.slice(0, 90).padEnd(90)} ${row.text.slice(0, 50)}`);
  }
  console.log(`  => ${right} right, ${built} built, of ${rows.length}; ${Math.round(secs)} s in all`);
}
process.exit(0);
