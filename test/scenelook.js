// look(): the scene's material and lighting, set from CODE.
//
// colorize/finish/glass/glow describe a SHAPE. Everything about the room —
// what the whole model is made of, the four lights, exposure, the background —
// lived only in the Material panel, so a model could describe its geometry but
// never its presentation. An assistant asked for "brushed aluminium under warm
// light" could only name a panel and hope.
//
// It is VIEWER-ONLY, exactly like glass() and glow(): geometry, exports and
// prints are untouched. The viewer reads what compile() collected and moves the
// panel's own controls, so the user keeps ownership of every setting.

import { look, cube, sphere, group, translate, build, toSTL, takeSceneLook, resetSceneLook, SCENE_KEYS } from "../index.js";
import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};

console.log("\nlook(): collecting scene settings\n");
{
  resetSceneLook();
  look({ filament: "cc-witchcraft", metal: 80, rough: 25, key: 180, filmic: true });
  const got = takeSceneLook();
  check("it collects what the code asked for",
    got?.filament === "cc-witchcraft" && got.metal === 80 && got.rough === 25
    && got.key === 180 && got.filmic === true, JSON.stringify(got));
  check("...and taking it CLEARS it — one build, one apply", takeSceneLook() === null);

  resetSceneLook();
  look({ metal: 90 });
  look({ rough: 10 });
  const merged = takeSceneLook();
  check("two calls merge rather than replace", merged.metal === 90 && merged.rough === 10,
    JSON.stringify(merged));

  resetSceneLook();
  look({ key: 9999, metal: -50 });
  const clamped = takeSceneLook();
  check("numbers clamp to the panel's own ranges", clamped.key === 300 && clamped.metal === 0,
    JSON.stringify(clamped));
}

console.log("\n...and refusing what would silently do nothing\n");
{
  const boom = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  resetSceneLook();
  check("an unknown setting is named, with the list",
    /unknown setting "nonsense"[\s\S]*filament/.test(boom(() => look({ nonsense: 1 })) || ""),
    "a typo'd key that silently did nothing is the worst outcome here");
  check("a colour that is not #rrggbb is refused",
    /needs a #rrggbb/.test(boom(() => look({ bg: "blue" })) || ""));
  check("a non-numeric slider value is refused",
    /needs a number/.test(boom(() => look({ metal: "shiny" })) || ""));
  check("every documented key is actually accepted",
    Object.keys(SCENE_KEYS).every((k) => {
      resetSceneLook();
      const v = SCENE_KEYS[k] === "bool" ? true : SCENE_KEYS[k] === "str" ? "x"
        : SCENE_KEYS[k] === "hex" ? "#112233" : 1;
      return boom(() => look({ [k]: v })) === null;
    }));
}

console.log("\nit changes the look, never the geometry\n");
{
  const volOf = (r) => {
    let vol = 0;
    const v = [...toSTL(r, "t").matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)].map((m) => [+m[1], +m[2], +m[3]]);
    for (let i = 0; i < v.length; i += 3) {
      const [a, b, c] = v.slice(i, i + 3);
      vol += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    return Math.abs(vol);
  };
  resetSceneLook();
  const plain = volOf(await build(cube([20, 20, 20])));
  resetSceneLook();
  const wrapped = volOf(await build(look({ metal: 100, filmic: true }, cube([20, 20, 20]))));
  check("wrapping a shape leaves it identical", Math.abs(plain - wrapped) < 1e-6,
    `${plain} vs ${wrapped}`);

  // The bare form is the one an assistant will write most: a setting on its own
  // line, before the model. An empty group() throws, so this must not use one.
  resetSceneLook();
  const bare = await build(group(look({ key: 200 }), cube([10, 10, 10])));
  check("a BARE look() on its own line builds", volOf(bare) > 0,
    "look({...}) with no children must not throw");
}

console.log("\nthe viewer applies it, once, after a successful compile\n");
{
  const HTML = readFileSync(new URL("../viewer/index.html", import.meta.url), "utf8");
  check("the build clears any previous request first",
    /dsl\.resetSceneLook\(\);\s*\n\s*await dsl\.compile\(shape, ph, trace\);/.test(HTML),
    "a stale look from the last build must not leak into this one");
  check("...and applies it only after the compile succeeded",
    /const want = dsl\.takeSceneLook\(\);[\s\S]{0,200}?Object\.assign\(mat, want\)/.test(HTML),
    "a model that fails to build must not repaint the room");
  check("...through the panel's own apply + save",
    /applyMaterial\(\);[\s\S]{0,120}?saveMat\(\);/.test(HTML),
    "so a look() edit behaves exactly like moving the slider by hand");
  check("a background from code counts as a user override",
    /if \(want\.bg\) matUserBg = true;/.test(HTML),
    "otherwise the theme paints over it on the next repaint");
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
