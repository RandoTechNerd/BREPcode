// Plain parts the in-browser model fills in rather than writes.
//
// A 1.5B model asked for "an L bracket, 50 mm each side, two holes an arm"
// writes code that builds about five times in six, and is the right SHAPE far
// less often than that: a flat bar for the bracket, a square for a round lid,
// a solid block for an open box, the hole size used as the radius. Reading the
// sizes out of the sentence is a job it does well. So for the handful of plain
// parts people ask a CAD chat for most (a plate with holes, an L bracket, an
// open box, a tube or washer, a lid with a knob, a block, a frame), the model
// only fills in a short JSON form of numbers, held to that shape by WebLLM's
// grammar, and the part is written here: right by construction, every size a
// named const at the top so it lands with sliders.
//
// Anything a template cannot draw (a T shape, a slot, a lip, rounded corners,
// a hinge) is left to the code-writing pass: a template that drops half the
// request is worse than a model that tries all of it.
//
// No DOM: test/browserparts.js builds every template on the real kernel.

import { keyTokens } from "../src/catalog/match.js";

const num = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Feature words no template draws. Any of these in the request, and the
// request goes to the code pass instead (see `allow` for the exceptions).
const FEATURES = /\b(slot|slots|slotted|lips?|hooks?|tabs?|notch(?:es|ed)?|grooves?|threads?|threaded|text|logo|letters?|handles?|hinges?|hinged|clips?|magnets?|magnetic|countersunk|countersink|counterbore|chamfer|chamfered|fillet|rounded|round(?:ed)? corners?|curved?|taper(?:ed)?|cone|conical|hex(?:agon(?:al)?)?|octagon(?:al)?|triang(?:le|ular)|star|cross|[ltux][- ]shaped?|wedge|ramp|step(?:ped)?|oval|ellip\w*|dome|sphere|ball|gear|teeth|spring|arrow|heart)\b/i;

