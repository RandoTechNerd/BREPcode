/* tslint:disable */
/* eslint-disable */

export class WasmBrepSolid {
    free(): void;
    [Symbol.dispose](): void;
    boolean_buffer(other: WasmBrepSolid, operation: string, tolerance: number, merge_coplanar_faces: boolean): WasmSolidBuffer;
    boolean_json(other: WasmBrepSolid, operation: string, tolerance: number, merge_coplanar_faces: boolean): string;
    /**
     * Golovanov §6.12 direct editing — delete a transition face (chamfer /
     * fillet / simple 4-sided face) and heal the hole by extending and
     * re-intersecting its neighbours. `face_id` is the wire id of the face to
     * remove.
     */
    delete_face_and_heal_buffer(face_id: number): WasmSolidBuffer;
    delete_face_and_heal_json(face_id: number): string;
    export_step(name: string, unit: string, timestamp: string): string;
    /**
     * Construct from the flat f64 codec instead of JSON — same arena
     * validation as the JSON constructor.
     */
    static from_buffer(data: Float64Array, names_json: string): WasmBrepSolid;
    full_mass_properties_json(): string;
    /**
     * Full mass properties scaled to a physical `density` (Golovanov §8.11):
     * `mass = density * volume`, inertia and the principal moments scale by
     * `density`, while volume, surface area, centroid, and the principal axes
     * are density-independent. Returns the `DensityMassProperties` JSON.
     */
    full_mass_properties_with_density_json(density: number): string;
    mass_properties_json(): string;
    /**
     * Golovanov §6.12 direct editing — translate a face group rigidly by
     * (dx, dy, dz) and heal the adjacency by re-intersecting the planar
     * neighbours. Mirrors `delete_face_and_heal_json`; `face_ids` follows
     * `offset_shell_json`'s integer-id validation.
     */
    move_faces_json(face_ids: Float64Array, dx: number, dy: number, dz: number): string;
    constructor(solid_json: string);
    offset_shell_buffer(opening_face_ids: Float64Array, distance: number): WasmSolidBuffer;
    offset_shell_json(opening_face_ids: Float64Array, distance: number): string;
    /**
     * Compute + serialize every edge's shared samples once, so the face-range
     * split can hand the same buffer to each worker instead of recomputing
     * `sample_all_edges` in all of them. See `sample_edges_encoded`.
     */
    sample_edges_buffer(chord_tolerance: number): Float64Array;
    /**
     * Standalone heal/sew: pair coincident one-use boundary edges (open
     * chains and closed rims), merge the shells they join, and re-orient the
     * result outward. Best-effort — unsewable gaps stay open and are counted
     * in the returned report. Returns `{ "solid": …, "report": … }`.
     */
    sew_json(tolerance: number): string;
    tessellate_buffers(slabs_per_span_u: number, steps_per_span_v: number): WasmMeshBuffers;
    tessellate_json(slabs_per_span_u: number, steps_per_span_v: number): string;
    tessellate_watertight_buffers(chord_tolerance: number): WasmMeshBuffers;
    /**
     * Tessellate only the faces whose global sequential index `i` satisfies
     * `i % stride == offset` (a face subset), so a heavy solid can be meshed
     * in parallel across worker instances (dispatch `stride` calls, offsets
     * 0..stride-1, concatenate the fragments on the caller side). No
     * closed-shell validation — a fragment is not a closed mesh; the caller
     * validates the concatenated whole. See
     * `tessellate_brep_watertight_face_stride`.
     */
    tessellate_watertight_face_stride_buffers(chord_tolerance: number, stride: number, offset: number): WasmMeshBuffers;
    /**
     * Face-stride tessellation using pre-computed edge samples (from
     * `sample_edges_buffer`), skipping the redundant per-worker resampling.
     */
    tessellate_watertight_face_stride_with_samples_buffers(chord_tolerance: number, stride: number, offset: number, samples: Float64Array): WasmMeshBuffers;
    to_buffer(): WasmSolidBuffer;
    to_json(): string;
    transform_buffer(matrix: Float64Array, reverse_orientation: boolean): WasmSolidBuffer;
    transform_json(matrix: Float64Array, reverse_orientation: boolean): string;
    validate_json(): string;
}

/**
 * Tessellation output as typed arrays; getters consume the buffers.
 */
export class WasmMeshBuffers {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    take_face_ids(): Uint32Array;
    take_indices(): Uint32Array;
    take_normals(): Float64Array;
    take_positions(): Float64Array;
}

export class WasmNurbsCurve {
    free(): void;
    [Symbol.dispose](): void;
    derivatives_flat(parameter: number, derivative_count: number): Float64Array;
    evaluate_many(parameters: Float64Array): Float64Array;
    constructor(curve_json: string);
}

