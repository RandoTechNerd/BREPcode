// The blend mesher that cannot produce a pinch.
//
// smoothUnion() meshed its field with our own surface nets, and surface nets
// has a structural flaw: one vertex per grid cell. Wherever two sheets of the
// blended surface pass through the same cells — a giraffe's legs 2.8mm apart
// with a 2.5mm blend pulling their surfaces together — the sheets are forced
// to share vertices, the shared edges end up owned by four faces, and the
// kernel refuses the mesh ("Not manifold") while its viewer renders ragged
// see-through holes. Cutting the pinches apart afterwards (see cutPinches)
// recovers some of them, but stitching topology back together after the fact
// is a losing game: the giraffe still had 52 open edges after the best cut.
//
// Manifold's levelSet() is the same idea built right: it meshes a signed
// distance field with manifoldness guaranteed by construction — that
// guarantee is the library's entire reason to exist. Measured on the giraffe
// that started this: surface nets 17 non-manifold edges and a refused export;
// levelSet watertight, genus 0, exports clean.
//
// Loaded lazily, exactly like the STEP exporter: WASM costs nothing until the
// first organic model, and if it cannot load (an exotic host, a blocked
// fetch) the caller falls back to surface nets + cutPinches — worse, but
// never nothing.
//
// Sign convention, measured: levelSet treats POSITIVE as inside (a sphere
// written as `r - |p|` gives the exact volume; written SDF-style as `|p| - r`
// it returns an inside-out box with the sphere as a cavity). Our fields are
// standard negative-inside SDFs, so the adapter negates.

let wasmPromise = null;

async function manifoldModule() {
  wasmPromise ??= (async () => {
    const Module = (await import("manifold-3d")).default;
    const wasm = await Module();
    wasm.setup();
    return wasm;
  })();
  return wasmPromise;
}

export async function blendLevelSet(f, bounds, edgeLength) {
  const { Manifold } = await manifoldModule();
  const solid = Manifold.levelSet(
    (p) => -f(p),
    { min: bounds[0].slice(), max: bounds[1].slice() },
    Math.max(0.05, edgeLength),
  );
  try {
    if (solid.isEmpty()) return null;
    const mesh = solid.getMesh();
    const points = [];
    const { vertProperties: vp, numProp: np, triVerts: tv } = mesh;
    for (let i = 0; i < mesh.numVert; i++) points.push([vp[i * np], vp[i * np + 1], vp[i * np + 2]]);
    const faces = [];
    for (let i = 0; i < mesh.numTri; i++) faces.push([tv[3 * i], tv[3 * i + 1], tv[3 * i + 2]]);
    return { points, faces };
  } finally {
    solid.delete();
  }
}
