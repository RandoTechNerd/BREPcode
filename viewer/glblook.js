// Getting the LOOK into the .glb — glitter, glass and the lights.
//
// The viewer draws a named spool with a custom shader: a world-space colour
// ramp and a procedural flake field. Neither of those is a thing glTF has. A
// custom shader cannot travel at all, and the old export knew it — it flattened
// every spool to a plain MeshStandardMaterial, which is why a Fairy Floss part
// arrived in Blender as a lump of matte lilac with no gradient, no sparkle and
// no glass.
//
// So the job is not "export the shader", it is "say the same thing in glTF's
// own vocabulary", and glTF's vocabulary is better than it sounds:
//
//   transmission + volume + ior   real refractive glass, with the colour
//                                 deepening through thickness the way the
//                                 spool's attenuation does
//   iridescence                   the rainbow shift on rainbow flake
//   a baked baseColor ramp        the gradient, as an actual texture, so it
//                                 survives into any renderer
//   a baked normal map            the flake, as real facets that catch a
//                                 moving light — which is the whole point for
//                                 a video, and something no colour map can do
//   KHR_lights_punctual           the key/fill/rim rig, at its real angles
//
// WHAT CANNOT TRAVEL, so nobody hunts for it: ambient light and tone-mapping
// exposure are renderer settings, not scene data — glTF has no ambient light
// and no exposure. The background colour is not part of the model either. Those
// three are noted for the user rather than silently dropped.
//
// Everything here is pure: it returns numbers and pixel arrays, so it can be
// tested without a GPU. index.html turns the results into THREE objects.

// ------------------------------------------------------------------ colour
export const hexToRgb01 = (hex) => {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const v = parseInt(n, 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

// sRGB -> linear, because glTF material factors are LINEAR and the spool
// colours are written as sRGB hex. Skipping this is the classic "why is my
// export washed out" and it is a real, visible error, not a nicety.
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const hexToLinear = (hex) => hexToRgb01(hex).map(srgbToLinear);

// ---------------------------------------------------------------- material
//
// One spool -> one set of MeshPhysicalMaterial parameters. Returned as plain
// data so the mapping can be checked without building a renderer.
//
// `sizeMm` is the model's bounding box. Thickness is the honest unknown here:
// glTF wants a real distance for how much material light crosses, and a part
// is not a uniform slab. The smallest bounding dimension is the closest thing
// to "how thick is this where you look through it" — a plate is its plate
// thickness, a bead is its diameter — and it is at least stable and explicable,
// which a diagonal or an average is not.
export function physicalFromSpool(spool, family, sizeMm = [10, 10, 10], opts = {}) {
  const fam = family || { ior: 1.46, rough: 0.4, env: 0.5 };
  const thickness = Math.max(0.1, Math.min(...sizeMm.map((n) => Math.abs(n) || 0.1)));
  const flake = spool?.flake;
  const p = {
    color: hexToLinear(spool?.base || "#cccccc"),
    roughness: spool?.rough ?? fam.rough,
    metalness: 0,
    ior: fam.ior,
    // Transmission is what makes it read as plastic you can see INTO rather
    // than a painted shell. Attenuation is the colour deepening with distance.
    transmission: spool?.t ?? 0,
    thickness: (spool?.t ?? 0) > 0 ? thickness : 0,
    attenuationDistance: spool?.atten ?? 0,
    attenuationColor: hexToLinear(spool?.base || "#ffffff"),
    // The viewer's own alpha. A transmissive material in glTF is usually left
    // opaque — transmission does the see-through — so alpha is only carried
    // when the user actually asked for it and there is no transmission.
    opacity: opts.opacity ?? spool?.a ?? 1,
    // Flake is metal in plastic: a touch of specular tint sells it even before
    // the normal map lands.
    specularIntensity: flake ? 1 : 0.5,
    // Rainbow flake is a thin-film effect, which glTF models directly. A
    // single-colour flake (gold dust) is NOT iridescent and must not get this,
    // or the gold goes pearly green at grazing angles.
    iridescence: flake?.rainbow ? 0.55 : 0,
    iridescenceIOR: 1.8,
    // 100-400nm is the soap-bubble range: enough spread that neighbouring
    // specks differ in hue instead of all flashing the same colour.
    iridescenceThicknessRange: [100, 400],
    // A printed part is not polished, but a glitter spool has a resin coat.
    clearcoat: flake ? 0.35 : 0,
    clearcoatRoughness: 0.25,
  };
  return p;
}

// ---------------------------------------------------------------- gradient
//
// The ramp the shader draws in world Z, baked into a tall 1-pixel-wide image.
// The mesh gets a generated UV whose V is the part's own height, so the
// gradient lands exactly where it does in the viewer however tall the part is.
//
// Stops are BOTTOM -> TOP, matching how the spools are written and how the
// filament actually comes off the spool.
export function gradientPixels(stops, height = 256) {
  const list = (stops || []).map(hexToRgb01);
  const h = Math.max(2, Math.round(height));
  const out = new Uint8Array(h * 4);
  if (!list.length) return out;
  if (list.length === 1) list.push(list[0]);
  for (let y = 0; y < h; y++) {
    // v runs 0 at the BOTTOM row. Canvas rows run top-down, so the caller
    // writes this array bottom-up; getting it backwards flips every gradient
    // in the set and looks plausible on a symmetric part.
    const v = y / (h - 1);
    const seg = v * (list.length - 1);
    const i = Math.min(list.length - 2, Math.floor(seg));
    const f = seg - i;
    for (let c = 0; c < 3; c++) {
      out[y * 4 + c] = Math.round(255 * (list[i][c] * (1 - f) + list[i + 1][c] * f));
    }
    out[y * 4 + 3] = 255;
  }
  return out;
}

// ------------------------------------------------------------------ flake
//
// A deterministic speck field. Same model, same file, every time — an export
// that shuffles its glitter between runs cannot be used for a re-render.
const rng = (seed) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

// How many millimetres of part one tile of the texture should cover.
//
// `density` is CELLS PER MILLIMETRE and it is the number that decides whether
// this reads as glitter or as a pearl coat — the same lesson the shader learned
// the hard way. A tile holding `cells` cells therefore covers cells/density mm,
// and the texture repeats that many times across the part.
export function tileSpanMm(density, cells = 24) {
  const d = Math.max(0.05, +density || 2.4);
  return cells / d;
}

// The texture repeat that turns a UV measured in MILLIMETRES into tiles of the
// right physical size. One number, used on both axes and on every face.
//
// This is deliberately independent of how big the part is. Speck size is a
// property of the FILAMENT — 0.2-0.5mm of real flake — so a 200mm vase and a
// 10mm bead must show the same size specks, and scaling the repeat by the
// model's bounding box would make the bead's glitter four times too coarse.
// (The first version did exactly that, on top of a millimetre UV, so the
// repeat was applied twice and the specks came out a quarter of a millimetre.)
export function uvRepeat(density, cells = 24) {
  return 1 / tileSpanMm(density, cells);
}

// One speck per cell, jittered, at `coverage` of cells filled. Returns unit
// coordinates so the caller can rasterise at whatever resolution it likes.
export function sparkleField({ cells = 24, coverage = 0.15, seed = 12345 } = {}) {
  const r = rng(seed);
  const out = [];
  const cov = Math.min(1, Math.max(0, coverage));
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      if (r() > cov) continue;
      // A flake is a flat plate at a random tilt — that tilt is the entire
      // reason it flashes as the light or the camera moves. A speck drawn as a
      // bright dot instead is just paint and stays bright from every angle.
      const ang = r() * Math.PI * 2;
      const tilt = 0.35 + r() * 0.65;
      out.push({
        x: (cx + 0.15 + r() * 0.7) / cells,
        y: (cy + 0.15 + r() * 0.7) / cells,
        r: (0.16 + r() * 0.26) / cells,
        nx: Math.cos(ang) * tilt,
        ny: Math.sin(ang) * tilt,
      });
    }
  }
  return out;
}

