// Claude Code as a provider people can actually find.
//
// The integration worked for a long time before anyone could tell it was
// there: the option sat fifth in the Provider list, below three services that
// want an API key, wearing a label that described a feature ("this computer,
// no key") rather than answering the only question that matters — is it going
// to work on THIS machine.
//
// It is the one thing the desktop build offers that the website cannot: chat
// that runs on the Claude subscription the user already pays for, with no key
// to paste and nothing metered per message. That deserves to be the default
// when it is present, not a discovery.

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
const PRELOAD = readFileSync(new URL("../desktop/preload.cjs", import.meta.url), "utf8");
const MAIN = readFileSync(new URL("../desktop/claude.cjs", import.meta.url), "utf8");

console.log("\nit is offered before the ones that want a credit card\n");
{
  // ...searching for the closing tag FROM the opening one. Without the offset
  // this found an earlier </select> and sliced backwards to nothing, which
  // reads as "the provider list is missing" — a confident lie.
  const at = HTML.indexOf('<select id="ai-provider">');
  const list = HTML.slice(at, HTML.indexOf("</select>", at));
  const order = [...list.matchAll(/<option value="([a-z-]+)"/g)].map((m) => m[1]);
  check("the provider list was found", order.length >= 6, order.join(", "));
  check("built-in stays first — it needs nothing at all", order[0] === "builtin", order[0]);
  check("Claude Code comes next, above the key-holders",
    order[1] === "claude-code", order.slice(0, 4).join(" > "));
  check("...and ahead of every paid API", order.indexOf("claude-code") < order.indexOf("openai")
    && order.indexOf("claude-code") < order.indexOf("gemini")
    && order.indexOf("claude-code") < order.indexOf("claude"));
  check("it is hidden on the web, where there is no CLI to reach",
    /<option value="claude-code" id="opt-claude-code" hidden>/.test(list));
  check("...and shown as soon as the desktop bridge exists",
    /if \(window\.brepcodeDesktop\) \{\s*\n\s*\$\("opt-claude-code"\)\.hidden = false;/.test(HTML));
}

console.log("\nthe label says what was found, not what is hoped for\n");
{
  check("found: it says so, with the version it probed",
    /Claude Code ✓ found\$\{ccVersion \? ` \(\$\{ccVersion\}\)` : ""\} — your subscription, no key/.test(HTML));
  check("missing: it says where to get it",
    /Claude Code — install to enable \(claude\.com\/code\)/.test(HTML));
  check("both come from one probe of the real CLI",
    /claudeInfo\?\.\(\)\.then\(\(i\) => \{[\s\S]{0,200}ccFound = !!i\?\.found/.test(HTML));
  check("the connected dot is repainted once the answer is in",
    /\$\("opt-claude-code"\)\.textContent = ccFound[\s\S]*?updateSpark\(\);/.test(HTML),
    "the probe is async — the dot is wrong until it answers");
}

console.log("\nit picks itself the first time, and never argues after that\n");
{
  check("first run with the CLI present selects it",
    /if \(ccFound && !aiCfg\.provider\) \{\s*\n\s*aiProvider\.value = "claude-code";/.test(HTML));
  check("...and tells the rest of the app, rather than only the <select>",
    /aiProvider\.dispatchEvent\(new Event\("change"\)\)/.test(HTML),
    "the model list and the header label both hang off that event");
  check("a provider chosen before is never overridden",
    /!aiCfg\.provider/.test(HTML),
    "aiCfg.provider is the stored choice — its absence is what 'first run' means");
  check("the one-time note exists and starts hidden",
    /<div class="note" id="cc-firstrun" hidden/.test(HTML));
  check("...and says what it means for cost, which is the point",
    /no API key, nothing metered per message/.test(HTML));
}

console.log("\nsomeone arriving later can still find out\n");
{
  const docs = HTML.slice(HTML.indexOf('<div id="about-docs">'), HTML.indexOf('<div class="docs-sec"><b>Build a model</b>'));
  check("the docs name it", /Claude Code/.test(docs));
  check("...with the three steps: install, sign in, pick it",
    /install[\s\S]{0,200}sign in once[\s\S]{0,120}Provider/.test(docs));
  check("...and say the other providers are unaffected",
    /still works exactly as before/.test(docs),
    "a new default must not read as the others being taken away");
  check("...and point at the indicator",
    /dot beside the chat\s*box lights up/.test(docs));
}

console.log("\nthe bridge it depends on is really there\n");
{
  check("the preload exposes the probe", /claudeInfo: \(\) => ipcRenderer\.invoke\("claude:info"\)/.test(PRELOAD));
  check("...and the ask", /claudeAsk: \(opts\) => ipcRenderer\.invoke\("claude:ask"/.test(PRELOAD));
  check("...and a way to sign in", /claudeLogin/.test(PRELOAD));
  check("the main process answers both", /ipcMain\.handle\("claude:info"/.test(MAIN)
    && /ipcMain\.handle\("claude:ask"/.test(MAIN));
  check("the version probe is async, so a cold CLI cannot stall the window",
    /ASYNC on purpose/.test(MAIN));
}

console.log("\nthe CLI is run lean, and the newest one on the machine is the one that runs\n");
{
  // Measured 2026-11-09: spawned the old way a five-word question carried 131
  // tools, 7 MCP servers and 55,918 tokens of prompt; this way, 284.
  check("it runs in a folder of its own, away from anyone's project", /spawn\(r\.file, r\.args, \{ windowsHide: true, env, \.\.\.\(cwd \? \{ cwd \} : \{\}\) \}\)/.test(MAIN)
    && /const WORK_DIR = path\.join\(os\.tmpdir\(\), "BREPcode-chat"\);/.test(MAIN));
  check("no MCP servers, one tool, and the effort as the CLI's own flag",
    /args\.push\("--strict-mcp-config", "--tools", "Read", "--effort", eff\);/.test(MAIN));
  check("the instructions are the real system prompt, from a file named by a constant",
    /args\.push\("--system-prompt-file", SYSTEM_FILE\);/.test(MAIN) && /const SYSTEM_FILE = "system\.txt";/.test(MAIN),
    "argv carries allowlisted tokens only: the text itself never touches it");
  check("the effort is allowlisted before it reaches argv",
    /const eff = EFFORTS\.has\(String\(effort\)\) \? String\(effort\) : "medium";/.test(MAIN));
  check("an old CLI that refuses the flags is asked the old way, once",
    /if \(!r\.ok && r\.unknownFlag && leanOk\) \{\s*\n\s*leanOk = false;/.test(MAIN));
  check("high effort is given the time it asks for", /const TIME_LIMIT_MIN = \{ low: 5, medium: 5, high: 12/.test(MAIN));
  check("a CLI too old for the model says to update, not 'returned nothing'",
    /does not support this model/.test(MAIN) && /claude update/.test(MAIN));
  check("the model list carries Fable 5.2 by id, since the alias lags",
    /"claude-code": \["default", "claude-fable-5-2", "fable", "opus", "sonnet", "haiku"\]/.test(HTML));

  const { createRequire } = await import("node:module");
  const cc = createRequire(import.meta.url)("../desktop/claude.cjs");
  check("2.1.309 is newer than 2.1.290", cc.cmpVersion("2.1.309 (Claude Code)", "2.1.290") > 0);
  check("...and 2.1.241 older", cc.cmpVersion("2.1.241 (Claude Code)", "2.1.290") < 0);
  check("...and a version is equal to itself, however it is dressed", cc.cmpVersion("2.1.309", "2.1.309 (Claude Code)") === 0);
  check("a newer CLI in the Claude app replaces an older one on PATH",
    /const newer = bundledClis\(\)\.find\(\(b\) => cmpVersion\(b\.version, cached\.version\) > 0\);/.test(MAIN));
  const found = cc.bundledClis();
  check("listing the app's CLIs never throws, and is newest first",
    Array.isArray(found) && found.every((b, i) => i === 0 || cc.cmpVersion(found[i - 1].version, b.version) >= 0));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
