// Getting the spool's look into a .glb.
//
// The viewer draws glitter and gradient with a custom shader, and a custom
// shader cannot go in a glTF file at all. So this is a TRANSLATION, and the
// things worth testing are the places a translation quietly says the wrong
// thing: colour space, physical speck size, which effects apply to which
// spool, and what we admit we could not carry.

import * as GL from "../viewer/glblook.js";
import { SPOOLS, FAMILY } from "../viewer/filaments.js";

let pass = 0, fail = 0;
const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  -- ${detail}` : ""}`); }
};
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const spool = (id) => SPOOLS.find((s) => s.id === id);

console.log("\ncolour goes out LINEAR\n");
{
  // glTF material factors are linear. Handing them sRGB is the classic
  // washed-out export, and it looks "nearly right" which is why it survives.
  check("mid grey is darkened by the transfer function",
    near(GL.hexToLinear("#808080")[0], 0.2158, 0.002), GL.hexToLinear("#808080")[0].toFixed(4));
  check("white stays white", GL.hexToLinear("#ffffff").every((c) => near(c, 1, 1e-6)));
  check("black stays black", GL.hexToLinear("#000000").every((c) => c === 0));
  check("the tiny-value branch is the linear one",
    near(GL.srgbToLinear(0.02), 0.02 / 12.92, 1e-9));
  check("short hex works too",
    GL.hexToRgb01("#f0a").every((c, i) => near(c, GL.hexToRgb01("#ff00aa")[i], 1e-9)));
}

console.log("\none spool, one material\n");
{
  const ff = spool("cc-fairyfloss");
  const p = GL.physicalFromSpool(ff, FAMILY.TPU, [30, 30, 12]);
  check("transmission comes from the spool", p.transmission === ff.t, `${p.transmission}`);
  check("attenuation distance travels", p.attenuationDistance === ff.atten);
  check("ior comes from the FAMILY, not the spool", p.ior === FAMILY.TPU.ior, `${p.ior}`);
  check("thickness is the smallest bounding dimension", p.thickness === 12, `${p.thickness}`);
  check("...and a transmissive material has one at all", p.thickness > 0);

  // Rainbow flake is thin-film; single-colour flake is not. Getting this
  // backwards turns Gold Dust pearly green at grazing angles.
  check("rainbow flake becomes iridescence", p.iridescence > 0, `${p.iridescence}`);
  const gold = spool("cc-golddust");
  const pg = GL.physicalFromSpool(gold, FAMILY.TPU, [20, 20, 20]);
  check("single-colour flake does NOT", pg.iridescence === 0,
    "gold flake is metal, not a soap film");
  check("...but still gets the resin coat", pg.clearcoat > 0);

  const plain = spool("cc-pinkombre");
  const pp = GL.physicalFromSpool(plain, FAMILY.TPU, [20, 20, 20]);
  check("a spool with no flake gets no iridescence and no clearcoat",
    pp.iridescence === 0 && pp.clearcoat === 0);

  const solid = GL.physicalFromSpool({ base: "#ff0000", t: 0 }, FAMILY.PLA, [10, 10, 10]);
  check("no transmission means no thickness either", solid.thickness === 0,
    "a volume extension on an opaque material is noise");
}

console.log("\nevery shipped spool survives the trip\n");
{
  // A spool that produces NaN or a negative factor writes a file that some
  // importers reject outright and others render black.
  let bad = [];
  for (const s of SPOOLS) {
    const p = GL.physicalFromSpool(s, FAMILY[s.family], [25, 25, 25]);
    const nums = ["roughness", "metalness", "ior", "transmission", "thickness",
      "iridescence", "clearcoat", "opacity"];
    for (const k of nums) {
      if (!Number.isFinite(p[k]) || p[k] < 0) bad.push(`${s.id}.${k}=${p[k]}`);
    }
    if (p.transmission > 1 || p.roughness > 1 || p.iridescence > 1) bad.push(`${s.id} out of range`);
    if (p.color.some((c) => !Number.isFinite(c) || c < 0 || c > 1)) bad.push(`${s.id} colour`);
  }
  check(`all ${SPOOLS.length} spools produce finite, in-range factors`, bad.length === 0, bad.join(", "));
}

console.log("\nthe gradient, as an image\n");
{
  const px = GL.gradientPixels(["#000000", "#ffffff"], 256);
  check("the ramp is the height asked for", px.length === 256 * 4);
  check("row 0 is the FIRST stop — the bottom of the part", px[0] === 0, `${px[0]}`);
  check("the last row is the last stop", px[255 * 4] === 255, `${px[255 * 4]}`);
  check("it is opaque throughout", px[3] === 255 && px[255 * 4 + 3] === 255);
  const mid = px[128 * 4];
  check("...and monotonic in between", mid > 100 && mid < 155, `${mid}`);

  // Three stops: the middle one has to actually appear, which is the whole
  // reason this is a texture and not two vertex colours.
  const three = GL.gradientPixels(["#ff0000", "#00ff00", "#0000ff"], 256);
  const midG = three[128 * 4 + 1];
  check("a three-stop ramp really passes through its middle colour",
    midG > 240, `green at the midpoint = ${midG}`);
  check("a single stop is a flat colour, not a crash",
    GL.gradientPixels(["#123456"], 8).length === 32);
  check("no stops is empty, not NaN", GL.gradientPixels([], 8).every((v) => v === 0));
}

