// An insert for a kitchen drawer that lays spice jars down on sloped rows,
// lids to the front and labels tilted up to read from above. A sawtooth side
// profile (a lip, a ramp, a drop to the next lip), with a window cut through
// each tooth so it is a frame rather than a block, extruded across the
// drawer. It prints lying on that profile: every wall is vertical while it
// prints. Drawers wider than the bed take two or more side by side.

export default {
  id: "spice-drawer",
  category: "kitchen",
  title: "Spice drawer insert",
  summary: "sloped rows that lay spice jars down in a drawer, lids forward and labels tilted up.",
  print: "lying on its side (the sawtooth profile on the bed), no supports. Wide drawers take two or more side by side.",
  names: ["spice drawer insert", "spice drawer organizer", "drawer spice rack", "in drawer spice rack", "angled spice tray",
    "spice tray insert", "spice drawer liner", "drawer spice organizer", "spice drawer tray"],
  nouns: ["insert", "tray", "organizer", "rack"],
  keywords: ["spice", "drawer", "jar", "angled", "slanted", "kitchen", "seasoning"],
  fits: ["jar"],
  fromSpec: (s) => ({ rowD: Math.min(140, Math.max(40, s.dims.h * 0.9 + 5)) }),
  specNote: "each row is about a jar long",
  tips: ["4 rows", "250 mm wide", "steeper"],
  examples: ["I want a spice drawer insert", "make me a spice drawer organizer with 4 rows",
    "angled spice tray 240 mm wide", "in drawer spice rack for large spice jars"],
  params: {
    rows: { default: 2, min: 1, max: 6, unit: "count", label: "rows", say: ["row", "tier", "level"] },
    rowD: { default: 95, min: 40, max: 140, unit: "mm", label: "depth of each row (about a jar long)", say: ["deep", "depth", "row"], more: ["deeper"], less: ["shallower"] },
    tilt: { default: 25, min: 10, max: 40, unit: "deg", label: "slope of each row", say: ["angle", "tilt", "slope", "degree"], more: ["steeper"], less: ["flatter"] },
    width: { default: 200, min: 60, max: 250, unit: "mm", label: "width (across the drawer)", say: ["wide", "width", "long", "length"], more: ["wider", "longer"], less: ["narrower", "shorter"] },
    wall: { default: 3, min: 2, max: 6, unit: "mm", label: "wall thickness", say: ["thick", "thickness", "wall"], more: ["stronger", "thicker"] },
    lipH: { default: 6, min: 2, max: 20, unit: "mm", label: "lip at the front of each row", say: ["lip", "stop"] },
  },
  things: [
    { names: ["large spice drawer insert", "tall spice jar drawer insert"], title: "Spice drawer insert (large jars)", spec: "spice-jar-large", params: { rows: 2 } },
    { names: ["small spice drawer insert", "single row spice tray", "one row spice tray"], title: "One-row spice tray", params: { rows: 1, width: 150 } },
    { names: ["3 row spice drawer insert", "three row spice drawer insert"], title: "3-row spice drawer insert", params: { rows: 3 } },
    { names: ["4 row spice drawer insert", "four row spice drawer insert", "deep drawer spice insert"], title: "4-row spice drawer insert", params: { rows: 4, rowD: 90 } },
    { names: ["nail polish drawer insert", "nail polish tray", "small bottle drawer insert"], title: "Small bottle drawer insert", params: { rows: 5, rowD: 50, tilt: 20, width: 180, lipH: 4, wall: 2.4 } },
    { names: ["k cup drawer insert", "coffee pod drawer insert", "pod drawer tray"], title: "Coffee pod drawer insert", params: { rows: 4, rowD: 55, tilt: 30, lipH: 8 } },
  ],
  body: `
// side profile: x runs front to back, y runs up; extruded across the width
const t = wall;
const ta = Math.tan(tilt * Math.PI / 180);
const yh = t + rowD * ta;                        // back of each ramp
const lip = Math.min(lipH, (yh - t) * 0.8);
const D = rows * rowD + t;
const outline = [[0, 0], [0, t + lip]];
for (let k = 0; k < rows; k++) {
  const x = k * rowD;
  outline.push([x + t, t + lip], [x + t, t], [x + rowD, yh]);
  if (k < rows - 1) outline.push([x + rowD, t + lip]);
}
outline.push([D, yh], [D, 0]);
let part = linearExtrude({ h: width }, polygon(outline));

// a window through each tooth, \`wall\` in from the ramp, the floor and the drop
const ca = Math.cos(tilt * Math.PI / 180);
const wins = [];
for (let k = 0; k < rows; k++) {
  const xa = k * rowD + t, xb = (k + 1) * rowD - t;
  const x0 = xa + (t / ca) / ta;
  const ytop = t + (xb - xa) * ta - t / ca;
  if (xb - x0 > 4 && ytop > t + 3) wins.push(translate([0, 0, -1], linearExtrude({ h: width + 2 }, polygon([[x0, t], [xb, t], [xb, ytop]]))));
}
if (wins.length) part = difference(part, ...wins);
return translate([-D / 2, -yh / 2, 0], part);
`,
};
