#!/usr/bin/env node
// Static dev server for the viewer.
//
// Exists because the browser caches ES modules independently of the page that
// imports them, so editing src/*.js and reloading silently served stale code.
// Everything here is sent with no-store.

import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.argv[2]) || 5320;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".stl": "model/stl",
};

// Append ?v=<mtime> to every relative .js specifier so edits are picked up.
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(?\s*)(["'])(\.\.?\/[^"']+?\.js)(\2)/g;

function stampImports(text, baseDir) {
  return text.replace(SPECIFIER, (whole, head, q, spec, endQ) => {
    if (spec.includes("?")) return whole;
    const target = resolve(baseDir, spec);
    if (!existsSync(target)) return whole;
    const v = Math.floor(statSync(target).mtimeMs);
    return `${head}${q}${spec}?v=${v}${endQ}`;
  });
}

createServer((req, res) => {
  // dev-only: let the page save generated binary assets (e.g. rendered favicons)
  if (req.method === "POST" && req.url.startsWith("/__save/")) {
    const name = req.url.slice("/__save/".length);
    if (!/^[\w.-]+\.(png|ico)$/.test(name)) {
      res.writeHead(400).end("Bad name");
      return;
    }
    const bufs = [];
    req.on("data", (c) => bufs.push(c));
    req.on("end", () => {
      const target = join(root, "viewer", name);
      import("node:fs").then((fs) => {
        fs.writeFileSync(target, Buffer.concat(bufs));
        res.writeHead(200, { "content-type": "text/plain" }).end(`saved ${name}`);
      });
    });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400).end("Bad request");
    return;
  }

  let filePath = normalize(join(root, pathname));
  if (!filePath.startsWith(root)) {          // no escaping the project directory
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }
  if (!existsSync(filePath)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const headers = {
    "content-type": TYPES[ext] || "application/octet-stream",
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache",
  };

  // Chromium pins ES modules by URL and will keep serving a stale copy even with
  // no-store and a hard reload. Stamping each relative import with the target
  // file's mtime changes the URL whenever the file actually changes, which is the
  // only thing that reliably busts it.
  if (ext === ".html" || ext === ".js" || ext === ".mjs") {
    res.writeHead(200, headers);
    res.end(stampImports(readFileSync(filePath, "utf8"), dirname(filePath)));
    return;
  }

  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`BrepScript viewer:  http://localhost:${port}/viewer/`);
  console.log("(no-store: edits to src/*.js show up on a plain reload)");
});
