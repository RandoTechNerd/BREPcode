// the app's own mesh repair (src/meshrepair.js), as on import
import { readFileSync, writeFileSync } from "node:fs";
const R = await import(new URL("../../src/meshrepair.js", import.meta.url).href);
const [inp, outp] = process.argv.slice(2);
const b = readFileSync(inp);
const ascii = b.subarray(0, 5).toString("latin1") === "solid" && b.includes("facet normal");
const r = ascii ? R.repairStlText(b.toString("utf8"), "repaired") : R.repairBinaryStl(new Uint8Array(b), "repaired");
const text = r.text ?? r.stl ?? r.ascii ?? (typeof r === "string" ? r : null);
console.log(Object.keys(r), r.report ? R.repairSummary(r.report) : "");
if (text) writeFileSync(outp, text); else if (r.bytes) writeFileSync(outp, r.bytes);
process.exit(0);
