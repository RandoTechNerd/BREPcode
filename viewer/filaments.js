// Real filament looks, as data.
//
// The existing filament setting is a physical model — transmission, IOR,
// attenuation — with four generic entries. These are named spools in the
// looks real filament comes in (PLA, PETG and TPU; gradients, glitter,
// tri-colour silk), and they need things that model has no way to express:
//
//   GRADIENT   the colour changes along the spool, so it changes up the PRINT.
//              Bottom to top in world Z, because that is the order the layers
//              went down. Not screen space — orbit the part and the gradient
//              stays put on the object, the way it does on the real thing.
//
//   GLITTER    suspended flake. Sparse bright specks that catch the light,
//              which is a shader effect, not a material constant.
//
// This file is DATA ONLY, and that is deliberate: it is loaded last, after the
// page is usable, so nobody waits on a colour swatch. The shader that reads it
// lives in the page and defaults to off, so until one of these is picked there
// is nothing extra to compute and nothing extra to download.
//
// Colours are read off product photography, not measured. They are a good
// likeness, not a spectrophotometer.

// Per-family physical constants. A gradient PLA and a gradient PETG should not
// look the same: PETG is glossier and refracts harder, TPU is soft and matte.
//
// env WAS 2.0 / 2.6 / 1.5 and those numbers hid the whole feature on flat
// parts. envMapIntensity that high, on a surface as smooth as 0.13, makes a
// mirror — and a FLAT top face mirrors one patch of the environment across its
// entire area. Pointed anywhere near the room's ceiling light it went to solid
// white: no flake, and not even the right colour. Measured on a 70mm slab in
// Witchcraft, a deep violet: the top face came back RGB [249,249,250] with
// 95.6% of its pixels clipped and ZERO specks. Setting envMapIntensity to 0
// gave [52,21,107], the violet it should have been all along.
//
// It survived because the rigs were judged on a SPHERE, where only a small
// patch of the surface faces the bright part of the environment at any moment.
// Every real part — a cutter, a plate, a box — is mostly flat.
//
// The values below keep the sphere almost exactly as it was (specks 3.54% ->
// 3.46%, and it stops clipping) while the flat top goes from 0% specks to
// 5.6%. Roughness comes up at the same time: a printed surface has layer
// lines, and 0.13 is polished glass.
export const FAMILY = {
  PLA: { ior: 1.46, rough: 0.40, env: 0.50 },
  PETG: { ior: 1.57, rough: 0.30, env: 0.55 },
  TPU: { ior: 1.47, rough: 0.62, env: 0.40 },
};