export const TEMPLATES = [
  {
    id: "lbracket",
    names: ["l bracket", "angle bracket", "corner bracket", "right angle bracket", "shelf bracket", "bracket"],
    allow: ["l shaped", "l-shaped", "l shape", "l-shape"],     // an L-shaped bracket is still the bracket
    fields: {
      arm_a: "length of the first arm, mm",
      arm_b: "length of the second arm, mm (0 if both arms are the same)",
      width: "width of the bracket, mm",
      thickness: "thickness of the metal/plastic, mm",
      holes_per_arm: "screw holes in each arm",
      hole_d: "screw hole diameter, mm",
    },
    build(v) {
      const A = num(v.arm_a) || 40, B = num(v.arm_b) || A;
      const T = clamp(num(v.thickness) || 4, 1, Math.min(A, B) / 2);
      const W = num(v.width) || Math.max(15, r2(Math.min(A, B) * 0.5));
      const HOLES = Math.round(clamp(v.holes_per_arm ?? 0, 0, 6));
      // no wider than 0.6 of the bracket, and no wider than the gap between
      // two holes, or neighbouring holes run together into one slot
      const gap = (Math.min(A, B) - T) / (HOLES + 1);
      const HOLE_D = r2(clamp(num(v.hole_d) || 4, 1, Math.min(W * 0.6, gap * 0.8)));
      return {
        say: `An L bracket: ${A} × ${B} mm arms, ${W} mm wide, ${T} mm thick${HOLES ? `, ${HOLES} × ${HOLE_D} mm hole${HOLES > 1 ? "s" : ""} in each arm` : ""}.`,
        code: `const A = ${A};          // first arm (on the bed), mm
const B = ${B};          // second arm (upright), mm
const W = ${W};          // width, mm
const T = ${T};           // thickness, mm
const HOLES = ${HOLES};       // screw holes in each arm
const HOLE_D = ${HOLE_D};      // hole diameter, mm

// holes spaced evenly along each arm, clear of the bend
const along = (len, i) => T + (len - T) * (i + 1) / (HOLES + 1);
return difference(
  union(cube([A, W, T]), cube([T, W, B])),
  ...Array.from({ length: HOLES }, (_, i) => translate([along(A, i), W / 2, -1], cylinder({ r: HOLE_D / 2, h: T + 2 }))),
  ...Array.from({ length: HOLES }, (_, i) => translate([-1, W / 2, along(B, i)], rotate([0, 90, 0], cylinder({ r: HOLE_D / 2, h: T + 2 })))),
);`,
      };
    },
  },
  {
    // before the tube: a "hexagonal spacer" is a hex, not a round spacer
    id: "hex",
    names: ["hex nut", "hexagonal nut", "nut", "hex spacer", "hexagonal spacer", "hex standoff", "hexagonal standoff", "hexagon", "hexagonal prism", "hex"],
    allow: ["hex", "hexagon", "hexagonal"],
    fields: {
      flats: "size across the flats, mm",
      thickness: "thickness or height, mm",
      hole_d: "hole diameter through the middle, mm, 0 for none",
    },
    build(v) {
      const F = num(v.flats) || 13, T = num(v.thickness) || r2(F * 0.4);
      const HOLE_D = num(v.hole_d) < F * 0.9 ? num(v.hole_d) : 0;
      return {
        say: `A hexagon ${F} mm across the flats, ${T} mm thick${HOLE_D ? `, with a ${HOLE_D} mm hole` : ""}.`,
        code: `const FLATS = ${F};    // across the flats, mm
const T = ${T};       // thickness, mm
${HOLE_D ? `const HOLE_D = ${HOLE_D};   // hole through the middle, mm
` : ""}
// six sides: a hexagon's corners sit FLATS / sqrt(3) from its middle
const hex = cylinder({ r: FLATS / Math.sqrt(3), h: T, $fn: 6 });
${HOLE_D ? "return difference(hex, translate([0, 0, -1], cylinder({ r: HOLE_D / 2, h: T + 2 })));" : "return hex;"}`,
      };
    },
  },
  {
    id: "wedge",
    names: ["wedge", "ramp", "incline", "sloped block", "slope"],
    allow: ["wedge", "ramp"],
    fields: {
      length: "length along the slope, mm",
      width: "width across, mm",
      height: "height at the tall end, mm",
    },
    build(v) {
      const L = num(v.length) || 50, W = num(v.width) || r2(L * 0.6), H = num(v.height) || r2(L * 0.4);
      return {
        say: `A wedge ${L} mm long and ${W} mm wide, rising to ${H} mm.`,
        code: `const L = ${L};     // length, mm
const W = ${W};     // width, mm
const H = ${H};     // height at the tall end, mm

// the side profile, stood up and extruded across the width
return translate([0, W, 0], rotate([90, 0, 0], linearExtrude({ h: W }, polygon([[0, 0], [L, 0], [L, H]]))));`,
      };
    },
  },
  {
    id: "box",
    square: true,
    // not "case", "pot" or "enclosure": a phone case, a lid for a pot and an
    // Arduino enclosure are other things, and a plain box would be wrong
    names: ["open box", "box", "tray", "bin", "container"],
    allow: ["lid"],
    fields: {
      length: "outside length, mm",
      width: "outside width, mm",
      height: "outside height, mm",
      wall: "wall thickness, mm",
      floor: "floor thickness, mm (0 if the same as the walls)",
      lid: "1 if the request wants a separate lid, else 0",
    },
    build(v, text = "") {
      const L = num(v.length) || 60, W = num(v.width) || L, H = num(v.height) || r2(Math.min(L, W) * 0.5);
      const WALL = clamp(num(v.wall) || 2, 0.8, Math.min(L, W) / 4);
      const FLOOR = clamp(num(v.floor) || WALL, 0.8, H / 2);
      const LID = (v.lid === 1 || /\b(with|and|plus) (a )?(separate |matching )?lid\b/i.test(text)) && !/\bno lid\b|\bwithout (a )?lid\b|\bopen\b/i.test(text);
      return {
        say: `A ${L} × ${W} × ${H} mm box, ${WALL} mm walls${LID ? ", with a lid that sits beside it" : ", open top"}.`,
        code: `const L = ${L};      // outside length, mm
const W = ${W};      // outside width, mm
const H = ${H};      // outside height, mm
const WALL = ${WALL};    // wall thickness, mm
const FLOOR = ${FLOOR};   // floor thickness, mm
${LID ? `const FIT = 0.3;    // gap round the lid's plug, mm
` : ""}
const box = difference(cube([L, W, H]), translate([WALL, WALL, FLOOR], cube([L - 2 * WALL, W - 2 * WALL, H])));
${LID ? `// the lid prints flat beside the box: a plate with a plug that drops inside the walls
const lid = translate([L + 10, 0, 0], union(
  cube([L, W, WALL]),
  translate([WALL + FIT, WALL + FIT, WALL - 0.01], cube([L - 2 * (WALL + FIT), W - 2 * (WALL + FIT), 4])),
));
return group(box, lid);` : "return box;"}`,
      };
    },
  },
  {
    id: "lid",
    names: ["lid", "round lid", "lid with a knob"],
    allow: ["handle", "handles"],     // the knob is its handle
    fields: {
      diameter: "diameter of the lid, mm",
      thickness: "thickness of the lid, mm",
      knob_d: "knob diameter, mm",
      knob_h: "knob height above the lid, mm",
    },
    build(v) {
      const D = num(v.diameter) || 80, T = num(v.thickness) || 3;
      const KD = clamp(num(v.knob_d) || r2(Math.max(10, D * 0.15)), 2, D * 0.8), KH = num(v.knob_h) || r2(Math.max(6, KD * 0.8));
      return {
        say: `A ${D} mm round lid, ${T} mm thick, with a ${KD} mm knob ${KH} mm tall in the middle.`,
        code: `const D = ${D};       // lid diameter, mm
const T = ${T};        // lid thickness, mm
const KNOB_D = ${KD};   // knob diameter, mm
const KNOB_H = ${KH};   // knob height above the lid, mm

return union(
  cylinder({ r: D / 2, h: T }),
  translate([0, 0, T - 0.01], cylinder({ r: KNOB_D / 2, h: KNOB_H + 0.01 })),
);`,
      };
    },
  },
  {
    id: "tube",
    // a round plate is a disc: the plate template would draw it square
    names: ["tube", "pipe", "spacer", "washer", "ring", "bushing", "sleeve", "cylinder", "disc", "disk", "standoff", "collar", "rod", "dowel", "puck", "shim", "grommet",
      "round plate", "circular plate", "round disc"],
    fields: {
      outer_d: "outside diameter, mm",
      inner_d: "inside (hole) diameter, mm, 0 for solid",
      height: "height or length (thickness for a washer), mm",
    },
    build(v, text = "") {
      let ID = num(v.inner_d);
      let OD = num(v.outer_d) || (ID ? r2(ID * 2) : 20);
      if (ID >= OD) [ID, OD] = [0, OD];       // nonsense pair: keep the outside, drop the hole
      const H = num(v.height) || (/\bwasher|shim|disc|disk\b/i.test(text) ? 2 : 10);
      return {
        say: ID ? `A tube ${OD} mm across with a ${ID} mm hole, ${H} mm long.` : `A solid cylinder ${OD} mm across, ${H} mm tall.`,
        code: `const OD = ${OD};     // outside diameter, mm
const ID = ${ID};      // hole diameter, mm (0 = solid)
const H = ${H};       // height, mm

${ID ? `return difference(
  cylinder({ r: OD / 2, h: H }),
  translate([0, 0, -1], cylinder({ r: ID / 2, h: H + 2 })),
);` : "return cylinder({ r: OD / 2, h: H });"}`,
      };
    },
  },
  {
    id: "frame",
    square: true,
    names: ["frame", "rectangular frame", "square frame", "border", "picture frame", "surround"],
    fields: {
      length: "outside length, mm",
      width: "outside width, mm",
      border: "width of the border, mm",
      thickness: "thickness, mm",
    },
    build(v) {
      const L = num(v.length) || 100, W = num(v.width) || L, T = num(v.thickness) || 5;
      const B = clamp(num(v.border) || 10, 1, Math.min(L, W) / 2 - 1);
      return {
        say: `A ${L} × ${W} mm frame with a ${B} mm border, ${T} mm thick.`,
        code: `const L = ${L};     // outside length, mm
const W = ${W};     // outside width, mm
const B = ${B};      // border width, mm
const T = ${T};       // thickness, mm

return difference(cube([L, W, T]), translate([B, B, -1], cube([L - 2 * B, W - 2 * B, T + 2])));`,
      };
    },
  },
  {
    id: "plate",
    square: true,
    names: ["plate", "mounting plate", "base plate", "backing plate", "flat bar", "bar", "panel", "sheet", "strip", "blank", "tile"],
    fields: {
      length: "length, mm",
      width: "width, mm",
      thickness: "thickness, mm",
      holes: "number of holes",
      hole_d: "hole diameter, mm",
    },
    build(v, text = "") {
      const L = num(v.length) || 60, W = num(v.width) || L, T = num(v.thickness) || 3;
      const HOLES = Math.round(clamp(v.holes ?? 0, 0, 64));
      const HOLE_D = clamp(num(v.hole_d) || 4, 0.5, Math.min(L, W) * 0.9);
      // where the holes go, from the words; otherwise one in the middle, two
      // at the ends, four in the corners, a square number in a grid, else a row
      const grid = Math.round(Math.sqrt(HOLES));
      const layout = HOLES === 0 ? "none"
        : /\b(row|line|along)\b/i.test(text) ? "row"
        : /\bgrid\b/i.test(text) || (HOLES > 4 && grid * grid === HOLES) ? "grid"
        : /\bcorners?\b/i.test(text) || HOLES === 4 ? "corners"
        : HOLES === 1 && !/\bend\b/i.test(text) ? "center" : "row";
      const INSET = r2(clamp(Math.max(HOLE_D * 1.5, 5), HOLE_D / 2 + 1, Math.min(L, W) / 2));
      const holes = {
        none: "",
        center: "[[L / 2, W / 2]]",
        corners: "[[INSET, INSET], [L - INSET, INSET], [INSET, W - INSET], [L - INSET, W - INSET]]",
        row: "Array.from({ length: HOLES }, (_, i) => [HOLES === 1 ? L / 2 : INSET + i * (L - 2 * INSET) / (HOLES - 1), W / 2])",
        grid: "Array.from({ length: HOLES }, (_, i) => [INSET + (i % COLS) * (L - 2 * INSET) / Math.max(1, COLS - 1), INSET + Math.floor(i / COLS) * (W - 2 * INSET) / Math.max(1, Math.ceil(HOLES / COLS) - 1)])",
      }[layout];
      return {
        say: `A ${L} × ${W} × ${T} mm plate${HOLES ? ` with ${HOLES} × ${HOLE_D} mm hole${HOLES > 1 ? "s" : ""}${layout === "corners" ? " in the corners" : layout === "center" ? " in the middle" : layout === "grid" ? " in a grid" : " in a row"}` : ""}.`,
        code: `const L = ${L};      // length, mm
const W = ${W};      // width, mm
const T = ${T};       // thickness, mm
${HOLES ? `const HOLES = ${HOLES};   // number of holes
const HOLE_D = ${HOLE_D};  // hole diameter, mm
const INSET = ${INSET};   // hole centres in from the edge, mm
${layout === "grid" ? `const COLS = ${grid};    // holes per row
` : ""}
const at = ${holes};
return difference(cube([L, W, T]), ...at.map(([x, y]) => translate([x, y, -1], cylinder({ r: HOLE_D / 2, h: T + 2 }))));` : "\nreturn cube([L, W, T]);"}`,
      };
    },
  },
  {
    id: "block",
    square: true,
    names: ["block", "cube", "brick", "cuboid", "box shape", "rectangular block"],
    fields: {
      length: "length, mm",
      width: "width, mm (0 if the same as the length)",
      height: "height, mm (0 if the same as the length)",
      hole_d: "diameter of a hole straight through the middle, mm, 0 for none",
    },
    build(v) {
      const L = num(v.length) || 20, W = num(v.width) || L, H = num(v.height) || L;
      const HOLE_D = num(v.hole_d) < Math.min(L, W) ? num(v.hole_d) : 0;
      return {
        say: `A ${L} × ${W} × ${H} mm block${HOLE_D ? ` with a ${HOLE_D} mm hole through it` : ""}.`,
        code: `const L = ${L};     // length, mm
const W = ${W};     // width, mm
const H = ${H};     // height, mm
${HOLE_D ? `const HOLE_D = ${HOLE_D};  // hole straight through, mm

return difference(cube([L, W, H]), translate([L / 2, W / 2, -1], cylinder({ r: HOLE_D / 2, h: H + 2 })));` : "\nreturn cube([L, W, H]);"}`,
      };
    },
  },
];

