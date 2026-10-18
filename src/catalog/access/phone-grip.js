// A finger loop that sticks to the back of a phone, tablet or remote, so it
// can be held by sliding fingers through rather than by gripping its edges.
// A flat pad for adhesive with an arched band over it; one side profile
// printed lying on its side, so the arch needs no support.

export default {
  id: "phone-grip",
  category: "access",
  title: "Phone finger loop",
  summary: "a finger loop that sticks to the back of a phone, tablet or remote, for holding it without a firm grip.",
  print: "lying on its side as shown, no supports. Stick it on with strong double-sided tape (VHB).",
  names: ["phone grip", "phone finger loop", "phone loop", "finger loop", "finger loop for phone", "phone grip loop", "phone handle",
    "phone strap grip", "one handed phone grip", "phone back grip", "finger grip for phone"],
  nouns: ["grip", "loop"],
  keywords: ["phone", "finger", "loop", "back", "hold", "grip", "arthritis", "tablet"],
  tips: ["for a tablet", "taller loop", "wider"],
  examples: ["I want a phone grip", "a finger loop for the back of my phone",
    "tablet handle for my ipad", "phone finger loop 25mm wide"],
  params: {
    span: { default: 55, min: 30, max: 120, unit: "mm", label: "loop length", say: ["long", "length", "span"], more: ["longer"] },
    loopH: { default: 18, min: 10, max: 40, unit: "mm", label: "loop height", say: ["tall", "high", "height", "room"], more: ["taller", "roomier"] },
    band: { default: 3, min: 2, max: 6, unit: "mm", label: "band thickness", say: ["band", "thick"], more: ["stiffer", "thicker"] },
    loopW: { default: 22, min: 12, max: 50, unit: "mm", label: "width", say: ["wide", "width"], more: ["wider"] },
    plateL: { default: 70, min: 40, max: 150, unit: "mm", label: "pad length", say: ["pad", "plate"] },
    plateT: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "pad thickness", say: ["base"] },
  },
  things: [
    { names: ["tablet handle", "ipad grip handle", "tablet grip", "tablet finger loop", "ipad handle"], title: "Tablet handle",
      params: { span: 90, loopH: 24, loopW: 30, plateL: 120, band: 4 } },
    { names: ["remote grip", "tv remote finger loop", "remote control grip", "remote handle"], title: "Remote control grip",
      params: { span: 45, loopH: 16, loopW: 18, plateL: 55 } },
    { names: ["two finger phone grip", "big phone grip", "phone grip for arthritis"], title: "Two-finger phone grip",
      params: { span: 60, loopH: 26, loopW: 30, plateL: 80 } },
  ],
  body: `
// side profile: x runs along the phone, y runs out from its back; printed lying on it, \`loopW\` wide
const sp = Math.min(span, plateL - 4);
const arch = (a, b, n = 32) => Array.from({ length: n + 1 }, (_, i) => {
  const t = Math.PI * i / n;
  return [a * Math.cos(t), plateT + b * Math.sin(t)];
});
const outer = [[-plateL / 2, 0], [plateL / 2, 0], [plateL / 2, plateT], [sp / 2, plateT], ...arch(sp / 2, loopH).slice(1, -1), [-sp / 2, plateT], [-plateL / 2, plateT]];
const inner = [...arch(sp / 2 - band, loopH - band), [-(sp / 2 - band), plateT - 0.01], [sp / 2 - band, plateT - 0.01]];
const piece = difference(linearExtrude({ h: loopW }, polygon(outer)), translate([0, 0, -1], linearExtrude({ h: loopW + 2 }, polygon(inner))));
return translate([0, -(plateT + loopH) / 2, 0], piece);
`,
};
