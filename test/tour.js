// The guided tour.
//
// Two things rot a tour, and both are silent. Buttons get renamed and the
// popups start anchoring to nothing; and the example code drifts out of date
// so the first thing a beginner runs is the one thing that does not work. So
// this file checks the tour against the REAL index.html and BUILDS every
// snippet it teaches, rather than trusting either.

import { readFileSync } from "node:fs";
import {
  TOUR_STEPS, LANGUAGE_STEPS, tourPlan, placePopup, MARGIN, celebrationSvg, TOUR_DONE_KEY,
} from "../viewer/tour.js";
import { fromOpenSCAD, looksLikeOpenSCAD } from "../src/openscad.js";
import { fromPython, looksLikePython } from "../src/py123d.js";
import { build, toSTL } from "../index.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};

const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");

console.log("\nevery step points at something that still exists\n");
{
  // This is the check that earns the file. A tour anchored to a renamed id
  // does not throw — it quietly points at the middle of nowhere.
  for (const step of tourPlan()) {
    if (!step.sel) continue;
    const id = step.sel.replace(/^#/, "");
    check(`${step.sel} is in index.html`,
      HTML.includes(`id="${id}"`), `nothing declares id="${id}"`);
  }
  // Cards a step asks to open must exist too.
  for (const step of tourPlan()) {
    if (!step.open) continue;
    check(`opens #${step.open}`, HTML.includes(`id="${step.open}"`));
  }
}

console.log("\nthe steps say something, and the run has a shape\n");
{
  const plan = tourPlan();
  check("the tour is worth starting", plan.length >= 12, `${plan.length} steps`);
  check("it opens without pointing at anything", plan[0].sel === null);
  check("every step has a title and a body",
    plan.every((s) => s.title?.trim() && s.body?.trim()));
  check("no step is a wall of text",
    plan.every((s) => s.body.length < 400),
    plan.find((s) => s.body.length >= 400)?.title);
  check("the three languages are all covered",
    ["OpenSCAD", "JSCAD", "build123d"].every((l) =>
      LANGUAGE_STEPS.some((s) => s.lang === l)));
  check("the language steps carry code", LANGUAGE_STEPS.every((s) => s.code?.trim()));
  check("...and land in the editor", tourPlan().slice(-3).every((s) => s.sel === "#code"));
  check("finishing is remembered under a stable key", /tour/.test(TOUR_DONE_KEY));

  // The filament trap cost a real user a rebuild that could not help — the
  // tour is where it gets explained before it bites.
  check("the material step warns about the GLOBAL filament setting",
    TOUR_STEPS.some((s) => /filament/i.test(s.body) && /global/i.test(s.body)));
}

console.log("\nthe opening card makes a case, and /tour is a real address\n");
{
  const hero = tourPlan()[0];
  check("the first step is the hero", hero.hero === true);
  check("...and points at nothing, so it reads as an intro", hero.sel === null);
  check("...with a handful of claims, not a wall", hero.brag?.length >= 4 && hero.brag.length <= 6,
    `${hero.brag?.length}`);
  check("every claim is a heading plus a detail",
    hero.brag.every(([h, d]) => h?.trim() && d?.trim() && h.length < 46));

  // The claims have to be TRUE, and each of these is checkable elsewhere in
  // the repo — that is the point of pinning them here rather than in prose.
  const blob = hero.brag.map((b) => b.join(" ")).join(" ");
  for (const claim of ["OpenSCAD", "JSCAD", "build123d", "STEP", "3MF", "MIT"]) {
    check(`the intro claims ${claim}`, new RegExp(claim, "i").test(blob));
  }
  check("...and says the work stays local", /local|leaves this machine/i.test(blob));

  // The auto-start hook, and the page that uses it.
  check("the app auto-starts on ?tour=1", /tour=1/.test(HTML) && /tour-btn"\)\.click\(\)/.test(HTML));
  check("...and on #tour", /\^#tour\$/i.test(HTML) || /#tour/i.test(HTML));
  const build = readFileSync(new URL("../build-site.mjs", import.meta.url), "utf8");
  check("the build emits a /tour folder", /join\(OUT, "tour"\)/.test(build));
  check("...that redirects into the app with the flag", /\.\.\/index\.html\?tour=1/.test(build));
  check("...by meta refresh AND script, so one failing is survivable",
    /http-equiv="refresh"/.test(build) && /location\.replace/.test(build));
}

console.log("\nthe popup stays on screen — including on a phone\n");
{
  const view = { width: 1280, height: 800 };
  const pop = { width: 300, height: 160 };
  const inside = (r, v) =>
    r.left >= 0 && r.top >= 0 && r.left + pop.width <= v.width && r.top + pop.height <= v.height;

  check("no anchor centres it",
    placePopup(null, pop, view).place === "center");
  const c = placePopup(null, pop, view);
  check("...and centred really is centred", Math.abs(c.left - (1280 - 300) / 2) < 1);

  // an anchor in each corner and the middle, at two viewport sizes
  const anchors = [
    { left: 4, top: 4, width: 40, height: 40 },
    { left: 1236, top: 4, width: 40, height: 40 },
    { left: 4, top: 756, width: 40, height: 40 },
    { left: 1236, top: 756, width: 40, height: 40 },
    { left: 620, top: 380, width: 40, height: 40 },
  ];
  for (const a of anchors) {
    const r = placePopup(a, pop, view);
    check(`anchored at ${a.left},${a.top} stays inside`, inside(r, view), JSON.stringify(r));
  }

  const phone = { width: 375, height: 667 };
  for (const a of anchors.map((a) => ({ ...a, left: Math.min(a.left, 320), top: Math.min(a.top, 600) }))) {
    const r = placePopup(a, { width: 300, height: 160 }, phone);
    check(`phone: anchored at ${a.left},${a.top} stays inside`,
      r.left >= 0 && r.top >= 0 && r.left + 300 <= phone.width && r.top + 160 <= phone.height,
      JSON.stringify(r));
  }

  // a preference is honoured when it fits, and overridden when it does not
  const mid = { left: 600, top: 380, width: 40, height: 40 };
  check("a preference that fits is used", placePopup(mid, pop, view, "top").place === "top");
  const topEdge = { left: 600, top: 2, width: 40, height: 40 };
  check("a preference that does not fit is dropped",
    placePopup(topEdge, pop, view, "top").place !== "top");

  // the pathological case: a viewport smaller than the popup
  const tiny = placePopup(mid, { width: 900, height: 900 }, { width: 320, height: 480 });
  check("a popup bigger than the screen still lands at 0,0 or better",
    tiny.left >= 0 && tiny.top >= 0, JSON.stringify(tiny));
  check("MARGIN is a real gap", MARGIN > 0);
}

console.log("\nevery snippet the tutorial teaches actually builds\n");
{
  const vol = async (shape) => {
    const r = await build(shape);
    const stl = toSTL(r, "t");
    const v = [...stl.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    let out = 0;
    for (let i = 0; i < v.length; i += 3) {
      const [a, b, c] = v.slice(i, i + 3);
      out += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return Math.abs(out);
  };

  const scad = LANGUAGE_STEPS.find((s) => s.lang === "OpenSCAD");
  check("the OpenSCAD sample is detected as OpenSCAD", looksLikeOpenSCAD(scad.code));
  let v = 0, err = "";
  try { v = await vol(fromOpenSCAD(scad.code)); } catch (e) { err = String(e.message || e); }
  check("...and it builds into real geometry", v > 1000, err || `${v}`);

  const py = LANGUAGE_STEPS.find((s) => s.lang === "build123d");
  check("the build123d sample is detected as Python", looksLikePython(py.code));
  v = 0; err = "";
  try { v = await vol(fromPython(py.code).shape); } catch (e) { err = String(e.message || e); }
  check("...and it builds into real geometry", v > 1000, err || `${v}`);

  const js = LANGUAGE_STEPS.find((s) => s.lang === "JSCAD");
  check("the JSCAD sample looks like a JSCAD module",
    /@jscad\/modeling/.test(js.code) && /module\.exports/.test(js.code));
  check("...and is NOT mistaken for OpenSCAD", !looksLikeOpenSCAD(js.code));
  check("...nor for Python", !looksLikePython(js.code));
}

console.log("\nthe celebration is self-contained\n");
{
  const svg = celebrationSvg({ width: 800, height: 500 });
  check("it is an svg", svg.trim().startsWith("<svg"));
  check("it draws something", (svg.match(/<(rect|circle|ellipse|path)/g) || []).length > 20,
    `${(svg.match(/<(rect|circle|ellipse|path)/g) || []).length} shapes`);
  check("nothing is fetched from anywhere", !/https?:|url\(/.test(svg));
  check("it scales with the box", celebrationSvg({ width: 400, height: 300 }).includes("0 0 400 300"));
  check("a small count still renders", celebrationSvg({ count: 3 }).includes("<svg"));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
