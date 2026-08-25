// Rewrite viewer/locked-key.js in its minimal form, keeping whatever key is
// already in it. The template ships BOTH forms (house key + password-locked)
// with one commented out, which is right for a template and confusing in a
// filled-in file: a `grep provider:` shows three hits and a reader cannot tell
// which is live.
//
// The key value is read and written, never printed.
import { readFileSync, writeFileSync } from "node:fs";

const PATH = new URL("../viewer/locked-key.js", import.meta.url);
const src = readFileSync(PATH, "utf8");

// Only fields on a line that is NOT commented out — the whole point.
const live = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
const field = (name) => {
  const m = live.match(new RegExp(`${name}\\s*:\\s*"([^"]*)"`));
  return m ? m[1] : null;
};

const key = field("open");
const blob = field("blob");
if (!key && !blob) {
  console.error("viewer/locked-key.js has neither an `open` key nor a `blob` — nothing to tidy.");
  process.exit(1);
}

const provider = field("provider") || "openai";
const model = field("model") || "stealth/ox-alpha";
const baseUrl = field("baseUrl") || "https://openrouter.ai/api/v1";

const header = key
  ? [
    "// BREPcode HOUSE KEY.",
    "//",
    "// Applied whenever a visitor has no working key of their own, and offered",
    "// as a \"Try …\" button in the chat greeting.",
    "//",
    "// The key below is PLAIN TEXT in the deployed bundle: anyone who opens",
    "// devtools, or unzips the site, has it. That is the deliberate trade for a",
    "// public demo — keep a spend cap on the key, and treat rotating it as",
    "// routine rather than as an incident.",
  ]
  : [
    "// BREPcode SHIPPED KEY, password-locked (lockbox.js).",
    "//",
    "// The recipient triple-taps the \"API key\" label in the AI settings and",
    "// enters the password. On a public host the blob is downloadable by anyone",
    "// and PBKDF2 only buys time against offline guessing, so this suits a",
    "// private hand-off rather than a website.",
  ];

const body = key
  ? `  open: ${JSON.stringify(key)},`
  : `  blob: ${JSON.stringify(blob)},`;

const out = [
  ...header,
  "//",
  "// Gitignored. Ships only when built with:  node build-site.mjs --with-locked-key",
  "",
  "export const LOCKED = {",
  body,
  `  provider: ${JSON.stringify(provider)},`,
  `  model: ${JSON.stringify(model)},`,
  `  baseUrl: ${JSON.stringify(baseUrl)},`,
  "};",
  "",
].join("\n");

writeFileSync(PATH, out);
console.log(`tidied: ${out.length} bytes, ${out.split("\n").length - 1} lines`);
console.log(`  form     : ${key ? "house key (open)" : "password-locked (blob)"}`);
console.log(`  provider : ${provider}`);
console.log(`  model    : ${model}`);
console.log(`  baseUrl  : ${baseUrl}`);
console.log(`  secret   : present, ${(key || blob).length} chars (not printed)`);
