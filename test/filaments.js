// The named Cookiecad spools.
//
// These are shown to someone as "this is what that filament looks like", so
// the data has to be internally honest: every colour parseable, every gradient
// ordered bottom-to-top, every effect actually reachable by the shader. The
// shader itself needs a GPU, but the mapping from a spool to the numbers it
// feeds is pure — and that mapping is where a wrong-looking swatch comes from.

import {
  SPOOLS, FAMILY, fxFor, hexToRgb, byFamily, CREDIT, LOOKS, LOOK_KEYS, lookFor,
  findSpool, spoolNames,
} from "../viewer/filaments.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ""}`); }
};
const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
const isHex = (s) => /^#[0-9a-f]{6}$/i.test(s);

console.log("\nthe line-up is what was agreed\n");
{
  check("nine spools", SPOOLS.length === 9, `${SPOOLS.length}`);
  const groups = byFamily();
  for (const g of groups) {
    check(`${g.family} has three`, g.spools.length === 3, `${g.spools.length}`);
  }
  check("the families are PLA, PETG, TPU",
    groups.map((g) => g.family).join(",") === "PLA,PETG,TPU");
  check("every id is unique", new Set(SPOOLS.map((s) => s.id)).size === 9);
  check("every spool is named for a real product",
    SPOOLS.every((s) => s.label && s.label.length > 3));
  check("the credit names the source", /cookiecad/i.test(CREDIT));

  // The spread is the point: a demo of nine spools that all do one trick is a
  // demo of one trick.
  const grads = SPOOLS.filter((s) => s.grad).length;
  const flakes = SPOOLS.filter((s) => s.flake).length;
  const plain = SPOOLS.filter((s) => !s.grad && !s.flake).length;
  check("there are gradients", grads >= 3, `${grads}`);
  check("there is glitter", flakes >= 3, `${flakes}`);
  check("...and something plain to contrast against", plain >= 1, `${plain}`);
  check("at least one spool does BOTH", SPOOLS.some((s) => s.grad && s.flake));
}

console.log("\nevery colour and constant is usable\n");
{
  for (const s of SPOOLS) {
    check(`${s.id}: base is a hex colour`, isHex(s.base), s.base);
    check(`${s.id}: transmission is in range`, s.t >= 0 && s.t <= 1, `${s.t}`);
    check(`${s.id}: alpha is in range`, s.a > 0 && s.a <= 1, `${s.a}`);
    check(`${s.id}: attenuation is positive`, s.atten > 0, `${s.atten}`);
    check(`${s.id}: family is known`, !!FAMILY[s.family], s.family);
    if (s.grad) {
      check(`${s.id}: gradient stops are hex`, s.grad.every(isHex), s.grad.join(","));
      check(`${s.id}: 2 or 3 stops`, s.grad.length === 2 || s.grad.length === 3, `${s.grad.length}`);
    }
    if (s.flake) {
      check(`${s.id}: flake colour is hex`, isHex(s.flake.colour), s.flake.colour);
      // sparse is what makes it read as glitter rather than a rough surface
      check(`${s.id}: flake is SPARSE`, s.flake.size > 0 && s.flake.size < 0.25, `${s.flake.size}`);
      check(`${s.id}: flake is bright enough to catch`, s.flake.strength > 0.5, `${s.flake.strength}`);
    }
  }
  // The three families must actually differ, or PETG gloss is a claim not a look
  check("PETG is glossier than PLA", FAMILY.PETG.rough < FAMILY.PLA.rough);
  check("TPU is the mattest", FAMILY.TPU.rough > FAMILY.PLA.rough);
  check("PETG refracts hardest", FAMILY.PETG.ior > FAMILY.PLA.ior && FAMILY.PETG.ior > FAMILY.TPU.ior);
}

console.log("\nhex parsing does not quietly hand the shader garbage\n");
{
  check("6-digit", hexToRgb("#ff8000").map((v) => Math.round(v * 255)).join(",") === "255,128,0");
  check("3-digit expands", hexToRgb("#f80").map((v) => Math.round(v * 255)).join(",") === "255,136,0");
  check("no hash", hexToRgb("00ff00")[1] === 1);
  check("rubbish falls back to white rather than NaN",
    hexToRgb("nope").every((v) => Number.isFinite(v)), JSON.stringify(hexToRgb("nope")));
}

