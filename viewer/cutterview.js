// A cookie cutter, rendered: the small picture on each card of the cutter
// shelf, and the large one beside the dials.
//
// The cards used to be drawings (cutterdoor.js previewSvg): quick, and a fair
// cartoon of a cutter, but a cartoon. This is the cutter itself, in miniature:
// the same blade, rim, bars and connectors the kit's code will build, as real
// solids, lit by a room and standing on their own shadow. What is on the card
// is what comes off the printer.
//
// Two halves, kept apart so the first can be tested without a screen:
//
//   cutterSolids   outline in, flat regions with a bottom and a top out. The
//                  2D work is Clipper2 (manifold-3d's CrossSection), which is
//                  what the kit's own offset()s go through, so a rim here
//                  rounds a corner exactly as the built one does. No DOM, no
//                  three.js.
//   makeCutterViewer   those regions extruded, lit and photographed by one
//                  small WebGL renderer shared by every card.
//
// previewSvg stays: it is on the card the instant a shape is clicked, and it
// is what a browser without WebGL keeps.

import { DEFAULTS, pieceLinks, linkStrip } from "./cutterkit.js";

const area2 = (p) => {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) { const u = p[i], v = p[(i + 1) % n]; a += u[0] * v[1] - v[0] * u[1]; }
  return a;
};
const wind = (p, ccw) => ((area2(p) > 0) === ccw ? p : p.slice().reverse());
const RIMS = { none: 0, standard: 6, wide: 10, comfort: 6 };
const circle = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// loops (mm) -> { parts: [{ part, z0, z1, polys: [[outer, ...holes]] }], top }
// or null for a kit this does not draw (the roller keeps its drawing).
//   opts: height, handle, bars, sharp, kind, as the door's dials have them.
export function cutterSolids(CS, loops, opts = {}) {
  const kind = opts.kind || "cutter";
  if (kind === "roller") return null;
  const solid = (loops || []).filter((l) => !l.hole && l.points?.length >= 3).map((l) => wind(l.points, true));
  if (!solid.length) return null;
  const bin = [];
  const k = (cs) => { bin.push(cs); return cs; };
  try {
    const region = (polys) => k(new CS(polys, "Positive"));
    const grow = (cs, d, round = false) => k(cs.offset(d, round ? "Round" : "Miter", 4, 24));
    const join = (list) => list.reduce((a, b) => (a ? k(a.add(b)) : b), null);
    // a region as outlines with their holes, one entry per separate piece
    const polysOf = (cs) => {
      const out = [];
      if (!cs || cs.isEmpty()) return out;
      for (const piece of cs.decompose().map(k)) {
        const all = piece.toPolygons().filter((p) => p.length >= 3);
        const outer = all.filter((p) => area2(p) > 0), holes = all.filter((p) => area2(p) < 0);
        if (outer.length) out.push([outer[0], ...holes]);
      }
      return out;
    };
    const parts = [];
    const put = (part, z0, z1, cs) => { const polys = polysOf(cs); if (polys.length && z1 > z0) parts.push({ part, z0, z1, polys }); };

    if (kind === "stencil") {
      // a sheet, the shape cut through it in rows
      const cols = 4, rows = 3, pitch = 26, T = DEFAULTS.sheet;
      let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
      for (const p of solid) for (const [x, y] of p) { lo = [Math.min(lo[0], x), Math.min(lo[1], y)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y)]; }
      const fit = (pitch * 0.78) / Math.max(hi[0] - lo[0], hi[1] - lo[1], 1e-6), mx = (lo[0] + hi[0]) / 2, my = (lo[1] + hi[1]) / 2;
      const W = cols * pitch, D = rows * pitch, cuts = [];
      for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
        const ox = -W / 2 + pitch * (c + 0.5), oy = -D / 2 + pitch * (r + 0.5);
        for (const p of solid) cuts.push(p.map(([x, y]) => [ox + (x - mx) * fit, oy + (y - my) * fit]));
      }
      const sheet = region([[[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]]);
      put("sheet", 0, T, k(sheet.subtract(region(cuts))));
      return { parts, top: T, flat: true };
    }

    const H = Math.max(6, +opts.height || DEFAULTS.height);
    const WALL = Math.max(0.8, +opts.wall || DEFAULTS.wall);
    const handle = opts.handle in RIMS ? opts.handle : "standard";
    const RIM = RIMS[handle], RIM_H = DEFAULTS.rimHeight;
    const each = solid.map((p) => region([p]));
    const inner = each.map((o) => grow(o, -WALL / 2));
    const blades = each.map((o, i) => k(grow(o, WALL / 2).subtract(inner[i])));
    const sharp = !!opts.sharp, EH = DEFAULTS.edgeHeight;
    put("blade", 0, sharp ? H - EH : H, join(blades));
    if (sharp) put("blade", H - EH, H, join(each.map((o, i) => k(grow(o, Math.min(DEFAULTS.edge, WALL) - WALL / 2).subtract(inner[i])))));
    // everything that lies on the plate is one region: rims, bars, connectors
    const low = [];
    if (RIM) for (const o of each) low.push(k(grow(o, RIM, true).subtract(o)));
    const nBars = kind === "cutter" ? +opts.bars || 0 : 0;
    if (nBars > 0) {
      let span = 0;
      for (const p of solid) for (const [x, y] of p) span = Math.max(span, Math.abs(x), Math.abs(y));
      const S = span * 2 + 10, B = DEFAULTS.barWidth / 2;
      const strips = [[[-S, -B], [S, -B], [S, B], [-S, B]]];
      if (nBars > 1) strips.push([[-B, -S], [B, -S], [B, S], [-B, S]]);
      const cross = region(strips);
      for (const o of each) low.push(k(grow(o, WALL / 2).intersect(cross)));
    }
    if (opts.links !== false) {
      const links = pieceLinks(solid.map((points) => ({ hole: false, points })));
      for (const l of links) low.push(region([wind(linkStrip(l, DEFAULTS.linkWidth, Math.min(0.2, WALL / 2 - 0.1)), true)]));
    }
    // nothing on the plate may close an opening: the dough has to come out
    if (low.length) put("rim", 0, RIM_H, k(join(low).subtract(join(inner))));
    if (handle === "comfort") put("rim", RIM_H - 0.01, RIM_H * 1.6, join(each.map((o) => k(grow(o, RIM * 0.55, true).subtract(o)))));
    let top = H;
    if (kind === "stamp") {
      // the stamp hangs over the opening it drops into, knob up
      const z = H + 9, P = DEFAULTS.plate;
      put("stamp", z, z + P, grow(each[0], -0.5));
      const b = each[0].bounds(), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
      put("knob", z + P - 0.01, z + P + 14, region([circle(cx, cy, 11)]));
      top = z + P + 14;
    }
    return { parts, top, flat: false };
  } finally {
    for (const cs of bin) { try { cs.delete(); } catch { /* already gone */ } }
  }
}

