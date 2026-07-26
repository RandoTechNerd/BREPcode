// JSCAD (@jscad/modeling) compatibility layer for BrepScript.
//
// JSCAD is already JavaScript, so this is a mapping layer rather than a parser.
// Two conventions differ from ours and are converted here:
//   * JSCAD primitives are CENTRED on the origin; ours follow OpenSCAD.
//   * JSCAD rotations are in RADIANS; ours are in degrees.
//
// Usage mirrors @jscad/modeling:
//   import { primitives, booleans, transforms } from "brepscript/jscad";
//   const { cuboid, cylinder } = primitives;

import * as dsl from "./dsl.js";
import { isProfile, profileOp, profileToSolid, offsetPolygon } from "./openscad.js";

const RAD2DEG = 180 / Math.PI;
const vec3 = (v, fallback = 0) =>
  Array.isArray(v) ? [v[0] ?? fallback, v[1] ?? fallback, v[2] ?? fallback]
    : [v ?? fallback, v ?? fallback, v ?? fallback];

const atCenter = (shape, center) => {
  const c = vec3(center ?? [0, 0, 0]);
  return (c[0] || c[1] || c[2]) ? dsl.translate(c, shape) : shape;
};

// ---------------------------------------------------------------- primitives

// JSCAD's cuboid is centred on `center`; ours puts a corner at the origin.
export function cuboid({ size = [2, 2, 2], center = [0, 0, 0] } = {}) {
  const [x, y, z] = vec3(size, 2);
  return dsl.translate(
    [center[0] - x / 2, center[1] - y / 2, center[2] - z / 2],
    dsl.cube([x, y, z]),
  );
}

export function cube({ size = 2, center = [0, 0, 0] } = {}) {
  return cuboid({ size: vec3(size, 2), center });
}

export function sphere({ radius = 1, segments = 32, center = [0, 0, 0] } = {}) {
  return atCenter(dsl.sphere({ r: radius, $fn: segments }), center);
}

// JSCAD's cylinder straddles the origin; ours starts at z = 0.
export function cylinder({ radius = 1, height = 2, segments = 32, center = [0, 0, 0] } = {}) {
  return atCenter(dsl.cylinder({ r: radius, h: height, $fn: segments, center: true }), center);
}

export function cylinderElliptic({ startRadius, endRadius, height = 2, segments = 32, center = [0, 0, 0] } = {}) {
  const r1 = Array.isArray(startRadius) ? startRadius[0] : startRadius ?? 1;
  const r2 = Array.isArray(endRadius) ? endRadius[0] : endRadius ?? 1;
  return atCenter(dsl.cylinder({ r1, r2, h: height, $fn: segments, center: true }), center);
}

export function torus({ innerRadius = 1, outerRadius = 4, outerSegments = 32, center = [0, 0, 0] } = {}) {
  return atCenter(dsl.torus({ r: outerRadius, tube: innerRadius, $fn: outerSegments }), center);
}

// roundedCylinder({height, radius, roundRadius}) — a cylinder whose top and
// bottom rims are rounded over. Built by composition rather than a kernel
// fillet: a full-height core at (radius - roundRadius), a straight wall band
// spanning the middle, and a torus at each rim. Every piece is an exact
// primitive, so it stays parametric and never depends on edge-detection
// succeeding on a curved face.
export function roundedCylinder({
  height = 2, radius = 1, roundRadius = 0.2, segments = 32, center = [0, 0, 0],
} = {}) {
  const h = Math.max(height, 1e-6);
  const r = Math.max(radius, 1e-6);
  // A round bigger than the shape has nowhere to go. Clamp it, then check what
  // survives: once the straight wall AND the flat core are both gone there is
  // no cylinder left, only the rim sweep — that shape is a sphere. Building it
  // as one avoids handing the kernel a stack of zero-thickness pieces.
  const rr = Math.max(Math.min(roundRadius, r, h / 2), 0);
  if (rr <= 1e-9) return cylinder({ radius: r, height: h, segments, center });
  const coreR = r - rr, bandH = h - 2 * rr;
  if (coreR < 1e-3 && bandH < 1e-3) {
    return atCenter(dsl.sphere({ r: rr, $fn: segments }), center);
  }

  const core = dsl.cylinder({ r: r - rr, h, $fn: segments, center: true });
  const band = dsl.cylinder({ r, h: h - 2 * rr, $fn: segments, center: true });
  const rim = (z) => dsl.translate([0, 0, z], dsl.torus({ r: r - rr, tube: rr, $fn: segments }));
  return atCenter(dsl.union(core, band, rim(h / 2 - rr), rim(-(h / 2 - rr))), center);
}

