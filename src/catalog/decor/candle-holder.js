// Candle holders, one or many: a cup sized to the candle on a shared base,
// set on stems for candlesticks and candelabras, in a row (a menorah, a
// kinara, a tealight tray) or a ring (an advent wreath). Each holder is a
// turned profile: a stem that flares out at 45 degrees into the cup, so it
// prints upright. The middle candle can stand taller, as a menorah's shamash
// does.

export default {
  id: "candle-holder",
  category: "decor",
  title: "Candle holder",
  summary: "a holder for one or more candles: tealights, tapers or pillars, in a row or a ring.",
  print: "upright as shown, no supports. Keep flames clear of plastic: PLA softens at 60 C, so use tealights in metal cups or LED candles.",
  names: ["candle holder", "candleholder", "candle stand", "candle base", "candle cup", "holder for candles"],
  nouns: ["holder", "stand", "candlestick"],
  keywords: ["candle", "candles", "tealight", "taper", "table", "holiday", "christmas", "dinner", "wax"],
  fits: ["candle"],
  fromSpec: (s) => ({ candleD: s.dims.d + (s.dims.d > 30 ? 1.5 : 0.4), cupDepth: s.dims.cup }),
  specNote: "the cup is a little bigger than the candle",
  ask: { unless: ["candleD"], text: "Which candle is it for? Say “for tealights”, “taper candles” or “a 3 inch pillar”; I sized it for a tealight." },
  tips: ["for taper candles", "3 candles in a row", "on a 100 mm stem", "in a ring"],
  examples: ["I want a candle holder", "make me a candle holder for 3 tealights",
    "a taper candle holder with a 120mm stem", "candle holder for 4 candles in a ring"],
  params: {
    candleD: { default: 39.5, min: 5, max: 90, unit: "mm", label: "candle diameter (the cup)", say: ["diameter", "across", "candle", "cup"] },
    cupDepth: { default: 12, min: 3, max: 60, unit: "mm", label: "cup depth", say: ["deep", "depth"] },
    count: { default: 1, min: 1, max: 12, unit: "count", label: "candles", say: ["candle", "tealight", "taper", "holder", "cup", "light"] },
    arrange: { default: "row", unit: "choice", choices: ["row", "ring"], label: "arrangement",
      words: { ring: ["ring", "circle", "wreath", "round"], row: ["row", "line", "straight"] } },
    spacing: { default: 12, min: 2, max: 60, unit: "mm", label: "gap between cups", say: ["gap", "spacing", "apart"] },
    stemH: { default: 0, min: 0, max: 200, unit: "mm", label: "stem height (0 = cups on the base)", say: ["stem", "tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    centerLift: { default: 0, min: 0, max: 60, unit: "mm", label: "extra height for the middle candle", say: ["middle", "centre", "center", "shamash"] },
    wall: { default: 2.4, min: 1.6, max: 6, unit: "mm", label: "cup wall", say: ["wall"] },
    baseT: { default: 4, min: 2, max: 12, unit: "mm", label: "base thickness", say: ["base", "thick"] },
    margin: { default: 8, min: 2, max: 40, unit: "mm", label: "base border round the cups", say: ["border", "margin"] },
  },
  things: [
    { names: ["tealight holder", "tea light holder", "tealight candle holder", "led tealight holder", "tealight cup"], title: "Tealight holder", spec: "candle-tealight" },
    { names: ["tealight tray", "triple tealight holder", "tea light tray", "tealight candle tray"], title: "Tealight tray", spec: "candle-tealight",
      params: { count: 3 } },
    { names: ["taper candle holder", "taper holder", "dinner candle holder", "taper candle stand"], title: "Taper candle holder", spec: "candle-taper",
      params: { margin: 18, baseT: 5 } },
    { names: ["candlestick", "candle stick", "candlestick holder", "taper candlestick", "candle stick holder"], title: "Candlestick", spec: "candle-taper",
      params: { stemH: 120, margin: 24, baseT: 6 } },
    { names: ["candelabra", "candelabrum", "five candle holder"], title: "Candelabra", spec: "candle-taper",
      params: { count: 5, stemH: 60, centerLift: 25, spacing: 18, baseT: 6 } },
    { names: ["menorah", "hanukkah menorah", "chanukah menorah", "chanukiah", "hanukkah candle holder", "hanukiah"], title: "Menorah", spec: "candle-hanukkah",
      params: { count: 9, centerLift: 25, spacing: 10, stemH: 20, baseT: 6, margin: 10 } },
    { names: ["kinara", "kwanzaa candle holder", "kwanzaa kinara"], title: "Kinara", spec: "candle-taper",
      params: { count: 7, spacing: 8, centerLift: 10, stemH: 15, baseT: 6 } },
    { names: ["advent candle holder", "advent wreath", "advent wreath candle holder", "advent candles holder", "advent candle ring"], title: "Advent candle holder",
      spec: "candle-pillar-small", params: { count: 4, arrange: "ring", spacing: 30, margin: 12 } },
    { names: ["votive holder", "votive candle holder", "votive cup"], title: "Votive holder", spec: "candle-votive" },
    { names: ["pillar candle holder", "pillar candle plate", "candle plate", "pillar candle stand"], title: "Pillar candle plate", spec: "candle-pillar",
      params: { margin: 10, wall: 3 } },
    { names: ["birthday candle holder", "cake candle holder"], title: "Birthday candle holder", spec: "candle-birthday", params: { count: 5, spacing: 6, margin: 5 } },
    { names: ["maxi tealight holder", "large tealight holder"], title: "Maxi tealight holder", spec: "candle-tealight-maxi" },
  ],
  body: `
const rin = candleD / 2;
const rout = rin + wall;
const pitch = 2 * rout + spacing;
const mid = count % 2 === 1 ? (count - 1) / 2 : -1;
// where each cup stands: a row along x, or a ring
const ringR = count < 2 ? 0 : Math.max(pitch / (2 * Math.sin(Math.PI / count)), rout + spacing / 2);
const spots = Array.from({ length: count }, (_, i) => arrange === "ring" && count > 1
  ? [ringR * Math.cos(2 * Math.PI * i / count), ringR * Math.sin(2 * Math.PI * i / count), 0]
  : [(i - (count - 1) / 2) * pitch, 0, arrange === "row" && i === mid && count > 2 ? centerLift : 0]);
// one holder: an optional stem that flares at 45 degrees into the cup
const stemR = Math.max(4, Math.min(rout * 0.4, rout - 2));
const holderAt = (lift) => {
  const col = stemH + lift;
  const r0 = col > 0 && stemH > 0 ? stemR : rout;
  const flare = col > 0 && stemH > 0 ? rout - r0 : 0;
  const zCup = baseT + col + flare;                  // the cup's floor
  const top = zCup + cupDepth;
  const pts = r0 < rout
    ? [[0, baseT - 0.5], [r0, baseT - 0.5], [r0, baseT + col], [rout, zCup], [rout, top], [rin, top], [rin, zCup], [0, zCup]]
    : [[0, baseT - 0.5], [rout, baseT - 0.5], [rout, top], [rin, top], [rin, zCup], [0, zCup]];
  return revolve(360, polygon(pts));
};
const base = count === 1 || arrange === "ring"
  ? cylinder({ r: ringR + rout + margin, h: baseT, $fn: 96 })
  : hull(translate([-(count - 1) / 2 * pitch, 0, 0], cylinder({ r: rout + margin, h: baseT, $fn: 64 })),
    translate([(count - 1) / 2 * pitch, 0, 0], cylinder({ r: rout + margin, h: baseT, $fn: 64 })));
return union(base, ...spots.map(([x, y, lift]) => translate([x, y, 0], holderAt(lift))));
`,
};
