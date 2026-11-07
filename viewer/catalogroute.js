// The in-browser model as the catalog's interpreter.
//
// The catalog (src/catalog) answers a request it recognises by its WORDS:
// "a phone stand" scores, "squeeze the last bit out of the toothpaste" does
// not, and that request then goes to a 1-4 GB model writing code from
// scratch, the one job it is worst at. Saying what the thing is CALLED is a
// job a small model is good at, and naming things is what the catalog's
// matcher is good at. So before the model writes anything it is asked one
// question: the object's name in a few shop words ("toothpaste squeezer"),
// as a one-line JSON reply that WebLLM's grammar holds to that shape. The
// name goes to the catalog's own matcher, which decides, with its usual
// confidence bar, whether one of the tested designs is that object.
//
// Tried first and dropped: showing the model the catalog and having it pick
// (a category of 18, then a design), each answer held to the list. The 1.5B
// Coder got 7 of 40 and never once chose "none" -- held to a list, it took
// whatever came early in it (storage, drawer cabinet). The matcher, given the
// names a person would say, gets 37 of 40 and says nothing for a custom part.
//
// The pick is then handed to the catalog as "<design name> <the request>", so
// the request's own sizes, phone and colour land on the design's dials the
// same way a typed request's do. No match carries on to the code-writing pass.
//
// No DOM: test/catalogroute.js runs the prompt, the parsing and the hand-off
// in Node with a stand-in for the model.

import { familyById } from "../src/catalog/index.js";
import { matchRequest } from "../src/catalog/match.js";

// Three names, not one: a small model's first word for a thing is often a
// fair one the catalog files under another ("bike rack" for the bike hanger,
// "card holder" for the deck box), and the second or third is the shop's.
// Examples from outside the test requests, so a score on those is earned.
export function nameAsk(request) {
  return {
    system: "You name the object in a 3D-printing request the way a hardware store labels it on the shelf: "
      + "three different names for the same object, 2 to 4 plain words each, the most common first. "
      + "Name the object itself, not what it is for. A part described by sizes is named for what it is.\n"
      + "Examples: \"somewhere to hang my bath towel\" -> towel hook, towel hanger, bathroom hook. "
      + "\"stop my glasses getting scratched in my bag\" -> glasses case, spectacle case, eyeglass box. "
      + "\"a 25 mm disc with a 3 mm hole\" -> washer, flat washer, shim.\nReply with JSON only.",
    user: `Request: ${request}\n{"names": ["<name>", "<another name>", "<another name>"]}`,
    schema: {
      type: "object",
      properties: { names: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 } },
      required: ["names"],
      additionalProperties: false,
    },
  };
}

const clean = (v) => {
  if (typeof v !== "string") return null;
  const name = v.toLowerCase().replace(/[^a-z0-9 '-]+/g, " ").replace(/\s+/g, " ").trim();
  return name && name.split(" ").length <= 6 ? name : null;
};

// The names in the model's reply, most common first. The grammar keeps WebLLM
// to the shape, but a reply is still read defensively: a provider without
// one, a stray fence, an empty or rambling name, one name given as a string.
export function readNames(reply) {
  let j = null;
  try { j = JSON.parse(String(reply ?? "").replace(/^[^{]*/, "").replace(/[^}]*$/, "")); }
  catch { return []; }
  const raw = Array.isArray(j?.names) ? j.names : [j?.names ?? j?.object];
  return [...new Set(raw.map(clean).filter(Boolean))].slice(0, 3);
}

// `ask({ system, user, schema })` is one constrained model call returning its
// text. The names, most common first ([] when the reply was no use). They are
// asked for once and used twice: here for the catalog, and by
// browserparts.js to pick a plain part when the catalog has nothing.
export async function nameRequest(request, ask) {
  return readNames(await ask(nameAsk(request)));
}

// { family, name } for the first name the catalog is confident is one of its
// designs, else null.
export function routeNames(names) {
  for (const name of names) {
    const m = matchRequest(name);
    const family = m ? familyById(m.familyId) : null;
    if (family) return { family, name };
  }
  return null;
}

export async function routeRequest(request, ask) {
  return routeNames(await nameRequest(request, ask));
}

// What the catalog is handed for a pick: the design's own name in front of
// the request, so the matcher lands on that family (a name phrase is its
// strongest signal) while the request's numbers and named objects still fill
// its dials. Said as a NEW thing ("I want a ..."): with the starter cube in
// the editor, a bare "drain strainer stop hair going down..." read as an
// edit of the cube and never reached the catalog.
export const catalogPhrase = (family, request) => {
  const name = family.names[0];
  return `I want ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}, ${request}`;
};

// The catalog's answer is only kept when it is the design that was named:
// the request's own words can still outweigh the prefixed name (a longer
// phrase for a different design), and then the pick is not what got built.
export const pickedFamilyOf = (code) => /From the BREPcode catalog: ([\w-]+)\./.exec(String(code || ""))?.[1] || null;
