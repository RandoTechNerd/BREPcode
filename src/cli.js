#!/usr/bin/env node
// brepscript — an OpenSCAD-style CLI for the BREP.io kernel.
//
//   brepscript model.js -o part.stl
//   brepscript model.js -D size=30 -D holes=4
//   brepscript model.js --info
//   brepscript part.step              (STEP -> editable code, as part.bcode)

import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve, basename, extname, dirname, join } from "node:path";
import { build, toSTL, stats } from "./render.js";
import { fromOpenSCAD, looksLikeOpenSCAD } from "./openscad.js";
import { exactSTEP } from "./stepexport.js";

function parseArgs(argv) {
  const out = { input: null, output: null, step: null, defines: {}, info: false, help: false, tolerance: 6, lang: null, engine: "auto" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") out.help = true;
    else if (a === "--info") out.info = true;
    else if (a === "-o" || a === "--output") out.output = argv[++i];
    else if (a === "--step") out.step = argv[++i];
    else if (a === "-t" || a === "--tolerance") out.tolerance = Number(argv[++i]);
    else if (a === "-l" || a === "--lang") out.lang = argv[++i];
    else if (a === "-e" || a === "--engine") {
      out.engine = argv[++i];
      if (!["auto", "split", "js", "nvidia", "nvidia-split"].includes(out.engine)) throw new Error(`--engine takes auto, split, js, nvidia or nvidia-split (got "${out.engine}")`);
    }
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
  brepscript <part.step> [-o part.bcode | -o part.js]

A STEP file is rebuilt as editable BREPcode: each body as extrudes with
drilled holes, or a turned profile, with its sizes as dials, every body
checked against the file. A body that cannot be rebuilt exactly stays the
file's own solid (importedSolid). Default output: <part>.bcode, which carries
those solids and opens in the app; -o part.js writes the code alone, with each
kept solid as part-<body>.step beside it.

Options:
  -o, --output FILE     Write STL here (default: <model>.stl)
      --step FILE       Write the EXACT B-rep as STEP (AP242, mm) instead of STL.
                        Refuses (exit 2) if the model left the exact lane.
  -D, --define K=V      Inject a parameter, readable as params.K in the model
  -l, --lang NAME       Force "openscad" or "brepscript" (default: by extension)
  -t, --tolerance N     Export decimal precision (default 6)
  -e, --engine NAME     auto (default): Rust kernel for exact parts, manifold for
                        meshes, JS kernel if either refuses. split: no fallback.
                        js: the JS kernel only. nvidia: NVIDIA's SMLib kernel
                        first (native builds only), then auto. nvidia-split:
                        NVIDIA's kernel or nothing.
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
  if (/\.(step|stp)$/i.test(args.input)) return fromStep(inputPath, args);

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
    result = await build(shape, { tolerance: args.tolerance, engine: args.engine });
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

  console.error(result.fallback
    ? `  engine: JS kernel (the split engine refused: ${result.fallback})`
    : `  engine: ${result.engine === "js" ? "JS kernel" : result.engine === "exact" ? "Exact (Rust kernel)" : "Mesh (Rust + manifold)"}`);

  if (args.info) {
    console.error(`built in ${ms}ms (no file written)`);
    return;
  }

  if (args.step) {
    const stepPath = resolve(process.cwd(), args.step);
    let text;
    try { text = await exactSTEP(result, name); }
    catch (e) { console.error(`STEP refused: ${e.message}`); process.exit(2); }
    writeFileSync(stepPath, text);
    console.error(`wrote ${stepPath} in ${ms}ms`);
    if (!args.output) return;
  }

  const outPath = resolve(process.cwd(), args.output ?? `${name}.stl`);
  writeFileSync(outPath, toSTL(result, name));
  console.error(`wrote ${outPath} in ${ms}ms`);
}

// STEP -> code (src/step2code-check.js): the per-body report on stderr, the
// code (and the bodies kept as solids) written out
async function fromStep(inputPath, args) {
  const { convertStep } = await import("./step2code-check.js");
  const name = basename(inputPath, extname(inputPath));
  const t0 = Date.now();
  const r = await convertStep(readFileSync(inputPath, "utf8"), { title: name });
  for (const b of r.bodies) console.error(`  ${b.name}: ${b.ok ? `code (${b.kind === "revolve" ? "turned" : "extruded"})` : `kept as the file's solid: ${b.why}`}`);
  const ok = r.bodies.filter((b) => b.ok).length;
  console.error(`  ${ok} of ${r.bodies.length} bod${r.bodies.length === 1 ? "y" : "ies"} rebuilt as code, each checked against the file`);
  const out = resolve(process.cwd(), args.output || join(dirname(inputPath), `${name}.bcode`));
  if (/\.bcode$/i.test(out)) {
    const { bcodeFile, packMeshes } = await import("../viewer/exporters.js");
    // each kept solid's STEP, and its mesh as "<name>::mesh" (the app's own
    // pairing: the mesh is what a kernel with no STEP reader builds from)
    const files = new Map();
    for (const i of r.imports) { files.set(i.name, i.step); if (i.mesh) files.set(`${i.name}::mesh`, i.mesh); }
    const meshes = await packMeshes([...files.keys()], (n) => files.get(n));
    writeFileSync(out, bcodeFile(r.code, { name, meshes }));
  } else {
    writeFileSync(out, r.code);
    for (const im of r.imports) writeFileSync(join(dirname(out), im.name), im.step);
    if (r.imports.length) console.error(`  ...and ${r.imports.length} kept solid${r.imports.length > 1 ? "s" : ""} beside it (${r.imports.map((i) => i.name).join(", ")}): import them in the app before building`);
  }
  console.error(`wrote ${out} in ${Date.now() - t0}ms`);
}

// Exit explicitly: the kernels leave timers/wasm workers alive, so the process
// used to finish its work and then never return to the shell.
main().then(() => process.exit(0), (e) => {
  console.error(e?.stack || String(e));
  process.exit(1);
});
