// Assembles the BREPcode viewer into a self-contained static site and zips it.
//
//   node build-site.mjs
//
// Output: dist-site/  (deployable to any static host — Lovable, Pages, S3…)
//         BREPcode-site.zip
//
// Everything stays client-side. The kernel arrives as its published dist
// bundle, unmodified, with its LICENSE.md alongside (see viewer About card
// for attribution). Only the runtime import graph is included:
//   brep-kernel.js -> PartHistory-* -> SketchSolver2D-*, deepClone-*,
//   index.esm-*, manifold-* (dynamic)

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import JSZip from "jszip";

const OUT = "dist-site";
// Windows keeps a directory undeletable while anything holds a handle inside
// it — an Electron run that was killed hard, a virus scanner, a shell sitting
// in the folder. Refusing to build over that turned a stale handle into "the
// site build is broken", so a clean that cannot finish falls back to emptying
// what it can: every file the build writes is overwritten anyway.
try {
  rmSync(OUT, { recursive: true, force: true });
} catch (e) {
  console.log(`  note: couldn't remove ${OUT} (${e.code}) — clearing its files instead`);
  const empty = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) { empty(p); try { rmSync(p, { recursive: true }); } catch { /* held */ } }
      else try { rmSync(p); } catch { /* held */ }
    }
  };
  try { empty(OUT); } catch { /* best-effort */ }
}
mkdirSync(join(OUT, "src"), { recursive: true });
mkdirSync(join(OUT, "vendor", "three", "jsm", "controls"), { recursive: true });
mkdirSync(join(OUT, "vendor", "kernel"), { recursive: true });

// ---- path rewrites so the app runs from the site root -----------------
// NB: the import-map entries are rewritten by their exact "key": "value" pair —
// a loose prefix rule here once replaced the KEY instead of the value, which
// silently broke every bare "three/addons/..." import on the built site.
const rewrites = [
  ['"three": "/node_modules/three/build/three.module.js"',
   '"three": "./vendor/three/three.module.js"'],
  ['"three/addons/": "/node_modules/three/examples/jsm/"',
   '"three/addons/": "./vendor/three/jsm/"'],
  ["/node_modules/brep-io-kernel/dist-kernel/", "./vendor/kernel/"],
  ['"../src/', '"./src/'],
  // modulepreload hints (must come after the exact import-map pairs above,
  // which consume their own copies of these paths first)
  ["/node_modules/three/build/three.module.js", "./vendor/three/three.module.js"],
  ["/node_modules/three/build/three.core.js", "./vendor/three/three.core.js"],
  // curved-STEP kernel (lazy-loaded by viewer/curved.js)
  ["/node_modules/replicad/dist/replicad.js", "./vendor/replicad/replicad.js"],
  ["/node_modules/replicad-opencascadejs/src/", "./vendor/replicad/"],
  // scannable codes (lazy-loaded by viewer/codes.js)
  ["/node_modules/bwip-js/dist/bwip-js.mjs", "./vendor/bwip/bwip-js.mjs"],
  // in-browser LLM engine (lazy-loaded by viewer/webllm.js, weights from HF)
  ["/node_modules/@mlc-ai/web-llm/lib/index.js", "./vendor/webllm/index.js"],
];
const rewrite = (text) => rewrites.reduce((t, [a, b]) => t.split(a).join(b), text);

// locked-key.js is a password-locked API key meant to be handed to ONE person.
// It is gitignored for that reason, and a public static host is a different
// proposition entirely: the blob becomes downloadable by anyone, and PBKDF2 only
// buys time against an offline guessing attack on the password. So a public
// build leaves it out unless you say otherwise.
//
//   node build-site.mjs                    -> no key (deploy this to the web)
//   node build-site.mjs --with-locked-key  -> key included (private hand-off)
const WITH_KEY = process.argv.includes("--with-locked-key");
const VIEWER_JS = ["assist.js", "exporters.js", "chatbot.js", "inventory.js", "curved.js",
  "trace.js", "lockbox.js", "codes.js", "svg.js", "recipes.js", "webllm.js",
  // the build worker: loaded by URL rather than imported, so nothing else
  // references it — leaving it out ships a site that silently falls back to
  // freezing the main thread on every build.
  "kernel-worker.js",
  ...(WITH_KEY ? ["locked-key.js"] : [])];