// roundedCuboid({size, roundRadius}) — a box with every edge and corner rounded.
// The convex hull of eight corner spheres is exactly that shape, and hull() is
// already how the OpenSCAD/BOSL2 layer rounds cuboids.
export function roundedCuboid({
  size = [2, 2, 2], roundRadius = 0.2, segments = 32, center = [0, 0, 0],
} = {}) {
  const [x, y, z] = vec3(size, 2);
  const rr = Math.max(Math.min(roundRadius, x / 2, y / 2, z / 2), 0);
  if (rr <= 1e-9) return cuboid({ size: [x, y, z], center });
  const hx = x / 2 - rr, hy = y / 2 - rr, hz = z / 2 - rr;
  // Once every corner offset collapses the eight spheres sit on one point, and
  // a hull of coincident points isn't manifold. That shape is just a sphere.
  if (hx < 1e-3 && hy < 1e-3 && hz < 1e-3) {
    return atCenter(dsl.sphere({ r: rr, $fn: segments }), center);
  }
  const balls = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    balls.push(dsl.translate([sx * hx, sy * hy, sz * hz], dsl.sphere({ r: rr, $fn: segments })));
  }
  return atCenter(dsl.hull(...balls), center);
}

// ellipsoid({radius:[x,y,z]}) — a sphere scaled per axis.
export function ellipsoid({ radius = [1, 1, 1], segments = 32, center = [0, 0, 0] } = {}) {
  const [rx, ry, rz] = vec3(radius, 1);
  const base = Math.max(rx, ry, rz) || 1;
  return atCenter(
    dsl.scale([rx / base, ry / base, rz / base], dsl.sphere({ r: base, $fn: segments })),
    center,
  );
}

// geodesicSphere({radius, frequency}) — we have no icosphere, so this is a
// UV sphere tessellated to a comparable density. Same silhouette, different
// triangle layout; nothing downstream depends on the topology.
export function geodesicSphere({ radius = 1, frequency = 6, center = [0, 0, 0] } = {}) {
  const segments = Math.max(12, Math.round(frequency * 4));
  return atCenter(dsl.sphere({ r: radius, $fn: segments }), center);
}

// polyhedron({points, faces}) — exact, including concave shapes: the faces are
// triangulated into an ASCII STL and handed to the mesh importer. hull() would
// have silently convexified anything non-convex, which is worse than slower.
let polySeq = 0;
export function polyhedron({ points = [], faces = [], orientation = "outward" } = {}) {
  if (points.length < 4 || !faces.length) {
    throw new Error("polyhedron() needs at least 4 points and one face, e.g. polyhedron({ points: [...], faces: [[0,1,2], ...] })");
  }
  const P = points.map((p) => [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0]);
  const flip = orientation !== "outward";
  const tris = [];
  for (const f of faces) {
    if (!Array.isArray(f) || f.length < 3) continue;
    for (let i = 1; i < f.length - 1; i++) {          // fan-triangulate n-gons
      const t = [P[f[0]], P[f[i]], P[f[i + 1]]];
      if (t.some((v) => !v)) throw new Error("polyhedron(): a face references a point index that doesn't exist");
      tris.push(flip ? [t[0], t[2], t[1]] : t);
    }
  }
  if (!tris.length) throw new Error("polyhedron(): no usable faces");
  const body = tris.map((t) => {
    const [a, b, c] = t;
    const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], v = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    const n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]];
    const L = Math.hypot(...n) || 1;
    return `  facet normal ${n[0]/L} ${n[1]/L} ${n[2]/L}\n    outer loop\n`
      + t.map((p) => `      vertex ${p[0]} ${p[1]} ${p[2]}`).join("\n")
      + "\n    endloop\n  endfacet";
  }).join("\n");
  // deterministic name: identical geometry across rebuilds reuses one entry
  let hash = 0;
  for (let i = 0; i < body.length; i++) hash = (hash * 31 + body.charCodeAt(i)) | 0;
  const name = `__polyhedron_${(hash >>> 0).toString(36)}_${tris.length}.stl`;
  if (!dsl.listImports().includes(name)) {
    dsl.registerImport(name, `solid poly\n${body}\nendsolid poly\n`);
    polySeq++;
  }
  return dsl.importedMesh(name);
}

