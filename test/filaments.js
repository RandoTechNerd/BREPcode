// The named filament spools.
//
// These are shown to someone as "this is what that filament looks like", so
// the data has to be internally honest: every colour parseable, every gradient
// ordered bottom-to-top, every effect actually reachable by the shader. The
// shader itself needs a GPU, but the mapping from a spool to the numbers it
// feeds is pure — and that mapping is where a wrong-looking swatch comes from.

import {
  SPOOLS, FAMILY, fxFor, hexToRgb, byFamily, LOOKS, LOOK_KEYS, lookFor,
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
  check("eleven spools, ten plain translucents and two tri-colours", SPOOLS.length === 23 && SPOOLS.filter((s) => !s.group).length === 11, `${SPOOLS.length}`);
  const groups = byFamily();
  for (const g of groups) {
    check(`${g.family} has its spools`, g.spools.length === (g.family === "Tri-colour silk" ? 2 : g.family === "Translucent" ? 10 : g.family === "TPU" ? 3 : 4), `${g.spools.length}`);
  }
  check("the families are PLA, PETG, TPU, then the translucents and the tri-colour silks",
    groups.map((g) => g.family).join(",") === "PLA,PETG,TPU,Translucent,Tri-colour silk");
  check("every id is unique", new Set(SPOOLS.map((s) => s.id)).size === SPOOLS.length);
  check("every spool is named for a real product",
    SPOOLS.every((s) => s.label && s.label.length > 3));
  check("no maker's name on any spool", SPOOLS.every((s) => !/cookie\s*cad|funfetti|witchcraft|fairy floss|gold dust|dark magic|mermaid|unicorn/i.test(`${s.id} ${s.label}`)));
  check("the tri-colour silks are a picker group of their own", groups.some((g) => g.family === "Tri-colour silk" && g.spools.map((s) => s.id).join() === "tri-ryb,tri-bbp"));

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

console.log("\nplain translucent colours\n");
{
  const clear = SPOOLS.filter((s) => s.clear);
  check("the everyday colours come see-through: at least ten of them", clear.length >= 10, `${clear.length}`);
  for (const want of ["blue", "green", "yellow", "orange", "pink", "purple", "teal", "smoke", "clear"]) {
    const sp = findSpool(`translucent ${want}`);
    check(`"translucent ${want}" is a spool`, !!sp?.clear, sp?.id ?? "none");
  }
  check("a see-through colour lets real light through", clear.every((s) => s.t >= 0.5 && s.a <= 0.72),
    clear.filter((s) => !(s.t >= 0.5 && s.a <= 0.72)).map((s) => s.id).join(","));
  check("...and has no flake or gradient to hide behind", clear.every((s) => !s.flake && !s.grad && !s.tri));
  check("the deep colours saturate sooner than the pale ones",
    SPOOLS.find((s) => s.id === "sapphire-blue").atten < SPOOLS.find((s) => s.id === "ice-blue").atten);
  check("the viewer shows a clear spool see-through however it was named",
    /function spoolSeeThrough\(f\) \{ return mat\.filamentChosen \|\| !!f\?\.spool\?\.flake \|\| !!f\?\.spool\?\.clear; \}/.test(HTML));
  check("...with a gloss coat on any stage", /m\.userData\.spoolGloss = t > 0 && f\.spool\?\.clear \? 0\.4 : 0;/.test(HTML)
    && /const g = m\.userData\.spoolGloss \|\|/.test(HTML));
  check("tinted plastic is lit from within, by the scene's own lights",
    /LIGHT INSIDE THE PLASTIC/.test(HTML) && /totalEmissiveRadiance \+= pow\(gC, vec3\(0\.8\)\) \* lit \* transmission/.test(HTML));
  check("the right-click lists group them as the panel does",
    (HTML.match(/of F\.byFamily\(\)\)/g) || []).length >= 3);
}

