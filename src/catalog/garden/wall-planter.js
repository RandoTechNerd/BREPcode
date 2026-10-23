// A wall planter: a half-oval pocket on a flat back plate, hung on a screw
// through a keyhole above it. The pocket is one plan outline extruded
// straight up, so it prints standing on its floor with every wall vertical.

export default {
  id: "wall-planter",
  category: "garden",
  title: "Wall planter",
  summary: "a half-oval pocket planter on a flat back plate with a keyhole to hang it.",
  print: "standing upright on its floor as shown, no supports. No drain hole by default, for indoor walls.",
  names: ["wall planter", "wall pocket planter", "wall mounted planter", "wall plant pot", "wall hanging planter",
    "wall pot", "flat back planter", "wall vase"],
  nouns: ["planter", "pot", "pocket", "vase"],
  keywords: ["wall", "mounted", "keyhole", "plant", "succulent", "fence"],
  primary: "width",
  tips: ["150 mm wide", "deeper pocket", "with a drain hole"],
  examples: ["I want a wall planter", "make me a wall mounted planter 150mm wide",
    "wall pocket planter for succulents", "a flat back planter to hang on a fence"],
  params: {
    width: { default: 120, min: 50, max: 240, unit: "mm", label: "width", say: ["wide", "width", "across"], more: ["wider"], less: ["narrower"] },
    depth: { default: 60, min: 25, max: 120, unit: "mm", label: "how far it stands off the wall", say: ["deep", "depth", "out"], more: ["deeper"], less: ["shallower", "slimmer"] },
    height: { default: 90, min: 30, max: 200, unit: "mm", label: "pocket height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    wall: { default: 2.2, min: 1.2, max: 5, unit: "mm", label: "wall thickness", say: ["wall"] },
    plateUp: { default: 25, min: 20, max: 60, unit: "mm", label: "back plate above the pocket", say: ["plate", "above"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw size for the keyhole", say: ["screw", "keyhole"] },
    drain: { default: 0, min: 0, max: 20, unit: "mm", label: "drain hole (0 = none)", say: ["drain", "drainage"] },
  },
  things: [
    { names: ["air plant holder", "air plant wall holder", "air plant wall mount"], title: "Air plant holder",
      params: { width: 70, depth: 35, height: 40, wall: 1.8 } },
    { names: ["wall succulent planter", "succulent wall planter"], title: "Succulent wall planter", params: { width: 100, depth: 50, height: 60 } },
    { names: ["fence planter", "fence mounted planter", "outdoor wall planter"], title: "Fence planter",
      params: { width: 200, depth: 90, height: 130, wall: 2.6, plateUp: 35, drain: 8 } },
    { names: ["dried flower wall vase", "wall bud vase", "wall flower holder"], title: "Wall vase",
      params: { width: 60, depth: 35, height: 140, plateUp: 30 } },
    { names: ["propagation wall pocket", "cutting wall vase"], title: "Propagation pocket", params: { width: 80, depth: 40, height: 110 } },
  ],
  body: `
const bt = wall + 1.5;                                   // back plate thickness
const a = width / 2, b = Math.max(depth - bt, 8);        // the half-oval's semi-axes
const halfOval = (sa, sb, y0, n = 40) => [
  ...Array.from({ length: n + 1 }, (_, i) => {
    const t = Math.PI * i / n;
    return [sa * Math.cos(t), y0 + sb * Math.sin(t)];
  }),
];
// the pocket: from the plate face out and round, extruded straight up
const outer = linearExtrude({ h: height }, polygon([[a, 0], ...halfOval(a, b, bt), [-a, 0]]));
const cavity = translate([0, 0, wall], linearExtrude({ h: height }, polygon(halfOval(a - wall, b - wall, bt))));
const pocket = difference(outer, cavity);

// the back plate, up past the pocket, with a keyhole through it above the soil
const plate = translate([-a, 0, 0], cube([width, bt, height + plateUp]));
const headR = screwD * 0.95, slotL = screwD * 1.3, slotR = screwD * 0.55;
const zk = height + (plateUp - headR - slotL - slotR) / 2 + headR;   // centre of the round head
const through = (x, z, r) => translate([x, -1, z], rotate([-90, 0, 0], cylinder({ r, h: bt + 2, $fn: 24 })));
const keyhole = union(
  through(0, zk, headR),
  translate([-slotR, -1, zk], cube([2 * slotR, bt + 2, slotL])),
  through(0, zk + slotL, slotR),
);
let part = difference(union(pocket, plate), keyhole);
if (drain > 0) part = difference(part, translate([0, bt + b / 2, -1], cylinder({ r: drain / 2, h: wall + 2, $fn: 24 })));
return part;
`,
};