// -------------------------------------------------------------- 2D + extrude

// JSCAD's 2D primitives, as profile trees (see openscad.js) — extrude to use.
export function polygon({ points = [] } = {}) {
  return { __profile2d: true, leaf: true, pts: points.map((p) => [p[0], p[1]]) };
}

export function rectangle({ size = [2, 2], center = [0, 0] } = {}) {
  const [w, d] = [size[0] ?? 2, size[1] ?? size[0] ?? 2];
  const [cx, cy] = center;
  return polygon({ points: [
    [cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2],
    [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2],
  ] });
}

export function circle({ radius = 1, segments = 32, center = [0, 0] } = {}) {
  const [cx, cy] = center;
  const pts = Array.from({ length: Math.max(3, segments) }, (_, i) => {
    const a = (i / Math.max(3, segments)) * 2 * Math.PI;
    return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  });
  return polygon({ points: pts });
}

export function square({ size = 2, center = [0, 0] } = {}) {
  const s = Array.isArray(size) ? size : [size, size];
  return rectangle({ size: s, center });
}

export function ellipse({ radius = [1, 1], segments = 32, center = [0, 0] } = {}) {
  const [rx, ry] = Array.isArray(radius) ? radius : [radius, radius];
  const [cx, cy] = center;
  const n = Math.max(3, segments);
  return polygon({ points: Array.from({ length: n }, (_, i) => {
    const a = (i / n) * 2 * Math.PI;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
  }) });
}

// roundedRectangle({size, roundRadius}) — corners swept with real arc points.
export function roundedRectangle({
  size = [2, 2], roundRadius = 0.2, segments = 32, center = [0, 0],
} = {}) {
  const [w, d] = [size[0] ?? 2, size[1] ?? size[0] ?? 2];
  const [cx, cy] = center;
  const rr = Math.max(Math.min(roundRadius, w / 2 - 1e-6, d / 2 - 1e-6), 0);
  if (rr <= 0) return rectangle({ size: [w, d], center });
  const per = Math.max(2, Math.round(Math.max(3, segments) / 4));
  const hx = w / 2 - rr, hy = d / 2 - rr;
  const pts = [];
  // four corner arcs, counter-clockwise from +x+y
  const corners = [[hx, hy, 0], [-hx, hy, Math.PI / 2], [-hx, -hy, Math.PI], [hx, -hy, 1.5 * Math.PI]];
  for (const [ox, oy, a0] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = a0 + (i / per) * (Math.PI / 2);
      pts.push([cx + ox + rr * Math.cos(a), cy + oy + rr * Math.sin(a)]);
    }
  }
  return polygon({ points: pts });
}