// t     transmission (how much light passes through)
// atten how many mm of plastic before the colour saturates
// a     alpha, so a part standing alone still reads as translucent
// grad  colour stops BOTTOM -> TOP; 2 or 3 of them
// flake { density, size, strength, colour, rainbow }
//
// density is CELLS PER MILLIMETRE, which is the number that was wrong. The
// first pass used 20-34, giving flake 0.03-0.05mm across — a fifth the size of
// real glitter and, at any normal zoom, several specks per PIXEL. The GPU
// dutifully averaged them into a faint sheen, which is why it read as a
// pearlescent coat rather than glitter. Real flake is 0.2-0.5mm, so density
// belongs around 2-4. Nothing else about the shader mattered until this was
// right.
//
// tri   three colours SIDE BY SIDE in the strand (coextruded "tri-colour
//       silk"). The colour you see depends on which way the wall FACES, not
//       on height: a cylinder is red on one side, yellow and blue round the
//       others, and every twist or flute trades them. Colours in order round
//       the part (by the world-space normal's direction about Z).
//
// size is the fraction of cells that hold a speck, so it is coverage, not a
// dimension. Below about 0.08 the surface looks clean; above 0.25 the specks
// touch and it goes back to being a coat of paint.
export const SPOOLS = [
  // ---------------------------------------------------------------- PLA
  {
    id: "rainbow-glitter",
    aliases: ["cc-funfetti", "funfetti"],   // names it had before, still accepted
    family: "PLA",
    label: "Rainbow Glitter · clear with rainbow flake",
    base: "#dfe7ec",
    t: 0.66, atten: 46, a: 0.60, rough: 0.30, env: 0.14,
    flake: { density: 2.4, size: 0.19, strength: 3.0, colour: "#ffffff", rainbow: true },
  },
  {
    id: "pink-blue-gradient",
    aliases: ["cc-unicorn", "unicorn"],   // names it had before, still accepted
    family: "PLA",
    label: "Gradient · pink → purple → blue",
    base: "#9b6ef3",
    t: 0.30, atten: 20, a: 0.90,
    grad: ["#ff6fb5", "#9b6ef3", "#4aa8ff"],
  },
  {
    id: "ruby-red",
    aliases: ["cc-ruby", "ruby"],   // names it had before, still accepted
    family: "PLA",
    label: "Ruby Red · translucent",
    base: "#c0182c",
    t: 0.46, atten: 15, a: 0.78, rough: 0.32,
  },

  // --------------------------------------------------------------- PETG
  {
    id: "violet-flake",
    aliases: ["cc-witchcraft", "witchcraft"],   // names it had before, still accepted
    family: "PETG",
    label: "Violet Flake · violet with cyan flake",
    base: "#5326b8",
    t: 0.24, atten: 11, a: 0.94,
    flake: { density: 3.0, size: 0.16, strength: 2.8, colour: "#8fe8ff", rainbow: false },
  },
  {
    id: "ocean-gradient",
    aliases: ["cc-mermaid", "mermaid"],   // names it had before, still accepted
    family: "PETG",
    label: "Ocean Gradient · purple → blue → green",
    base: "#2f7fe0",
    t: 0.34, atten: 22, a: 0.86,
    grad: ["#7b3fe4", "#2f7fe0", "#29c39a"],
  },
  {
    id: "smoky-violet",
    aliases: ["cc-darkmagic", "darkmagic", "dark magic"],   // names it had before, still accepted
    family: "PETG",
    label: "Smoky Violet · near-black translucent",
    base: "#241a3a",
    t: 0.40, atten: 9, a: 0.82,
    flake: { density: 3.6, size: 0.10, strength: 2.2, colour: "#b79bff", rainbow: false },
  },

  // ---------------------------------------------------------------- TPU
  {
    id: "pastel-glitter",
    aliases: ["cc-fairyfloss", "fairyfloss", "fairy floss"],   // names it had before, still accepted
    family: "TPU",
    label: "Pastel Glitter · pink → purple → blue, glittered",
    base: "#b98cf0",
    t: 0.28, atten: 24, a: 0.88,
    grad: ["#ff9ad5", "#b98cf0", "#7fc4ff"],
    flake: { density: 2.8, size: 0.15, strength: 2.4, colour: "#ffffff", rainbow: true },
  },
  {
    id: "gold-flake",
    aliases: ["cc-golddust", "golddust", "gold dust"],   // names it had before, still accepted
    family: "TPU",
    label: "Gold Flake · clear with gold flake",
    base: "#e6ded0",
    t: 0.58, atten: 42, a: 0.64, env: 0.20,
    flake: { density: 2.2, size: 0.17, strength: 3.2, colour: "#ffc95e", rainbow: false },
  },
  {
    id: "pink-ombre",
    aliases: ["cc-pinkombre", "pinkombre"],   // names it had before, still accepted
    family: "TPU",
    label: "Pink Ombré",
    base: "#ff7ab8",
    t: 0.22, atten: 18, a: 0.92,
    grad: ["#ffd8ea", "#ff5fa2"],
  },

  // ------------------------------------------------- coextruded tri-colour
  {
    id: "tri-ryb",
    group: "Tri-colour silk",
    family: "PLA",
    label: "Tri-colour Silk · red / yellow / blue",
    base: "#f2c21b",
    t: 0.0, atten: 6, a: 1, rough: 0.26,
    tri: ["#d6202a", "#f4c417", "#1d58d0"],
  },
  {
    id: "tri-bbp",
    group: "Tri-colour silk",
    family: "PETG",
    label: "Tri-colour Silk · black / blue / purple",
    base: "#3b2a9e",
    t: 0.0, atten: 6, a: 1, rough: 0.25,
    tri: ["#101018", "#1f56e8", "#8a2fe0"],
  },
];


