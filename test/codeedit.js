// Targeted code edits (src/codeedit.js): the rules both the MCP edit_code tool
// and the chat's SEARCH/REPLACE blocks go through, plus the chat harness gate
// that offers edit blocks only when there is a model on screen to edit.

import { applyEdits, parseEditBlocks, hasEditBlocks, stripEditBlocks } from "../src/codeedit.js";
import * as CHAT from "../viewer/chatbot.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const SRC = `// Every number below is a slider (Params). From the BREPcode catalog: phone-stand.
const WIDTH = 80;
const DEPTH = 60;
const WALL = 3;
const plate = cube([WIDTH, DEPTH, WALL]);
const hole = translate([10, 10, -1], cylinder({ r: 2, h: WALL + 2 }));
const hole2 = translate([70, 10, -1], cylinder({ r: 2, h: WALL + 2 }));
return difference(plate, hole, hole2);
`;

// ---- applyEdits -----------------------------------------------------------
{
  const r = applyEdits(SRC, [{ old: "const WALL = 3;", new: "const WALL = 4;" }]);
  check("one exact edit applies", r.ok && r.code.includes("const WALL = 4;") && !r.code.includes("const WALL = 3;"), JSON.stringify(r));
  check("...and touches nothing else", r.ok && r.code.replace("WALL = 4", "WALL = 3") === SRC);
  check("...and reports how many applied", r.applied === 1);
}
{
  const r = applyEdits(SRC, [
    { old: "const WIDTH = 80;", new: "const WIDTH = 100;" },
    { old: "translate([70, 10, -1]", new: "translate([90, 10, -1]" },
  ]);
  check("several edits apply in order", r.ok && r.code.includes("WIDTH = 100") && r.code.includes("[90, 10, -1]") && r.applied === 2);
}
{
  // the second edit quotes the text the first one produced
  const r = applyEdits(SRC, [
    { old: "const DEPTH = 60;", new: "const DEPTH = 60;\nconst LIP = 5;" },
    { old: "const LIP = 5;", new: "const LIP = 6;" },
  ]);
  check("each edit sees the result of the one before", r.ok && r.code.includes("const LIP = 6;"));
}
{
  const r = applyEdits(SRC, [{ old: "cylinder({ r: 2, h: WALL + 2 })", new: "cylinder({ r: 3, h: WALL + 2 })" }]);
  check("an old that matches twice is refused", !r.ok && /matches 2 times/.test(r.error), r.error);
  check("...naming the lines it matched", /lines 6, 7/.test(r.error), r.error);
}
{
  const r = applyEdits(SRC, [{ old: "const WALL = 2.4;", new: "const WALL = 3;" }]);
  check("an old that is not there is refused", !r.ok && /not found/.test(r.error), r.error);
  check("...pointing at the closest line", /line 4/.test(r.error) && /WALL = 3/.test(r.error), r.error);
}
{
  const r = applyEdits(SRC, [
    { old: "const WIDTH = 80;", new: "const WIDTH = 90;" },
    { old: "nothing like this", new: "x" },
  ]);
  check("a failed edit applies none of them", !r.ok && r.index === 1 && !("code" in r), JSON.stringify(r));
  check("...and says which one failed", /edit 2 of 2/.test(r.error), r.error);
}
check("an empty old is refused", !applyEdits(SRC, [{ old: "", new: "x" }]).ok);
check("old equal to new is refused", /the same/.test(applyEdits(SRC, [{ old: "WALL", new: "WALL" }]).error || ""));
check("no edits is refused", !applyEdits(SRC, []).ok && !applyEdits(SRC, undefined).ok);
check("a missing new is refused", /needs both/.test(applyEdits(SRC, [{ old: "WALL = 3" }]).error || ""));
check("an empty new deletes", applyEdits(SRC, [{ old: "const DEPTH = 60;\n", new: "" }]).code === SRC.replace("const DEPTH = 60;\n", ""));
{
  // trailing spaces are the line the strict tool refuses but explains
  const spaced = SRC.replace("const WALL = 3;", "const WALL = 3;   ");
  const strict = applyEdits(spaced, [{ old: "const WALL = 3;\nconst plate = cube([WIDTH, DEPTH, WALL]);", new: "const WALL = 5;\nconst plate = cube([WIDTH, DEPTH, WALL]);" }]);
  check("strict: trailing-space mismatch is refused", !strict.ok, JSON.stringify(strict));
  check("...and the error says why", /trailing spaces/.test(strict.error || ""), strict.error);
  const loose = applyEdits(spaced, [{ old: "const WALL = 3;\nconst plate = cube([WIDTH, DEPTH, WALL]);", new: "const WALL = 5;\nconst plate = cube([WIDTH, DEPTH, WALL]);" }], { loose: true });
  check("loose: the same edit applies", loose.ok && loose.code.includes("const WALL = 5;\nconst plate"), JSON.stringify(loose));
  const crlf = SRC.replace(/\n/g, "\r\n");
  const lc = applyEdits(crlf, [{ old: "const WALL = 3;\nconst plate = cube([WIDTH, DEPTH, WALL]);", new: "const WALL = 6;\nconst plate = cube([WIDTH, DEPTH, WALL]);" }], { loose: true });
  check("loose: CRLF code takes an LF edit", lc.ok && lc.code.includes("WALL = 6"), JSON.stringify(lc));
}

// ---- SEARCH/REPLACE blocks ------------------------------------------------
const REPLY = `Thicker wall and a wider plate.

