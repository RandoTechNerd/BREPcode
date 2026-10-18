// A stand of slots for memory cards and USB sticks. Each row steps up
// behind the one in front, like seats in a stadium, so every card is in view
// and the steps are plain vertical faces (nothing hangs over). A card sits a
// share of its height deep and the rest stands proud to pull. A USB stick is
// held by its plug, so its "card" is the plug's own size.

export default {
  id: "card-holder",
  category: "storage",
  title: "Memory card holder",
  summary: "a stepped stand of slots for SD and microSD cards or USB sticks, every card in view.",
  print: "upright as shown, no supports.",
  // gaming/cartridge-holder owns "sd card holder", "memory card holder" and
  // the microSD holder phrases; this stand answers to storage words
  names: ["sd card storage", "sd card rack", "memory card organizer", "memory card storage", "memory card stand",
    "card slot holder", "memory card rack", "sd card storage stand", "memory card slot stand", "stepped card holder"],
  nouns: ["rack", "stand", "organizer"],
  keywords: ["sd", "card", "memory", "camera", "storage", "slot", "usb"],
  fits: ["card"],
  fromSpec: (s) => ({ cardW: s.dims.w, cardH: s.dims.h, cardT: s.dims.t }),
  specNote: "each slot allows a little room",
  tips: ["for micro sd", "12 slots", "3 rows"],
  examples: ["make me an sd card rack", "memory card storage with 12 slots",
    "micro sd holder with 3 rows", "a usb stick holder for 8 drives"],
  params: {
    cardW: { default: 24, min: 5, max: 60, unit: "mm", label: "card width", say: ["wide", "width"] },
    cardH: { default: 32, min: 8, max: 80, unit: "mm", label: "card height", say: ["tall", "height", "high"] },
    cardT: { default: 2.1, min: 0.6, max: 12, unit: "mm", label: "card thickness", say: ["thick", "thickness"] },
    count: { default: 8, min: 1, max: 20, unit: "count", label: "slots per row", say: ["slot", "card", "drive", "stick"] },
    rows: { default: 2, min: 1, max: 4, unit: "count", label: "rows", say: ["row", "rows"] },
    hold: { default: 0.45, min: 0.25, max: 0.95, unit: "ratio", label: "share of each card held in its slot", say: ["deep", "hold"] },
    fit: { default: 0.35, min: 0.15, max: 0.8, unit: "mm", label: "slot clearance", say: ["fit", "clearance", "loose"] },
  },
  things: [
    { names: ["microsd holder", "micro sd holder", "micro sd card rack", "microsd card organizer", "micro sd storage"],
      title: "microSD card holder", spec: "memcard-microsd", params: { count: 10, rows: 2 } },
    { names: ["usb stick holder", "usb drive holder", "flash drive holder", "thumb drive holder", "usb stick organizer", "pen drive holder"],
      title: "USB stick holder", spec: "memcard-usb-a", params: { count: 6, rows: 2, hold: 0.9 } },
    { names: ["cf card holder", "compact flash holder", "compactflash card holder"], title: "CF card holder", spec: "memcard-cf", params: { count: 6, rows: 1 } },
    { names: ["cfexpress card holder", "xqd card holder", "cfexpress holder"], title: "CFexpress card holder", spec: "memcard-cfexpress-b", params: { count: 6, rows: 1 } },
    { names: ["camera card holder", "camera memory card holder", "photographer card holder"], title: "Camera card holder",
      params: { count: 6, rows: 3 } },
    { names: ["usb c stick holder", "usb c drive holder"], title: "USB-C stick holder", spec: "memcard-usb-c", params: { count: 8, rows: 2, hold: 0.9 } },
  ],
  body: `
const rib = Math.max(2, cardT * 0.8);
const sw = cardW + fit, st = cardT + fit;            // one slot
const pitch = st + rib;
const W = count * pitch + rib;                       // slots run across
const D = sw + 2 * rib + 2;                          // one row, front to back
const depth = Math.max(2, Math.min(cardH * hold, cardH - 1));
const base = depth + 2;                              // front row height
const rise = Math.max(4, cardH * 0.35);              // each row higher than the one in front
const rowsOf = Array.from({ length: rows }, (_, j) => translate([-W / 2, -rows * D / 2 + j * D, 0], cube([W, D + (j < rows - 1 ? 0.01 : 0), base + j * rise])));
const cuts = [];
for (let j = 0; j < rows; j++) {
  const top = base + j * rise, y0 = -rows * D / 2 + j * D + (D - sw) / 2;
  for (let i = 0; i < count; i++) {
    cuts.push(translate([-W / 2 + rib + i * pitch, y0, top - depth], cube([st, sw, depth + 1])));
  }
}
return difference(rows > 1 ? union(...rowsOf) : rowsOf[0], ...cuts);
`,
};