// ---------------------------------------------------------------- lighting
//
// One lighting rig cannot flatter them all. A near-clear glitter spool needs
// light coming from BEHIND it — that is the only way transmission reads, and
// the only angle at which flake flashes — while a matte TPU lit that way just
// looks thin. A near-black translucent needs almost everything turned up or it
// is a silhouette. So each spool carries the rig that suits it.
//
// This ONLY applies to these named spools. The four generic filaments leave
// the user's lighting exactly as they set it, and switching back off a spool
// restores whatever was there before — see the snapshot in index.html. Taking
// over someone's scene is fine as a suggestion and unforgivable as a one-way
// door.
//
// Values are in the same units as the Lighting tab: 100 = 1.0.
export const LOOK_KEYS = [
  "ambient", "key", "fill", "rim", "exposure", "opacity", "bg", "rimcol", "fillcol",
];

export const LOOKS = {
  // Clear body, rainbow flake. Backlit HARD originally, which blew the body
  // to white and left the coloured specks nowhere to read — the one spool whose
  // whole name is its glitter, and you could not see it. Backlight and exposure
  // pulled down to leave headroom for the flake.
  "rainbow-glitter": { key: 112, fill: 38, rim: 88, ambient: 34, exposure: 104, opacity: 88, bg: "#0a0d14" },
  // a ramp has to be READ, so light it evenly and do not blow out the top
  "pink-blue-gradient": { key: 145, fill: 78, rim: 48, ambient: 66, exposure: 106, opacity: 100, bg: "#0d1018" },
  // jewel tone: it should glow from behind like held-up glass
  "ruby-red": { key: 132, fill: 46, rim: 115, ambient: 42, exposure: 116, opacity: 90, bg: "#0c0a0e" },
  // deep violet would crush to black without a strong key AND a rim
  "violet-flake": { key: 168, fill: 56, rim: 108, ambient: 44, exposure: 114, opacity: 96, bg: "#080a12" },
  // glossy PETG: enough rim to throw the specular line that says "gloss"
  "ocean-gradient": { key: 152, fill: 72, rim: 76, ambient: 58, exposure: 108, opacity: 96, bg: "#0a0f16" },
  // the hardest one in the set — everything up, or it is a hole in the screen
  "smoky-violet": { key: 178, fill: 62, rim: 140, ambient: 52, exposure: 128, opacity: 88, bg: "#0d0b14" },
  // pastel gradient on matte TPU: soft and open, no hard highlights
  "pastel-glitter": { key: 136, fill: 82, rim: 72, ambient: 68, exposure: 107, opacity: 98, bg: "#0e1017" },
  // warm flake wants a warm backlight, or the gold reads grey
  "gold-flake": { key: 112, fill: 44, rim: 82, ambient: 34, exposure: 103, opacity: 86, rimcol: "#ffd9a0", bg: "#0a0a0d" },
  // matte needs FILL above all — lit like the others it looks dead flat
  "pink-ombre": { key: 142, fill: 92, rim: 42, ambient: 74, exposure: 104, opacity: 100, bg: "#0f1016" },
  // silk: a bright even key so all three colours read, and a rim for the sheen
  "tri-ryb": { key: 150, fill: 70, rim: 96, ambient: 52, exposure: 106, opacity: 100, bg: "#0b0e15" },
  // dark silk: the black third needs a strong rim and key or it is a hole;
  // the sheen IS the look, so the rim leads
  "tri-bbp": { key: 165, fill: 66, rim: 132, ambient: 48, exposure: 112, opacity: 100, bg: "#0a0b12" },
};

export const lookFor = (id) => LOOKS[id] || null;

