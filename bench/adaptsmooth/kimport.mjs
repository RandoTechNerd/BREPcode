import { readFileSync } from "node:fs";
import { kernelImport } from "./lib.mjs";
for (const f of process.argv.slice(2)) console.log(f, JSON.stringify(await kernelImport(readFileSync(f, "utf8"), "k")));
process.exit(0);