export class WasmNurbsSurface {
    free(): void;
    [Symbol.dispose](): void;
    derivatives_flat(u: number, v: number, derivative_count: number): Float64Array;
    evaluate_many(parameters_uv: Float64Array): Float64Array;
    constructor(surface_json: string);
    normals_many(parameters_uv: Float64Array): Float64Array;
}

/**
 * A solid encoded as one flat `Float64Array` plus a tiny JSON side channel
 * for face/edge names — the zero-JSON result path for topology-heavy ops.
 * Getters consume the buffers (each may be read once) to avoid double copies.
 */
export class WasmSolidBuffer {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Operation-specific extras (e.g. offset-shell face images); "{}" when
     * the operation has none.
     */
    metadata_json(): string;
    names_json(): string;
    take_data(): Float64Array;
}

/**
 * INSERT: hand the opened sub-part document over to the library. Executes the
 * document once, snapshots, stores the entry, and returns the EFFECTIVE part
 * name (the ACOMP `partName` the app must reference):
 *
 * - a live entry with the same `sourceKey` AND `sourceSignature` is reused
 *   verbatim (no re-execution, instant re-insert);
 * - same `sourceKey` but a DIFFERENT signature gets a fresh entry under a
 *   disambiguated name (existing instances keep their version; the explicit
 *   refresh lane is [`refresh_library_entry`]);
 * - a requested name taken by different content is disambiguated (`name-2`).
 *
 * The wasm export. A NATIVE caller must call [`add_part_to_library_impl`]:
 * building a `JsValue` off wasm32 panics inside a frame that cannot unwind,
 * so an error returned through this door aborts the whole app (the audit's
 * Insert component crash).
 */
export function add_part_to_library(name: string, source_key: string, source_signature: string, document_json: string): string;

export function apply_edge_splits_json(request_json: string): string;

export function arc_curve_json(request_json: string): string;

export function arrange_segments_json(request_json: string): string;

/**
 * Add a constraint of `constraint_type` with the given `inputParams` JSON
 * (elements etc.; `id` is minted from the type's short name + the persistent
 * counter when absent). Auto-solves; returns `{id, report}`.
 */
export function assembly_add_constraint_json(constraint_type: string, params_json: string): string;

/**
 * Fold the session's solved state into a history DOCUMENT: replaces the
 * top-level `assembly` block and writes each pending pose / grounded flag
 * into the owning feature's `inputParams` (matched by `inputParams.id` —
 * generic JSON, no dependency on the ACOMP feature shape). The app calls this
 * on its document before persisting or re-running (the pose-authority
 * write-back).
 */
export function assembly_apply_document_json(document_json: string): string;

/**
 * Scan and CREATE: every accepted candidate becomes a constraint, then ONE
 * solve runs for the whole batch (each inferred constraint is already
 * satisfied at the pose it was read from, so a healthy assembly does not
 * move). Returns `{ok, created: [id…], report, solve}`.
 */
export function assembly_apply_inferred_constraints_json(options_json: string): string;

/**
 * The last solve's DOF/diagnostics summary (`{ok, dof, rank, redundant,
 * status, strategy, iterations, maxResidual, ...}` or `{ok:false, error}`).
 */
export function assembly_dof_json(): string;

/**
 * SCAN the live scene for constraints its component placement implies, without
 * creating anything. `options_json` is [`super::infer::InferOptions`] (`{}` for
 * the defaults). Never `Err`: a missing session or a bad options object comes
 * back as `{ok: false, error}` — a `JsValue` error aborts a native build.
 */
export function assembly_infer_constraints_json(options_json: string): string;

/**
 * The inferable constraint types, joined to the catalogue: `[{type, label,
 * icon, longName, detects, defaultOn}]`. Session-free — the dialog can list
 * what the button offers before any document is open.
 */
export function assembly_inferable_types_json(): string;

/**
 * Reorder a constraint to `index` (clamped). Auto-solves; returns the report.
 */
export function assembly_move_constraint_json(id: string, index: number): string;

/**
 * Overlay geometry for the viewport graphics lane: per enabled constraint,
 * the resolved WORLD anchor points/directions/geometry classes (post-solve),
 * the status, the evaluated value, and (multi-element types) the element
 * role groups — `[{id, type, status, message, anchors, directions, geoms,
 * value, unit, target, groups}]`. Constraints whose selections do not
 * resolve emit status/message only (no anchors).
 */
export function assembly_overlay_json(): string;

/**
 * The pending generic feature write-backs: `{"poses": {componentId:
 * transformParam}, "isFixed": {componentId: bool}}`. The transform param is
 * `{translate, rotateEulerDeg (deg, intrinsic XYZ)}` — exactly the shape the
 * ACOMP feature's `inputParams.transform` reader expects.
 */
export function assembly_pose_updates_json(): string;

/**
 * Delete a constraint. Auto-solves; returns the solve report.
 */
export function assembly_remove_constraint_json(id: string): string;

/**
 * Manual solve (the panel's Solve button). Returns the solve report.
 */