// ---------------------------------------------------------------- the camera
//
// One renderer for every card. Each picture is drawn, copied to a canvas of
// its own, and the scene emptied again, so forty-eight search results cost
// forty-eight short renders and one WebGL context.
export function makeCutterViewer(THREE, RoomEnvironment) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.NeutralToneMapping ?? THREE.ACESFilmicToneMapping;   // neutral keeps a spool's colour; filmic greys it
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  if (RoomEnvironment) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.5;
    pmrem.dispose();
  }
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c8, 0.22));
  const key = new THREE.DirectionalLight(0xffffff, 1.35);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 9;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.3;
  scene.add(key, key.target);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.3, transparent: true }));
  floor.receiveShadow = true;
  scene.add(floor);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 5000);
  camera.up.set(0, 0, 1);

  // Printed plastic with flake in it: a gloss coat over a satin body, the
  // colour running rim to edge as a gradient spool prints, and glitter that
  // is there or not by where it sits in the part, brighter when it happens
  // to face you.
  const plastic = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0, clearcoat: 0.75, clearcoatRoughness: 0.18 });
  plastic.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCkPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCkPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCkPos;")
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        {
          vec3 q = vCkPos * 1.9, c = floor(q), f = fract(q) - 0.5;
          float h = fract(sin(dot(c, vec3(127.1, 311.7, 74.7))) * 43758.5453);
          vec3 at = (vec3(fract(h * 13.1), fract(h * 29.7), fract(h * 53.3)) - 0.5) * 0.6;
          float size = 0.10 + 0.13 * fract(h * 7.3);
          float fl = step(0.62, h) * smoothstep(size, size * 0.35, length(f - at));
          vec3 tilt = normalize(vec3(fract(h * 3.1) - 0.5, fract(h * 5.7) - 0.5, 0.9));
          float face = pow(abs(dot(normalize(vViewPosition), tilt)), 5.0);
          totalEmissiveRadiance += vec3(1.0, 0.98, 0.92) * fl * (0.18 + 1.6 * face);
        }`);
  };
  const made = [];
  const lo = new THREE.Color(), hi = new THREE.Color(), mix = new THREE.Color();

  function build(solids, tint, topTint) {
    lo.set(tint); hi.set(topTint);
    const box = new THREE.Box3();
    for (const p of solids.parts) {
      for (const [outer, ...holes] of p.polys) {
        const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
        for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
        const g = new THREE.ExtrudeGeometry(shape, { depth: p.z1 - p.z0, bevelEnabled: false, curveSegments: 1 });
        g.translate(0, 0, p.z0);
        // rim to edge, as a gradient spool prints: the colour is the height
        const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          mix.copy(lo).lerp(hi, Math.min(1, Math.max(0, pos.getZ(i) / (solids.top || 1))));
          col[i * 3] = mix.r; col[i * 3 + 1] = mix.g; col[i * 3 + 2] = mix.b;
        }
        g.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const m = new THREE.Mesh(g, plastic);
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
        made.push(m);
        g.computeBoundingBox();
        box.union(g.boundingBox);
      }
    }
    return box;
  }

  return {
    // solids: cutterSolids' answer. px: the canvas's side in device pixels.
    // high: looked down on from higher up (a searched shape, whose outline
    // has to read before its wall does). Returns a canvas, or null.
    render(solids, { tint = "#49b9c9", top = null, px = 264, high = false } = {}) {
      if (!solids?.parts?.length) return null;
      try {
        const box = build(solids, tint, top || tint);
        if (box.isEmpty()) return null;
        const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
        const R = Math.max(size.length() / 2, 1);
        // from the front and a little to the left, as the cutter stands on the plate
        const dir = new THREE.Vector3(-0.3, -1, solids.flat || high ? 1.35 : 0.72).normalize();
        camera.position.copy(c).addScaledVector(dir, (R / Math.sin((camera.fov / 2) * Math.PI / 180)) * (solids.flat || high ? 0.9 : 0.8));
        camera.near = R * 0.2; camera.far = R * 12;
        camera.lookAt(c);
        camera.updateProjectionMatrix();
        key.target.position.copy(c);
        key.position.copy(c).add(new THREE.Vector3(-0.55, -0.5, 1).normalize().multiplyScalar(R * 4));
        const s = key.shadow.camera;
        s.left = s.bottom = -R * 1.5; s.right = s.top = R * 1.5; s.near = R; s.far = R * 8;
        s.updateProjectionMatrix();
        floor.scale.set(R * 12, R * 12, 1);
        floor.position.set(c.x, c.y, box.min.z - 0.01);
        renderer.setPixelRatio(1);
        renderer.setSize(px, px, false);
        renderer.render(scene, camera);
        const out = document.createElement("canvas");
        out.width = out.height = px;
        out.getContext("2d").drawImage(renderer.domElement, 0, 0);
        return out;
      } catch { return null; }
      finally {
        for (const m of made) { scene.remove(m); m.geometry.dispose(); }
        made.length = 0;
      }
    },
    dispose() { renderer.dispose(); plastic.dispose(); },
  };
}
