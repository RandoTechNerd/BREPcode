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

// the kernel licence must ship alongside the kernel (licence clause 1)
check("kernel LICENSE.md bundled", existsSync(join(OUT, "vendor/kernel/LICENSE.md")));
check("no plaintext API key", !readFileSync(join(OUT, "index.html"), "utf8").includes("sk-ant-api"));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