console.log("\nfxFor gives the shader exactly what it expects\n");
{
  const off = fxFor(null);
  check("nothing selected => both effects off", off.grad === 0 && off.flake === 0);

  const plainSpool = SPOOLS.find((s) => !s.grad && !s.flake);
  const p = fxFor(plainSpool);
  check("a plain spool turns both off", p.grad === 0 && p.flake === 0);
  check("...but still carries its physics", p.t > 0 && p.ior > 1 && p.atten > 0);

  // A two-stop ombre must arrive as three, so the shader never branches on count
  const ombre = SPOOLS.find((s) => s.grad && s.grad.length === 2);
  const o = fxFor(ombre);
  check("a 2-stop ombre is widened to 3 stops", o.grad === 1 && o.gradB.length === 3);
  const mid = hexToRgb(ombre.grad[0]).map((v, i) => (v + hexToRgb(ombre.grad[1])[i]) / 2);
  check("...with the middle stop halfway between",
    o.gradB.every((v, i) => Math.abs(v - mid[i]) < 0.02), JSON.stringify(o.gradB));

  const three = SPOOLS.find((s) => s.grad && s.grad.length === 3);
  const t3 = fxFor(three);
  check("a 3-stop gradient keeps its own stops",
    t3.gradA.join() === hexToRgb(three.grad[0]).join()
      && t3.gradC.join() === hexToRgb(three.grad[2]).join());

  const rainbow = SPOOLS.find((s) => s.flake?.rainbow);
  check("a rainbow flake sets the flag", fxFor(rainbow).flakeRainbow === 1);
  const tinted = SPOOLS.find((s) => s.flake && !s.flake.rainbow);
  check("a tinted flake does not", fxFor(tinted).flakeRainbow === 0);
  check("...and carries its colour", fxFor(tinted).flakeColour.some((v) => v > 0));

  // Every number the shader reads must be finite — a NaN uniform silently
  // blanks the whole material rather than erroring.
  for (const s of SPOOLS) {
    const fx = fxFor(s);
    const nums = [fx.grad, fx.flake, fx.flakeDensity, fx.flakeSize, fx.flakeStrength,
      fx.flakeRainbow, fx.t, fx.ior, fx.env, fx.rough, fx.atten, fx.a,
      ...fx.gradA, ...fx.gradB, ...fx.gradC, ...fx.flakeColour];
    check(`${s.id}: every uniform is a finite number`, nums.every(Number.isFinite),
      JSON.stringify(nums.filter((n) => !Number.isFinite(n))));
  }
}

