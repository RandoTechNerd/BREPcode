// A drink coaster: round, square, hex or octagon, with a raised rim to catch
// drips and concentric or straight grooves cut into the top, printed flat.
// Several at once for a set, and an open holder that stacks them, with a
// finger notch to lift them out.

export default {
  id: "coaster",
  category: "decor",
  title: "Coaster",
  summary: "a drink coaster with a drip rim and grooves, as a set with a holder if wanted.",
  print: "flat as shown, no supports. A TPU or cork-filled base layer stops it sliding.",
  names: ["coaster", "drink coaster", "coasters", "table coaster", "glass coaster", "cup mat", "drinks coaster"],
  nouns: ["coaster", "mat"],
  keywords: ["drink", "cup", "mug", "glass", "table", "beer", "coffee", "tea", "wine"],
  primary: "size",
  tips: ["set of 4 with a holder", "hexagon", "110 mm across", "no grooves"],
  examples: ["I want a coaster", "make me a hexagon coaster 100mm across",
    "a set of 4 coasters with a holder", "square drink coaster with rings"],
  params: {
    size: { default: 100, min: 60, max: 160, unit: "mm", label: "across", say: ["across", "wide", "diameter", "size"], more: ["bigger", "wider"], less: ["smaller"] },
    thick: { default: 4, min: 2, max: 10, unit: "mm", label: "thickness", say: ["thick", "thickness"] },
    rim: { default: 1.5, min: 0, max: 6, unit: "mm", label: "rim height (0 = flat)", say: ["rim", "lip", "edge"] },
    rimW: { default: 3, min: 1.2, max: 8, unit: "mm", label: "rim width", say: ["border"] },
    shape: { default: "round", unit: "choice", choices: ["round", "square", "hex", "octagon"], label: "shape",
      words: { hex: ["hex", "hexagon", "hexagonal", "honeycomb"], octagon: ["octagon", "octagonal"], square: ["square"], round: ["round", "circle", "circular"] } },
    pattern: { default: "rings", unit: "choice", choices: ["rings", "lines", "plain"], label: "grooves on top",
      words: { plain: ["plain", "no grooves", "smooth", "flat top"], lines: ["lines", "stripes", "straight grooves"], rings: ["rings", "circles", "concentric"] } },
    count: { default: 1, min: 1, max: 8, unit: "count", label: "how many", say: ["coaster", "piece", "set"] },
    holder: { default: "no", unit: "choice", choices: ["no", "yes"], label: "holder for the stack",
      words: { no: ["no holder", "without holder", "without a holder"], yes: ["holder", "stand", "caddy", "with holder"] } },
  },
  things: [
    { names: ["cup coaster", "mug coaster", "coffee coaster", "tea coaster"], title: "Mug coaster", params: { size: 95 } },
    { names: ["hexagon coaster", "hex coaster", "honeycomb coaster"], title: "Hexagon coaster", params: { shape: "hex", size: 105 } },
    { names: ["square coaster", "square drink coaster"], title: "Square coaster", params: { shape: "square", size: 95, pattern: "lines" } },
    { names: ["octagon coaster", "octagonal coaster"], title: "Octagon coaster", params: { shape: "octagon" } },
    { names: ["coaster set", "set of coasters", "four coasters", "coaster set of 4"], title: "Coaster set", params: { count: 4 } },
    { names: ["coaster holder", "coaster stand", "coaster caddy", "coaster set with holder", "coasters with holder"], title: "Coasters with holder",
      params: { count: 4, holder: "yes" } },
    { names: ["beer coaster", "bar coaster", "pub coaster"], title: "Beer coaster", params: { size: 105, rim: 0, pattern: "rings" } },
    { names: ["wine glass coaster", "small coaster", "glass mat"], title: "Small coaster", params: { size: 80, thick: 3 } },
  ],
  body: `
const R = size / 2;
const sideN = shape === "hex" ? 6 : shape === "octagon" ? 8 : shape === "square" ? 4 : 0;
// the outline at a given inset (negative grows it): a polygon with a flat at the bottom
const outline = (inset) => {
  if (!sideN) return null;
  const rc = (R - inset) / Math.cos(Math.PI / sideN);   // R is the flat-to-centre distance
  const a0 = Math.PI / sideN - Math.PI / 2;
  return polygon(Array.from({ length: sideN }, (_, i) => [rc * Math.cos(a0 + 2 * Math.PI * i / sideN), rc * Math.sin(a0 + 2 * Math.PI * i / sideN)]));
};
const slab = (inset, z0, h) => sideN
  ? translate([0, 0, z0], linearExtrude({ h }, outline(inset)))
  : translate([0, 0, z0], cylinder({ r: R - inset, h, $fn: 96 }));
const one = () => {
  let c = slab(0, 0, thick + rim);
  const cuts = [];
  if (rim > 0) cuts.push(slab(rimW, thick, rim + 1));
  // grooves: 0.8 mm deep into the top, inside the rim
  const gd = Math.min(0.8, thick * 0.3);
  const inner = R - rimW - 3;
  if (pattern === "rings") {
    for (let r = 8; r < inner; r += 7) {
      cuts.push(translate([0, 0, thick - gd], difference(cylinder({ r: r + 0.8, h: gd + rim + 1, $fn: 72 }), translate([0, 0, -1], cylinder({ r: r - 0.8, h: gd + rim + 3, $fn: 72 })))));
    }
  } else if (pattern === "lines") {
    for (let y = -inner + 4; y < inner - 3; y += 7) {
      const half = Math.sqrt(Math.max(0, inner * inner - y * y));
      if (half > 4) cuts.push(translate([-half, y - 0.8, thick - gd], cube([2 * half, 1.6, gd + rim + 1])));
    }
  }
  return cuts.length ? difference(c, ...cuts) : c;
};
const step = size + 6;
const cols = count > 2 ? 2 : count;
const parts = Array.from({ length: count }, (_, i) => translate([(i % cols) * step, Math.floor(i / cols) * step, 0], one()));
if (holder === "yes") {
  // an open box the stack drops into, with a finger notch at the front
  const fit = 1;
  const wallT = 2.4;
  const hH = Math.min(count * (thick + rim) * 0.7 + 3, 60);
  const box = difference(slab(-(fit + wallT), 0, hH), slab(-fit, 2, hH),
    translate([-R * 0.3, -R - fit - wallT - 1, 4], cube([R * 0.6, wallT + 2 + R * 0.3, hH])));
  parts.push(translate([-(step + 10), 0, 0], box));
}
return parts.length > 1 ? group(...parts) : parts[0];
`,
};
