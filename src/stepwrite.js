// The Rust kernel's own AP242 writer, given the kernel module and solid
// handles. Browser-safe (no Node imports): src/stepexport.js uses it for the
// CLI and bench/cadgen, the viewer's worker for the exact model's STEP (the
// chat's look-compare blueprint is drawn from it).

// handles: resident solid handles. Several are unioned into one first (a
// STEP with two touching bodies is two parts, not one).
export function stepFromHandles(rk, handles, name = "part", { unit = "mm", timestamp = new Date().toISOString() } = {}) {
  let handle = handles[0];
  for (const h of handles.slice(1)) handle = rk.boolean_handle(handle, h, "union", 1e-6, true);
  try { return writeHandle(rk, handle, name, unit, timestamp); }
  catch (e) {
    // The kernel trusts its own boolean results, and some UNION results carry
    // a loop-wire id twice ("duplicate loop wire id"): fine in the registry,
    // refused by the validating codec the STEP writer reads through.
    // Intersecting with a box that encloses the solid is a geometric no-op
    // that rebuilds the topology with fresh ids, and that copy validates.
    if (!/duplicate|wire id|loop/i.test(String(e?.message ?? e))) throw e;
    const box = enclosingBox(rk, handle);
    try { return writeHandle(rk, rk.boolean_handle(handle, box, "intersect", 1e-6, true), name, unit, timestamp); }
    finally { try { rk.free_solid(box); } catch { /* gone */ } }
  }
}

function writeHandle(rk, handle, name, unit, timestamp) {
  const buf = rk.solid_handle_to_buffer(handle);
  let solid;
  try { solid = rk.WasmBrepSolid.from_buffer(buf.take_data(), buf.names_json()); }
  catch (e) { throw new Error(String(e?.message ?? e)); }
  try { return solid.export_step(name, unit, timestamp); }
  finally { solid.free(); }
}

function enclosingBox(rk, handle) {
  const m = rk.tessellate_handle(handle, 0.5);
  const P = m.take_positions();
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i++) { const k = i % 3; if (P[i] < lo[k]) lo[k] = P[i]; if (P[i] > hi[k]) hi[k] = P[i]; }
  const pad = 0.1 * Math.max(...hi.map((v, k) => v - lo[k])) + 1;
  const box = new rk.WasmBrepSolid(rk.box_brep_json(lo[0] - pad, lo[1] - pad, lo[2] - pad,
    hi[0] - lo[0] + 2 * pad, hi[1] - lo[1] + 2 * pad, hi[2] - lo[2] + 2 * pad));
  const b = box.to_buffer();
  try { return rk.register_solid_buffer(b.take_data(), b.names_json()); }
  finally { box.free(); }
}