// star({vertices, outerRadius, innerRadius}) — alternating radii, like JSCAD's.
export function star({
  vertices = 5, outerRadius = 1, innerRadius = 0, startAngle = 0, center = [0, 0],
} = {}) {
  const n = Math.max(2, Math.round(vertices));
  // JSCAD's default inner radius gives a regular star polygon
  const ri = innerRadius > 0 ? innerRadius : outerRadius * Math.cos(Math.PI / n) / Math.cos(Math.PI / (2 * n));
  const [cx, cy] = center;
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : ri;
    const a = startAngle + (i / (n * 2)) * 2 * Math.PI;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return polygon({ points: pts });
}

// triangle({type, values}) — the SSS/AAA forms JSCAD accepts, solved to points.
export function triangle({ type = "SSS", values = [1, 1, 1] } = {}) {
  const t = String(type).toUpperCase();
  let a, b, c;                                   // side lengths
  if (t === "SSS") { [a, b, c] = values; }
  else if (t === "AAA") {
    const [A, B, C] = values;                    // radians, sum ~= PI
    if (Math.abs(A + B + C - Math.PI) > 1e-3) throw new Error("triangle() AAA angles must add up to PI radians");
    a = Math.sin(A); b = Math.sin(B); c = Math.sin(C);   // law of sines, unit circumdiameter
  } else if (t === "ASA") {
    const [A, cSide, B] = values;
    const C = Math.PI - A - B;
    a = cSide * Math.sin(A) / Math.sin(C); b = cSide * Math.sin(B) / Math.sin(C); c = cSide;
  } else if (t === "SAS") {
    const [aSide, C, bSide] = values;
    c = Math.sqrt(aSide * aSide + bSide * bSide - 2 * aSide * bSide * Math.cos(C));
    a = aSide; b = bSide;
  } else throw new Error(`triangle() type "${type}" isn't supported — use SSS, SAS, ASA or AAA`);
  if (!(a > 0 && b > 0 && c > 0) || a + b <= c || b + c <= a || a + c <= b) {
    throw new Error("triangle(): those side lengths can't close a triangle");
  }
  // place side c along +x from the origin, solve the apex
  const x = (a * a + c * c - b * b) / (2 * c);
  const y = Math.sqrt(Math.max(0, a * a - x * x));
  return polygon({ points: [[0, 0], [c, 0], [x, y]] });
}

// extrudeLinear({ height }, geometry) — +Z from z=0, like JSCAD.
export function extrudeLinear({ height = 1, twistAngle = 0 } = {}, geom) {
  if (twistAngle) throw new Error("extrudeLinear() twistAngle isn't supported.");
  if (!isProfile(geom)) throw new Error("extrudeLinear() takes a 2D geometry (polygon/rectangle/circle).");
  return profileToSolid(geom, height);
}

// extrudeRotate({segments, angle}, geom2d) — JSCAD's lathe. Our revolve spins
// about x = 0, which is the same axis JSCAD uses, so the profile passes through
// unchanged. Boolean profile trees can't be revolved (the kernel wants one
// closed outline), so say that plainly instead of silently revolving a piece.
export function extrudeRotate({ segments = 32, angle = Math.PI * 2, startAngle = 0 } = {}, geom) {
  if (!isProfile(geom)) throw new Error("extrudeRotate() takes a 2D geometry (polygon/rectangle/circle).");
  if (!geom.leaf) throw new Error("extrudeRotate() needs a single outline — union/subtract the 2D pieces after revolving, not before.");
  if (startAngle) throw new Error("extrudeRotate() startAngle isn't supported — rotate the result instead.");
  const deg = angle * RAD2DEG;
  return dsl.revolve({ angle: deg, $fn: segments }, dsl.polygon(geom.pts));
}

export const extrusions = { extrudeLinear, extrudeRotate };

// ---------------------------------------------------------------------- hulls

export const hull = (...shapes) => {
  const list = shapes.flat();
  if (list.some(isProfile)) throw new Error("hull() of 2D outlines isn't supported — extrude them first.");
  return dsl.hull(...list);
};

