// Real filament looks, as data.
//
// The existing filament setting is a physical model — transmission, IOR,
// attenuation — with four generic entries. These are named spools you can
// actually buy, from Cookiecad's PLA/PETG/TPU lines, and they need two things
// that model has no way to express:
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
export const FAMILY = {
  PLA: { ior: 1.46, rough: 0.34, env: 2.0 },
  PETG: { ior: 1.57, rough: 0.13, env: 2.6 },
  TPU: { ior: 1.47, rough: 0.58, env: 1.5 },
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
// size is the fraction of cells that hold a speck, so it is coverage, not a
// dimension. Below about 0.08 the surface looks clean; above 0.25 the specks
// touch and it goes back to being a coat of paint.
export const SPOOLS = [
  // ---------------------------------------------------------------- PLA
  {
    id: "cc-funfetti",
    family: "PLA",
    label: "Funfetti Clear · rainbow glitter",
    base: "#dfe7ec",
    t: 0.66, atten: 46, a: 0.60, rough: 0.16,
    flake: { density: 2.4, size: 0.19, strength: 3.0, colour: "#ffffff", rainbow: true },
  },
  {
    id: "cc-unicorn",
    family: "PLA",
    label: "Unicorn · pink → purple → blue",
    base: "#9b6ef3",
    t: 0.30, atten: 20, a: 0.90,
    grad: ["#ff6fb5", "#9b6ef3", "#4aa8ff"],
  },
  {
    id: "cc-ruby",
    family: "PLA",
    label: "Ruby Red Elixir",
    base: "#c0182c",
    t: 0.46, atten: 15, a: 0.78, rough: 0.20,
  },

  // --------------------------------------------------------------- PETG
  {
    id: "cc-witchcraft",
    family: "PETG",
    label: "Witchcraft · violet with cyan flake",
    base: "#5326b8",
    t: 0.24, atten: 11, a: 0.94,
    flake: { density: 3.0, size: 0.16, strength: 2.8, colour: "#8fe8ff", rainbow: false },
  },
  {
    id: "cc-mermaid",
    family: "PETG",
    label: "Mermaid · purple → blue → green",
    base: "#2f7fe0",
    t: 0.34, atten: 22, a: 0.86,
    grad: ["#7b3fe4", "#2f7fe0", "#29c39a"],
  },
  {
    id: "cc-darkmagic",
    family: "PETG",
    label: "Dark Magic · near-black translucent",
    base: "#241a3a",
    t: 0.40, atten: 9, a: 0.82,
    flake: { density: 3.6, size: 0.10, strength: 2.2, colour: "#b79bff", rainbow: false },
  },

  // ---------------------------------------------------------------- TPU
  {
    id: "cc-fairyfloss",
    family: "TPU",
    label: "Fairy Floss · pink → purple → blue, glittered",
    base: "#b98cf0",
    t: 0.28, atten: 24, a: 0.88,
    grad: ["#ff9ad5", "#b98cf0", "#7fc4ff"],
    flake: { density: 2.8, size: 0.15, strength: 2.4, colour: "#ffffff", rainbow: true },
  },
  {
    id: "cc-golddust",
    family: "TPU",
    label: "Gold Dust · clear with gold flake",
    base: "#e6ded0",
    t: 0.58, atten: 42, a: 0.64,
    flake: { density: 2.2, size: 0.17, strength: 3.2, colour: "#ffc95e", rainbow: false },
  },
  {
    id: "cc-pinkombre",
    family: "TPU",
    label: "Pink Ombré",
    base: "#ff7ab8",
    t: 0.22, atten: 18, a: 0.92,
    grad: ["#ffd8ea", "#ff5fa2"],
  },
];

export const CREDIT = "Colours inspired by Cookiecad filament (cookiecad.com).";

// ---------------------------------------------------------------- lighting
//
// One lighting rig cannot flatter all nine. A near-clear glitter spool needs
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
  "cc-funfetti": { key: 112, fill: 38, rim: 88, ambient: 34, exposure: 104, opacity: 88, bg: "#0a0d14" },
  // a ramp has to be READ, so light it evenly and do not blow out the top
  "cc-unicorn": { key: 145, fill: 78, rim: 48, ambient: 66, exposure: 106, opacity: 100, bg: "#0d1018" },
  // jewel tone: it should glow from behind like held-up glass
  "cc-ruby": { key: 132, fill: 46, rim: 115, ambient: 42, exposure: 116, opacity: 90, bg: "#0c0a0e" },
  // deep violet would crush to black without a strong key AND a rim
  "cc-witchcraft": { key: 168, fill: 56, rim: 108, ambient: 44, exposure: 114, opacity: 96, bg: "#080a12" },
  // glossy PETG: enough rim to throw the specular line that says "gloss"
  "cc-mermaid": { key: 152, fill: 72, rim: 76, ambient: 58, exposure: 108, opacity: 96, bg: "#0a0f16" },
  // the hardest one in the set — everything up, or it is a hole in the screen
  "cc-darkmagic": { key: 178, fill: 62, rim: 140, ambient: 52, exposure: 128, opacity: 88, bg: "#0d0b14" },
  // pastel gradient on matte TPU: soft and open, no hard highlights
  "cc-fairyfloss": { key: 136, fill: 82, rim: 72, ambient: 68, exposure: 107, opacity: 98, bg: "#0e1017" },
  // warm flake wants a warm backlight, or the gold reads grey
  "cc-golddust": { key: 126, fill: 46, rim: 128, ambient: 46, exposure: 119, opacity: 86, rimcol: "#ffd9a0", bg: "#0a0a0d" },
  // matte needs FILL above all — lit like the others it looks dead flat
  "cc-pinkombre": { key: 142, fill: 92, rim: 42, ambient: 74, exposure: 104, opacity: 100, bg: "#0f1016" },
};

