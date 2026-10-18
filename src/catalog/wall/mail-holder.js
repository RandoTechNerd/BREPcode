// A wall pocket for mail, letters, magazines or files: a tall back plate and
// an open-topped pocket in front whose sides slope down from the back to a
// lower front, optionally split front to back into stepped pockets. Printed
// upright: every wall stands on the floor, and the screw holes through the
// back plate are teardrops (pointed on top) so they bridge cleanly.

export default {
  id: "mail-holder",
  category: "wall",
  title: "Mail holder",
  summary: "a wall pocket for mail and letters, with one or more stepped pockets.",
  print: "upright as shown, no supports.",
  names: ["mail holder", "mail organizer", "letter holder", "letter organizer", "wall mail holder", "mail sorter",
    "wall pocket", "wall organizer", "envelope holder", "letter rack", "mail rack"],
  nouns: ["holder", "organizer", "pocket", "sorter", "rack"],
  keywords: ["mail", "letter", "letters", "envelope", "bill", "paper", "wall", "post"],
  tips: ["3 pockets", "deeper", "230 mm wide"],
  examples: ["I want a mail holder", "make me a wall letter holder 220mm wide",
    "mail organizer with 3 pockets", "a wall pocket for envelopes 50mm deep"],
  params: {
    width: { default: 200, min: 60, max: 250, unit: "mm", label: "width", say: ["wide", "width", "long", "length"], more: ["wider"], less: ["narrower"] },
    depth: { default: 40, min: 15, max: 120, unit: "mm", label: "pocket depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower", "slimmer"] },
    pocketH: { default: 90, min: 30, max: 220, unit: "mm", label: "pocket height at the back", say: ["pocket", "tall", "high", "height"] },
    frontH: { default: 55, min: 10, max: 220, unit: "mm", label: "front height", say: ["front"] },
    backH: { default: 150, min: 40, max: 250, unit: "mm", label: "back plate height", say: ["back", "plate"] },
    pockets: { default: 1, min: 1, max: 4, unit: "count", label: "pockets, front to back", say: ["pocket", "slot", "compartment", "section", "tier"] },
    wall: { default: 2.4, min: 1.6, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["magazine holder", "magazine rack", "wall magazine holder", "magazine organizer"], title: "Magazine holder",
      params: { width: 230, depth: 80, pocketH: 200, frontH: 120, backH: 230 } },
    { names: ["wall file holder", "file holder", "folder holder", "file organizer", "wall file organizer"], title: "Wall file holder",
      params: { width: 250, depth: 50, pocketH: 180, frontH: 100, backH: 240 } },
    { names: ["tiered mail organizer", "mail sorter with pockets", "three pocket mail holder", "tiered letter holder"], title: "Tiered mail organizer",
      params: { pockets: 3, depth: 90, pocketH: 140, frontH: 60, backH: 180 } },
    { names: ["bill organizer", "bill holder", "two pocket mail holder"], title: "Bill organizer",
      params: { pockets: 2, width: 160, depth: 60, pocketH: 110, frontH: 50, backH: 150 } },
    { names: ["small wall pocket", "small wall organizer", "wall caddy"], title: "Small wall pocket",
      params: { width: 120, depth: 25, pocketH: 60, frontH: 35, backH: 100 } },
  ],
  body: `
// x across, y out from the wall, z up
const ph = Math.min(pocketH, backH);
const fh = Math.min(frontH, ph);
const bT = Math.max(3, wall);
const d = Math.max(depth, bT + wall + 8);
// rotate([90, 90, 0]) sends a side outline's x to y, its y to z, the width to +x
const inYZ = (pts, x, w) => translate([x, 0, 0], rotate([90, 90, 0], linearExtrude({ h: w }, polygon(pts))));
// the whole side view (back plate and the pocket's sloping sides) stretched
// across, minus the pocket itself between the two side walls
const side = [[0, 0], [d, 0], [d, fh], [bT, ph], ...(ph < backH - 0.5 ? [[bT, backH]] : []), [0, backH]];
const cavity = [[bT, wall], [d - wall, wall], [d - wall, backH + 1], [bT, backH + 1]];
const parts = [difference(inYZ(side, 0, width), inYZ(cavity, wall, width - 2 * wall))];
// stepped dividers between the pockets, each lower than the one behind it
for (let i = 1; i < pockets; i++) {
  const y = bT + (d - bT) * i / pockets;
  const h = fh + (ph - fh) * (1 - i / pockets);
  parts.push(translate([wall - 0.1, y - wall / 2, wall - 0.1], cube([width - 2 * wall + 0.2, wall, h - wall + 0.1])));
}
// countersunk screw holes through the back plate, the heads inside the pocket
const r = screwD / 2;
const zh = backH - ph >= 5 * screwD ? (ph + backH) / 2 : Math.max(wall + 2 * screwD, ph * 0.6);
const k = Math.min(r, bT - 1.2);
const holes = [width * 0.2, width * 0.8].flatMap((x) => [
  translate([x, -1, zh], rotate([-90, 0, 0], cylinder({ r, h: bT + 2, $fn: 24 }))),
  translate([x, bT - k + 0.02, zh], rotate([-90, 0, 0], cylinder({ r1: r, r2: r + k, h: k, $fn: 24 }))),
]);
return translate([-width / 2, 0, 0], difference(union(...parts), ...holes));
`,
};