// hullChain(a, b, c) hulls each CONSECUTIVE pair and unions the results — the
// standard way to loft a tube along a path without bridging non-adjacent links.
export const hullChain = (...shapes) => {
  const list = shapes.flat();
  if (list.length < 2) return hull(...list);
  const links = [];
  for (let i = 0; i < list.length - 1; i++) links.push(dsl.hull(list[i], list[i + 1]));
  return dsl.union(...links);
};

export const hulls = { hull, hullChain };

// ----------------------------------------------------------------- expansions
//
// 2D only: growing a solid in 3D is a Minkowski sum, which the kernel has no
// feature for. An honest error beats a wrong shape.
export function offset({ delta = 1, corners = "round", segments = 24 } = {}, geom) {
  if (!isProfile(geom)) throw new Error("offset() takes a 2D geometry — for 3D, scale() or rebuild at the larger size.");
  if (!geom.leaf) throw new Error("offset() needs a single outline, not a 2D boolean result.");
  return polygon({ points: offsetPolygon(geom.pts, delta, segments, corners !== "edge") });
}
export const expand = offset;
export const expansions = { expand, offset };

// --------------------------------------------------------------- measurements
//
// JSCAD measures built geometry; our shapes are a lazy description that only
// becomes geometry inside compile(), so there's nothing to measure yet. Rather
// than return a plausible-looking wrong number, explain the swap.
const cantMeasure = (name) => () => {
  throw new Error(`${name}() needs built geometry, which isn't available while your model is still being described. Compute the size from your own variables instead — e.g. keep \`const w = 40\` and use w.`);
};
export const measureBoundingBox = cantMeasure("measureBoundingBox");
export const measureDimensions = cantMeasure("measureDimensions");
export const measureCenter = cantMeasure("measureCenter");
export const measureVolume = cantMeasure("measureVolume");
export const measureArea = cantMeasure("measureArea");
export const measurements = {
  measureBoundingBox, measureDimensions, measureCenter, measureVolume, measureArea,
};

// ----------------------------------------------------------------- maths/utils
export const degToRad = (d) => d * Math.PI / 180;
export const radToDeg = (r) => r * RAD2DEG;
export const utils = { degToRad, radToDeg };

// ------------------------------------------------------------------ booleans

// Profile-aware: subtracting circles from a rectangle before extruding is the
// standard JSCAD idiom for plates with holes.
const boolOp = (op, dslFn) => (...shapes) => {
  const list = shapes.flat();
  const profiles = list.filter(isProfile).length;
  if (profiles === list.length && list.length > 0) return profileOp(op, list);
  if (profiles > 0) throw new Error("Can't mix 2D geometry with 3D solids — extrude the 2D part first.");
  return dslFn(list);
};

export const union = boolOp("UNION", dsl.union);
export const subtract = boolOp("SUBTRACT", dsl.difference);
export const intersect = boolOp("INTERSECT", dsl.intersection);

// ---------------------------------------------------------------- transforms

export const translate = (v, ...shapes) => dsl.translate(vec3(v), shapes.flat());
export const translateX = (n, ...shapes) => dsl.translate([n, 0, 0], shapes.flat());
export const translateY = (n, ...shapes) => dsl.translate([0, n, 0], shapes.flat());
export const translateZ = (n, ...shapes) => dsl.translate([0, 0, n], shapes.flat());

// radians in, degrees out
export const rotate = (angles, ...shapes) =>
  dsl.rotate(vec3(angles).map((a) => a * RAD2DEG), shapes.flat());
export const rotateX = (a, ...shapes) => dsl.rotate([a * RAD2DEG, 0, 0], shapes.flat());
export const rotateY = (a, ...shapes) => dsl.rotate([0, a * RAD2DEG, 0], shapes.flat());
export const rotateZ = (a, ...shapes) => dsl.rotate([0, 0, a * RAD2DEG], shapes.flat());

export const scale = (v, ...shapes) => dsl.scale(vec3(v, 1), shapes.flat());
export const scaleX = (n, ...shapes) => dsl.scale([n, 1, 1], shapes.flat());
export const scaleY = (n, ...shapes) => dsl.scale([1, n, 1], shapes.flat());
export const scaleZ = (n, ...shapes) => dsl.scale([1, 1, n], shapes.flat());

