// A playing-card holder for anyone who cannot hold a fanned hand: a weighted
// bar with a V-slot along the top that pinches the cards' bottom edges. Two
// or three slots step up toward the back, like seats in a theatre, so every
// row shows. One stepped end profile pushed along the length, with the slots
// cut down from the top.

export default {
  id: "card-hand-holder",
  category: "access",
  title: "Playing card holder",
  summary: "a bar with a pinching V-slot (or stepped rows of them) that holds a hand of cards upright.",
  print: "upright as shown, no supports.",
  names: ["playing card holder", "card holder for playing cards", "hand of cards holder", "card hand holder", "card game holder",
    "hands free card holder", "card holder for arthritis", "playing card stand", "card holder for kids"],
  nouns: ["holder", "rack"],
  keywords: ["playing", "cards", "card", "hand", "game", "kids", "arthritis", "poker", "uno"],
  tips: ["2 rows", "longer", "for dominoes"],
  examples: ["I want a playing card holder", "a card holder for kids with 2 rows",
    "hands free card holder 200mm long", "make me a domino holder"],
  params: {
    length: { default: 180, min: 60, max: 250, unit: "mm", label: "length", say: ["long", "length", "wide"], more: ["longer"], less: ["shorter"] },
    height: { default: 22, min: 12, max: 45, unit: "mm", label: "front row height", say: ["tall", "high", "height"] },
    slots: { default: 1, min: 1, max: 3, unit: "count", label: "rows", say: ["row", "slot", "tier"] },
    slotTop: { default: 2.6, min: 1, max: 14, unit: "mm", label: "slot width at the top", say: ["slot", "gap"] },
    slotBottom: { default: 0.6, min: 0.3, max: 13, unit: "mm", label: "slot width at the bottom (the pinch)", say: ["pinch", "tight"] },
    slotDepth: { default: 15, min: 5, max: 35, unit: "mm", label: "slot depth", say: ["deep", "depth"] },
    rise: { default: 12, min: 0, max: 25, unit: "mm", label: "each row higher than the last by", say: ["rise", "step"] },
    base: { default: 34, min: 18, max: 70, unit: "mm", label: "base depth (front to back, one row)", say: ["base", "foot"] },
  },
  things: [
    { names: ["kids card holder", "card holder for children", "small card holder"], title: "Kids card holder", params: { length: 150, height: 20 } },
    { names: ["two row card holder", "double card holder", "2 row card holder", "two tier card holder"], title: "Two-row card holder",
      params: { slots: 2, length: 200 } },
    { names: ["uno card holder", "large card holder", "big card holder"], title: "Large card holder", params: { length: 230, slots: 2, slotTop: 3.2 } },
    { names: ["domino holder", "domino rack", "domino stand", "dominoes holder", "dominoes rack", "mexican train domino holder"], title: "Domino rack",
      params: { length: 200, height: 22, slotTop: 11.5, slotBottom: 10.6, slotDepth: 12, base: 30 } },
    { names: ["tile rack", "game tile holder", "letter tile holder"], title: "Tile rack",
      params: { length: 190, height: 20, slotTop: 6, slotBottom: 5.2, slotDepth: 8, base: 28 } },
  ],
  body: `
// end profile: x runs front to back, y runs up; pushed along the length
const st = Math.max(slotTop, slotBottom + 0.2);
const band = st + 12;                            // depth each extra row adds
const D = base + (slots - 1) * band;
const yc = (k) => base / 2 + k * band;           // slot k's centre
const top = (k) => height + k * rise;
const prof = [[0, 0], [D, 0], [D, top(slots - 1)]];
for (let k = slots - 1; k >= 1; k--) prof.push([yc(k) - band / 2, top(k)], [yc(k) - band / 2, top(k - 1)]);
prof.push([Math.min(4, base / 6), top(0)], [0, top(0) - Math.min(4, base / 6)]);
// a profile (x, y) pushed along x from 0 to the length
const along = (pts, h) => rotate([0, 0, 90], rotate([90, 0, 0], linearExtrude({ h }, polygon(pts))));
const bar = along(prof, length);
const sd = (k) => Math.min(slotDepth, top(k) - 3);
const cuts = Array.from({ length: slots }, (_, k) => translate([-1, 0, 0], along([[yc(k) - st / 2, top(k) + 1], [yc(k) - slotBottom / 2, top(k) - sd(k)],
  [yc(k) + slotBottom / 2, top(k) - sd(k)], [yc(k) + st / 2, top(k) + 1]], length + 2)));
return translate([-length / 2, -D / 2, 0], difference(bar, ...cuts));
`,
};