console.log("\nevery spool brings lighting that suits it — and gives it back\n");
{
  check("every spool has a rig", SPOOLS.every((s) => !!LOOKS[s.id]),
    SPOOLS.filter((s) => !LOOKS[s.id]).map((s) => s.id).join(","));
  check("no rig for anything that is not a spool",
    Object.keys(LOOKS).every((id) => SPOOLS.some((s) => s.id === id)));
  check("lookFor is the same map", lookFor(SPOOLS[0].id) === LOOKS[SPOOLS[0].id]);
  check("lookFor(unknown) is null, not a half-rig", lookFor("nope") === null);

  for (const [id, look] of Object.entries(LOOKS)) {
    check(`${id}: only touches known settings`,
      Object.keys(look).every((k) => LOOK_KEYS.includes(k)),
      Object.keys(look).filter((k) => !LOOK_KEYS.includes(k)).join(","));
    for (const k of ["ambient", "key", "fill", "rim", "exposure", "opacity"]) {
      if (look[k] === undefined) continue;
      check(`${id}: ${k} is a sane percentage`, look[k] >= 0 && look[k] <= 250, `${look[k]}`);
    }
    if (look.bg) check(`${id}: bg is a hex colour`, isHex(look.bg), look.bg);
    if (look.rimcol) check(`${id}: rim tint is a hex colour`, isHex(look.rimcol), look.rimcol);
  }

  // The rigs must actually DIFFER, or "auto-adjusts" is a claim with nothing
  // behind it — nine identical rigs would pass every check above.
  const sig = Object.values(LOOKS).map((l) => [l.key, l.fill, l.rim, l.ambient].join(","));
  check("the nine rigs are not all the same", new Set(sig).size >= 7, `${new Set(sig).size} distinct`);

  // and they must differ in the RIGHT direction
  const clear = SPOOLS.filter((s) => s.t >= 0.55).map((s) => LOOKS[s.id]);
  const solid = SPOOLS.filter((s) => s.t <= 0.3).map((s) => LOOKS[s.id]);
  const avg = (xs, k) => xs.reduce((a, l) => a + l[k], 0) / xs.length;
  check("see-through spools get more BACK light than solid ones",
    avg(clear, "rim") > avg(solid, "rim"),
    `clear rim ${avg(clear, "rim").toFixed(0)} vs solid ${avg(solid, "rim").toFixed(0)}`);
  check("...and more exposure, so the light through them registers",
    avg(clear, "exposure") > avg(solid, "exposure"),
    `${avg(clear, "exposure").toFixed(0)} vs ${avg(solid, "exposure").toFixed(0)}`);
  check("...and are shown less than fully opaque",
    avg(clear, "opacity") < avg(solid, "opacity"),
    `${avg(clear, "opacity").toFixed(0)} vs ${avg(solid, "opacity").toFixed(0)}`);

  const matte = LOOKS["cc-pinkombre"];
  check("the mattest spool leans on FILL, not rim", matte.fill > matte.rim * 2,
    `fill ${matte.fill} rim ${matte.rim}`);
  const dark = LOOKS["cc-darkmagic"];
  check("the near-black spool is the brightest rig",
    dark.key >= Math.max(...Object.values(LOOKS).map((l) => l.key)),
    `${dark.key}`);

  // The promise that matters most: it is borrowed, not taken.
  check("the page snapshots the user's lighting before borrowing it",
    /lightBackup = Object\.fromEntries\(FIL\.LOOK_KEYS/.test(HTML));
  check("...and restores it when a generic filament is chosen",
    /restoreUserLook\(\);\s*\/\/ back to a generic/.test(HTML));
  check("...snapshotting ONCE, so spool-to-spool cannot overwrite the original",
    /if \(!lightBackup\) \{/.test(HTML));
  check("the background ownership flag is saved and put back too",
    /bgBackup = matUserBg;/.test(HTML) && /matUserBg = bgBackup;/.test(HTML));
  check("only named spools get a rig at all — generics are left alone",
    /const sp = FILAMENTS\[mat\.filament\]\?\.spool;/.test(HTML));
}

console.log("\nnaming a spool the way a person would\n");
{
  // "make a heart cutter in Witchcraft" reaches the code as filament("witchcraft"),
  // so the lookup has to survive every way a person or a model writes it.
  const cases = [
    ["witchcraft", "cc-witchcraft"], ["Witchcraft", "cc-witchcraft"],
    ["PETG Witchcraft", "cc-witchcraft"], ["Cookiecad Witchcraft", "cc-witchcraft"],
    ["funfetti", "cc-funfetti"], ["Funfetti Clear", "cc-funfetti"],
    ["unicorn", "cc-unicorn"], ["mermaid", "cc-mermaid"],
    ["dark magic", "cc-darkmagic"], ["darkmagic", "cc-darkmagic"],
    ["fairy floss", "cc-fairyfloss"], ["gold dust", "cc-golddust"],
    ["ruby", "cc-ruby"], ["Ruby Red Elixir", "cc-ruby"],
    ["pink ombre", "cc-pinkombre"], ["Pink Ombré", "cc-pinkombre"],
    ["cc-unicorn", "cc-unicorn"],
  ];
  for (const [q, want] of cases) {
    const got = findSpool(q);
    check(`"${q}" -> ${want}`, got?.id === want, got ? got.id : "null");
  }
  // An accent must not decide the answer.
  check("the accent on Ombré is irrelevant",
    findSpool("Pink Ombré")?.id === findSpool("pink ombre")?.id);

  // Nor must an apostrophe. Found in a demo rehearsal: "witch elixir" matched
  // and "witch's elixir" did not, because the possessive survived long enough
  // to turn "witch" into "witchs", which no longer prefixes "witchcraft".
  // Nobody would ever guess the apostrophe was the problem — they would just
  // conclude the feature does not work, in front of the people who make the
  // filament.
  for (const [q, want] of [
    ["witch's elixir", "cc-witchcraft"],
    ["witch’s elixir", "cc-witchcraft"],        // the curly one a phone types
    ["cookiecad's unicorn", "cc-unicorn"],
    ["the mermaid's petg", "cc-mermaid"],
  ]) {
    check(`a possessive does not break "${q}"`, findSpool(q)?.id === want, findSpool(q)?.id ?? "null");
  }
  check("...and it still matches without one",
    findSpool("witch elixir")?.id === "cc-witchcraft");

  // Not-found must be NULL, never a near miss. Quietly demoing the wrong
  // filament to the people who make it is the failure that matters here.
  for (const q of ["", null, undefined, "nonsense", "star stuff", "black pla", "galaxy"]) {
    check(`${JSON.stringify(q)} finds nothing rather than guessing`, findSpool(q) === null,
      findSpool(q)?.id);
  }
  check("every spool is reachable by its own short name",
    spoolNames().every((n) => findSpool(n)), spoolNames().filter((n) => !findSpool(n)).join(","));
  check("...and there are nine names to offer", spoolNames().length === 9);
}

console.log("\nfilament() is wired, and cannot change the geometry\n");
{
  check("the verb exists in the viewer vocabulary", /filament: \(name, shape\) =>/.test(HTML));
  // The comment form is the one that always works — a JS verb is invisible to
  // the OpenSCAD translator, and cookie cutters are written as OpenSCAD.
  check("a `// filament: name` directive exists", /function applyFilamentDirective/.test(HTML));
  check("...accepting both // and # comments", /\(\?:\\\/\\\/\|#\)/.test(HTML));
  check("...and running on every build, whatever the language",
    /applyFilamentDirective\(typed\)/.test(HTML));
  check("it resolves the name through findSpool", /F\.findSpool\(name\)/.test(HTML));
  check("an unknown name says so and lists the real ones",
    /no such spool/.test(HTML) && /F\.spoolNames\(\)/.test(HTML));
  check("it returns the shape untouched, so it cannot alter the model",
    /return shape;/.test(HTML));
  check("it applies the spool's lighting rig too", /applySpoolLook\(sp\);[\s\S]{0,120}applySpoolFx\(\)/.test(HTML));
  check("picking the same spool twice does not churn the scene",
    /already there, no churn/.test(HTML));
  check("it works before the lazy module has landed",
    /if \(FIL\) set\(FIL\); else loadSpools\(\)/.test(HTML));

  // and the model must be TOLD about it, or it will never write it
  const bot = readFileSync(new URL("../viewer/chatbot.js", import.meta.url), "utf8");
  check("the harness teaches filament()", /filament\("witchcraft"\)/.test(bot));
  check("...with the nine names", spoolNames().every((n) => bot.includes(n)),
    spoolNames().filter((n) => !bot.includes(n)).join(","));
  check("...and that it never changes the STL", /STL is identical whichever spool/.test(bot));
}

console.log("\nthere is one button that puts EVERYTHING back\n");
{
  // The button you press when the view has gone strange and you do not want to
  // work out why. It has to clear every layer a spool touches, including the
  // two that have no slider.
  check("a reset exists in the panel HEADER, not only the footer",
    /id="mat-reset-top"/.test(HTML));
  check("both reset buttons run the same thing",
    /\$\("mat-reset"\)\.addEventListener\("click", resetLook\)/.test(HTML)
      && /\$\("mat-reset-top"\)\.addEventListener\("click", resetLook\)/.test(HTML));
  check("it restores MAT_DEFAULTS", /mat = \{ \.\.\.MAT_DEFAULTS, custom: keepCustom \}/.test(HTML));
  check("...and turns the GRADIENT off", /sharedFx\.grad\.value = 0;/.test(HTML));
  check("...and the GLITTER off", /sharedFx\.flake\.value = 0;/.test(HTML));
  check("...and drops the borrowed-lighting snapshot",
    /lightBackup = null; bgBackup = null;/.test(HTML));
  check("...and puts the themed background back", /applyTheme\(localStorage/.test(HTML));
  check("the user's saved swatches survive it", /keepCustom/.test(HTML));
  check("it says what it did, and what it did NOT touch",
    /back to the baseline/.test(HTML) && /colours in your <b>code<\/b> are untouched/.test(HTML));

  // The credit finally has somewhere to live.
  check("Cookiecad is credited in the Material panel", /inspired by[\s\S]{0,80}cookiecad\.com/i.test(HTML));
}

console.log("\nthe page can actually drive it\n");
{
  // Each uniform the module feeds has to exist on the other side. A typo here
  // is invisible: the effect simply never appears.
  for (const u of ["uFxGrad", "uFxGradA", "uFxGradB", "uFxGradC", "uFxLo", "uFxHi",
    "uFxFlake", "uFxFlakeD", "uFxFlakeS", "uFxFlakeK", "uFxFlakeC", "uFxRainbow"]) {
    check(`${u} is declared in the shader`, HTML.includes(`uniform`) && HTML.includes(u), u);
  }
  check("the gradient runs in WORLD z, so it is bottom-to-top of the print",
    /vFxWorld\.z/.test(HTML));
  check("...anchored to the model's own bounding box", /sharedFx\.lo\.value = bb\.min\.z/.test(HTML));
  check("flake is emissive, so it catches light at glancing angles",
    /totalEmissiveRadiance \+= fxFlake/.test(HTML));
  check("the module is fetched lazily", /import\("\.\/filaments\.js"\)/.test(HTML));
  check("...on idle, after everything else", /requestIdleCallback[\s\S]{0,200}loadSpools/.test(HTML));
  check("...and on opening the Material panel", /loadSpools\(\);\s*\/\/ no-op/.test(HTML));
  check("effects default to OFF so an unused feature costs nothing",
    /grad: \{ value: 0 \}/.test(HTML) && /flake: \{ value: 0 \}/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