export const mirror = (opts, ...shapes) => {
  const normal = Array.isArray(opts) ? opts : (opts?.normal ?? [1, 0, 0]);
  return dsl.mirror(vec3(normal), shapes.flat());
};
export const mirrorX = (...shapes) => dsl.mirror([1, 0, 0], shapes.flat());
export const mirrorY = (...shapes) => dsl.mirror([0, 1, 0], shapes.flat());
export const mirrorZ = (...shapes) => dsl.mirror([0, 0, 1], shapes.flat());

// center()/align() need to know where a shape currently sits, and that isn't
// known until compile() builds it. Most JSCAD centering is redundant here
// anyway — our primitives already take `center`. Say so instead of guessing.
const cantCenter = (name) => () => {
  throw new Error(`${name}() has to measure the shape first, which isn't possible while the model is still a description. Our primitives take a \`center\` option directly — e.g. cylinder({ radius: 5, height: 20, center: [0, 0, 10] }) — or wrap it in translate([...]).`);
};
export const center = cantCenter("center");
export const centerX = cantCenter("centerX");
export const centerY = cantCenter("centerY");
export const centerZ = cantCenter("centerZ");
export const align = cantCenter("align");

// ---------------------------------------------------------------- colors
//
// JSCAD colours geometry with colorize([r,g,b], geom). We tag the shape with a
// hex colour that compile() threads into the trace, so the viewer paints each
// coloured piece. hexToRgb/rgbToHex mirror @jscad/modeling/colors (0..1 floats).
export function hexToRgb(hex) {
  const h = String(hex).replace(/^#/, "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
}
export function rgbToHex(rgb) {
  const to = (v) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255))).toString(16).padStart(2, "0");
  return "#" + to(rgb[0]) + to(rgb[1]) + to(rgb[2]);
}
export const colorToRgba = (c) => (Array.isArray(c) && c.length >= 4 ? c : [c[0], c[1], c[2], 1]);
const toHex = (color) => typeof color === "string"
  ? (color[0] === "#" ? color : rgbToHex(hexToRgb(color)))
  : rgbToHex(color);
export function colorize(color, ...objects) {
  const hex = toHex(color);
  const tag = (o) => {
    if (Array.isArray(o)) { o.forEach(tag); return o; }
    if (o && o.__brepscript) o.color = hex;      // read by compile()'s colour threading
    return o;
  };
  objects.forEach(tag);
  return objects.length === 1 ? objects[0] : objects;
}
// glow(color, ...shapes) — a BREPcode extension: emissive/self-lit colour, so a
// screen or neon part lights up (and exports that way in the GLB). Optional
// trailing number sets the intensity: glow([0,1,.8], part, 1.4).
export function glow(color, ...objects) {
  let intensity = 1;
  if (typeof objects[objects.length - 1] === "number") intensity = objects.pop();
  const hex = toHex(color);
  const tag = (o) => {
    if (Array.isArray(o)) { o.forEach(tag); return o; }
    if (o && o.__brepscript) { o.color = hex; o.emissive = hex; o.emissiveInt = intensity; }
    return o;
  };
  objects.forEach(tag);
  return objects.length === 1 ? objects[0] : objects;
}
export const colors = { colorize, glow, hexToRgb, rgbToHex, colorToRgba };

// Namespaced form, matching how @jscad/modeling is normally imported.
export const primitives = {
  cube, cuboid, roundedCuboid, sphere, ellipsoid, geodesicSphere,
  cylinder, cylinderElliptic, roundedCylinder, torus, polyhedron,
  polygon, rectangle, roundedRectangle, square, circle, ellipse, star, triangle,
};
export const booleans = { union, subtract, intersect };
export const transforms = {
  translate, translateX, translateY, translateZ,
  rotate, rotateX, rotateY, rotateZ,
  scale, scaleX, scaleY, scaleZ,
  mirror, mirrorX, mirrorY, mirrorZ,
  center, centerX, centerY, centerZ, align,
};
export const maths = { degToRad, radToDeg };

