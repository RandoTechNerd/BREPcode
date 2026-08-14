// Run with:  node scripts/check-llm-prompt.mjs
//
// Build every code example in the authoring guide. A guide whose examples do
// not run is worse than none — it teaches the shape of wrong code.
import { readFileSync } from "node:fs";
import * as api from "../index.js";

const doc = readFileSync(new URL("../LLM_PROMPT.md", import.meta.url), "utf8");
const blocks = [...doc.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
const runnable = blocks.filter((b) => !b.includes("import ") && !b.includes("require("));

console.log(`${blocks.length} js blocks, ${runnable.length} runnable in the editor form\n`);
const names = Object.keys(api).filter((k) => typeof api[k] === "function");
let bad = 0;
for (const [i, src] of runnable.entries()) {
  const first = src.trim().split("\n")[0].slice(0, 58);
  try {
    const body = /\breturn\b/.test(src) ? src : `return (${src.trim()});`;
    const fn = new Function(...names, body);
    const shape = fn(...names.map((n) => api[n]));
    const r = await api.build(shape);
    const tris = (api.toSTL(r, "t").match(/facet normal/g) || []).length;
    console.log(`  ok    #${i + 1} ${first}…  -> ${r?.solids?.length ?? "?"} solid(s), ${tris} triangles`);
  } catch (e) {
    bad++;
    console.log(`  FAIL  #${i + 1} ${first}…  -> ${String(e?.message || e).slice(0, 110)}`);
  }
}
console.log(bad ? `\n${bad} example(s) do not build` : "\nevery example builds");
process.exit(bad ? 1 : 0);
