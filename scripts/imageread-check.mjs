// The chat's picture-to-model path, end to end in a real browser, with the AI
// mocked so it costs nothing and answers the same way every time.
//
//   node serve.js 5320 &            (the dev server)
//   node scripts/imageread-check.mjs [http://localhost:5320]
//
// It attaches a large drawing (bench/cadgen practice p01), asks "make this
// from the drawing", and plays the AI:
//   1. a feature table + code that FORGETS the counterbores
//   2. (the self-check found them missing and asked for a fix) the right code
//   3. (look-compare, the app's blueprint attached) NO CHANGES
// and checks what the app sent and showed at each step: zoomed tiles, the
// #imageread rules, the table card, the self-check line, the fix request
// with the measured disagreement, the blueprint on the look-compare.
// Playwright and Chromium come from the machine (see bench/cadgen/README.md).

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:5320";
let pw;
try { pw = await import("playwright"); } catch { pw = createRequire("/opt/node-tools/node_modules/")("playwright"); }

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const TABLE = `{ "kind": "drawing", "scale": { "source": "dimensions", "basis": "the drawing" },
  "frame": "min corner origin, Z up", "overall": { "x": 120, "y": 80, "z": 12 },
  "features": [
    { "id": "A", "type": "cbore", "count": 4, "positions": [[12, 12, 12], [108, 12, 12], [12, 68, 12], [108, 68, 12]], "axis": "+z", "dia": 6.6, "depth": "thru", "cbore": { "d": 11, "depth": 6.5 }, "source": "4X Ø6.6 THRU ⌴ Ø11 ↧ 6.5", "confidence": "high" },
    { "id": "B", "type": "hole", "count": 1, "positions": [[60, 40, 12]], "axis": "+z", "dia": 30, "depth": "thru", "source": "Ø30 THRU", "confidence": "high" },
    { "id": "C", "type": "slot", "count": 1, "positions": [[60, 15, 12]], "axis": "+z", "width": 8, "length": 38, "along": "x", "depth": "thru", "source": "SLOT 8 WIDE 30 CTR-CTR", "confidence": "medium" } ],
  "guessed": [] }`;
const holes = (cbore) => [[12, 12], [108, 12], [12, 68], [108, 68]].map(([x, y]) =>
  `  drill([${x}, ${y}, 12], [0, 0, 1], { d: 6.6, through: true${cbore ? ", cbore: { d: 11, depth: 6.5 }" : ""} }),`).join("\n");
const code = (cbore) => `const L = 120, W = 80, T = 12;
return difference(fillet({ r: 8, edges: "z" }, cube([L, W, T])),
${holes(cbore)}
  drill([60, 40, 12], [0, 0, 1], { d: 30, through: true }),
  translate([0, 0, -1], hull({ exact: true }, translate([45, 15, 0], cylinder({ d: 8, h: 14 })), translate([75, 15, 0], cylinder({ d: 8, h: 14 })))));`;
const REPLIES = [
  `A drawing of a mounting plate; every size is on it.\n\`\`\`json\n${TABLE}\n\`\`\`\n\`\`\`js\n${code(false)}\n\`\`\``,
  `The code forgot the counterbores; the table is right.\n\`\`\`json\n${TABLE}\n\`\`\`\n\`\`\`js\n${code(true)}\n\`\`\``,
  "NO CHANGES",
];

const browser = await pw.chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (/\[chat\]/.test(m.text())) console.log(`  (page) ${m.text().slice(0, 300)}`); });
await page.addInitScript(() => {
  localStorage.setItem("brepcode-ai", JSON.stringify({ provider: "claude", model: "claude-opus-5-5", key: "sk-ant-test", fixTries: "2" }));
  localStorage.setItem("brepcode-image-candidates", "2");
});
const sent = [];
await page.route("https://api.anthropic.com/**", async (route) => {
  const body = JSON.parse(route.request().postData() || "{}");
  if (!/\/messages/.test(route.request().url())) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ id: "claude-opus-5-5" }] }) });
  const i = sent.length;
  sent.push(body);
  const text = REPLIES[Math.min(i, REPLIES.length - 1)];
  await route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ id: `m${i}`, type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn",
      content: [{ type: "text", text }], usage: { input_tokens: 1, output_tokens: 1 } }) });
});
await page.goto(`${BASE}/viewer/index.html`, { waitUntil: "load" });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById("chat-btn")?.click());
await page.setInputFiles("#chat-img-file", new URL("../bench/cadgen/practice/data/inputs/p01-plate/input.png", import.meta.url).pathname);
await page.waitForTimeout(500);
await page.fill("#chat-input", "make this from the drawing");
await page.click("#chat-send");

// wait for the three AI turns and the builds between them
const t0 = Date.now();
while (Date.now() - t0 < 420000) {
  const done = await page.evaluate(() => /blueprint of the model matches/.test(document.getElementById("chat-msgs")?.textContent || ""));
  if (done) break;
  await page.waitForTimeout(1000);
}
const chat = await page.evaluate(() => document.getElementById("chat-msgs")?.textContent || "");
const imgs = (b) => (b.messages?.at(-1)?.content || []).filter((c) => c.type === "image").length;
const sys = (b) => JSON.stringify(b.system || "");
const userText = (b) => JSON.stringify(b.messages || []);

check("three AI turns: read, fix, look-compare", sent.length === 3, `${sent.length} requests`);
check("the first carries the drawing plus zoomed tiles", sent[0] && imgs(sent[0]) === 5, `${sent[0] && imgs(sent[0])} images`);
check("...and the two-step reader rules", sent[0] && sys(sent[0]).includes("#imageread") && sys(sent[0]).includes("STEP 1, THE FEATURE TABLE"));
check("the table is shown to the user as a card", /what I read off the picture \(4 rows\)/.test(chat), chat.slice(0, 300));
check("the self-check finds the missing counterbores", /counterbore is missing/.test(chat));
check("the fix request carries the measured disagreement and the pictures again",
  sent[1] && /counterbore is missing/.test(userText(sent[1])) && imgs(sent[1]) === 5);
check("after the fix the self-check agrees", /self-check: all \d+ checks agree with the table ✓/.test(chat));
check("the look-compare sends the app's blueprint too", sent[2] && imgs(sent[2]) === 6 && /LOOK-COMPARE/.test(userText(sent[2])));
check("NO CHANGES ends it", /blueprint of the model matches the picture/.test(chat));
const editor = await page.evaluate(() => document.getElementById("code")?.value || "");
check("the editor holds the fixed model", /cbore: \{ d: 11, depth: 6\.5 \}/.test(editor));
check("no page errors", !errors.length, errors.slice(0, 3).join(" | "));
await page.screenshot({ path: process.env.SHOT || "/tmp/imageread-check.png" });
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
