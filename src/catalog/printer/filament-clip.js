// A clip that pushes onto the rim of a spool and holds the loose end of the
// filament, so it never springs off and tangles. Two arms grip the spool's
// side wall a little tighter than it is thick; a block on the end has a hole
// the filament snaps into from the side through a slit narrower than it.
// One flat profile, printed lying down.

export default {
  id: "filament-clip",
  category: "printer",
  title: "Filament clip",
  summary: "a clip that pushes onto a spool's rim and holds the loose filament end so it never tangles.",
  print: "flat as shown, no supports. PETG springs back best.",
  names: ["filament clip", "spool clip", "filament end clip", "filament spool clip", "filament holder clip",
    "filament keeper", "filament end holder", "spool edge clip", "filament tail clip", "filament retainer"],
  nouns: ["clip", "keeper", "retainer"],
  keywords: ["filament", "spool", "end", "tangle", "printer"],
  primary: "filD",
  tips: ["for 2.85 mm filament", "for a 4 mm thick spool wall", "longer arms"],
  examples: ["make me a filament clip", "spool clip for 2.85mm filament",
    "filament end clip for a spool with 4 mm sides", "a filament keeper for my spools"],
  params: {
    filD: { default: 1.75, min: 1.5, max: 3.2, unit: "mm", label: "filament diameter", say: ["filament", "diameter"] },
    flangeT: { default: 3, min: 1, max: 8, unit: "mm", label: "spool wall thickness it grips", say: ["spool", "wall", "side", "rim", "flange"] },
    armL: { default: 12, min: 6, max: 30, unit: "mm", label: "arm length", say: ["arm", "long", "length"], more: ["longer"], less: ["shorter"] },
    armT: { default: 2, min: 1.2, max: 4, unit: "mm", label: "arm thickness", say: ["thick", "stiff"], more: ["stiffer", "stronger"], less: ["softer"] },
    clipW: { default: 8, min: 4, max: 20, unit: "mm", label: "clip width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
  },
  things: [
    { names: ["1.75 filament clip", "1.75mm filament clip", "1.75 spool clip"], title: "1.75 mm filament clip", params: { filD: 1.75 } },
    { names: ["2.85 filament clip", "2.85mm filament clip", "3mm filament clip", "2.85 spool clip"], title: "2.85 mm filament clip", params: { filD: 2.85 } },
    { names: ["cardboard spool clip", "thick spool clip"], title: "Cardboard spool clip", params: { flangeT: 5, armL: 14 } },
    { names: ["thin spool clip", "sample spool clip", "mini spool clip"], title: "Thin spool clip", params: { flangeT: 1.6, armL: 9, armT: 1.6 } },
  ],
  body: `
const a = armT;
const g = Math.max(0.6, flangeT - 0.3);              // a little tighter than the wall: it grips
const hb = filD + 2 * a + 1;                         // the block that holds the filament
const blk = Math.max(filD + 2 * a + 2, 6);
const L = blk + armL;
const lead = Math.min(1.2, armL / 4);                // a lead-in at the mouth
const outline = [
  [0, -hb], [blk, -hb], [blk, 0], [L, 0], [L, a * 0.5], [L - lead, a], [blk, a],
  [blk, a + g], [L - lead, a + g], [L, a + g + a * 0.5], [L, 2 * a + g], [0, 2 * a + g],
];
const clip = linearExtrude({ h: clipW }, polygon(outline));
// the filament runs up through the block; it goes in sideways through a slit narrower than it
const yc = -hb / 2;
return translate([-L / 2, 0, 0], difference(clip,
  translate([blk / 2, yc, -1], cylinder({ d: filD + 0.15, h: clipW + 2, $fn: 24 })),
  translate([-1, yc - filD * 0.375, -1], cube([blk / 2 + 1, filD * 0.75, clipW + 2])),
));
`,
};