// ------------------------------------------------------------ finding one
//
// Somebody says "use violet flake" or "the pink ombre" or a spool's old name,
// and the AI writes filament("witchcraft") from that. So the lookup has to be
// forgiving about everything a person or a model will vary: case, the family
// prefix, a maker's name in front, accents on Ombré, and the marketing words
// (Elixir, Clear, glitter) that come and go.
//
// Deliberately NOT fuzzy-by-distance. A near-match that silently picks the
// wrong spool is worse than not finding one — the caller can say so and the
// user can pick from the list.
const norm = (s) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")     // ombré -> ombre
  .toLowerCase()
  .replace(/cookie\s*cad|cookiecad/g, " ")
  // A possessive, BEFORE the punctuation is stripped. Otherwise "witch's
  // elixir" becomes "witchs", which no longer prefixes "witchcraft" and the
  // spool goes unfound — while the identical "witch elixir" matches fine.
  // Nobody would ever guess the apostrophe was the problem.
  .replace(/['’ʼ]s\b/g, "")
  .replace(/\b(pla|petg|tpu|filament|spool|elixir|clear|with|and|the)\b/g, " ")
  .replace(/[^a-z0-9]+/g, "");

export function findSpool(name) {
  const q = norm(name);
  if (!q) return null;
  // exact id first, so filament("pink-blue-gradient") is never ambiguous;
  // then a name the spool had before (a model saved with it still loads)
  const want = String(name).trim().toLowerCase();
  const byId = SPOOLS.find((s) => s.id === want);
  if (byId) return byId;
  const byAlias = SPOOLS.find((s) => (s.aliases || []).some((a) => a === want || norm(a) === q));
  if (byAlias) return byAlias;
  // then the distinctive word in the label, e.g. "witchcraft", "golddust"
  const keyed = SPOOLS.find((s) => norm(s.id.replace(/^cc-/, "")) === q);
  if (keyed) return keyed;
  // ...then the product NAME — the part of the label before the dash, never the
  // description after it. Matching the description made "black pla" resolve to
  // Dark Magic, whose blurb says "near-black": Black PLA is a real spool they
  // sell and we do not stock it, so the honest answer is "not one of these",
  // not a silent substitution.
  const hits = SPOOLS.filter((s) => {
    const name = norm(s.label.split("·")[0]);
    const key = norm(s.id.replace(/^cc-/, ""));
    return name.includes(q) || q.includes(key);
  });
  return hits.length === 1 ? hits[0] : null;
}

// Every name the picker should accept, for the error message when it does not.
export const spoolNames = () => SPOOLS.map((s) => s.id.replace(/^cc-/, ""));

export const hexToRgb = (hex) => {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  if (!Number.isFinite(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Everything the shader needs, as plain numbers. Pure, so the mapping from a
// spool to what gets drawn is checkable without a GPU.
//
// A gradient always yields THREE stops even when the spool names two — an
// ombré is just a ramp whose middle sits halfway — so the shader never has to
// branch on how many there are.
export function fxFor(spool) {
  if (!spool) return { grad: 0, flake: 0 };
  const fam = FAMILY[spool.family] || FAMILY.PLA;
  // grad 2 = tri-colour: the same three colour slots, read by facing instead of height
  const stops = spool.tri ? spool.tri.slice(0, 3) : spool.grad
    ? (spool.grad.length >= 3
      ? [spool.grad[0], spool.grad[1], spool.grad[2]]
      : [spool.grad[0], mixHex(spool.grad[0], spool.grad[1], 0.5), spool.grad[1]])
    : null;
  const f = spool.flake;
  return {
    grad: spool.tri ? 2 : stops ? 1 : 0,
    gradA: hexToRgb(stops ? stops[0] : "#ffffff"),
    gradB: hexToRgb(stops ? stops[1] : "#ffffff"),
    gradC: hexToRgb(stops ? stops[2] : "#ffffff"),
    flake: f ? 1 : 0,
    flakeDensity: f ? f.density : 0,
    flakeSize: f ? f.size : 0,
    flakeStrength: f ? f.strength : 0,
    flakeColour: hexToRgb(f ? f.colour : "#ffffff"),
    flakeRainbow: f && f.rainbow ? 1 : 0,
    // the physical half, merged with the family defaults
    // env is overridable per spool for the same reason rough is: the two
    // NEARLY CLEAR spools have pale bodies that any reflection pushes to white,
    // and white flake on a white body is not glitter, it is nothing.
    t: spool.t, ior: fam.ior, env: spool.env ?? fam.env,
    rough: spool.rough ?? fam.rough,
    atten: spool.atten, a: spool.a,
    base: spool.base,
  };
}

function mixHex(a, b, k) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const to = (v) => Math.round(v * 255).toString(16).padStart(2, "0");
  return "#" + A.map((v, i) => to(v + (B[i] - v) * k)).join("");
}

// Grouped for the picker: the families in order, then any spool with a
// group of its own (the tri-colour silks), under that group's name.
export function byFamily() {
  const groups = ["PLA", "PETG", "TPU"].map((family) => ({
    family,
    spools: SPOOLS.filter((s) => s.family === family && !s.group),
  }));
  for (const g of [...new Set(SPOOLS.map((s) => s.group).filter(Boolean))]) {
    groups.push({ family: g, spools: SPOOLS.filter((s) => s.group === g) });
  }
  return groups;
}