export const lookFor = (id) => LOOKS[id] || null;

// ------------------------------------------------------------ finding one
//
// Somebody says "use witchcraft" or "cookiecad funfetti" or "the pink ombre",
// and the AI writes filament("witchcraft") from that. So the lookup has to be
// forgiving about everything a person or a model will vary: case, the family
// prefix, the word Cookiecad, accents on Ombré, and the marketing words
// (Elixir, Clear, glitter) that come and go.
//
// Deliberately NOT fuzzy-by-distance. A near-match that silently picks the
// wrong spool is worse than not finding one — the caller can say so and the
// user can pick from a list of nine.
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
  // exact id first, so filament("cc-unicorn") is never ambiguous
  const byId = SPOOLS.find((s) => s.id === String(name).trim().toLowerCase());
  if (byId) return byId;
  // then the distinctive word in the label, e.g. "witchcraft", "golddust"
  const keyed = SPOOLS.find((s) => norm(s.id.replace(/^cc-/, "")) === q);
  if (keyed) return keyed;
  // ...then the product NAME — the part of the label before the dash, never the
  // description after it. Matching the description made "black pla" resolve to
  // Dark Magic, whose blurb says "near-black": Black PLA is a real spool they
  // sell and we do not stock it, so the honest answer is "not one of the nine",
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
  const stops = spool.grad
    ? (spool.grad.length >= 3
      ? [spool.grad[0], spool.grad[1], spool.grad[2]]
      : [spool.grad[0], mixHex(spool.grad[0], spool.grad[1], 0.5), spool.grad[1]])
    : null;
  const f = spool.flake;
  return {
    grad: stops ? 1 : 0,
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
    t: spool.t, ior: fam.ior, env: fam.env,
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

// Grouped for the picker, in the order the families should appear.
export function byFamily() {
  return ["PLA", "PETG", "TPU"].map((family) => ({
    family,
    spools: SPOOLS.filter((s) => s.family === family),
  }));
}
