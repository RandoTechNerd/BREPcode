// A little cabinet of drawers. The cabinet prints lying on its back, so the
// shelves between drawers stand straight up off the bed instead of bridging
// across it; the drawers print upright beside it, each with a pull whose
// underside is a 45 degree wedge. Rows and columns set the grid; every drawer
// is the slot it lives in, less the clearance.

export default {
  id: "drawer-cabinet",
  category: "storage",
  title: "Mini drawer cabinet",
  summary: "a small cabinet with a grid of pull-out drawers, for screws, beads, parts and bits.",
  print: "cabinet on its back, drawers upright beside it, no supports.",
  names: ["mini drawers", "drawer unit", "drawer cabinet", "small drawers", "storage drawers", "parts drawers",
    "drawer box", "mini chest of drawers", "drawer tower", "tiny drawers", "mini drawer cabinet", "drawer organizer cabinet",
    "small parts drawers"],
  nouns: ["cabinet", "chest"],
  keywords: ["drawer", "parts", "small", "mini", "organizer", "workshop"],
  triple: ["width", "height", "depth"],
  tips: ["4 rows", "2 columns", "150 x 120 x 100"],
  examples: ["make me mini drawers", "a drawer unit with 4 rows and 2 columns",
    "small parts drawers 150 x 120 x 100", "a mini drawer cabinet for beads"],
  params: {
    width: { default: 110, min: 50, max: 220, unit: "mm", label: "cabinet width", say: ["wide", "width"], more: ["wider"], less: ["narrower"] },
    height: { default: 100, min: 40, max: 220, unit: "mm", label: "cabinet height", say: ["tall", "high", "height"], more: ["taller"], less: ["shorter"] },
    depth: { default: 90, min: 40, max: 180, unit: "mm", label: "cabinet depth", say: ["deep", "depth"], more: ["deeper"], less: ["shallower"] },
    rows: { default: 3, min: 1, max: 6, unit: "count", label: "rows of drawers", say: ["row", "rows", "drawer", "high"] },
    cols: { default: 1, min: 1, max: 3, unit: "count", label: "columns of drawers", say: ["column", "columns", "across", "wide"] },
    wall: { default: 1.6, min: 1.2, max: 3, unit: "mm", label: "wall thickness", say: ["wall"] },
    fit: { default: 0.4, min: 0.2, max: 1, unit: "mm", label: "drawer clearance per side", say: ["fit", "clearance", "loose"] },
  },
  things: [
    { names: ["screw drawers", "hardware drawers", "screw storage drawers", "nut and bolt drawers"], title: "Screw drawers",
      params: { width: 140, height: 120, depth: 100, rows: 4, cols: 2 } },
    { names: ["bead drawers", "bead storage drawers", "craft drawers", "sewing drawers"], title: "Bead drawers",
      params: { width: 120, height: 100, depth: 80, rows: 4, cols: 2, wall: 1.2 } },
    { names: ["jewelry drawers", "jewellery drawers", "ring drawers"], title: "Jewelry drawers",
      params: { width: 120, height: 90, depth: 90, rows: 3, cols: 1 } },
    { names: ["component drawers", "resistor drawers", "electronics drawers", "smd drawers"], title: "Component drawers",
      params: { width: 120, height: 150, depth: 90, rows: 6, cols: 2, wall: 1.2 } },
    { names: ["sd card drawers", "memory card drawers"], title: "SD card drawers", params: { width: 70, height: 70, depth: 50, rows: 3, cols: 1 } },
    { names: ["stackable drawers", "drawer module", "stacking drawer unit"], title: "Stackable drawers", params: { width: 120, height: 60, depth: 100, rows: 1, cols: 2 } },
  ],
  body: `
// effective grid: every slot at least 10 mm high and 14 mm wide
const nr = Math.max(1, Math.min(rows, Math.floor((height - wall) / (10 + wall))));
const nc = Math.max(1, Math.min(cols, Math.floor((width - wall) / (14 + wall))));
const slotW = (width - wall * (nc + 1)) / nc;
const slotH = (height - wall * (nr + 1)) / nr;
// the cabinet lies on its back: x across, y up the cabinet, z is the depth
const cabinet = difference(
  cube([width, height, depth]),
  ...Array.from({ length: nr * nc }, (_, k) => {
    const i = k % nc, j = Math.floor(k / nc);
    return translate([wall + i * (slotW + wall), wall + j * (slotH + wall), wall], cube([slotW, slotH, depth]));
  }),
);
// one drawer: x across, y front (0) to back, z up
const dw = slotW - 2 * fit, dh = slotH - 2 * fit, dd = depth - wall - fit;
const dt = Math.max(1.2, wall * 0.75);
const pw = Math.min(30, dw * 0.45), po = Math.min(6, dh * 0.4);   // pull width and how far it stands out
// rotate([90, 90, 0]) sends the profile's x to y, its y to z, and the extrusion to +x
const pull = translate([(dw - pw) / 2, 0, 0], rotate([90, 90, 0], linearExtrude({ h: pw },
  polygon([[0.01, dh - po - 1.5], [-po, dh - 1.5], [-po, dh], [0.01, dh]]))));
const drawer = union(
  difference(cube([dw, dd, dh]), translate([dt, dt, dt], cube([dw - 2 * dt, dd - 2 * dt, dh]))),
  pull,
);
// lay them out: cabinet first, then drawers, two to a row of the plate
const cellW = Math.max(width, dw) + 8, cellD = Math.max(height, dd + po) + 8;
const pieces = [cabinet, ...Array.from({ length: nr * nc }, () => translate([0, po, 0], drawer))];
const placed = pieces.map((p, k) => translate([(k % 2) * cellW, Math.floor(k / 2) * cellD, 0], p));
const rowsUsed = Math.ceil(pieces.length / 2);
return translate([-cellW + 4, -rowsUsed * cellD / 2 + 4, 0], group(...placed));
`,
};