console.log("\nglitter that does not repeat, and no wait for it\n");
{
  check("the flake grid is turned off the part's axes and bent", /vec3 fxLattice\(vec3 pos, float freq, float seed\)/.test(HTML)
    && /0\.33 \* sin\(q\.yzx \* 0\.73 \+ seed\)/.test(HTML));
  check("every depth and the resting dot use that one lattice",
    /vec3 Q = fxLattice\(vFxHome \+ Rw \* t, freq, seed\);/.test(HTML) && /vec3 Q = fxLattice\(vFxHome, uFxFlakeD \* 1\.35, 0\.0\);/.test(HTML));
  check("no sin() hash left in the flake", !/tHash\(cell/.test(HTML));
  check("flakes come in mixed sizes, mostly fine", /float size = mix\(0\.11, 0\.34, k \* k \* k\);/.test(HTML));
  // The sparkle is SIMULATED: no mirror per flake, no test of each flake
  // against each light. A flake fires when a wave swept by the view direction
  // peaks at its own random angle, as hard as the surface is near the light.
  check("which flakes fire is random per flake and changes with the view",
    /float wave = 0\.5 \+ 0\.5 \* sin\(dot\(Vw, k - 0\.5\) \* 34\.0 \+ h\.z \* 6\.28318\);/.test(HTML) && /float fire = pow\(wave, 14\.0\);/.test(HTML));
  check("...and how hard is how near the light the surface is, worked out once per pixel",
    /light \+= directionalLights\[i\]\.color \* \(0\.12 \* nl \+ 0\.75 \* pow\(nh, 6\.0\)\);/.test(HTML)
    && !/facetW/.test(HTML));
  check("a flash keeps its colour at its brightest", /fxGlint = v \* \(3\.2 \/ \(3\.2 \+ max\(v\.r, max\(v\.g, v\.b\)\)\)\);/.test(HTML));
  check("a spool kept from the last session comes back with its own lighting",
    /const kept = FILAMENTS\[mat\.filament\]\?\.spool;\s*if \(kept && !lightBackup\) \{ applySpoolLook\(kept\); applyMaterial\(\); \}/.test(HTML));
  check("every solid material shares one program family", /m\.customProgramCacheKey = \(\) => "brep-solid";/.test(HTML));
  check("the see-through programs are made ahead, off the main thread",
    /function warmSeeThrough\(\)/.test(HTML) && /renderer\.compileAsync\(frame, camera, scene\)/.test(HTML)
    && /id: "warm:seethrough"/.test(HTML));
  check("...and drawn once when a filament list is reached for",
    /for \(const id of \["sm-filament", "sm-material", "mat-filament"\]\)/.test(HTML) && /async function warmDraw\(\)/.test(HTML));
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

  // FLAKE HAS TO BE THE SIZE OF REAL FLAKE, and nothing here checked that.
  //
  // density is cells per millimetre, so 1/density is how big a speck is. The
  // first version shipped 20-34, which is flake 0.03-0.05mm across — a fifth
  // the size of real glitter, and at any normal zoom several specks per PIXEL.
  // The GPU averaged them into a faint pearlescent sheen. Every number was
  // finite, every test passed, and the feature did not do the one thing it is
  // named after. A plausibility band is the only kind of check that catches a
  // whole effect being at the wrong physical scale.
  //
  // Real glitter in filament is roughly 0.2-0.5mm, so 2-5 cells/mm. The band
  // is widened a little at both ends to leave room for taste.
  for (const s of SPOOLS.filter((x) => x.flake)) {
    const mm = 1 / s.flake.density;
    check(`${s.id}: flake is ${mm.toFixed(2)}mm — the size real glitter is`,
      mm >= 0.15 && mm <= 0.7,
      `density ${s.flake.density} gives ${mm.toFixed(3)}mm; under 0.15 it is sub-pixel dust, over 0.7 it is confetti`);
    // Coverage: below about 0.08 the surface looks clean, above 0.25 the
    // specks touch and it goes back to being a coat of paint.
    check(`${s.id}: ...at a coverage that reads as sparse specks`,
      s.flake.size >= 0.06 && s.flake.size <= 0.26, `${s.flake.size}`);
    check(`${s.id}: ...and bright enough to flash`, s.flake.strength >= 1.5, `${s.flake.strength}`);
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
  // This used to assert the OPPOSITE — that clear spools get MORE exposure,
  // "so the light through them registers". That was the same wrong intuition
  // that produced the blow-out bug. A near-clear spool has a PALE body, so it
  // is the first thing to clip: Funfetti and Gold Dust were sitting at 250 of
  // 255 with zero visible flake, on the two spools whose whole selling point
  // is the flake. What they need is BACK light, checked above, and LESS
  // exposure so there is headroom left for a speck to be brighter than the
  // body it sits in.
  check("...and LESS exposure, because a pale body clips first",
    avg(clear, "exposure") < avg(solid, "exposure"),
    `clear ${avg(clear, "exposure").toFixed(0)} vs solid ${avg(solid, "exposure").toFixed(0)}`);
  // The cap belongs on PALE bodies only. Dark Magic runs exposure 128 and is
  // right to: a near-black body has enormous headroom, and measured on a flat
  // face it does not clip at all. What cannot take it is a light body, which
  // reaches 255 and takes its own flake with it.
  const lumOf = (hex) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  };
  for (const s of SPOOLS) {
    if (lumOf(s.base) < 0.55) continue;          // dark bodies can take the light
    check(`${s.id}: pale body, so it is not exposed into clipping`,
      LOOKS[s.id].exposure <= 112,
      `base luminance ${lumOf(s.base).toFixed(2)} at exposure ${LOOKS[s.id].exposure}`);
  }
  check("...and are shown less than fully opaque",
    avg(clear, "opacity") < avg(solid, "opacity"),
    `${avg(clear, "opacity").toFixed(0)} vs ${avg(solid, "opacity").toFixed(0)}`);

  const matte = LOOKS["pink-ombre"];
  check("the mattest spool leans on FILL, not rim", matte.fill > matte.rim * 2,
    `fill ${matte.fill} rim ${matte.rim}`);
  const dark = LOOKS["smoky-violet"];
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
    // the names they have now
    ["violet-flake", "violet-flake"], ["Violet Flake", "violet-flake"], ["PETG violet flake", "violet-flake"],
    ["rainbow glitter", "rainbow-glitter"], ["gold flake", "gold-flake"], ["ruby red", "ruby-red"],
    ["pink ombre", "pink-ombre"], ["Pink Ombré", "pink-ombre"], ["tri-bbp", "tri-bbp"],
    // ...and the names saved models were written with before (aliases)
    ["witchcraft", "violet-flake"], ["Witchcraft", "violet-flake"], ["cc-witchcraft", "violet-flake"],
    ["funfetti", "rainbow-glitter"], ["cc-funfetti", "rainbow-glitter"],
    ["unicorn", "pink-blue-gradient"], ["mermaid", "ocean-gradient"],
    ["dark magic", "smoky-violet"], ["darkmagic", "smoky-violet"],
    ["fairy floss", "pastel-glitter"], ["gold dust", "gold-flake"],
    ["ruby", "ruby-red"], ["cc-unicorn", "pink-blue-gradient"], ["pinkombre", "pink-ombre"],
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
    ["the violet's flake", "violet-flake"],
    ["the violet’s flake", "violet-flake"],      // the curly one a phone types
    ["the ocean's gradient", "ocean-gradient"],
  ]) {
    check(`a possessive does not break "${q}"`, findSpool(q)?.id === want, findSpool(q)?.id ?? "null");
  }
  check("...and it still matches without one",
    findSpool("violet flake")?.id === "violet-flake");

  // Not-found must be NULL, never a near miss. Quietly demoing the wrong
  // filament to the people who make it is the failure that matters here.
  for (const q of ["", null, undefined, "nonsense", "star stuff", "black pla", "galaxy"]) {
    check(`${JSON.stringify(q)} finds nothing rather than guessing`, findSpool(q) === null,
      findSpool(q)?.id);
  }
  check("every spool is reachable by its own short name",
    spoolNames().every((n) => findSpool(n)), spoolNames().filter((n) => !findSpool(n)).join(","));
  check("...and there are twenty-three names to offer", spoolNames().length === 23);
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
  check("the harness teaches filament()", /filament\("violet-flake"\)/.test(bot));
  check("...with every name", spoolNames().every((n) => bot.includes(n)),
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
  check("no maker's name or link in the Material panel", !/cookiecad/i.test(HTML.replace(/\/\/[^\n]*/g, "")));
}