const byId = new Map(TEMPLATES.map((t) => [t.id, t]));
export const templateById = (id) => byId.get(id) || null;

// Which template a request is, from the model's names for it (catalogroute.js
// already asked for three) and the request's own words. The FIRST template in
// TEMPLATES order whose name phrase appears wins, so the specific ones (an L
// bracket, a lid) beat the general ones (a plate, a block). null when a
// feature no template draws is in the request, or nothing matches.
export function templateFor(request, names = []) {
  const text = String(request || "");
  const words = (s) => ` ${keyTokens(s).join(" ")} `;
  const heard = [text, ...names].map(words).join(" | ");
  for (const t of TEMPLATES) {
    if (!t.names.some((n) => heard.includes(words(n)))) continue;
    const extra = text.match(new RegExp(FEATURES.source, "gi")) || [];
    if (extra.some((w) => !(t.allow || []).includes(w.toLowerCase()))) return null;
    // a ROUND tray, plate or frame is not the square one these draw
    if (t.square && /\b(round|circular|cylindrical|oval)\b/i.test(text)) return null;
    return t;
  }
  return null;
}

// The form the model fills: every field a number, 0 for "the request does
// not say", so a missing size falls to the template's own default rather than
// to whatever the model invents.
export function fillAsk(template, request) {
  const lines = Object.entries(template.fields).map(([k, d]) => `${k}: ${d}`).join("\n");
  return {
    system: `You read the sizes in a 3D-print request into a form. Millimetres. A size "across" or "wide" for a hole or a round part is its diameter. Write 0 for anything the request does not say; never guess.\nThe form (${template.id}):\n${lines}\nReply with JSON only.`,
    user: `Request: ${request}`,
    // six fields with names like holes_per_arm run past the 40 tokens a list
    // of names needs; cut off mid-field, the form read as no answer
    maxTokens: 160,
    schema: {
      type: "object",
      properties: Object.fromEntries(Object.keys(template.fields).map((k) => [k, { type: "number" }])),
      required: Object.keys(template.fields),
      additionalProperties: false,
    },
  };
}

