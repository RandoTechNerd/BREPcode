// brepcode.com/seedstarter: the address that opens it, the card's dials
// against the catalog family they turn, and the chat follow-ups the video
// promises ("make it 4 by 4", "use a bottle") on the code it puts on the plate.
// The builds themselves are test/catalog.js's (defaults; --full adds the
// bottle, every thing and every dial's ends), each part checked as a print.
//
//   node test/seedstarter.js

import { isSeedStarterUrl, isSeedStarterCode, DIALS, WATER, FAMILY_ID, sizeLine } from "../viewer/seedstarter.js";
import { FAMILIES } from "../src/catalog/index.js";
import { resolveParams, familyCode } from "../src/catalog/schema.js";
import { matchRequest } from "../src/catalog/match.js";
import { findParams } from "../viewer/params.js";
import { respond } from "../viewer/chatbot.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const read = (src) => Object.fromEntries(findParams(src).map((p) => [p.name, p.value]));

console.log("\nthe address\n");
check("/seedstarter opens it", isSeedStarterUrl({ pathname: "/seedstarter" }) && isSeedStarterUrl({ pathname: "/brep/seedstarter/" }));
check("?seedstarter=1 and #seedstarter open it", isSeedStarterUrl({ search: "?seedstarter=1" }) && isSeedStarterUrl({ hash: "#seedstarter" }));
check("?seedstarter=10 is not ?seedstarter=1", !isSeedStarterUrl({ search: "?seedstarter=10" }));
check("/m/seedstarter is a model, not this", !isSeedStarterUrl({ pathname: "/m/seedstarter" }));

console.log("\nthe card and the family agree\n");
const fam = FAMILIES.find((f) => f.id === FAMILY_ID);
check("the family is in the catalog", !!fam);
const code = familyCode(fam, resolveParams(fam).values);
check("its code is recognised as the seed starter", isSeedStarterCode(code));
check("...and a different catalog model is not", !isSeedStarterCode(familyCode(FAMILIES.find((f) => f.id === "seedling-tray"), {})));
for (const d of DIALS) check(`dial ${d.name} is a numeric family param`, fam.params[d.name] && fam.params[d.name].unit !== "choice");
check("the watering buttons are the family's choices", JSON.stringify(WATER.map((w) => w.value)) === JSON.stringify(fam.params.water.choices));
const v0 = read(code);
check("defaults read back: 3 x 3, spout", v0.cols === 3 && v0.rows === 3 && v0.water === "spout", JSON.stringify({ cols: v0.cols, rows: v0.rows, water: v0.water }));
check("the size line", sizeLine(v0) === "3 x 3 pots, about 164 x 164 mm", sizeLine(v0));

console.log("\nthe chat finds it and changes it\n");
for (const q of ["self watering seed starter", "a self watering seed starter that a soda bottle twists into", "make me a self watering seed starter with 4 x 4 pots"]) {
  const m = matchRequest(q);
  check(`"${q}" -> ${FAMILY_ID}`, m?.familyId === FAMILY_ID, m?.familyId);
}
const bottle = matchRequest("a self watering seed starter that a soda bottle twists into");
check("...with the bottle socket", bottle?.values.water === "bottle", bottle?.values.water);
const dims = { min: [-90, -90, 0], max: [90, 90, 100] };
const ctx = { catalog: { familyId: FAMILY_ID, specId: null } };
const r1 = respond("make it 4 by 4", ctx, code, dims);
const v1 = r1.code ? read(r1.code) : {};
check("'make it 4 by 4' makes it 4 x 4", v1.cols === 4 && v1.rows === 4, `${r1.reply} ${JSON.stringify({ cols: v1.cols, rows: v1.rows })}`);
const r2 = respond("use a bottle", ctx, r1.code || code, dims);
const v2 = r2.code ? read(r2.code) : {};
check("'use a bottle' switches to the bottle socket", v2.water === "bottle", r2.reply);
check("...and keeps the 4 x 4", v2.cols === 4 && v2.rows === 4);
const r3 = respond("go back to the spout", ctx, r2.code || code, dims);
check("'go back to the spout' switches back", r3.code && read(r3.code).water === "spout", r3.reply);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