export function assembly_run_solve_json(): string;

/**
 * Enable/disable a constraint. Auto-solves; returns the solve report.
 */
export function assembly_set_constraint_enabled_json(id: string, enabled: boolean): string;

/**
 * Persist a constraint row's dialog expansion state (view state — no solve).
 */
export function assembly_set_constraint_open_json(id: string, open: boolean): void;

/**
 * The current `assembly` block (post-solve) as JSON — the panel's list source
 * and the state the app folds back into its document.
 */
export function assembly_state_json(): string;

/**
 * Per-constraint status rows: `[{id, type, enabled, open, status, message,
 * satisfied, error}]`.
 */
export function assembly_statuses_json(): string;

/**
 * Replace a constraint's `inputParams` (the dialog commit). Auto-solves;
 * returns the solve report.
 */
export function assembly_update_constraint_json(id: string, params_json: string): string;

export function boolean_brep_diagnostics_json(request_json: string): string;

export function boolean_brep_json(request_json: string): string;

/**
 * Boolean of two resident solids -> a NEW resident handle. The result never
 * crosses the boundary as topology; only its handle is returned. Kernel-produced
 * result is trusted (no double-validate).
 */
export function boolean_handle(a: number, b: number, operation: string, tolerance: number, merge_coplanar_faces: boolean): number;

export function box_brep_json(corner_x: number, corner_y: number, corner_z: number, size_x: number, size_y: number, size_z: number): string;

export function box_mesh_json(x: number, y: number, z: number): string;

export function build_imprints_json(request_json: string): string;

export function build_pcurve_json(request_json: string): string;

export function capabilities_json(): string;

/**
 * Diagnostic carrier preview: re-express a surface over an inflated domain
 * (open directions inflate about the centre via extended evaluation; closed
 * directions keep their full period). `inflate <= 0` defaults to 2.
 */
export function carrier_preview_patch_json(surface_json: string, inflate: number): string;

export function chamfer_edge_buffer(request_json: string): WasmSolidBuffer;

export function chamfer_edge_json(request_json: string): string;

export function chamfer_edges_angle_buffer(request_json: string): WasmSolidBuffer;

export function chamfer_edges_angle_json(request_json: string): string;

export function chamfer_edges_asymmetric_buffer(request_json: string): WasmSolidBuffer;

export function chamfer_edges_asymmetric_json(request_json: string): string;

export function circle_curve_json(request_json: string): string;

export function classify_points_json(request_json: string): string;

/**
 * wasm boundary for [`clear_history_cache`].
 */
export function clear_history_cache_json(): void;

export function cone_brep_json(radius_bottom: number, radius_top: number, height: number): string;

export function curve_derivatives_json(request_json: string): string;

export function curve_evaluate_json(request_json: string): string;

export function cylinder_brep_json(base_x: number, base_y: number, base_z: number, axis_x: number, axis_y: number, axis_z: number, radius: number, height: number): string;

export function cylinder_mesh_json(radius: number, height: number, segments: number): string;

/**
 * Deserialize a history request, run it, and serialize the per-feature results.
 * The handles in the result are `u32`s the caller tessellates / pulls names
 * from via the existing `*_handle` wasm exports.
 */
export function execute_history_json(request_json: string): string;

export function export_step_json(request_json: string): string;

export function extrude_brep_buffer(request_json: string): WasmSolidBuffer;

export function extrude_brep_json(request_json: string): string;

export function extrude_profile_brep_draft_buffer(request_json: string): WasmSolidBuffer;

export function extrude_profile_brep_draft_json(request_json: string): string;

export function face_metrics_json(face_json: string): string;

/**
 * The resident solid's face id -> name map (Stage 1b; lets the host rebuild its
 * selection/name index from a handle without materializing the full graph).
 */
export function face_names_handle(handle: number): string;

/**
 * wasm boundary: the whole feature-schema catalogue as JSON.
 */
export function feature_schemas_json(): string;

export function fillet_edge_buffer(request_json: string): WasmSolidBuffer;

export function fillet_edge_json(request_json: string): string;

export function fillet_edges_buffer(request_json: string): WasmSolidBuffer;

export function fillet_edges_json(request_json: string): string;

export function fillet_edges_variable_buffer(request_json: string): WasmSolidBuffer;

export function fillet_edges_variable_json(request_json: string): string;

export function fragment_faces_json(request_json: string): string;

/**
 * Drop a resident solid. No-op if the handle is unknown.
 */
export function free_solid(handle: number): void;

export function hyperbola_curve_json(request_json: string): string;

/**
 * Import Wavefront OBJ text as a faceted (planar-triangle) BREP solid.
 * `tolerance <= 0` derives the vertex-weld band from the model's
 * bounding-box diagonal.
 */
export function import_obj_solid(text: string, tolerance: number): string;

