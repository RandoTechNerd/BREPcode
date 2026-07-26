#!/usr/bin/env node
// brepscript — an OpenSCAD-style CLI for the BREP.io kernel.
//
//   brepscript model.js -o part.stl
//   brepscript model.js -D size=30 -D holes=4
//   brepscript model.js --info

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, basename, extname } from "node:path";
import { build, toSTL, stats } from "./render.js";
import { fromOpenSCAD, looksLikeOpenSCAD } from "./openscad.js";

function parseArgs(argv) {
  const out = { input: null, output: null, defines: {}, info: false, help: false, tolerance: 6, lang: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--info") out.info = true;
    else if (a === "-o" || a === "--output") out.output = argv[++i];
    else if (a === "-t" || a === "--tolerance") out.tolerance = Number(argv[++i]);
    else if (a === "-l" || a === "--lang") out.lang = argv[++i];
    else if (a === "-D" || a === "--define") {
      const [k, ...rest] = String(argv[++i] ?? "").split("=");
      const raw = rest.join("=");
      let v = raw;
      try { v = JSON.parse(raw); } catch { /* keep string */ }
      if (k) out.defines[k] = v;
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (!out.input) out.input = a;
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return out;
}

const HELP = `brepscript — OpenSCAD-style CLI for the BREP.io kernel

Usage:
  brepscript <model.js|model.scad> [-o out.stl] [-D key=value]... [--info]

Options:
  -o, --output FILE     Write STL here (default: <model>.stl)
  -D, --define K=V      Inject a parameter, readable as params.K in the model
  -l, --lang NAME       Force "openscad" or "brepscript" (default: by extension)
  -t, --tolerance N     Export decimal precision (default 6)
      --info            Print facet counts and bounding boxes, write nothing
  -h, --help            Show this message

.scad files are translated from OpenSCAD automatically. For JSCAD, import the
compatibility layer in a .js model: import { primitives } from "brepscript/jscad"

A model file default-exports either a shape or a function of (params):

  import { cube, cylinder, difference, translate } from "brepscript";

  export default (params) => difference(
    cube([params.size ?? 20, 20, 20]),
    translate([10, 10, -1], cylinder({ r: 5, h: 22 })),
  );
`;

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exit(1); }

  if (args.help || !args.input) {
    console.log(HELP);
    process.exit(args.input ? 0 : 1);
  }

  const inputPath = resolve(process.cwd(), args.input);

  // .scad files (or --lang openscad) are translated; everything else is a JS module.
  let isScad = args.lang === "openscad" || args.lang === "scad";
  if (!args.lang) {
    if (extname(args.input).toLowerCase() === ".scad") isScad = true;
    else if (extname(args.input).toLowerCase() === ".txt") {
      try { isScad = looksLikeOpenSCAD(readFileSync(inputPath, "utf8")); } catch { /* handled below */ }
    }
  }

  const t0 = Date.now();
  let result;
  try {
    let shape;
    if (isScad) {
      const source = readFileSync(inputPath, "utf8");
      shape = fromOpenSCAD(source);
    } else {
      let mod;
      try {
        mod = await import(pathToFileURL(inputPath).href);
      } catch (e) {
        console.error(`Failed to load ${args.input}:\n  ${e.message}`);
        process.exit(1);
      }
      const exported = mod.default ?? mod.model ?? mod.main;
      if (!exported) {
        console.error(`${args.input} has no default export (expected a shape or a function).`);
        process.exit(1);
      }
      shape = typeof exported === "function" ? await exported(args.defines) : exported;
    }
    result = await build(shape, { tolerance: args.tolerance });
  } catch (e) {
    console.error(`Build failed: ${e.message}`);
    process.exit(1);
  }
  const ms = Date.now() - t0;

  const name = basename(args.input, extname(args.input));
  const fmt = (n) => Number(n.toFixed(3));

  for (const s of stats(result)) {
    const b = s.bounds;
    console.error(
      `  ${s.name}: ${s.facets} facets  ` +
      `x[${fmt(b.x[0])}, ${fmt(b.x[1])}]  y[${fmt(b.y[0])}, ${fmt(b.y[1])}]  z[${fmt(b.z[0])}, ${fmt(b.z[1])}]`,
    );
  }

  if (args.info) {
    console.error(`built in ${ms}ms (no file written)`);
    return;
  }

  const outPath = resolve(process.cwd(), args.output ?? `${name}.stl`);
  writeFileSync(outPath, toSTL(result, name));
  console.error(`wrote ${outPath} in ${ms}ms`);
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
