// Interface languages (viewer/i18n.js): every row has all ten languages, the
// labels it promises are really on the page, and "auto" follows the system.
import { readFileSync } from "node:fs";
import { STRINGS, TABLE, LANGS, translate, resolveLang } from "../viewer/i18n.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

const short = Object.entries(TABLE).filter(([, row]) => row.length !== 10 || row.some((t) => !t)).map(([k]) => k);
check("every row has ten translations", short.length === 0, short.join(", "));
check("eleven languages offered, English first", LANGS.length === 11 && LANGS[0][0] === "en");
for (const [code] of LANGS.slice(1)) {
  const same = STRINGS.filter((s) => s.length > 6 && translate(s, code) === s);
  check(`${code}: no row left in English by mistake`, same.length <= 6, same.join(", "));
}
check("English is the identity", STRINGS.every((s) => translate(s, "en") === s));
check("an unknown label passes through", translate("Gridfinity bin", "de") === "Gridfinity bin");
check("auto follows the system", resolveLang("auto", "ja-JP") === "ja" && resolveLang("auto", "pt-BR") === "pt");
check("auto falls back to English", resolveLang("auto", "sv-SE") === "en");
check("a chosen language wins over the system", resolveLang("fr", "de-DE") === "fr");

// Every label in the table should exist somewhere in the app, or it is dead weight.
const app = ["viewer/index.html", "viewer/welcome.js", "viewer/design-shell.js", "viewer/design/dialogs.js"].map((f) => readFileSync(f, "utf8")).join("\n")
  .replaceAll("&middot;", "·").replaceAll("&amp;", "&");
const missing = STRINGS.filter((s) => !app.includes(s));
check("every label in the table is really in the app", missing.length === 0, missing.join(" | "));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
