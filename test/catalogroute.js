// The in-browser model as the catalog's interpreter (viewer/catalogroute.js).
//
// The model itself only runs in a browser with WebGPU, so here a stand-in
// answers. What has to hold without it:
//
//   * every design survives the hand-off: "<its name> <any request>" comes
//     back from the catalog as that design;
//   * the names a person would say for a request reach the right design, and
//     a custom part's name reaches none (the matcher's confidence bar);
//   * the reply is held to {"names": [up to three]} and read defensively;
//   * the prompt stays tiny: it is paid for on every new-thing request.

import { FAMILIES } from "../src/catalog/index.js";
import { respond } from "../viewer/chatbot.js";
import { nameAsk, readNames, routeRequest, catalogPhrase, pickedFamilyOf } from "../viewer/catalogroute.js";

let pass = 0, fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
}

// The editor's starter model, as index.html opens with it. The hand-off is
// made with this on screen: said as a bare "drain strainer stop hair...", the
// catalog read it as an edit of the cube and the pick was lost.
const STARTER = "difference(\n  cube([30, 30, 12]),\n  translate([15, 15, -1], cylinder({ r: 8, h: 14, $fn: 64 })),\n)";

console.log("\ncatalog route: the hand-off\n");
{
  const missed = [];
  for (const f of FAMILIES) {
    for (const req of ["something to keep my stuff tidy", "make it 80 mm wide please", "stop hair going down the plughole"]) {
      for (const [where, code] of [["empty", ""], ["starter", STARTER]]) {
        const r = respond(catalogPhrase(f, req), {}, code);
        if (pickedFamilyOf(r.code) !== f.id) missed.push(`${f.id} <- "${req}" (${where} editor): ${pickedFamilyOf(r.code)}`);
      }
    }
  }
  check(`every design comes back as itself (${FAMILIES.length} designs, 3 requests, empty and starter editor)`, !missed.length,
    `${missed.length} missed:\n    ${missed.slice(0, 20).join("\n    ")}`);
}

console.log("\ncatalog route: a name reaches its design\n");
{
  // request -> the name a person (or a decent model) gives it -> the design.
  // None of these requests is matched by the catalog's words on their own.
  const named = [
    ["squeeze the last bit out of the tube of toothpaste", "toothpaste squeezer", "toothpaste-squeezer"],
    ["stop hair going down the bath plughole", "drain hair catcher", "drain-strainer"],
    ["measure how much it rained", "rain gauge", "rain-gauge"],
    ["hold my roll of filament so it unwinds while printing", "filament spool holder", "spool-holder"],
    ["put my socks on without bending down", "sock aid", "sock-aid"],
    ["a 40 by 60 mm plate 3 mm thick with four 4 mm holes", "mounting plate", null],
    ["a gear with 24 teeth and a 5 mm bore", "spur gear", null],
    ["a model of the Eiffel tower", "eiffel tower model", null],
  ];
  for (const [request, name, want] of named) {
    const r = await routeRequest(request, async () => JSON.stringify({ names: [name] }));
    check(`"${name}" -> ${want ?? "no design"}`, (r?.family?.id ?? null) === want, String(r?.family?.id));
    if (want) check(`...and the hand-off builds it over the starter`, pickedFamilyOf(respond(catalogPhrase(r.family, request), {}, STARTER).code) === want);
  }
}

console.log("\ncatalog route: the prompt and the reply\n");
{
  const q = nameAsk("a holder for my toothbrush");
  check("the reply is held to a list of up to three names", JSON.stringify(q.schema.required) === `["names"]` && q.schema.properties.names.maxItems === 3 && q.schema.additionalProperties === false);
  // ~4 characters a token: well under 200 tokens, so the question costs about
  // a second even on an integrated GPU
  check("the prompt is under 1,000 characters", q.system.length + q.user.length < 1000, String(q.system.length + q.user.length));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  check("names in order, cleaned", same(readNames('{"names": ["Bike Rack", "bike hook", "bike hanger"]}'), ["bike rack", "bike hook", "bike hanger"]));
  check("a fenced reply", same(readNames('```json\n{"names":["rain gauge"]}\n```'), ["rain gauge"]));
  check("one name given as a string", same(readNames('{"names": "soap dish"}'), ["soap dish"]));
  check("junk is no names", same(readNames("It is a soap dish"), []));
  check("empty, rambling and repeated names are dropped",
    same(readNames('{"names": ["  ", "a thing that you can use to hold up your phone while cooking", "phone stand", "Phone Stand"]}'), ["phone stand"]));
  // the first name the catalog is sure of wins, not the first name
  const r = await routeRequest("hang my bike up in the garage", async () => '{"names": ["bike rack", "bike hanger", "bike hook"]}');
  check("a later name finds the design the first one missed", r?.family?.id === "bike-hanger" && r.name === "bike hanger", JSON.stringify(r && [r.family.id, r.name]));
  let asked = 0;
  await routeRequest("x", async () => { asked++; return "{}"; });
  check("one question per request", asked === 1);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
