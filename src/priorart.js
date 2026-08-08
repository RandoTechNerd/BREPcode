// "Has somebody already made this?"
//
// For a bracket with two holes the answer is meaningless — every bracket has
// been made. For "a Snapmaker U1" it is the most useful thing the app can say,
// because a real product has a real shape and somebody has usually measured it
// properly. So the check only runs when the request names something
// RECOGNISABLE: a product, a brand, a model number, a thing with a name.
//
// The decision is made here, in plain code, rather than by asking the model.
// That matters for cost: a search that fires on every request adds latency and
// tokens to the many builds where nothing relevant could exist, and the whole
// point of this is that it should be free when it is not wanted.
//
// It is deliberately biased towards NOT firing. A missed search costs a link
// nobody sees; a false one interrupts "make me a 40mm spacer" with a shopping
// list, which is worse.

// Brands and product families whose parts people model. Lower case; matched as
// whole words so "apple" in "apple corer" is a fair hit but "pineapple" is not.
const BRANDS = [
  // printers and maker hardware
  "snapmaker", "bambu", "bambulab", "prusa", "creality", "ender", "voron", "anycubic",
  "elegoo", "ultimaker", "makerbot", "flashforge", "sovol", "qidi", "raise3d",
  "raspberry pi", "arduino", "adafruit", "sparkfun", "esp32", "esp8266", "jetson",
  // cameras, phones, audio, computing
  "gopro", "insta360", "dji", "canon", "nikon", "sony", "fujifilm", "leica",
  "iphone", "ipad", "airpods", "macbook", "apple watch", "airtag", "apple",
  "samsung", "galaxy", "pixel", "oneplus", "kindle", "steam deck", "switch",
  "nintendo", "playstation", "xbox", "sonos", "bose", "jbl", "logitech",
  "thinkpad", "dell", "hp", "asus", "razer", "keychron",
  // tools, home, vehicles
  "dyson", "makita", "dewalt", "milwaukee", "ryobi", "bosch", "festool",
  "ikea", "skadis", "gridfinity", "lego", "duplo", "hot wheels",
  "tesla", "ford", "toyota", "honda", "bmw", "vw", "volkswagen", "jeep",
  "nerf", "peloton", "garmin", "fitbit", "oura", "starlink", "ubiquiti",
];

// Named things that are not brands but are still specific enough to search —
// a shape with an accepted meaning rather than a description of one.
const NAMED_THINGS = [
  "benchy", "3dbenchy", "calibration cube", "xyz cube", "temperature tower",
  "gridfinity bin", "voronoi", "spinner", "fidget cube", "whistle",
];

// Model-number shapes: U1, X1C, MK4, A250, MK3S, CR-10, 18650, CR2032, RTX 4090.
// A bare number is not one — "40mm" and "2 holes" must not look like a product.
const MODEL_NUMBER = /\b(?:[A-Z]{1,4}[-\s]?\d{1,4}[A-Za-z]{0,2}|\d{4,5})\b/;

// A brand followed by a word and a number — "Hero 11", "Ender 3", "Pi 5" — is
// how half of all products are named, and the bare-token pattern above misses
// every one of them. Only used to decide CONFIDENCE, never whether to look.
const NAMED_MODEL = /\b[A-Z][a-z]{1,10}\s?\d{1,4}\b/;

const word = (haystack, needle) =>
  new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i")
    .test(haystack);

// What the request appears to be about, or null when it is not about anything
// in particular. The subject comes back too, because it is what gets searched.
export function namedSubject(text) {
  const s = String(text || "").trim();
  if (!s || s.length > 400) return null;              // a whole essay is not a product name

  const brand = BRANDS.find((b) => word(s, b));
  const named = NAMED_THINGS.find((n) => word(s, n));
  if (named) return { subject: named, why: "named", confident: true };

  // A model number with no brand is too weak on its own: "40 x 20" and
  // "M3 x 12" would both qualify, and neither is a product.
  if (!brand) return null;

  // A brand is enough to look. An earlier version also demanded that the
  // request not contain a generic noun — the idea being that "a bracket for my
  // Bambu spool" is a shape rather than a product. That was wrong in the way
  // that matters: it threw out "GoPro Hero 11 mount" and "IKEA Skadis hook",
  // which are the requests most likely to have somebody else's work behind
  // them. If a brand is named, somebody has probably made the thing.
  const hasModel = MODEL_NUMBER.test(s) || NAMED_MODEL.test(s);
  return {
    subject: subjectPhrase(s, brand),
    why: hasModel ? "brand+model" : "brand",
    confident: hasModel,
  };
}

// The searchable phrase: the brand plus what follows it, trimmed of the
// request's own verbs so "make me a snapmaker u1 model in 4 colours" searches
// for "snapmaker u1" and not for the sentence.
function subjectPhrase(text, brand) {
  const i = text.toLowerCase().indexOf(brand.toLowerCase());
  const tail = text.slice(i, i + 60);
  const cut = tail.replace(
    /\b(model|print|printable|stl|please|for me|in \d+ colou?rs?|with .*|that .*|which .*)\b.*/i, "");
  return cut.replace(/[^\w\s.+-]/g, " ").replace(/\s+/g, " ").trim() || brand;
}

// Where to look. These are the places 3D models actually live, and naming them
// keeps the search off the rest of the web — a product's marketing page is not
// a model.
export const MODEL_SITES = [
  "printables.com", "makerworld.com", "thingiverse.com",
  "thangs.com", "cults3d.com", "grabcad.com", "myminifactory.com",
];

// The question put to the provider's own web search. Kept tight on purpose:
// this is a lookup, not a research project.
export function searchQuery(subject) {
  return `${subject} 3D model STL download`;
}

// Every download from this feature is somebody else's work arriving inside our
// app, and the user has to be told that before it lands rather than after.
// Kept here, next to the search, so the warning cannot drift away from the
// thing it warns about.
export const DOWNLOAD_WARNING =
  "This is somebody else's model from an outside website — not made by BREPcode "
  + "and not checked by us. Open the source page and satisfy yourself about the "
  + "licence, the author's terms and what the file actually contains before you "
  + "print it, share it or sell anything made from it.";

// A link is only offered when it is one we would follow ourselves.
export function safeModelUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.href;
}

// Files we are willing to pull in. A zip could hold anything and a gcode is
// already sliced for a machine that is not yours.
const FILE_EXT = /\.(stl|3mf|obj|step|stp)(\?|#|$)/i;
export function looksLikeModelFile(url) {
  const safe = safeModelUrl(url);
  return !!safe && FILE_EXT.test(safe);
}

// Past this we are not "importing a model", we are downloading a disk image.
export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
