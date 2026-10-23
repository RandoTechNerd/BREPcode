// A trough that screws up under a desk and carries what would otherwise
// dangle: cables, a power strip, a laptop brick. The back wall runs up to a
// flange that screws into the desk; the front wall stops short, leaving a
// gap to drop things in. One end profile, printed standing on end, so every
// wall is vertical while it prints.

export default {
  id: "under-desk-tray",
  category: "desk",
  title: "Under-desk cable tray",
  summary: "a trough that screws up under a desk to carry cables, a power strip or a laptop brick.",
  print: "standing on one end as shown, no supports. Screws go up through the flange into the desk.",
  names: ["under desk cable tray", "under desk tray", "cable tray", "cable management tray", "desk cable tray", "under desk cable management",
    "cable trough", "under desk cable basket", "cable management basket", "wire tray under desk"],
  nouns: ["tray", "trough", "basket"],
  keywords: ["under", "desk", "cable", "wire", "cord", "management", "power"],
  fits: ["strip"],
  fromSpec: (s) => ({ innerW: s.dims.w + 3, innerH: s.dims.h + 3, frontH: Math.round(s.dims.h * 0.7), length: Math.min(250, Math.max(60, s.dims.len * 0.6)) }),
  specNote: "two of these under a long strip",
  tips: ["80 mm wide inside", "250 mm long", "for a power strip"],
  examples: ["I want an under desk cable tray", "a power strip holder under my desk",
    "cable management tray 250mm long", "under desk tray for my surge protector"],
  params: {
    innerW: { default: 60, min: 20, max: 200, unit: "mm", label: "inside width", say: ["wide", "width", "inside"], more: ["wider"], less: ["narrower"] },
    innerH: { default: 50, min: 15, max: 150, unit: "mm", label: "inside height", say: ["tall", "high", "height", "deep", "depth"], more: ["deeper", "taller"], less: ["shallower"] },
    length: { default: 200, min: 40, max: 250, unit: "mm", label: "length", say: ["long", "length"], more: ["longer"], less: ["shorter"] },
    frontH: { default: 30, min: 5, max: 150, unit: "mm", label: "front wall height", say: ["front", "lip"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["wall", "thick", "thickness"], more: ["sturdier", "thicker"] },
    flange: { default: 18, min: 10, max: 40, unit: "mm", label: "screw flange width", say: ["flange", "tab"] },
    screwD: { default: 4, min: 3, max: 5.5, unit: "mm", label: "screw diameter", say: ["screw"] },
  },
  things: [
    { names: ["power strip holder", "power strip mount", "under desk power strip holder", "surge protector holder", "surge protector mount",
      "power strip bracket", "power bar holder"], title: "Power strip holder", spec: "strip-power-strip" },
    { names: ["laptop brick holder", "power brick holder", "power adapter holder", "charger brick holder", "power supply holder"],
      title: "Power brick holder", spec: "strip-laptop-brick" },
    { names: ["deep cable tray", "big cable tray", "cable box under desk"], title: "Deep cable tray", params: { innerW: 100, innerH: 80, frontH: 50, wall: 3.5 } },
    { names: ["small cable tray", "cable channel under desk", "narrow cable tray"], title: "Small cable tray", params: { innerW: 30, innerH: 25, frontH: 15, wall: 2.4 } },
    { names: ["under desk phone tray", "under desk shelf tray", "hidden desk tray"], title: "Under-desk catch tray", params: { innerW: 120, innerH: 35, frontH: 30, length: 180 } },
  ],
  body: `
// end profile: x runs front to back under the desk, y runs up (desk underside at y = H)
const t = wall;
const H = innerH + 2 * t;
const fh = Math.min(frontH, innerH + t);
const xf = t + innerW;                           // inside face of the front wall
const outline = [[-flange, H], [t, H], [t, t], [xf, t], [xf, fh], [xf + t, fh], [xf + t, 0], [0, 0], [0, H - t], [-flange, H - t]];
const trough = linearExtrude({ h: length }, polygon(outline));
// screw holes up through the flange, countersunk from below
const k = screwD / 2;
const zs = length < 90 ? [length / 2] : [length * 0.2, length * 0.8];
const holes = zs.flatMap((z) => [
  translate([-flange / 2, H + 1, z], rotate([90, 0, 0], cylinder({ r: screwD / 2, h: t + 2, $fn: 24 }))),
  translate([-flange / 2, H - t + k - 0.02, z], rotate([90, 0, 0], cylinder({ r1: screwD / 2, r2: screwD / 2 + k, h: k, $fn: 24 }))),
]);
return translate([(flange - xf - t) / 2, -H / 2, 0], difference(trough, ...holes));
`,
};