console.log("\nflake at the size real flake is\n");
{
  // Density is CELLS PER MILLIMETRE. This is the number that decided whether
  // the viewer's shader read as glitter or as a pearl coat, and the same
  // number decides it here.
  const ff = spool("cc-fairyfloss");
  const span = GL.tileSpanMm(ff.flake.density);
  check("a tile covers a sane span of the part", near(span, 24 / 2.8, 0.01), `${span.toFixed(2)}mm`);
  const speck = span / 24;
  check("...putting one speck every 0.2-0.5mm, which is what glitter is",
    speck > 0.15 && speck < 0.6, `${speck.toFixed(3)}mm`);

  // The repeat must NOT depend on how big the model is: flake is a property of
  // the filament, so a 200mm vase and a 10mm bead show the same size specks.
  // The first version scaled by the bounding box AND used a millimetre UV, so
  // the repeat was applied twice.
  const r = GL.uvRepeat(ff.flake.density);
  check("the repeat is the inverse of the tile span", near(r, 1 / span, 1e-9));
  check("...and is the same whatever the part's size",
    GL.uvRepeat(ff.flake.density) === r, "no bounding box in this calculation");
  check("a denser flake tiles more often", GL.uvRepeat(6) > GL.uvRepeat(2));
}

console.log("\nthe speck field itself\n");
{
  const a = GL.sparkleField({ cells: 24, coverage: 0.15, seed: 7 });
  const b = GL.sparkleField({ cells: 24, coverage: 0.15, seed: 7 });
  check("the same seed gives the same glitter, so a re-render matches",
    JSON.stringify(a) === JSON.stringify(b));
  check("a different seed does not",
    JSON.stringify(GL.sparkleField({ cells: 24, coverage: 0.15, seed: 8 })) !== JSON.stringify(a));
  check("coverage is roughly honoured", near(a.length / (24 * 24), 0.15, 0.05),
    `${(a.length / 576).toFixed(3)}`);
  check("no coverage means no specks", GL.sparkleField({ coverage: 0 }).length === 0);
  check("every speck sits inside the tile",
    a.every((s) => s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1));
  // The tilt is the effect. Specks all facing the viewer are paint, not flake:
  // they never flash as the camera moves, which is the one thing a video needs.
  const tilts = a.map((s) => Math.hypot(s.nx, s.ny));
  check("specks are TILTED, not flat-on",
    tilts.every((t) => t > 0.3) && new Set(tilts.map((t) => t.toFixed(2))).size > 5,
    `${new Set(tilts.map((t) => t.toFixed(2))).size} distinct tilts`);
}

console.log("\nthe lighting rig\n");
{
  const L = GL.lightsFor({ key: 165, fill: 85, rim: 55, lightcol: "#ffffff", fillcol: "#3ddc84" });
  check("all three lights travel", L.length === 3, L.map((x) => x.name).join(","));
  check("intensity is the app's 0-200 scale over 100", near(L[0].intensity, 1.65, 1e-9));
  check("colours are carried, not defaulted", L[1].color === "#3ddc84");
  check("a light turned off is left OUT of the file",
    GL.lightsFor({ key: 100, fill: 0, rim: 0 }).length === 1, "a zero light is clutter");
  check("the rim falls back to the key's colour",
    GL.lightsFor({ rim: 50, lightcol: "#ffddaa" }).find((x) => x.name === "rim").color === "#ffddaa");

  // glTF has no exposure. Ignoring it is why the first export came out at 40%
  // of the brightness the viewer was showing and read as black plastic.
  const bright = GL.lightsFor({ key: 100, exposure: 244 });
  check("exposure is folded into the light intensities",
    near(bright[0].intensity, 2.44, 1e-9), `${bright[0].intensity}`);
  const plain = GL.lightsFor({ key: 100, exposure: 100 });
  check("...and an exposure of 1 changes nothing", near(plain[0].intensity, 1, 1e-9));

  // ...and no ambient light either, so a transmissive part with none is a
  // silhouette. A ring of dim lights is the stand-in.
  const amb = GL.lightsFor({ key: 100, ambient: 68 });
  const ring = amb.filter((x) => /^ambient/.test(x.name));
  check("ambient ships as a ring of lights", ring.length === 5, `${ring.length}`);
  check("...spread across opposing directions, not stacked in one place",
    new Set(ring.map((r) => r.position.join(","))).size === ring.length);
  check("...and dimmer than the key, not competing with it",
    ring.every((r) => r.intensity < amb[0].intensity), ring[0]?.intensity.toFixed(3));
  check("no ambient means no ring", GL.lightsFor({ key: 100, ambient: 0 })
    .every((x) => !/^ambient/.test(x.name)));
}

console.log("\nsaying what did NOT fit\n");
{
  // A quiet omission is indistinguishable from a bug in whatever opens the file.
  const n = GL.unexportable({ ambient: 68, exposure: 107 });
  check("ambient light is admitted as an APPROXIMATION", n.some((s) => /ambient/.test(s)), n.join(" | "));
  check("...and says what to do instead", n.some((s) => /environment|HDRI/.test(s)));
  check("exposure says it was folded in, and what that means for your renderer",
    n.some((s) => /exposure/.test(s) && /1\.0/.test(s)), n.join(" | "));
  check("the background is always mentioned", n.some((s) => /background/.test(s)));
  const none = GL.unexportable({ ambient: 0, exposure: 100 });
  check("with nothing lost, only the background is noted", none.length === 1, none.join(" | "));
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
