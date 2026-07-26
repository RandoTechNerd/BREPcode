// Builds viewer/recipes/manifest.json from the frontmatter of every .md file
// in viewer/recipes/.
//
// Generated, never hand-written: a hand-maintained index is exactly how the
// three.js addon list went stale and shipped two bundles with broken outlines.
// Drop a .md file in and it is live. test/recipes.js regenerates in memory and
// fails if the committed manifest has drifted, so a forgotten rebuild is caught
// rather than silently serving a stale index.
//
//   node scripts/recipes-manifest.mjs        # rewrite it
//   node scripts/recipes-manifest.mjs --check # exit 1 if stale, write nothing

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DIR = "viewer/recipes";
export const OUT = join(DIR, "manifest.json");

function frontmatter(text, file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) throw new Error(`${file}: no --- frontmatter block`);
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line.trim());
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}

export function buildManifest() {
  // README.md documents the library for humans; it is not a recipe, so it stays
  // out of the index and off the wire.
  const files = readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md").sort();
  const recipes = files.map((file) => {
    const fm = frontmatter(readFileSync(join(DIR, file), "utf8"), file);
    if (!fm.tag) throw new Error(`${file}: frontmatter needs a "tag:"`);
    if (!fm.match) throw new Error(`${file}: frontmatter needs "match:" keywords`);
    const r = {
      tag: fm.tag,
      title: fm.title || fm.tag,
      file,
      match: fm.match.split(",").map((s) => s.trim()).filter(Boolean),
    };
    if (fm.parent) r.parent = fm.parent;
    if (fm.ask) r.ask = fm.ask;
    return r;
  });

  // Catch the mistakes that would otherwise show up as a recipe that silently
  // never fires.
  const tags = new Set();
  for (const r of recipes) {
    if (tags.has(r.tag)) throw new Error(`duplicate tag "${r.tag}"`);
    tags.add(r.tag);
  }
  for (const r of recipes) {
    if (r.parent && !tags.has(r.parent)) {
      throw new Error(`${r.file}: parent "${r.parent}" is not a tag in this library`);
    }
    if (r.parent === r.tag) throw new Error(`${r.file}: cannot be its own parent`);
  }
  return { generated: "scripts/recipes-manifest.mjs", recipes };
}

export const serialize = (m) => JSON.stringify(m, null, 2) + "\n";

// pathToFileURL, not string-building: on Windows a hand-made "file://C:/…" has
// two slashes where Node's own URL has three, so the guard never fired and the
// script did nothing at all.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = serialize(buildManifest());
  if (process.argv.includes("--check")) {
    let have = "";
    try { have = readFileSync(OUT, "utf8"); } catch { /* missing counts as stale */ }
    if (have !== text) {
      console.error(`${OUT} is stale — run: node scripts/recipes-manifest.mjs`);
      process.exit(1);
    }
    console.log(`${OUT} is up to date`);
  } else {
    writeFileSync(OUT, text);
    const n = JSON.parse(text).recipes.length;
    console.log(`${OUT}: ${n} recipes`);
  }
}
