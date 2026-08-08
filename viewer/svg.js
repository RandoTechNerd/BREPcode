// SVG -> solid. Parse an SVG's filled paths (holes and all) with three's
// SVGLoader, extrude them, and hand back an ASCII STL that the normal import
// path registers as one solid. From there it's a real part: extrude it thicker
// for a TPU screen-print positive, or difference() it out of a plate for a
// stencil. Lazy — three's SVGLoader loads only when an SVG is actually imported.

import * as THREE from "three";

let SVGLoader = null;
export async function loadSvg() {
  if (!SVGLoader) ({ SVGLoader } = await import("three/addons/loaders/SVGLoader.js"));
  return SVGLoader;
}

// svgText -> ASCII STL. Fills to a `maxSize` mm footprint (aspect kept), `height`
// mm thick, sitting on z=0, centred in XY. SVG's y-down axis is flipped to
// y-up (with winding corrected) so the art isn't mirrored.
export async function svgToStl(svgText, { height = 3, maxSize = 60, name = "svg" } = {}) {
  await loadSvg();
  const data = new SVGLoader().parse(svgText);
  const shapes = [];
  for (const path of data.paths) {
    for (const s of SVGLoader.createShapes(path)) shapes.push(s);
  }
  if (!shapes.length) throw new Error("no filled shapes found in that SVG (strokes-only SVGs have nothing to extrude — give the paths a fill)");

  const geo = new THREE.ExtrudeGeometry(shapes, { depth: height, bevelEnabled: false, steps: 1 });
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
  const pos = nonIndexed.attributes.position;
  nonIndexed.computeBoundingBox();
  const bb = nonIndexed.boundingBox;
  const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y;
  const scale = maxSize / Math.max(sx || 1, sy || 1);
  const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
  // XY -> mm (scaled, centred, Y flipped); Z stays the extrude depth in mm
  const tx = (x) => ((x - cx) * scale).toFixed(4);
  const ty = (y) => (-(y - cy) * scale).toFixed(4);
  const tz = (z) => z.toFixed(4);

  const F = [];
  for (let i = 0; i < pos.count; i += 3) {
    const A = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const B = [pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)];
    const C = [pos.getX(i + 2), pos.getY(i + 2), pos.getZ(i + 2)];
    // Y flip mirrors the geometry, which reverses winding — swap B and C to
    // keep outward-facing normals so the mesh stays manifold.
    const v = (p) => `vertex ${tx(p[0])} ${ty(p[1])} ${tz(p[2])}`;
    F.push(`facet normal 0 0 0\nouter loop\n${v(A)}\n${v(C)}\n${v(B)}\nendloop\nendfacet`);
  }
  return `solid ${name}\n${F.join("\n")}\nendsolid ${name}\n`;
}

// svgText -> OUTLINE LOOPS in mm, ready to offset into a cutter.
//
// svgToStl above gives a solid, which is a dead end for a cutter: a blade is a
// polygon offset, and an offset needs POINTS. So this returns the same shapes
// as flat point loops instead — outer contours and their holes, in the same
// millimetre space (centred, y-flipped, scaled to maxSize).
//
// `divisions` is how finely curves are sampled. Higher is smoother and slower
// to offset; 12 is plenty for an icon at cookie size.
export async function svgToLoops(svgText, { maxSize = 70, divisions = 12 } = {}) {
  await loadSvg();
  const data = new SVGLoader().parse(svgText);
  const shapes = [];
  for (const path of data.paths) for (const s of SVGLoader.createShapes(path)) shapes.push(s);
  if (!shapes.length) {
    throw new Error("no filled shapes in that SVG — an outline-only icon has nothing to cut around");
  }

  // Collect first, measure second: every loop has to be scaled by the SAME
  // factor or the holes stop lining up with the outline they belong to.
  const raw = [];
  for (const s of shapes) {
    raw.push({ pts: s.getPoints(divisions), hole: false });
    for (const h of s.holes || []) raw.push({ pts: h.getPoints(divisions), hole: true });
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { pts } of raw) for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX, h = maxY - minY;
  const scale = maxSize / Math.max(w || 1, h || 1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

  const round = (n) => +(n * scale).toFixed(3);
  return raw.map(({ pts, hole }) => ({
    hole,
    // y is flipped because SVG counts downwards and the plate does not
    points: pts.map((p) => [round(p.x - cx), round(-(p.y - cy))]),
  })).filter((l) => l.points.length >= 3);
}