/**
 * Import an ISO-10303-21 (STEP Part 21) document and return the reconstructed
 * kernel solids as a JSON array of `BrepSolid` records. Round-trips exactly
 * what `export_step` writes; unsupported entities yield a clear error string.
 */
export function import_step_json(step_text: string): string;

/**
 * Import binary-STL bytes as a faceted (planar-triangle) BREP solid.
 * `tolerance <= 0` derives the vertex-weld band from the model's
 * bounding-box diagonal.
 */
export function import_stl_solid(data: Uint8Array, tolerance: number): string;

export function interpolate_curve_thinned_json(request_json: string): string;

export function intersect_curve_surface_json(request_json: string): string;

export function intersect_curves_json(request_json: string): string;

export function intersect_surfaces_json(request_json: string): string;

export function line_curve_json(request_json: string): string;

export function loft_brep_buffer(request_json: string): WasmSolidBuffer;

export function loft_brep_json(request_json: string): string;

export function loft_profile_brep_closed_buffer(request_json: string): WasmSolidBuffer;

export function loft_profile_brep_closed_json(request_json: string): string;

export function loft_profile_brep_guided_buffer(request_json: string): WasmSolidBuffer;

export function loft_profile_brep_guided_json(request_json: string): string;

export function loft_profile_brep_tangent_buffer(request_json: string): WasmSolidBuffer;

export function loft_profile_brep_tangent_json(request_json: string): string;

/**
 * Analytic mass properties of a resident solid (a handful of scalars).
 */
export function mass_properties_handle(handle: number): string;

export function merge_curve_continuations_json(request_json: string): string;

export function mesh_regions_to_brep_buffer(request_json: string): WasmSolidBuffer;

export function mesh_regions_to_brep_json(request_json: string): string;

export function mesh_volume_json(mesh_json: string): number;

export function mirror_brep_buffer(request_json: string): WasmSolidBuffer;

export function mirror_brep_json(request_json: string): string;

export function offset_face_carrier_json(request_json: string): string;

export function offset_shell_diagnostics_json(request_json: string): string;

export function offset_shell_json(request_json: string): string;

export function offset_surface_json(request_json: string): string;

export function parabola_curve_json(request_json: string): string;

export function parameter_point_in_face_json(request_json: string): string;

/**
 * The current library in the `partsLibrary` block shape — what SAVE must
 * serialize into the document (never the loaded block: this copy carries
 * healed snapshots, refreshes, and GC).
 */
export function parts_library_json(): string;

export function point_in_polygon_json(request_json: string): string;

export function project_curve_json(request_json: string): string;

export function project_surface_json(request_json: string): string;

export function pyramid_brep_json(corner_x: number, corner_y: number, corner_z: number, side_length: number, height: number, sides: number): string;

export function read_stl_json(data: Uint8Array): string;

/**
 * UPDATE (update-components / edit-in-place commit): replace an existing
 * entry's document + signature. When the new document BUILDS differently
 * ([`same_build`]) the entry is marked DIRTY: the next history run's ACOMP
 * self-heal lane re-executes the document, re-snapshots, and every instance
 * of the part follows. When it builds the same — only its symbol, pads or BOM
 * attributes moved — the snapshot and ports still describe it and are kept,
 * so the part is not rebuilt for an edit that changed no geometry.
 *
 * The wasm export; a NATIVE caller must call [`refresh_library_entry_impl`],
 * for the reason [`add_part_to_library`] gives.
 */
export function refresh_library_entry(name: string, source_signature: string, document_json: string): void;

/**
 * Ingest a solid from the flat f64 codec into the resident registry (arena +
 * validate kept — external / first-crossing ingest). Returns an opaque handle.
 */
export function register_solid_buffer(data: Float64Array, names_json: string): number;

/**
 * Ingest a solid from JSON into the resident registry (arena + validate kept).
 */
export function register_solid_json(solid_json: string): number;

/**
 * Number of resident solids (diagnostics / handle-leak detection).
 */
export function registered_solid_count(): number;

export function revolve_brep_buffer(request_json: string): WasmSolidBuffer;

export function revolve_brep_json(request_json: string): string;

export function rib_from_profile_buffer(request_json: string): WasmSolidBuffer;

export function rib_from_profile_json(request_json: string): string;

export function round_convex_corner_buffer(request_json: string): WasmSolidBuffer;

export function round_convex_corner_json(request_json: string): string;

/**
 * Every record carrying an imported COLOUR, as `{name: "#RRGGBB"}`.
 *
 * The narrow read the display layer needs. It exists because this store is
 * THREAD-LOCAL to whichever thread ran the history: `BREP_render` executes a
 * run on a background thread / worker, so anything the main thread wants must
 * be read runner-side and shipped in the `RunOutput` (the same reason the
 * assembly pose write-backs are read there). See `io/appearance.rs` for the
 * record convention and `BREP_render/src/pipeline.rs` for the consumer.
 *
 * Deliberately colour-only rather than a whole-store dump: every face carries
 * `sourceFeatureId` and friends, and pushing all of that across the seam into
 * the caller's own metadata store is a different decision from "an imported
 * colour should be visible".
 */