// ----------------------------------------------------------------- lights
//
// The viewer's rig, in glTF terms. Intensities are the app's 0-200 scale over
// 100; positions are the viewer's own, so the key stays the key.
//
// Directional lights carry no distance, so only the DIRECTION matters — but
// the exporter writes a position anyway and some importers show it, so the
// real positions go out rather than normalised ones.
export function lightsFor(m = {}) {
  const pct = (v, d = 1) => (v == null ? d : v / 100);

  // EXPOSURE IS FOLDED IN. glTF has no exposure — it is a property of the
  // camera, not the scene — so a file that ignores it arrives at whatever
  // fraction of the intended brightness the viewer happened to be showing. At
  // an exposure of 2.44 that is a part rendered at 40% and reading as black
  // plastic instead of glitter.
  //
  // Multiplying the lights by it is not mathematically identical, because tone
  // mapping is not linear, but it lands in the right place instead of a long
  // way from it — and the alternative is telling the user to go and turn
  // everything up by hand.
  const gain = pct(m.exposure, 1);

  const out = [
    { name: "key", color: m.lightcol || "#ffffff", intensity: pct(m.key, 1.5) * gain, position: [60, -80, 120] },
    { name: "fill", color: m.fillcol || "#88aaff", intensity: pct(m.fill, 0.5) * gain, position: [-90, -55, 45] },
    { name: "rim", color: m.rimcol || m.lightcol || "#ffffff", intensity: pct(m.rim, 0) * gain, position: [0, 95, 85] },
  ];

  // AMBIENT, APPROXIMATED. glTF genuinely has no ambient light, and a
  // transmissive part with none is a silhouette: there is nothing behind it
  // for the light to come through. A ring of dim lights on opposing axes is
  // the standard stand-in — not identical to uniform sky, but it fills the
  // shadow side, which is the job.
  const amb = pct(m.ambient, 0) * gain;
  if (amb > 0.001) {
    const each = amb * 0.3;
    const ring = [[200, 0, 0], [-200, 0, 0], [0, 200, 0], [0, -200, 0], [0, 0, -200]];
    ring.forEach((p, i) => out.push({ name: `ambient${i + 1}`, color: "#ffffff", intensity: each, position: p }));
  }
  return out.filter((l) => l.intensity > 0.001);   // a zero light is clutter in the file
}

// What we could NOT put in the file. Shown to the user, because a quiet
// omission is indistinguishable from a bug in whatever opens it.
export function unexportable(m = {}) {
  const notes = [];
  if ((m.ambient ?? 0) > 0) {
    notes.push(`ambient light is APPROXIMATED — glTF has no ambient light, so it ships as a `
      + "ring of dim lights. Swap in an environment/HDRI for the real thing");
  }
  if (Math.abs((m.exposure ?? 100) - 100) > 1) {
    notes.push(`exposure (${(m.exposure / 100).toFixed(2)}) is FOLDED INTO the light intensities — `
      + "glTF has no exposure, so set yours to 1.0 or the part will be twice as bright as here");
  }
  notes.push("the background colour, which is the viewer's, not the model's");
  return notes;
}
