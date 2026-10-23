// A shower shelf for bottles, soap and razors: a corner shelf (quarter
// round or triangular) or a straight one, with back walls, a low front lip
// and drain holes so nothing sits in water. It prints exactly as it hangs,
// shelf down on the bed with the walls and lip rising from it, so every wall
// is vertical; the walls slope down toward the front, there is a 45 degree
// fillet along each inside joint, and the screw holes through the walls are
// teardrops pointed up, countersunk on the inside.

export default {
  id: "shower-shelf",
  category: "bathroom",
  title: "Shower shelf",
  summary: "a corner or straight shower shelf with a front lip, drain holes and screw or tape mounting.",
  print: "as shown, shelf flat on the bed, walls up; no supports. PETG or ASA in a shower.",
  names: ["shower shelf", "corner shower shelf", "shower corner shelf", "bathroom corner shelf", "shower caddy shelf",
    "corner shelf for the shower", "shower wall shelf", "bath shelf", "shower ledge shelf"],
  nouns: ["shelf", "caddy", "ledge"],
  keywords: ["shower", "bathroom", "bath", "tub", "corner", "shampoo", "drain", "tile"],
  primary: "size",
  tips: ["triangle", "straight, 220 mm long", "with tape", "taller lip"],
  examples: ["I want a corner shower shelf", "make me a shower shelf 200 mm across with a 15 mm lip",
    "a straight shower shelf with tape", "triangular corner shower shelf"],
  params: {
    shape: { default: "corner", unit: "choice", choices: ["corner", "triangle", "straight"], label: "shape",
      words: { triangle: ["triangle", "triangular"], straight: ["straight", "flat wall", "long", "rectangular"], corner: ["corner", "quarter round", "rounded"] } },
    size: { default: 180, min: 60, max: 250, unit: "mm", label: "size along each wall (straight: its length)", say: ["across", "wide", "width", "long", "length", "size", "big"], more: ["bigger", "wider", "longer"], less: ["smaller", "narrower"] },
    depth: { default: 100, min: 40, max: 200, unit: "mm", label: "straight shelf: how far it sticks out", say: ["deep", "depth", "out"], more: ["deeper"], less: ["shallower"] },
    plateT: { default: 4, min: 3, max: 8, unit: "mm", label: "shelf thickness", say: ["thick", "thickness"], more: ["thicker", "stronger"] },
    wallH: { default: 70, min: 20, max: 160, unit: "mm", label: "back wall height", say: ["tall", "high", "height", "back", "wall"], more: ["taller"], less: ["lower"] },
    wallT: { default: 4, min: 3, max: 8, unit: "mm", label: "back wall thickness", say: ["wall"] },
    lipH: { default: 14, min: 0, max: 50, unit: "mm", label: "front lip height (0 = none)", say: ["lip", "rail", "edge", "rim"], more: ["deeper"] },
    lipT: { default: 3, min: 2, max: 6, unit: "mm", label: "front lip thickness", say: ["lip"] },
    drainD: { default: 6, min: 0, max: 12, unit: "mm", label: "drain holes (0 = none)", say: ["drain", "hole"] },
    screwD: { default: 4.5, min: 3, max: 6, unit: "mm", label: "screw hole diameter", say: ["screw"] },
    mount: { default: "screws", unit: "choice", choices: ["screws", "tape"], label: "how it mounts",
      words: { tape: ["tape", "adhesive", "stick on", "no screws", "no drilling", "command strip", "sticky"], screws: ["screws", "screw", "screwed"] } },
  },
  things: [
    { names: ["shampoo shelf", "shampoo bottle shelf", "shower bottle shelf", "shampoo holder shelf", "conditioner shelf"],
      title: "Shampoo shelf", params: { shape: "straight", size: 220, depth: 90, lipH: 18 } },
    { names: ["shower caddy", "shower basket", "shower caddy basket", "shower organizer", "shower storage caddy"],
      title: "Shower caddy", params: { shape: "straight", size: 230, depth: 110, lipH: 40, wallH: 90, drainD: 8 } },
    { names: ["razor shelf", "shower razor shelf", "small shower shelf", "mini shower shelf", "shaving shelf"],
      title: "Razor shelf", params: { shape: "straight", size: 120, depth: 55, lipH: 8, wallH: 40, drainD: 5 } },
    { names: ["bathroom corner shelf", "corner bathroom shelf", "vanity corner shelf", "small corner shelf", "corner shelf for bathroom"],
      title: "Bathroom corner shelf", params: { shape: "corner", size: 200, lipH: 8, drainD: 0 } },
    { names: ["soap shelf", "shower soap shelf", "triangle soap shelf"],
      title: "Soap shelf", params: { shape: "triangle", size: 130, lipH: 10, wallH: 45, drainD: 7 } },
    { names: ["triangle shower shelf", "triangular shower shelf", "triangular corner shelf", "triangle corner shelf"],
      title: "Triangular shower shelf", params: { shape: "triangle", size: 200 } },
    { names: ["bathtub shelf", "tub corner shelf", "bathtub corner shelf", "tub shelf", "bath tub shelf"],
      title: "Bathtub corner shelf", params: { shape: "corner", size: 160, lipH: 12, wallH: 55 } },
    { names: ["adhesive shower shelf", "stick on shower shelf", "no drill shower shelf", "tape shower shelf"],
      title: "Adhesive shower shelf", params: { mount: "tape", wallH: 80 } },
  ],
  body: `
// print = as hung: the shelf on the bed (z = 0), walls rising; the corner is at the origin
const R = size;
const straight = shape === "straight", tri = shape === "triangle";
const Dp = straight ? depth : R;
const lip = Math.min(lipH, 40);
const H = Math.max(wallH, lip + 12, plateT + 14);
const g = Math.min(6, H / 6);                         // 45 degree fillet along the inside of each wall
const arcN = (r, a0, a1, n = 36) => Array.from({ length: n + 1 }, (_, i) => {
  const t = a0 + (a1 - a0) * i / n;
  return [r * Math.cos(t), r * Math.sin(t)];
});
const rc = Math.min(12, R / 4, Dp / 4);
// the shelf outline, and the same outline pulled in by the lip's thickness; both run
// past the walls (e) and are trimmed there, so the lip never shares a face with a wall
const outline = (k) => {
  const e = -1 - k;
  if (straight) return [[k, e], [R - k, e],
    ...arcN(rc - k, 0, Math.PI / 2, 8).map(([x, y]) => [x + R - rc, y + Dp - rc]),
    ...arcN(rc - k, Math.PI / 2, Math.PI, 8).map(([x, y]) => [x + rc, y + Dp - rc])];
  const L = R - k * Math.SQRT2;
  if (tri) return [[e, e], [L - e, e], [e, L - e]];
  return [[e, e], [R - k, e], ...arcN(R - k, 0, Math.PI / 2), [e, R - k]];
};
// slab(): the outline, extruded and hull()ed into a faceted solid, so the drain holes cut fast
const slab = (k, z, h) => hull(translate([0, 0, z], linearExtrude({ h }, polygon(outline(k)))));
const plate = intersection(slab(0, 0, plateT), translate([0, 0, -1], cube([R + 1, Dp + 1, plateT + 2])));

// drain holes on a grid, clear of the walls and the lip
const holes = [];
if (drainD > 0) {
  const m = drainD / 2 + 2.5;
  const x0 = straight ? lipT + m : wallT + g + m;
  const inside = (x, y) => y > wallT + g + m && (straight
    ? x < R - lipT - m && y < Dp - lipT - m
    : x > x0 && (tri ? x + y < R - (lipT + m) * Math.SQRT2 : Math.hypot(x, y) < R - lipT - m));
  const area = straight ? R * Dp : tri ? R * R / 2 : Math.PI * R * R / 4;
  const pitch = Math.max(drainD * 2.2, Math.sqrt(area / 80));
  for (let x = x0; x < R; x += pitch) {
    for (let y = wallT + g + m; y < Dp; y += pitch) {
      if (inside(x, y)) holes.push(translate([x, y, -1], cylinder({ r: drainD / 2, h: plateT + 2, $fn: 16 })));
    }
  }
}
const parts = [holes.length ? difference(plate, ...holes) : plate];

// a profile drawn in (x, z) and stood up as a wall from y0 to y0 + t; and one drawn in (y, z) from x0 to x0 + t
const inXZ = (pts, y0, t) => translate([0, y0 + t, 0], rotate([90, 0, 0], linearExtrude({ h: t }, polygon(pts))));
const inYZ = (pts, x0, t) => translate([x0, 0, 0], rotate([90, 90, 0], linearExtrude({ h: t }, polygon(pts))));
// a back wall, sloping down toward its front end
const wallPts = (len) => [[0, 0], [len, 0], [len, lip + plateT + 2], [len * 0.55, H], [0, H]];
const endA = straight ? R : tri ? R - wallT : Math.sqrt(R * R - wallT * wallT);
parts.push(inXZ(straight ? [[0, 0], [R, 0], [R, lip + plateT + 2], [R - Math.min(40, R * 0.2), H], [Math.min(40, R * 0.2), H], [0, lip + plateT + 2]] : wallPts(endA), 0, wallT));
const filletA = [[wallT - 0.01, plateT - 0.01], [wallT + g, plateT - 0.01], [wallT - 0.01, plateT + g]];
const runA = straight ? R : tri ? R - wallT - g - 1 : Math.sqrt(R * R - (wallT + g) ** 2) - 1;
parts.push(inYZ(filletA, straight ? 0 : wallT - 0.01, runA - (straight ? 0 : wallT - 0.01)));
if (!straight) {
  parts.push(inYZ(wallPts(endA), 0, wallT));
  parts.push(inXZ(filletA, wallT - 0.01, runA - wallT + 0.01));
}
// the front lip: the outline minus the outline pulled in by its thickness
if (lip > 0) {
  const band = difference(slab(0, plateT - 0.01, lip + 0.01), slab(lipT, plateT - 0.5, lip + 1));
  parts.push(intersection(band, translate([0, 0, 0], cube([R + 1, Dp + 1, plateT + lip + 1]))));
}
let part = union(...parts);

// screw holes: teardrops (pointed up) through the walls, countersunk on the inside
if (mount === "screws") {
  const r = screwD / 2;
  const zs = plateT + g + (H - plateT - g) * 0.55;
  const tear = polygon([...Array.from({ length: 25 }, (_, i) => {
    const t = 3 * Math.PI / 4 + i * (3 * Math.PI / 2) / 24;
    return [r * Math.cos(t), r * Math.sin(t)];
  }), [0, r * Math.SQRT2]]);
  const cuts = [];
  const along = straight ? [R * 0.25, R * 0.75] : [Math.min(R * 0.3, endA * 0.45)];
  for (const s of along) {
    cuts.push(translate([s, wallT + 1, zs], rotate([90, 0, 0], linearExtrude({ h: wallT + 2 }, tear))));
    cuts.push(translate([s, wallT + 0.01, zs], rotate([90, 0, 0], cylinder({ r1: 2 * r, r2: r, h: r, $fn: 32 }))));
    if (!straight) {
      cuts.push(translate([-1, s, zs], rotate([90, 90, 0], linearExtrude({ h: wallT + 2 }, tear))));
      cuts.push(translate([wallT + 0.01, s, zs], rotate([0, -90, 0], cylinder({ r1: 2 * r, r2: r, h: r, $fn: 32 }))));
    }
  }
  part = difference(part, ...cuts);
}
// turned so the walls are at the back of the view, still square to the bed
return rotate([0, 0, 180], translate([-R / 2, straight ? 0 : -R / 2, 0], part));
`,
};