// The model's form as numbers, or null. Read defensively like the route's.
export function readForm(reply, template) {
  let j = null;
  try { j = JSON.parse(String(reply ?? "").replace(/^[^{]*/, "").replace(/[^}]*$/, "")); }
  catch { return null; }
  if (!j || typeof j !== "object") return null;
  const out = {};
  for (const k of Object.keys(template.fields)) out[k] = typeof j[k] === "number" && Number.isFinite(j[k]) ? j[k] : 0;
  return out;
}

// ---------------------------------------------------------------- the words
//
// Sizes the sentence ties to a word beyond doubt ("30 mm tall", "20 mm
// across", "2 mm walls", "40 by 60 by 3", "two holes on each arm"). These win
// over the model's form: filling it, the 1.5B gave a cylinder "30 mm tall and
// 20 mm across" an outside of 30 and a height of 20, and a disc "3 mm thick"
// a 3 mm hole. The model's numbers fill only what the words leave open.

const N = String.raw`(\d+(?:\.\d+)?)`;
const COUNT = { a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
const count = (w) => (/^\d+$/.test(w) ? +w : COUNT[w] ?? null);

export function readWords(request) {
  const t = String(request || "").toLowerCase().replace(/×/g, "x").replace(/(\d)\s*mm\b/g, "$1 mm");
  const w = {};
  const first = (re) => { const m = re.exec(t); return m ? +m[1] : null; };
  const tri = new RegExp(`${N}\\s*(?:mm\\s*)?(?:x|by)\\s*${N}(?:\\s*(?:mm\\s*)?(?:x|by)\\s*${N})?`).exec(t);
  if (tri) w.triple = [+tri[1], +tri[2], tri[3] != null ? +tri[3] : null];
  w.square = first(new RegExp(`${N} mm (?:square|on each side|each side|per side)`));
  w.thick = first(new RegExp(`${N} mm (?:thick|thickness)`));
  w.tall = first(new RegExp(`${N} mm (?:tall|high|deep)`)) ?? first(new RegExp(`(?:another|for) ${N} mm\\b(?! across)`));
  w.long = first(new RegExp(`${N} mm (?:long|length)`));
  w.border = first(new RegExp(`${N} mm (?:wide )?border`));
  w.wide = first(new RegExp(`${N} mm (?:wide|width)(?! border)`));
  w.wall = first(new RegExp(`${N} mm walls?`));
  w.outside = first(new RegExp(`${N} mm (?:outside|outer|od)`));
  w.inside = first(new RegExp(`${N} mm (?:inside|inner|id|bore)`)) ?? first(new RegExp(`for an? (?:m)?${N}(?: mm)? (?:bolt|screw|rod|shaft|dowel|pipe)`));
  w.across = first(new RegExp(`${N} mm (?:across|diameter|dia)(?! flats)`));
  w.knob = first(new RegExp(`${N} mm knob`));
  w.hole = first(new RegExp(`${N} mm (?:screw )?holes?`)) ?? first(new RegExp(`holes? ${N} mm`));
  // a metric screw named instead: "M4 holes" are clearance holes, 0.5 mm over
  const metric = /\bm(\d+(?:\.\d+)?)\b/.exec(t);
  if (w.hole == null && metric) w.hole = +metric[1] + 0.5;
  w.flats = first(new RegExp(`${N} mm (?:across )?(?:the )?flats`));
  w.rise = first(new RegExp(`(?:rising|rises|up) (?:from \\d+(?:\\.\\d+)? )?to ${N}`)) ?? first(new RegExp(`${N} mm (?:at (?:the|one) (?:tall |high )?end|high end)`));
  const arms = [...t.matchAll(new RegExp(`${N} mm (?:arm|leg)`, "g"))].map((m) => +m[1]);
  if (arms.length) w.arms = arms;
  w.cube = first(new RegExp(`${N} mm cube`));
  // how many holes: "four 4 mm holes", "a row of 3 holes", "9 holes", "no holes", "at each end"
  if (/\bno (?:screw )?holes?\b|\bwithout (?:any )?holes?\b/.test(t)) w.holes = 0;
  else {
    // ("four M4 holes": the screw size may sit between the count and the word)
    const m = new RegExp(`\\b(\\d+|a|an|one|single|two|three|four|five|six|seven|eight|nine|ten|twelve)\\s+(?:${N} mm\\s+|m\\d+(?:\\.\\d+)?\\s+)?(?:screw\\s+|mounting\\s+)?holes?\\b`).exec(t);
    if (m) w.holes = count(m[1]);
    if (/\b(?:at )?(?:each|both) ends?\b/.test(t) && w.holes === 1) w.holes = 2;
  }
  w.perArm = /\b(?:on|in) each (?:arm|leg|side)\b/.test(t);
  w.lid = /\b(?:with|and|plus) (?:a )?(?:separate |matching )?lid\b/.test(t) && !/\bno lid\b/.test(t);
  w.hasHole = /\bholes?\b|\bbore\b|\binside\b|\binner\b|\bfor an? (?:m?\d|\w+ )*(?:bolt|screw|rod|shaft)\b/.test(t);
  return w;
}

// What the words settle for each template, as form values (missing = unset).
// A hole size counts only when the words give it: asked for "two screw holes"
// with no size, the 1.5B filled in 20 mm, the bracket's own width. 0 means
// the template's default.
const FROM_WORDS = {
  plate: (w) => ({
    length: w.triple?.[0] ?? w.square ?? w.long, width: w.triple?.[1] ?? w.square ?? w.wide,
    thickness: w.triple?.[2] ?? w.thick, holes: w.holes, hole_d: w.hole ?? 0,
  }),
  lbracket: (w) => ({
    arm_a: w.arms?.[0] ?? w.square ?? w.triple?.[0], arm_b: w.arms?.[1] ?? w.square ?? w.triple?.[1],
    width: w.wide, thickness: w.thick, holes_per_arm: w.holes, hole_d: w.hole ?? 0,
  }),
  hex: (w) => ({ flats: w.flats ?? w.across, thickness: w.thick ?? w.tall ?? w.long, hole_d: w.hasHole ? (w.hole ?? w.inside) : 0 }),
  wedge: (w) => ({ length: w.triple?.[0] ?? w.long, width: w.triple?.[1] ?? w.wide, height: w.rise ?? w.triple?.[2] ?? w.tall }),
  box: (w) => ({
    length: w.triple?.[0] ?? w.square, width: w.triple?.[1] ?? w.square, height: w.triple?.[2] ?? w.tall,
    wall: w.wall, lid: w.lid ? 1 : undefined,
  }),
  lid: (w) => ({ diameter: w.across ?? w.wide, thickness: w.thick, knob_d: w.knob }),
  tube: (w) => ({
    outer_d: w.outside ?? w.across ?? w.wide, inner_d: w.hasHole ? (w.inside ?? w.hole) : 0,
    height: w.tall ?? w.long ?? w.thick,
  }),
  frame: (w) => ({ length: w.triple?.[0], width: w.triple?.[1], border: w.border, thickness: w.thick ?? w.triple?.[2] }),
  block: (w) => ({
    length: w.triple?.[0] ?? w.cube, width: w.triple?.[1] ?? w.cube, height: w.triple?.[2] ?? w.cube, hole_d: w.hasHole ? w.hole : 0,
  }),
};

// The model's form with every size the words settle put over it.
export function settle(template, values, request) {
  const said = FROM_WORDS[template.id]?.(readWords(request)) || {};
  const out = { ...values };
  for (const [k, v] of Object.entries(said)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out;
}

// One template, filled: { template, values, say, code } or null.
export async function fillTemplate(request, names, ask) {
  const template = templateFor(request, names);
  if (!template) return null;
  const form = readForm(await ask(fillAsk(template, request)), template);
  if (!form) return null;
  const values = settle(template, form, request);
  const { say, code } = template.build(values, request);
  return { template, values, say, code };
}