export function scene_metadata_colors_json(): string;

/**
 * The whole store (for part serialization).
 */
export function scene_metadata_dump_json(): string;

/**
 * The RESOLVED metadata for a name (inheritance chain merged, child wins).
 */
export function scene_metadata_get_json(name: string): string;

/**
 * The OWN metadata record only (no inheritance).
 */
export function scene_metadata_get_own_json(name: string): string;

/**
 * Replace the whole store (part load / reset — pass `{}` to clear).
 */
export function scene_metadata_load_json(all_json: string): void;

/**
 * Remove a whole record.
 */
export function scene_metadata_remove(name: string): void;

/**
 * Set (replace) the metadata record for a scene object name.
 */
export function scene_metadata_set_json(name: string, record_json: string): void;

export function segment_intersection_json(request_json: string): string;

export function segment_mesh_faces_json(request_json: string): string;

/**
 * Escape hatch: pull a resident solid's full topology across the boundary (for
 * STEP export or JSON-only lanes during the migration). Prefer handle-native
 * ops — this re-incurs the serialization cost the registry exists to avoid.
 */
export function solid_handle_to_buffer(handle: number): WasmSolidBuffer;

export function solid_mass_properties_full_json(solid_json: string): string;

export function solid_mass_properties_json(solid_json: string): string;

export function solve_assembly_json(request_json: string): string;

export function solve_banded_json(request_json: string): string;

export function solve_dense_json(request_json: string): string;

export function solve_sketch_json(request_json: string): string;

export function sphere_brep_json(radius: number): string;

/**
 * Cut a solid by the analytic carrier of a selected face's `surface` (Golovanov
 * §6.4). The face may be a plane, cylinder, cone, or sphere; the kernel
 * recognizes its analytic type and extends it to span the body. Returns
 * `{ "pieces": [<below/inside>, <above/outside>] }`. Errors on non-analytic
 * faces or when the carrier does not cleanly divide the body.
 */
export function split_solid_by_face_surface_json(request_json: string): string;

/**
 * Cut a solid by a plane (Golovanov §6.4). Returns `{ "below": <solid>,
 * "above": <solid> }` — the −n and +n pieces of the split. Errors with
 * "plane does not intersect the solid" when the plane misses the body.
 */
export function split_solid_by_plane_json(request_json: string): string;

/**
 * Cut a solid by an analytic tool surface (Golovanov §6.4). The request is
 * `{ "solid": <solid>, "tool": { "type": "cylinder"|"sphere"|"cone"|"torus"|
 * "plane", ... } }`. Returns `{ "pieces": [<inside>, <outside>] }` (for a
 * plane, `[below, above]`). Errors with "tool surface does not divide the
 * solid" when the tool does not cleanly cut the body.
 */
export function split_solid_by_surface_json(request_json: string): string;

/**
 * Reconstruct an STL (binary or ASCII bytes) into a validated STEP solid.
 * `options_json` is a (possibly partial) `StlConversionOptions`; "" = defaults.
 * Returns JSON `{ step, report, sourceTriangles }`; `step` feeds the kernel's
 * IMPORT3D `stepText` lane unchanged.
 */
export function stl_to_step_json(bytes: Uint8Array, options_json: string, name: string): string;

export function sweep_profile_along_path_buffer(request_json: string): WasmSolidBuffer;

export function sweep_profile_along_path_json(request_json: string): string;

export function sweep_profile_helix_buffer(request_json: string): WasmSolidBuffer;

export function sweep_profile_helix_json(request_json: string): string;

export function sweep_profile_twisted_buffer(request_json: string): WasmSolidBuffer;

export function sweep_profile_twisted_json(request_json: string): string;

export function tessellate_brep_json(request_json: string): string;

export function tessellate_face_json(request_json: string): string;

/**
 * Tessellate a resident solid to watertight mesh buffers (the buffers cross the
 * boundary; the solid does not).
 */
export function tessellate_handle(handle: number, chord_tolerance: number): WasmMeshBuffers;

export function thicken_face_sheet_buffer(request_json: string): WasmSolidBuffer;

export function thicken_face_sheet_json(request_json: string): string;

export function thicken_trimmed_sheet_buffer(request_json: string): WasmSolidBuffer;

export function thicken_trimmed_sheet_json(request_json: string): string;

/**
 * Batch-read RESOLVED records for a list of names (the per-solid display
 * read: one call per materialization, not one per face).
 */
export function topo_metadata_for_names_json(names_json: string): string;

export function torus_brep_json(major_radius: number, minor_radius: number): string;

export function transform_brep_json(request_json: string): string;

