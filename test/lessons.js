// Learning from this machine's own build history.
//
// The risk here is not that it learns too little — it is that it learns the
// WRONG thing and then injects it into every future prompt. So the tests lean
// on: a one-off never becomes a rule, an unrecognised error never invents
// advice, and an empty history changes nothing at all.

import {
  errorSignature, emptyStore, recordBuild, houseRules,
  similarity, nearestExamples, lessonBlock,
} from "../src/lessons.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

console.log("\nthe same mistake collapses to one signature\n");
{
  // Different names, same lesson — otherwise every occurrence looks unique and
  // nothing ever reaches the threshold to become a rule.
  const a = errorSignature("minkowski is not defined");
  const b = errorSignature("hull2 is not defined");
  check("two undefined words share a signature", a === b, `${a} vs ${b}`);

  // Numbers and positions are noise.
  check("line numbers do not split a signature",
    errorSignature("Unexpected token (12:5)") === errorSignature("Unexpected token (98:2)"));
  check("sizes do not split a signature",
    errorSignature("wall 0.3mm is too thin") === errorSignature("wall 1.7mm is too thin"));
  check("the error class prefix is stripped",
    errorSignature("TypeError: not a function") === errorSignature("not a function"));
  check("an empty error has no signature", errorSignature("") === "" && errorSignature(null) === "");
}

console.log("\na one-off is noise; a pattern is a rule\n");
{
  let s = emptyStore();
  s = recordBuild(s, { prompt: "a bracket", ok: false, error: "foo is not defined", attempts: 2 });
  check("one failure is not yet a rule", houseRules(s).length === 0, JSON.stringify(houseRules(s)));

  s = recordBuild(s, { prompt: "a plate", ok: false, error: "bar is not defined", attempts: 3 });
  const rules = houseRules(s);
  check("the second occurrence promotes it", rules.length === 1, JSON.stringify(rules));
  check("...and it comes back as an instruction, not a description",
    /vocabulary/i.test(rules[0].rule), rules[0].rule);
  check("...counted", rules[0].count === 2, `${rules[0].count}`);

  // An error nobody has a rule for must not produce invented advice.
  let t = emptyStore();
  t = recordBuild(t, { prompt: "x", ok: false, error: "the flux capacitor overheated", attempts: 2 });
  t = recordBuild(t, { prompt: "y", ok: false, error: "the flux capacitor overheated", attempts: 2 });
  check("an unrecognised error yields no rule", houseRules(t).length === 0,
    JSON.stringify(houseRules(t)));

  // A build that worked first time teaches nothing about first-attempt failures.
  let u = emptyStore();
  for (let i = 0; i < 5; i++) {
    u = recordBuild(u, { prompt: `p${i}`, ok: true, attempts: 1, code: "return cube([1,1,1]);" });
  }
  check("clean first-time builds add no rules", houseRules(u).length === 0);
}

console.log("\nthe closest previous success is offered as the example\n");
{
  let s = emptyStore();
  s = recordBuild(s, { prompt: "a raspberry pi case with usb cutouts", ok: true, attempts: 3,
    code: "return difference(cube([90,60,25]), translate([0,0,0], cube([13,5.5,3])));" });
  s = recordBuild(s, { prompt: "a cookie cutter shaped like a fish", ok: true, attempts: 2,
    code: "return difference(blade, bore);" });

  const near = nearestExamples(s, "a raspberry pi 5 case with usb ports", { max: 1 });
  check("it finds the related build", near.length === 1 && /raspberry/.test(near[0].prompt),
    JSON.stringify(near.map((n) => n.prompt)));
  check("...and not the unrelated one",
    nearestExamples(s, "a cookie cutter for gingerbread", { max: 1 })[0]?.prompt.includes("cookie"),
    JSON.stringify(nearestExamples(s, "a cookie cutter for gingerbread", { max: 1 })));
  check("a request like nothing before it gets no example",
    nearestExamples(s, "a garden trellis bracket", { max: 1 }).length === 0,
    JSON.stringify(nearestExamples(s, "a garden trellis bracket", { max: 1 })));

  // Similarity must not be fooled by the filler words in every request.
  check("filler words do not create a match",
    similarity("make me a model of a thing", "make me a model of a thing please") >= 0
    && similarity("a phone stand", "a raspberry pi case") === 0,
    `${similarity("a phone stand", "a raspberry pi case")}`);
}