console.log("\nthe page can actually drive it\n");
{
  // Each uniform the module feeds has to exist on the other side. A typo here
  // is invisible: the effect simply never appears.
  for (const u of ["uFxGrad", "uFxGradA", "uFxGradB", "uFxGradC", "uFxLo", "uFxHi",
    "uFxFlake", "uFxFlakeD", "uFxFlakeS", "uFxFlakeK", "uFxFlakeC", "uFxRainbow"]) {
    check(`${u} is declared in the shader`, HTML.includes(`uniform`) && HTML.includes(u), u);
  }
  // the mesh's own coordinates ARE the bed's (translate() is baked into the
  // geometry), and they stay put when Explode or a drag moves the mesh
  check("the gradient runs up the part as built (bed z), so it is bottom-to-top of the print and moves with an exploded part",
    /vFxHome\.z/.test(HTML) && /vFxHome = transformed;/.test(HTML));
  check("...anchored to the model's own bounding box", /sharedFx\.lo\.value = bb\.min\.z/.test(HTML));
  check("flake is emissive, so it catches light at glancing angles",
    /totalEmissiveRadiance \+= fxFlake/.test(HTML));
  check("the module is fetched lazily", /import\("\.\/filaments\.js"\)/.test(HTML));
  // either a bare idle callback, or (since bgjobs.js) the background scheduler's
  // last job: priority 90, behind every other warm-up and the cage
  check("...on idle, after everything else", /requestIdleCallback[\s\S]{0,200}loadSpools/.test(HTML)
    || /bg\.background\(\{ id: "warm:spools"[^\n]*priority: 9\d[^\n]*loadSpools\(\)/.test(HTML));
  check("...and on opening the Material panel", /loadSpools\(\);\s*\/\/ no-op/.test(HTML));
  check("effects default to OFF so an unused feature costs nothing",
    /grad: \{ value: 0 \}/.test(HTML) && /flake: \{ value: 0 \}/.test(HTML));
}

console.log("\nnothing reflects hard enough to white out a flat face\n");
{
  // THE BUG THIS BAND EXISTS FOR. envMapIntensity was 2.0 / 2.6 / 1.5, and on
  // a curved part that looks like gloss — only a small patch of a sphere faces
  // the bright part of the environment at once. A FLAT top face mirrors ONE
  // patch across its whole area, so pointed anywhere near the room's ceiling
  // light it went to solid white.
  //
  // Measured on a 70mm slab in Witchcraft, a deep violet, viewed from above:
  // the top face came back RGB [249,249,250] with 95.6% of its pixels clipped
  // and ZERO specks. With envMapIntensity forced to 0 the same pixel read
  // [52,21,107] — the violet it should always have been. It was not the
  // glitter that was missing; the whole face was blown out and the glitter had
  // nowhere to show. Every real part — a cutter, a plate, a box — is mostly
  // flat, which is why this was the common case and not the rare one.
  for (const [fam, v] of Object.entries(FAMILY)) {
    check(`${fam}: env stays low enough that a flat face keeps its colour`,
      v.env > 0 && v.env <= 0.8,
      `env ${v.env} — above about 0.8 a flat top mirrors the environment to white`);
    // A printed surface has layer lines. 0.13 was polished glass, which is
    // what made the mirror a mirror.
    check(`${fam}: roughness is a printed surface, not glass`,
      v.rough >= 0.25, `rough ${v.rough}`);
  }
  for (const s of SPOOLS) {
    if (s.env !== undefined) {
      check(`${s.id}: its env override is lower still`, s.env > 0 && s.env <= FAMILY[s.family].env,
        `${s.env} vs family ${FAMILY[s.family].env}`);
    }
    if (s.rough !== undefined) {
      check(`${s.id}: its roughness override is not glass either`, s.rough >= 0.25, `${s.rough}`);
    }
  }
  // The override has to actually reach the material, or the two clear spools
  // go back to being white.
  check("fxFor honours a per-spool env", (() => {
    const clear = SPOOLS.find((x) => x.env !== undefined);
    return clear && fxFor(clear).env === clear.env;
  })());
  check("...and falls back to the family when there is none", (() => {
    const plain = SPOOLS.find((x) => x.env === undefined);
    return plain && fxFor(plain).env === FAMILY[plain.family].env;
  })());
  check("the viewer reads the override too, not just the family",
    /env: s\.env \?\? F\.FAMILY\[s\.family\]\.env/.test(HTML));
}

console.log("\na material owns its own finish — the filament does not trump it\n");
{
  // Picking Concrete used to leave whatever filament was already set sitting on
  // top of it, and a spool wins every argument: it overrides roughness and
  // envMapIntensity, adds transmission and glitter, and borrows the lighting.
  // So Concrete came out as glittery translucent concrete lit for a clear
  // spool, with nothing to explain it — the Filament row two down still read
  // "Funfetti". Concrete should be concrete. Concrete AND Funfetti is still one
  // click away, in the order that reads as deliberate.
  check("there is a NONE option, so a material needs no filament chosen",
    /None — the material's own finish/.test(HTML));
  check("...and it is the first one in the list",
    HTML.indexOf('value="opaque"') < HTML.indexOf('value="pla"'));
  check("a preset resets the filament to None", /mat\.filament = "opaque";/.test(HTML));
  check("...and syncs the dropdown, so the UI cannot disagree with the state",
    /\$\("mat-filament"\)\.value = "opaque";/.test(HTML));
  check("...hands back any lighting a spool borrowed",
    /const hadSpool = FILAMENTS\[mat\.filament\]\?\.spool;[\s\S]{0,400}restoreUserLook\(\);/.test(HTML));
  check("...clears the gradient and glitter with it",
    /applySpoolFx\(\);\s*\/\/ and clear/.test(HTML));
  check("...and says so rather than dropping the spool silently",
    /filament set back to <b>None<\/b>/.test(HTML));

  // The borrowed rig must not outlive the spool. Persisting it made a
  // suggestion into a one-way door: after a reload the borrowed values WERE
  // the user's settings and there was nothing left to restore. Caught with the
  // filament reading "None" and the saved lights still Witchcraft's.
  check("a borrowed lighting rig is never what gets saved",
    /JSON\.stringify\(lightBackup \? \{ \.\.\.mat, \.\.\.lightBackup \} : mat\)/.test(HTML));

  // Metals are almost entirely reflection. With no environment map a
  // metalness-0.9 surface mirrors nothing and renders near-black: Gold measured
  // rgb [26,23,17] against its own #e6b422, which is to say picking Gold did
  // not give you gold. [63,57,33] with the environment at 2.
  for (const metal of ["Titanium", "Aluminum", "Steel", "Brass", "Copper", "Gold"]) {
    const row = new RegExp(`name: "${metal}"[^}]*\\}`).exec(HTML)?.[0] ?? "";
    check(`${metal} reflects something, or it is not metal`,
      /reflect: true/.test(row) && /envInt: 2/.test(row), row.slice(0, 90));
  }
  check("the None branch uses the MATERIAL's env, not a blanket 1",
    /m\.envMapIntensity = mat\.envInt \?\? 1;/.test(HTML));
  check("...and a preset records what it wants", /envInt: p\.envInt \?\? 1,/.test(HTML));
}

console.log("\nthe glint is a real specular test against the real lights\n");
{
  // What "sparkle" actually means, and what the first version could not do.
  //
  // Glitter blazes for an instant when a flake happens to bisect the light and
  // your eye, then vanishes. That needs the LIGHT and the VIEW in the
  // equation. The original lit a speck from dot(surfaceNormal, randomDir) —
  // neither of them — so it shimmered faintly as the part turned and that was
  // the whole effect. These pin the three things that make it work.
  check("a speck is tested against the half-vector of light and eye",
    /normalize\(directionalLights\[i\]\.direction \+ V\)/.test(HTML),
    "no half-vector — the flake cannot know where the light is");
  check("...using the view direction", /vec3 V = normalize\(vViewPosition\)/.test(HTML));
  // It has to be INJECTED at lights_pars_begin, which is where three declares
  // directionalLights[]. Put it in the HELPERS block at <common> instead and
  // the shader will not compile — the struct does not exist yet. Checking
  // where it is injected, not where the string happens to sit in this file.
  check("the glint is injected at lights_pars_begin, where the lights exist",
    /\.replace\("#include <lights_pars_begin>", "#include <lights_pars_begin>\\n" \+ FLAKE\)/.test(HTML),
    "injected somewhere else — directionalLights[] would not be declared yet");
  check("...and is not in the block that goes at <common>",
    !(/const HELPERS = `([^`]*)`/.exec(HTML)?.[1] ?? "").includes("fxFlakeLayer"));

  // Flakes lie nearly flat in the plastic. Random directions over the whole
  // sphere put half of them facing INTO the part, where they can never catch
  // anything — half the glitter simply missing.
  // (in WORLD space now, fixed to the part: tied to the camera, a flake kept
  // its tilt relative to the eye and orbiting barely changed it)
  // A constant baseline as bright as 0.25 is what made glitter read as a pale
  // coat of paint. With small flakes and clear plastic between them a FAINT
  // floor is what keeps off-angle flake reading as flake: the whole speck,
  // dim, in its own colour (never a bright outline round it), well under the
  // old 0.25 even as its turn to fire comes.
  check("there is no strong always-on baseline glow",
    !/0\.25 \+ 0\.75 \* flash/.test(HTML) && /vec3 rest = tint \* \(0\.4 \+ light\) \* \(0\.1 \+ 0\.16 \* wave \* wave\)/.test(HTML)
      && /\(rest \+ flash\) \* through \* gain \* shape/.test(HTML));
  // The edge softening is measured on the lattice before it is cut into
  // cells; on the cell distance it jumps at every cell wall and draws one.
  // SPEED. Measured on an M2 Pro at 2800x1800: the refraction capture at
  // full size made a glitter frame 31 ms, at a third 15 ms, same picture.
  // And the flake code must hang off the uniform alone: with gl_FrontFacing
  // in that test every see-through spool took 3.5 times as long.
  check("the refraction capture is drawn small (it is only ever seen frosted)",
    /renderer\.transmissionResolutionScale = 0\.35;/.test(HTML));
  check("the flake code is skipped on the uniform alone",
    /if \(uFxFlake > 0\.5\) totalEmissiveRadiance \+= fxFlake/.test(HTML)
      && !/uFxFlake > 0\.5 && gl_FrontFacing/.test(HTML));
  check("a firing flake has no outline round its cell",
    /float qw = length\(fwidth\(Q\)\)/.test(HTML) && !/fwidth\(d\)/.test(HTML.slice(HTML.indexOf("vec3 fxFlakeLayer"), HTML.indexOf("vec3 fxFlake("))));
  // Glitter is suspended IN the plastic: several depths, sampled along the
  // refracted view ray, so deeper flakes slide against the surface as you orbit.
  check("flake at three depths, not one layer painted on the surface (and one more where the plastic is clear)",
    (HTML.match(/fxFlakeLayer\(Vw, Rw, Nw, body, light,/g) || []).length === 4 && /if \(uFxClear > 0\.05\)/.test(HTML));
  // Glitter is flake in plastic you can see into: every spool with flake is at
  // least a little see-through, and is shown that way however it was named.
  check("every spool with flake is see-through",
    SPOOLS.filter((s) => s.flake).every((s) => s.t > 0 && s.a < 1));
  check("...and is shown see-through however it was named",
    /const t = spoolSeeThrough\(f\) \? f\.t : 0;/.test(HTML) && /mat\.filamentChosen \|\| !!f\?\.spool\?\.flake/.test(HTML));
  check("a flake stays solid however clear the body round it",
    /gl_FragColor\.a = max\(gl_FragColor\.a, clamp\(dot\(fxGlint/.test(HTML));
  check("...sampled along the refracted view ray (parallax)",
    /refract\(-Vw, Nw, 1\.0 \/ 1\.5\)/.test(HTML) && /vFxHome \+ Rw \* t/.test(HTML));
  check("...deeper flake dimmer and tinted by the plastic it shines through",
    /vec3 through = mix\(vec3\(1\.0\), body,/.test(HTML));
  check("flakes are angular specks of mixed size, not filled grid cells",
    /float d = \(o\.x \+ o\.y \+ o\.z\) \* 0\.62;/.test(HTML) && /float size = mix\(0\.\d+, 0\.\d+, k \* k \* k\)/.test(HTML));
  check("grazing angles show more flake", /float fres = pow\(1\.0 - clamp\(dot\(N, V\)/.test(HTML));

  // The dial.
  check("sparkle is a uniform every material shares", /sparkle: \{ value: 1 \}/.test(HTML));
  check("...exposed as a slider", /id="mat-sparkle"/.test(HTML));
  check("...whose row hides on spools with no flake",
    /\$\("mat-sparkle-row"\)\.style\.display = fx\.flake \? "" : "none"/.test(HTML));
  check("...and writes straight to the uniform, with no rebuild",
    /sharedFx\.sparkle\.value = mat\.sparkle;/.test(HTML));
  check("...and is remembered", /sparkle: 1,/.test(HTML));
  // Sparkle must drive BRIGHTNESS only. Tying the exponent to it as well made
  // turning it UP produce a sparser, dimmer surface, because a tighter lobe
  // catches fewer flakes than the extra gain adds back.
  check("sparkle scales gain, and the exponents are constants",
    /float fire = pow\(wave, 14\.0\);/.test(HTML)
      && /\* s \* s \*/.test(HTML),
    "an exponent that moves with sparkle makes the dial work backwards");
}

console.log("\na printed part looks printed, and a studio is somewhere to look at it\n");
{
  const fx = fxFor(SPOOLS.find((s) => s.id === "teal-violet-glitter"));
  check("a spool carries layer lines, and how strongly", fx.layers > 0 && fx.layers <= 1, String(fx.layers));
  check("...and a spool that says nothing still gets some", fxFor(SPOOLS.find((s) => s.id === "ruby-red")).layers > 0);
  check("the shader draws them on walls only, and fades them before they shimmer",
    /float fxLayerShade\(vec3 nW\)/.test(HTML) && /smoothstep\(0\.75, 0\.97, abs\(nW\.z\)\)/.test(HTML) && /fwidth\(ph\)/.test(HTML));
  check("...only when the Layer lines dial asks: smooth plastic is the default",
    /sharedFx\.layer\.value = \(fx\.layers \?\? 0\) \* \(mat\.layerLines \?\? 0\);/.test(HTML) && /layerLines: 0,/.test(HTML));
  check("no dark speck: a resting flake is only a shade duller than the plastic",
    !/fxDarkSpeck|uFxDark/.test(HTML) && /diffuseColor\.rgb \*= 1\.0 - 0\.07 \* fxFlakeRest\(\);/.test(HTML));
  check("a few flakes are mirrors, most are modest", /float bright = 0\.6 \+ 2\.6 \* k\.x \* k\.x \* k\.x \* k\.x;/.test(HTML));
  check("there are three studio stages", /studio: \{ label: "Studio, bright white"/.test(HTML) && /"studio-grey": \{/.test(HTML) && /"studio-dark": \{/.test(HTML));
  check("...with a soft shadow under the part, fitted to it", /new THREE\.ShadowMaterial\(/.test(HTML) && /function fitStage\(\)/.test(HTML) && /keyLight\.castShadow = !!st;/.test(HTML));
  check("...that scale the light sliders rather than replace them", /keyLight\.intensity \*= st\.direct;/.test(HTML));
  check("...hide the grid and the CAD edge lines, and ink the dimensions",
    /!gridExploded && !stagePlain\(\)/.test(HTML) && /if \(grid && !st\.grid\) grid\.visible = false;/.test(HTML) && /dimMaterial\.color\.set\(ink \?\? DIM_INK\);/.test(HTML));
  // The default is the showcase: a dark studio that keeps the grid and the
  // edge lines, and adds the room's reflections, a gloss coat, the part's
  // shadow and a backdrop that falls away to the corners.
  check("the default stage is the showcase, which keeps the grid", /stage: "showcase",/.test(HTML) && /showcase: \{ label: "Showcase, dark with grid"[^}]*grid: true[^}]*env: [\d.]+[^}]*gloss: [\d.]+ \}/.test(HTML));
  check("...the workshop grid is still there to choose", /<option value="grid">Workshop grid<\/option>/.test(HTML) && /<option value="showcase">/.test(HTML));
  check("...a saved look still on the old default moves over once, and only once", /if \(!mat\.stage2\) \{\s*if \(mat\.stage === "grid"\) mat\.stage = MAT_DEFAULTS\.stage;\s*mat\.stage2 = true;/.test(HTML));
  check("...only a stage without a grid hides the grid and the edge lines", /grid\.visible = showBox\.checked && !gridExploded && !stagePlain\(\);/.test(HTML) && /outlineGroup\.visible = !st \|\| !!st\.grid;/.test(HTML));
  check("...its backdrop steps aside when a snapshot swaps the background", /b\?\.isColor && b\.getHex\(\) === stageBackdrop\.userData\.bg \? 1 : 0/.test(HTML));
  check("...and the gloss coat stays off see-through plastic and pieces with their own finish", /const own = m\.userData\.finish \|\| m\.userData\.codeClear != null \|\| m\.transmission > 0\.01;/.test(HTML));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
