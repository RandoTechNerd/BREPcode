// one QuadriFlow run in its own process (a stuck seed is killed from outside)
import { writeFileSync } from "node:fs";
import { loadSTL, cage1 } from "./lib.mjs";
const [path, faces, seed, out] = process.argv.slice(2);
const c = await cage1(loadSTL(path).stl, +faces, +seed);
writeFileSync(out, JSON.stringify({ ...c, verts: [...c.verts], quads: [...c.quads] }));
process.exit(0);
