// The picture reader shared by the chat and bench/cadgen (src/imageread.js):
// the reply parser, the table normaliser, the summary people see, the tile
// and zoom plans, the follow-up prompts and the chat's "is this a picture to
// model?" test. Pure functions, no kernel.
//
//   node test/imageread.js

import {
  READ_RULES, TABLE_SCHEMA, readerRules, parseLooseJSON, parseReply, normalizeTable, tableRows, tableText,
  tileRects, tilesNote, zoomRects, fixPrompt, lookPrompt, candidateHint, wantsModelFromImage,
} from "../src/imageread.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

console.log("\nthe rules\n");
check("they cover drawings, sketches and photos", /DIMENSIONED DRAWING/.test(READ_RULES) && /HAND SKETCH/.test(READ_RULES) && /PHOTO/.test(READ_RULES));
check("an undimensioned picture asks for one size, or marks an estimate as guessed",
  /ask for ONE key size/.test(READ_RULES) && /"estimated"/.test(READ_RULES) && /Never present an estimated size/.test(READ_RULES));
check("the schema carries scale, confidence, guessed and zoom", ["scale", "confidence", "guessed", "zoom", "cbore", "csk"].every((k) => TABLE_SCHEMA.includes(`"${k}"`)));
check("the build rules state the rotate order and csink", /Z FIRST, then Y, then X/.test(readerRules()) && /csink: \{ d, angle \}/.test(readerRules()));

console.log("\nthe reply\n");
check("loose JSON: comments, trailing commas, '..' placeholders",
  parseLooseJSON('{ "a": 1, // note\n "b": [1, 2,], "c": .., "s": "x // not a comment" }')?.s === "x // not a comment");
{
  const r = parseReply("It is a flange.\n```json\n{ \"overall\": {\"x\": 10}, \"features\": [] }\n```\n\n```js\nreturn cube([10, 10, 2]);\n```");
  check("table and code come apart", r.table?.overall?.x === 10 && r.code === "return cube([10, 10, 2]);" && r.prose === "It is a flange.");
}
{
  const r = parseReply("```json\n{\"features\": []}\n```\n```js\nreturn cube(1);\n```\nOops, fixed:\n```js\nreturn cube(2);\n```");
  check("the last code block wins (a draft, then the fix)", r.code === "return cube(2);");
}
{
  const r = parseReply("```json\n{\"features\": [], \"zoom\": [[0.1, 0.2, 0.3, 0.4], [1, 2]]}\n```\n```js\nreturn cube([5, 5,");
  check("a reply cut off mid-code still yields the code", /^return cube/.test(r.code || ""));
  check("...and the valid zoom requests", r.zoom.length === 1 && r.zoom[0][2] === 0.3);
}
check("a question with no blocks is prose only", (() => { const r = parseReply("How wide is it?"); return !r.code && !r.table && r.prose === "How wide is it?"; })());
check("NO CHANGES parses to no code", parseReply("NO CHANGES").code === null);

console.log("\nthe table\n");
{
  const { table, warnings } = normalizeTable({
    overall: { x: "120", y: 80, z: 12 },
    features: [
      { type: "Hole", count: 4, positions: [[10, 10, 12], [110, 10, 12], [10, 70, 12]], d: 6.6, depth: "THRU" },
      { id: "S", type: "slot", position: [60, 40, 12], width: 8, length: 30, along: "x" },
    ],
    uncertain: ["the slot length"],
  });
  check("numbers coerced, d read as dia, THRU normalised", table.overall.x === 120 && table.features[0].dia === 6.6 && table.features[0].depth === "thru" && table.features[0].type === "hole");
  check("a single position becomes a list", table.features[1].positions.length === 1);
  check("a count that disagrees with the positions is flagged", warnings.some((w) => /count 4 but 3/.test(w)));
  check("'uncertain' is read as 'guessed'", table.guessed[0] === "the slot length");
  const rows = tableRows(table);
  check("the summary has the overall row and one per feature", rows.length === 3 && rows[0].size === "120 × 80 × 12" && /3× hole/.test(rows[1].what) && /Ø6.6 THRU/.test(rows[1].size));
  check("...and as text, guesses included", /guessed: the slot length/.test(tableText(table)));
}
check("no table, no crash", normalizeTable(null).table === null && tableRows(null).length === 0);

console.log("\nthe picture\n");
{
  check("a small picture goes whole", tileRects(1200, 900).length === 1);
  const t = tileRects(3072, 2118);
  check("a CADGenBench sheet: overview + 2x2 tiles", t.length === 5 && t[0].name === "overview");
  check("...the tiles cover the sheet with overlap", t.slice(1).every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 3072 && r.y + r.h <= 2118)
    && t[1].x + t[1].w > t[2].x && Math.max(...t.slice(1).map((r) => Math.max(r.w, r.h))) <= 1568 * 1.4);
  const big = tileRects(6000, 4000);
  check("a very large scan gets a finer grid", big.length === 1 + 9 || big.length === 1 + 6, String(big.length));
  check("a tall photo tiles in rows", tileRects(1500, 4000).slice(1).every((r) => r.w === 1500));
  check("the tiles note names them", /4 zoomed tiles/.test(tilesNote(t)));
  const z = zoomRects([[0.5, 0.5, 0.52, 0.51], [0.9, 0.1, 1.2, -0.2]], 3000, 2000);
  check("a zoom request is padded to useful context and clamped to the image",
    z.length === 2 && z[0].w >= 3000 / 8 - 1 && z.every((r) => r.x >= 0 && r.y >= 0 && r.x + r.w <= 3000 && r.y + r.h <= 2000));
}

console.log("\nfollow-ups\n");
check("the fix prompt asks which is wrong, the table or the code", /TABLE .* or the CODE/.test(fixPrompt("- hole A: diameter 6, table 6.6")));
check("the look prompt explains the blueprint and allows NO CHANGES", /TOP above FRONT/.test(lookPrompt()) && /NO CHANGES/.test(lookPrompt()));
check("candidates read differently", candidateHint(1) !== candidateHint(2) && candidateHint(0) === "");

console.log("\nthe chat's test\n");
for (const [t, want] of [
  ["make this from the drawing", true], ["model this part please", true], ["recreate this bracket from my photo", true],
  ["here is a sketch with dimensions", true], ["turn this into 3D", true], ["", true],
  ["emboss this logo on the lid", false], ["use this as a texture", false], ["what colour is this?", false],
]) check(`${JSON.stringify(t)} -> ${want}`, wantsModelFromImage(t) === want);
check("no picture, no read", !wantsModelFromImage("make this from the drawing", { hasImage: false }));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