/**
 * Rigid/affine transform of a resident solid -> a NEW resident handle (Stage 1b;
 * unblocks Transform/Pattern/bakeTransform from the legacy serialize lane). The
 * result never crosses the boundary as topology. Kernel-produced, so trusted.
 */
export function transform_handle(handle: number, matrix: Float64Array, reverse_orientation: boolean): number;

export function uniform_clamped_knots_json(control_point_count: number, degree: number): string;

export function validate_brep_detailed_json(solid_json: string): string;

export function validate_brep_json(solid_json: string): string;

export function write_obj_text(mesh_json: string, name: string): string;

export function write_stl_bytes(mesh_json: string, name: string): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmbrepsolid_free: (a: number, b: number) => void;
    readonly __wbg_wasmmeshbuffers_free: (a: number, b: number) => void;
    readonly __wbg_wasmnurbscurve_free: (a: number, b: number) => void;
    readonly __wbg_wasmnurbssurface_free: (a: number, b: number) => void;
    readonly __wbg_wasmsolidbuffer_free: (a: number, b: number) => void;
    readonly add_part_to_library: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly apply_edge_splits_json: (a: number, b: number) => [number, number, number, number];
    readonly arc_curve_json: (a: number, b: number) => [number, number, number, number];
    readonly arrange_segments_json: (a: number, b: number) => [number, number, number, number];
    readonly assembly_add_constraint_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly assembly_apply_document_json: (a: number, b: number) => [number, number, number, number];
    readonly assembly_apply_inferred_constraints_json: (a: number, b: number) => [number, number];
    readonly assembly_dof_json: () => [number, number];
    readonly assembly_infer_constraints_json: (a: number, b: number) => [number, number];
    readonly assembly_inferable_types_json: () => [number, number];
    readonly assembly_move_constraint_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly assembly_overlay_json: () => [number, number];
    readonly assembly_pose_updates_json: () => [number, number];
    readonly assembly_remove_constraint_json: (a: number, b: number) => [number, number, number, number];
    readonly assembly_run_solve_json: () => [number, number, number, number];
    readonly assembly_set_constraint_enabled_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly assembly_set_constraint_open_json: (a: number, b: number, c: number) => [number, number];
    readonly assembly_state_json: () => [number, number];
    readonly assembly_statuses_json: () => [number, number];
    readonly assembly_update_constraint_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly boolean_brep_diagnostics_json: (a: number, b: number) => [number, number, number, number];
    readonly boolean_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly boolean_handle: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly box_brep_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly box_mesh_json: (a: number, b: number, c: number) => [number, number];
    readonly build_imprints_json: (a: number, b: number) => [number, number, number, number];
    readonly build_pcurve_json: (a: number, b: number) => [number, number, number, number];
    readonly capabilities_json: () => [number, number];
    readonly carrier_preview_patch_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly chamfer_edge_buffer: (a: number, b: number) => [number, number, number];
    readonly chamfer_edge_json: (a: number, b: number) => [number, number, number, number];
    readonly chamfer_edges_angle_buffer: (a: number, b: number) => [number, number, number];
    readonly chamfer_edges_angle_json: (a: number, b: number) => [number, number, number, number];
    readonly chamfer_edges_asymmetric_buffer: (a: number, b: number) => [number, number, number];
    readonly chamfer_edges_asymmetric_json: (a: number, b: number) => [number, number, number, number];
    readonly circle_curve_json: (a: number, b: number) => [number, number, number, number];
    readonly classify_points_json: (a: number, b: number) => [number, number, number, number];
    readonly clear_history_cache_json: () => void;
    readonly cone_brep_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly curve_derivatives_json: (a: number, b: number) => [number, number, number, number];
    readonly curve_evaluate_json: (a: number, b: number) => [number, number, number, number];
    readonly cylinder_brep_json: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
    readonly cylinder_mesh_json: (a: number, b: number, c: number) => [number, number];
    readonly execute_history_json: (a: number, b: number) => [number, number, number, number];
    readonly export_step_json: (a: number, b: number) => [number, number, number, number];
    readonly extrude_brep_buffer: (a: number, b: number) => [number, number, number];
    readonly extrude_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly extrude_profile_brep_draft_buffer: (a: number, b: number) => [number, number, number];
    readonly extrude_profile_brep_draft_json: (a: number, b: number) => [number, number, number, number];
    readonly face_metrics_json: (a: number, b: number) => [number, number, number, number];
    readonly face_names_handle: (a: number) => [number, number, number, number];
    readonly feature_schemas_json: () => [number, number];
    readonly fillet_edge_buffer: (a: number, b: number) => [number, number, number];
    readonly fillet_edge_json: (a: number, b: number) => [number, number, number, number];
    readonly fillet_edges_buffer: (a: number, b: number) => [number, number, number];
    readonly fillet_edges_json: (a: number, b: number) => [number, number, number, number];
    readonly fillet_edges_variable_buffer: (a: number, b: number) => [number, number, number];
    readonly fillet_edges_variable_json: (a: number, b: number) => [number, number, number, number];
    readonly fragment_faces_json: (a: number, b: number) => [number, number, number, number];
    readonly free_solid: (a: number) => void;
    readonly hyperbola_curve_json: (a: number, b: number) => [number, number, number, number];
    readonly import_obj_solid: (a: number, b: number, c: number) => [number, number, number, number];
    readonly import_step_json: (a: number, b: number) => [number, number, number, number];
    readonly import_stl_solid: (a: number, b: number, c: number) => [number, number, number, number];
    readonly interpolate_curve_thinned_json: (a: number, b: number) => [number, number, number, number];
    readonly intersect_curve_surface_json: (a: number, b: number) => [number, number, number, number];
    readonly intersect_curves_json: (a: number, b: number) => [number, number, number, number];
    readonly intersect_surfaces_json: (a: number, b: number) => [number, number, number, number];
    readonly line_curve_json: (a: number, b: number) => [number, number, number, number];
    readonly loft_brep_buffer: (a: number, b: number) => [number, number, number];
    readonly loft_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly loft_profile_brep_closed_buffer: (a: number, b: number) => [number, number, number];
    readonly loft_profile_brep_closed_json: (a: number, b: number) => [number, number, number, number];
    readonly loft_profile_brep_guided_buffer: (a: number, b: number) => [number, number, number];
    readonly loft_profile_brep_guided_json: (a: number, b: number) => [number, number, number, number];
    readonly loft_profile_brep_tangent_buffer: (a: number, b: number) => [number, number, number];
    readonly loft_profile_brep_tangent_json: (a: number, b: number) => [number, number, number, number];
    readonly mass_properties_handle: (a: number) => [number, number, number, number];
    readonly merge_curve_continuations_json: (a: number, b: number) => [number, number, number, number];
    readonly mesh_regions_to_brep_buffer: (a: number, b: number) => [number, number, number];
    readonly mesh_regions_to_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly mesh_volume_json: (a: number, b: number) => [number, number, number];
    readonly mirror_brep_buffer: (a: number, b: number) => [number, number, number];
    readonly mirror_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly offset_face_carrier_json: (a: number, b: number) => [number, number, number, number];
    readonly offset_shell_diagnostics_json: (a: number, b: number) => [number, number, number, number];
    readonly offset_shell_json: (a: number, b: number) => [number, number, number, number];
    readonly offset_surface_json: (a: number, b: number) => [number, number, number, number];
    readonly parabola_curve_json: (a: number, b: number) => [number, number, number, number];
    readonly parameter_point_in_face_json: (a: number, b: number) => [number, number, number, number];
    readonly parts_library_json: () => [number, number];
    readonly point_in_polygon_json: (a: number, b: number) => [number, number, number, number];
    readonly project_curve_json: (a: number, b: number) => [number, number, number, number];
    readonly project_surface_json: (a: number, b: number) => [number, number, number, number];
    readonly pyramid_brep_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly read_stl_json: (a: number, b: number) => [number, number, number, number];
    readonly refresh_library_entry: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly register_solid_buffer: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly register_solid_json: (a: number, b: number) => [number, number, number];
    readonly registered_solid_count: () => number;
    readonly revolve_brep_buffer: (a: number, b: number) => [number, number, number];
    readonly revolve_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly rib_from_profile_buffer: (a: number, b: number) => [number, number, number];
    readonly rib_from_profile_json: (a: number, b: number) => [number, number, number, number];
    readonly round_convex_corner_buffer: (a: number, b: number) => [number, number, number];
    readonly round_convex_corner_json: (a: number, b: number) => [number, number, number, number];
    readonly scene_metadata_colors_json: () => [number, number];
    readonly scene_metadata_dump_json: () => [number, number];
    readonly scene_metadata_get_json: (a: number, b: number) => [number, number];
    readonly scene_metadata_get_own_json: (a: number, b: number) => [number, number];
    readonly scene_metadata_load_json: (a: number, b: number) => [number, number];
    readonly scene_metadata_remove: (a: number, b: number) => void;
    readonly scene_metadata_set_json: (a: number, b: number, c: number, d: number) => [number, number];
    readonly segment_intersection_json: (a: number, b: number) => [number, number, number, number];
    readonly segment_mesh_faces_json: (a: number, b: number) => [number, number, number, number];
    readonly solid_handle_to_buffer: (a: number) => [number, number, number];
    readonly solid_mass_properties_full_json: (a: number, b: number) => [number, number, number, number];
    readonly solid_mass_properties_json: (a: number, b: number) => [number, number, number, number];
    readonly solve_assembly_json: (a: number, b: number) => [number, number, number, number];
    readonly solve_banded_json: (a: number, b: number) => [number, number, number, number];
    readonly solve_dense_json: (a: number, b: number) => [number, number, number, number];
    readonly solve_sketch_json: (a: number, b: number) => [number, number, number, number];
    readonly sphere_brep_json: (a: number) => [number, number, number, number];
    readonly split_solid_by_face_surface_json: (a: number, b: number) => [number, number, number, number];
    readonly split_solid_by_plane_json: (a: number, b: number) => [number, number, number, number];
    readonly split_solid_by_surface_json: (a: number, b: number) => [number, number, number, number];
    readonly stl_to_step_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly sweep_profile_along_path_buffer: (a: number, b: number) => [number, number, number];
    readonly sweep_profile_along_path_json: (a: number, b: number) => [number, number, number, number];
    readonly sweep_profile_helix_buffer: (a: number, b: number) => [number, number, number];
    readonly sweep_profile_helix_json: (a: number, b: number) => [number, number, number, number];
    readonly sweep_profile_twisted_buffer: (a: number, b: number) => [number, number, number];
    readonly sweep_profile_twisted_json: (a: number, b: number) => [number, number, number, number];
    readonly tessellate_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly tessellate_face_json: (a: number, b: number) => [number, number, number, number];
    readonly tessellate_handle: (a: number, b: number) => [number, number, number];
    readonly thicken_face_sheet_buffer: (a: number, b: number) => [number, number, number];
    readonly thicken_face_sheet_json: (a: number, b: number) => [number, number, number, number];
    readonly thicken_trimmed_sheet_buffer: (a: number, b: number) => [number, number, number];
    readonly thicken_trimmed_sheet_json: (a: number, b: number) => [number, number, number, number];
    readonly topo_metadata_for_names_json: (a: number, b: number) => [number, number, number, number];
    readonly torus_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly transform_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly transform_handle: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly uniform_clamped_knots_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_brep_detailed_json: (a: number, b: number) => [number, number, number, number];
    readonly validate_brep_json: (a: number, b: number) => [number, number, number, number];
    readonly wasmbrepsolid_boolean_buffer: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmbrepsolid_boolean_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasmbrepsolid_delete_face_and_heal_buffer: (a: number, b: number) => [number, number, number];
    readonly wasmbrepsolid_delete_face_and_heal_json: (a: number, b: number) => [number, number, number, number];
    readonly wasmbrepsolid_export_step: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly wasmbrepsolid_from_buffer: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmbrepsolid_full_mass_properties_json: (a: number) => [number, number, number, number];
    readonly wasmbrepsolid_full_mass_properties_with_density_json: (a: number, b: number) => [number, number, number, number];
    readonly wasmbrepsolid_mass_properties_json: (a: number) => [number, number, number, number];
    readonly wasmbrepsolid_move_faces_json: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly wasmbrepsolid_new: (a: number, b: number) => [number, number, number];
    readonly wasmbrepsolid_offset_shell_buffer: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmbrepsolid_offset_shell_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmbrepsolid_sample_edges_buffer: (a: number, b: number) => [number, number, number, number];
    readonly wasmbrepsolid_sew_json: (a: number, b: number) => [number, number, number, number];
    readonly wasmbrepsolid_tessellate_buffers: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmbrepsolid_tessellate_json: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmbrepsolid_tessellate_watertight_buffers: (a: number, b: number) => [number, number, number];
    readonly wasmbrepsolid_tessellate_watertight_face_stride_buffers: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmbrepsolid_tessellate_watertight_face_stride_with_samples_buffers: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmbrepsolid_to_buffer: (a: number) => [number, number, number];
    readonly wasmbrepsolid_to_json: (a: number) => [number, number, number, number];
    readonly wasmbrepsolid_transform_buffer: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmbrepsolid_transform_json: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmbrepsolid_validate_json: (a: number) => [number, number, number, number];
    readonly wasmmeshbuffers_take_face_ids: (a: number) => [number, number];
    readonly wasmmeshbuffers_take_indices: (a: number) => [number, number];
    readonly wasmmeshbuffers_take_normals: (a: number) => [number, number];
    readonly wasmmeshbuffers_take_positions: (a: number) => [number, number];
    readonly wasmnurbscurve_derivatives_flat: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmnurbscurve_evaluate_many: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmnurbscurve_new: (a: number, b: number) => [number, number, number];
    readonly wasmnurbssurface_derivatives_flat: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly wasmnurbssurface_evaluate_many: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmnurbssurface_new: (a: number, b: number) => [number, number, number];
    readonly wasmnurbssurface_normals_many: (a: number, b: number, c: number) => [number, number, number, number];
    readonly wasmsolidbuffer_metadata_json: (a: number) => [number, number];
    readonly wasmsolidbuffer_names_json: (a: number) => [number, number];
    readonly wasmsolidbuffer_take_data: (a: number) => [number, number];
    readonly write_obj_text: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly write_stl_bytes: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
