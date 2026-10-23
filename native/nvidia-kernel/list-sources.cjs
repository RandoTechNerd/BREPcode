// The kernel sources binding.gyp compiles for one library (SMLib or SM_API):
// every .cpp except the Windows precompiled-header stub (no PCH here).
const fs = require("node:fs");
const path = require("node:path");
const lib = process.argv[2];
const dir = path.join("upstream", "source", lib, "src");
const out = fs.readdirSync(path.join(__dirname, dir)).sort()
  .filter((f) => f.endsWith(".cpp") && f !== "StdAfx.cpp")
  .map((f) => `${dir}/${f}`.split(path.sep).join("/"));
console.log(out.join(" "));