\`\`\`
<<<<<<< SEARCH
const WIDTH = 80;
=======
const WIDTH = 120;
>>>>>>> REPLACE
\`\`\`

<<<<<<< SEARCH
const WALL = 3;
=======
const WALL = 4;
>>>>>>> REPLACE
`;
{
  const { edits, incomplete } = parseEditBlocks(REPLY);
  check("parses blocks inside and outside a fence", edits.length === 2 && !incomplete, JSON.stringify(edits));
  check("...keeping their text exactly", edits[0].old === "const WIDTH = 80;" && edits[1].new === "const WALL = 4;");
  const r = applyEdits(SRC, edits, { loose: true });
  check("parsed blocks apply to the code", r.ok && r.code.includes("WIDTH = 120") && r.code.includes("WALL = 4"));
  check("hasEditBlocks sees them", hasEditBlocks(REPLY) && !hasEditBlocks("```js\nreturn cube([1,1,1]);\n```"));
  check("stripEditBlocks leaves only the prose", stripEditBlocks(REPLY) === "Thicker wall and a wider plate.", JSON.stringify(stripEditBlocks(REPLY)));
}
{
  const cut = parseEditBlocks("<<<<<<< SEARCH\nconst WALL = 3;\n=======\nconst WA");
  check("a block cut off mid-way is flagged incomplete", cut.incomplete && cut.edits.length === 0);
  const del = parseEditBlocks("<<<<<<< SEARCH\nconst DEPTH = 60;\n=======\n>>>>>>> REPLACE");
  check("an empty REPLACE parses as a deletion", del.edits.length === 1 && del.edits[0].new === "");
  const wobble = parseEditBlocks("<<<<<<<SEARCH  \nconst WALL = 3;\n========\nconst WALL = 2;\n>>>>>>>> REPLACE");
  check("marker lines tolerate small wobbles", wobble.edits.length === 1 && wobble.edits[0].new === "const WALL = 2;", JSON.stringify(wobble));
  check("CRLF replies parse", parseEditBlocks(REPLY.replace(/\n/g, "\r\n")).edits.length === 2);
}

// ---- the harness offers edits only when there is something to edit -------
{
  const withEdits = CHAT.composeSystem({ context: { text: "make it wider", editable: true } });
  const without = CHAT.composeSystem({ context: { text: "make a phone stand", editable: false } });
  check("harness: #edits rides along with a model on screen", /<<<<<<< SEARCH/.test(withEdits) && /SMALL CHANGES AS EDITS/.test(withEdits));
  check("harness: not sent for a blank editor", !/<<<<<<< SEARCH/.test(without));
  check("harness: the compact small-model primer never offers it", !/SEARCH/.test(CHAT.COMPACT_HARNESS) && !/SEARCH/.test(CHAT.POLISH_HARNESS));
  check("harness: #edits is an optional section", CHAT.harnessTags(CHAT.DEFAULT_HARNESS).includes("edits"));
  check("chatbot re-exports the edit helpers", CHAT.applyEdits === applyEdits && CHAT.parseEditBlocks === parseEditBlocks);
}

// The deterministic local edits still answer before any AI is asked: the
// edit-block path only ever sees replies from a model.
{
  const res = CHAT.respond("make it wider", {}, SRC, [80, 60, 3]);
  check("local follow-ups still answer catalog code without the AI", !!res && (typeof res.code === "string" || typeof res.reply === "string"), JSON.stringify(res)?.slice(0, 160));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