// Stamp the build into the version tooltip: hovering the version in About
// answers "is this the build I think it is" — the question every stale-exe
// mystery starts with.
let stamp = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
try {
  const { execSync } = await import("node:child_process");
  stamp += " · " + execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch { /* not a git checkout — the date alone still answers the question */ }
writeFileSync(join(OUT, "index.html"),
  rewrite(readFileSync("viewer/index.html", "utf8")).replace("BUILDSTAMP", `built ${stamp}`));
for (const f of VIEWER_JS) {
  if (!existsSync(`viewer/${f}`)) continue;      // locked-key.js is optional by design
  writeFileSync(join(OUT, f), rewrite(readFileSync(`viewer/${f}`, "utf8")));
}
// ---- recipe library (markdown, fetched per-message by recipes.js) ----
// The manifest is REGENERATED here rather than trusted: it is derived from the
// files' own frontmatter, so a recipe added without re-running the script would
// otherwise ship invisible — present on disk, absent from the index, never
// matched, with nothing to indicate anything is wrong.
{
  const { buildManifest, serialize, OUT: MPATH } = await import("./scripts/recipes-manifest.mjs");
  const manifest = buildManifest();
  writeFileSync(MPATH, serialize(manifest));            // keep the source copy fresh too
  mkdirSync(join(OUT, "recipes"), { recursive: true });
  writeFileSync(join(OUT, "recipes", "manifest.json"), serialize(manifest));
  for (const r of manifest.recipes) cpSync(join("viewer/recipes", r.file), join(OUT, "recipes", r.file));
  console.log(`  recipes: ${manifest.recipes.length} (${manifest.recipes.filter((r) => r.parent).length} nested)`);
}

// ---- hidden model stash (triple-tap the folder icon in the (i) card) ----
// Ships EMPTY: the wiring is in the page, the content is added on the host —
// drop .bcode/.html files into secret-models/ and list them in the manifest,
// or point the stash's Source box at a cloud endpoint (then this file is
// never read and a redeploy can't wipe anything).
mkdirSync(join(OUT, "secret-models"), { recursive: true });
writeFileSync(join(OUT, "secret-models", "manifest.json"), JSON.stringify({
  _readme: "Hidden stash for brepcode.com — reveal with a triple-tap on the folder button in the (i) card. Add entries like { \"name\": \"Dash goggles\", \"file\": \"goggles.bcode\" } with the file in this folder (paths are relative to this manifest). .bcode opens in the editor, .html opens in a new tab, anything else downloads.",
  models: [],
}, null, 2));

// ---- vendor: WebLLM (in-browser LLM engine, lazy-loaded on user request) ----
// The engine JS ships with the site (~6.4MB, fetched only if the provider is
// picked); the model WEIGHTS never do — they come from HuggingFace at the
// user's explicit request and live in the browser cache.
mkdirSync(join(OUT, "vendor", "webllm"), { recursive: true });
cpSync("node_modules/@mlc-ai/web-llm/lib/index.js", join(OUT, "vendor/webllm/index.js"));
cpSync("node_modules/@mlc-ai/web-llm/LICENSE", join(OUT, "vendor/webllm/LICENSE"));

// ---- vendor: bwip-js (scannable codes, lazy-loaded) ----
mkdirSync(join(OUT, "vendor", "bwip"), { recursive: true });
cpSync("node_modules/bwip-js/dist/bwip-js.mjs", join(OUT, "vendor/bwip/bwip-js.mjs"));
// bwip-js.mjs imports its symbology tables from a sibling bwipp.mjs — ship both
cpSync("node_modules/bwip-js/dist/bwipp.mjs", join(OUT, "vendor/bwip/bwipp.mjs"));
cpSync("node_modules/bwip-js/LICENSE", join(OUT, "vendor/bwip/LICENSE"));
for (const f of ["favicon.svg", "favicon.png", "apple-touch-icon.png"]) {
  cpSync(`viewer/${f}`, join(OUT, f));
}
for (const f of ["dsl.js", "openscad.js", "jscad.js", "py123d.js"]) {
  cpSync(`src/${f}`, join(OUT, "src", f));
}

// ---- vendor: replicad + OCCT wasm (curved STEP export, lazy-loaded) ----
mkdirSync(join(OUT, "vendor", "replicad"), { recursive: true });
cpSync("node_modules/replicad/dist/replicad.js", join(OUT, "vendor/replicad/replicad.js"));
cpSync("node_modules/replicad-opencascadejs/src/replicad_single.js",
  join(OUT, "vendor/replicad/replicad_single.js"));
cpSync("node_modules/replicad-opencascadejs/src/replicad_single.wasm",
  join(OUT, "vendor/replicad/replicad_single.wasm"));
cpSync("node_modules/replicad/LICENSE", join(OUT, "vendor/replicad/LICENSE"));

// ---- vendor: three ----------------------------------------------------
// three >= r0.180 splits its build: three.module.js imports ./three.core.js.
// Shipping only the module file makes the whole site fail silently.
cpSync("node_modules/three/build/three.module.js", join(OUT, "vendor/three/three.module.js"));
cpSync("node_modules/three/build/three.core.js", join(OUT, "vendor/three/three.core.js"));
// three addons are DISCOVERED, not hand-listed. This used to be a copy line per
// addon, and adding a new "three/addons/..." import to the viewer without also
// editing this file shipped a bundle that looked fine — the string was in the
// HTML — but 404'd at runtime. Scanning the sources and then following each
// addon's own relative imports means the two can't drift apart again.
const ADDON_SRC = "node_modules/three/examples/jsm";
const addonQueue = [];
for (const f of ["viewer/index.html", ...readdirSync("viewer").filter((n) => n.endsWith(".js")).map((n) => `viewer/${n}`),
                 ...readdirSync("src").filter((n) => n.endsWith(".js")).map((n) => `src/${n}`)]) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/["']three\/addons\/([\w./-]+\.js)["']/g)) addonQueue.push(m[1]);
}
const addonsCopied = new Set();
while (addonQueue.length) {
  const rel = addonQueue.shift();
  if (addonsCopied.has(rel)) continue;
  const from = join(ADDON_SRC, rel);
  if (!existsSync(from)) throw new Error(`build-site: three addon not found: ${rel}`);
  addonsCopied.add(rel);
  const to = join(OUT, "vendor/three/jsm", rel);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to);
  // follow the addon's own relative imports (LineSegments2 -> LineMaterial, …)
  const body = readFileSync(from, "utf8");
  for (const m of body.matchAll(/from\s+["'](\.[\w./-]+\.js)["']/g)) {
    addonQueue.push(posix.normalize(posix.join(posix.dirname(rel), m[1])));
  }
}
console.log(`  three addons: ${addonsCopied.size} (${[...addonsCopied].map((a) => a.split("/").pop()).join(", ")})`);
cpSync("node_modules/three/LICENSE", join(OUT, "vendor/three/LICENSE"));

// ---- vendor: kernel (runtime import graph only) -----------------------
const K = "node_modules/brep-io-kernel/dist-kernel";
const kernelFiles = readdirSync(K).filter((f) =>
  f === "brep-kernel.js"
  || /^PartHistory-.*\.js$/.test(f)
  || /^SketchSolver2D-.*\.js$/.test(f)
  || /^deepClone-.*\.js$/.test(f)
  || /^index\.esm-.*\.js$/.test(f)
  || /^manifold-.*\.js$/.test(f));
for (const f of kernelFiles) cpSync(join(K, f), join(OUT, "vendor/kernel", f));
cpSync("node_modules/brep-io-kernel/LICENSE.md", join(OUT, "vendor/kernel/LICENSE.md"));

// ---- zip --------------------------------------------------------------
const zip = new JSZip();
const addDir = (dir, zdir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) addDir(p, `${zdir}${entry}/`);
    else zip.file(`${zdir}${entry}`, readFileSync(p));
  }
};
addDir(OUT, "");
const bytes = await zip.generateAsync({
  type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 },
});
writeFileSync("BREPcode-site.zip", bytes);

const totalRaw = (() => {
  let n = 0;
  const walk = (d) => { for (const e of readdirSync(d)) {
    const p = join(d, e);
    statSync(p).isDirectory() ? walk(p) : (n += statSync(p).size);
  } };
  walk(OUT);
  return n;
})();

console.log(`dist-site: ${(totalRaw / 1e6).toFixed(1)} MB raw, ${kernelFiles.length} kernel files`);
console.log(`BREPcode-site.zip: ${(bytes.length / 1e6).toFixed(1)} MB`);