export default {
  primitives, booleans, transforms, colors,
  extrusions, hulls, expansions, measurements, maths, utils,
};

// ------------------------------------------------- pasted-module compatibility
//
// LLMs emit JSCAD as a module: require('@jscad/modeling'), destructuring, a
// main() function, and module.exports. None of that runs as a bare expression,
// so we detect the idiom, rewrite the module skeleton, and hand back a body
// that ends by calling main().

const NAMESPACES = {
  primitives, booleans, transforms, colors,
  extrusions, hulls, expansions, measurements, maths, utils,
};

// What require('@jscad/modeling') (or a subpath) hands back.
export function requireShim(path) {
  const p = String(path);
  if (!p.startsWith("@jscad")) {
    throw new Error(`require("${p}") isn't available here — only @jscad/modeling is emulated.`);
  }
  for (const [name, ns] of Object.entries(NAMESPACES)) {
    if (p.includes(name)) return ns;
  }
  const missing = p.match(/\b(text|geometries|curves)\b/);
  if (missing) {
    throw new Error(`@jscad ${missing[1]} isn't supported. Available: primitives, booleans, transforms, extrusions, hulls, expansions, colors, maths, utils.`);
  }
  // the root module: namespaced AND flat, since both destructuring styles show
  // up in generated code — `const { cuboid } = require(...)` as often as
  // `const { primitives } = require(...)`.
  return {
    primitives, booleans, transforms, extrusions, hulls, expansions,
    colors, measurements, maths, utils,
    ...primitives, ...booleans, ...transforms, ...extrusions,
    ...hulls, ...expansions, ...colors, ...measurements, ...maths, ...utils,
  };
}

export function isJscadModule(src) {
  return /\brequire\s*\(\s*["']@jscad/.test(src)
    || /\bfrom\s*["']@jscad/.test(src)
    || /\bmodule\.exports\b/.test(src)
    || /\b(?:export\s+(?:const|function)\s+main|const\s+main\s*=|function\s+main\s*\()/.test(src);
}

// Rewrite the module skeleton into a plain function body that returns main().
export function prepareJscadModule(src) {
  let code = src;

  // ESM imports -> require destructuring
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*(["'])(@jscad[^"']*)\2\s*;?/g,
    (_, names, _q, path) => `const {${names}} = require("${path}");`,
  );
  code = code.replace(
    /import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s*from\s*(["'])(@jscad[^"']*)\2\s*;?/g,
    (_, name, _q, path) => `const ${name} = require("${path}");`,
  );
  code = code.replace(
    /import\s+([A-Za-z_$][\w$]*)\s+from\s*(["'])(@jscad[^"']*)\2\s*;?/g,
    (_, name, _q, path) => `const ${name} = require("${path}");`,
  );

  // exports -> plain declarations
  code = code.replace(/\bexport\s+(const|let|var|function)\b/g, "$1");
  code = code.replace(/\bexport\s+default\b/g, "const __default__ =");
  code = code.replace(/\bmodule\.exports\s*=\s*\{[^}]*\}\s*;?/g, "");
  code = code.replace(/\bmodule\.exports\s*=\s*[A-Za-z_$][\w$]*\s*;?/g, "");

  // getParameterDefinitions is metadata for JSCAD's UI — harmless to keep as a
  // declaration, but main(params) needs an argument. Feed it the defaults.
  code += `
;const __params__ = (typeof getParameterDefinitions === "function")
  ? Object.fromEntries(getParameterDefinitions().map((d) => [d.name, d.initial ?? d.default]))
  : {};
const __out__ = (typeof main === "function") ? main(__params__)
  : (typeof __default__ !== "undefined") ? (typeof __default__ === "function" ? __default__(__params__) : __default__)
  : undefined;
return __out__;`;

  return code;
}