console.log("\nan empty history changes nothing\n");
{
  check("no store, no block", lessonBlock(emptyStore(), "a bracket") === "");
  check("undefined store is survivable", lessonBlock(undefined, "a bracket") === "");
  check("a store with only noise stays quiet",
    lessonBlock(recordBuild(emptyStore(), { prompt: "x", ok: false, error: "weird", attempts: 2 }),
      "a bracket") === "");
}

console.log("\nthe block says where it came from and what to do\n");
{
  let s = emptyStore();
  s = recordBuild(s, { prompt: "a pi case", ok: false, error: "a is not defined", attempts: 2 });
  s = recordBuild(s, { prompt: "a pi case with ports", ok: true, attempts: 3,
    code: "const W = 90;\nreturn cube([W, 60, 25]);" });
  s = recordBuild(s, { prompt: "another case", ok: false, error: "b is not defined", attempts: 2 });

  const block = lessonBlock(s, "a raspberry pi case with usb ports");
  check("the block is produced", block.length > 0);
  check("it is attributed to this machine", /THIS MACHINE'S OWN HISTORY/.test(block));
  check("it carries the rule", /vocabulary/i.test(block));
  check("it carries the worked example's code", /const W = 90/.test(block), block.slice(0, 120));
  check("it tells the model the example is the STARTING standard",
    /standard to start at/i.test(block));

  // Size discipline: a giant past model must not eat the prompt.
  let big = emptyStore();
  big = recordBuild(big, { prompt: "a huge thing", ok: true, attempts: 1, code: "x".repeat(9000) });
  check("an oversized example is left out",
    !lessonBlock(big, "a huge thing").includes("xxxxx"), "the 9k example leaked in");
}

console.log("\nthe store stays bounded\n");
{
  let s = emptyStore();
  for (let i = 0; i < 90; i++) {
    s = recordBuild(s, { prompt: `thing ${i}`, ok: true, attempts: 1, code: `return cube([${i},1,1]);` });
  }
  check("old builds are dropped", s.builds.length <= 60, `${s.builds.length}`);
  check("...keeping the most recent", s.builds[s.builds.length - 1].prompt === "thing 89",
    s.builds[s.builds.length - 1].prompt);
  check("a build with no prompt is ignored",
    recordBuild(emptyStore(), { prompt: "", ok: true, code: "x" }).builds.length === 0);
}

console.log("\nthe public build carries none of this\n");
{
  // The website has no disk and no business accumulating one person's history.
  // The whole feature hangs off a desktop-only bridge, so the guarantee worth
  // testing is that with nothing recorded the prompt is byte-identical to what
  // it always was — a visitor gets the same bytes as before this existed.
  const { composeSystem } = await import("../viewer/chatbot.js");
  const plain = composeSystem({});
  check("an empty store adds nothing to the prompt",
    composeSystem({ lessons: lessonBlock(emptyStore(), "a bracket") }) === plain);
  check("no lessons key at all is the same",
    composeSystem({ lessons: "" }) === plain && composeSystem({ lessons: undefined }) === plain);

  // And when there IS something to say it stays small — a prompt that grows
  // without bound costs money on every request forever.
  let s = emptyStore();
  for (let i = 0; i < 40; i++) {
    s = recordBuild(s, { prompt: `a pi case ${i}`, ok: false, error: "x is not defined", attempts: 2 });
    s = recordBuild(s, { prompt: `a pi case ${i}`, ok: true, attempts: 2,
      code: "const W = 90;\nreturn cube([W, 60, 25]);" });
  }
  const grown = composeSystem({ lessons: lessonBlock(s, "a pi case with usb") }).length - plain.length;
  check("even a long history adds only a few hundred characters",
    grown > 0 && grown < 4000, `${grown} chars`);
  check("...capped at four rules", houseRules(s).length <= 4, `${houseRules(s).length}`);
}


console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
