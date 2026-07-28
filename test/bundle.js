// Guards the BUILT site, not the sources. The classic failure here is a new
// `three/addons/...` import that nobody adds to build-site.mjs: the string is
// present in dist-site/index.html, so a grep-style audit passes, but the file
// itself was never copied and the feature 404s at runtime for every user.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const OUT = "dist-site";
if (!existsSync(OUT)) {
  console.log("\ndist-site missing — run `node build-site.mjs` first\n");
  process.exit(1);
}

console.log("\nbuilt bundle is self-contained\n");

// every bare "three/addons/x" import must exist under vendor/three/jsm/
const sources = ["index.html", ...readdirSync(OUT).filter((f) => f.endsWith(".js")),
  ...readdirSync(join(OUT, "src")).map((f) => `src/${f}`)];
const wanted = new Set();
for (const f of sources) {
  for (const m of readFileSync(join(OUT, f), "utf8").matchAll(/["']three\/addons\/([\w./-]+\.js)["']/g)) {
    wanted.add(m[1]);
  }
}
check("found addon imports to verify", wanted.size > 0, `${wanted.size}`);
for (const rel of wanted) {
  check(`shipped three/addons/${rel}`, existsSync(join(OUT, "vendor/three/jsm", rel)));
}

// and each shipped addon's own relative imports must have come along too
for (const rel of wanted) {
  const p = join(OUT, "vendor/three/jsm", rel);
  if (!existsSync(p)) continue;
  const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
  for (const m of readFileSync(p, "utf8").matchAll(/from\s+["'](\.\/[\w.-]+\.js)["']/g)) {
    const dep = (dir ? `${dir}/` : "") + m[1].slice(2);
    check(`  its dep ${dep}`, existsSync(join(OUT, "vendor/three/jsm", dep)));
  }
}

// nothing may still point at /node_modules/ — that path doesn't exist on a host
for (const f of sources) {
  const t = readFileSync(join(OUT, f), "utf8");
  check(`${f} has no /node_modules/ path`, !t.includes("/node_modules/"));
}

// the kernel license must ship alongside the kernel (license clause 1)
check("kernel LICENSE.md bundled", existsSync(join(OUT, "vendor/kernel/LICENSE.md")));
check("no plaintext API key", !readFileSync(join(OUT, "index.html"), "utf8").includes("sk-ant-api"));

// The kernel is ~13MB once its chunks are counted. A STATIC import of it would
// block every line of UI code behind that download and parse — the page sat
// dead for seconds. It must stay a dynamic import, warmed immediately so the
// first model still appears just as fast. This is easy to undo by accident:
// adding `import { PartHistory } from ".../brep-kernel.js"` at the top of the
// module works perfectly on a fast machine and quietly ruins the cold load.
{
  const html = readFileSync(join(OUT, "index.html"), "utf8");
  check("kernel is NOT statically imported",
    !/^\s*import\s[^\n]*from\s*["'][^"']*brep-kernel\.js["']/m.test(html));
  check("kernel loader is dynamic", /import\(\s*["'][^"']*brep-kernel\.js["']\s*\)/.test(html));
  check("kernel fetch is warmed at startup", /\n\s*getKernel\(\);/.test(html));
}

// The recipe library is fetched at runtime, so a missing file is a 404 the user
// only meets mid-conversation — the model quietly loses the numbers it was
// promised. Every recipe the manifest names has to actually ship.
{
  const mPath = join(OUT, "recipes/manifest.json");
  check("recipe manifest shipped", existsSync(mPath));
  if (existsSync(mPath)) {
    const m = JSON.parse(readFileSync(mPath, "utf8"));
    check("manifest lists recipes", m.recipes.length > 0, `${m.recipes.length}`);
    for (const r of m.recipes) {
      check(`  shipped recipes/${r.file}`, existsSync(join(OUT, "recipes", r.file)));
    }
  }
  check("recipes.js shipped", existsSync(join(OUT, "recipes.js")));
}

// The version shown in the About card is a hand-written literal, which is to
// say a lie waiting to happen. "Which build am I running?" was the first
// question of a real bug hunt, so the displayed number is pinned to
// package.json here.
{
  const pkg = JSON.parse(readFileSync("package.json", "utf8")).version;
  const html = readFileSync("viewer/index.html", "utf8");
  const shown = /id="app-version"[^>]*>v([\d.]+)</.exec(html)?.[1];
  check("the About card shows the real version", shown === pkg,
    `About says v${shown}, package.json says v${pkg}`);
  const appv = /APP_VERSION = "([\d.]+)"/.exec(readFileSync("viewer/exporters.js", "utf8"))?.[1];
  check("...and APP_VERSION in the exporters matches too", appv === pkg,
    `exporters say ${appv}, package.json says ${pkg}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
