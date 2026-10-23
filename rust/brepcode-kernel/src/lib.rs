//! The upstream kernel's `#[wasm_bindgen]` exports come along with the
//! dependency; this crate adds the one thing the kernel's own wasm doesn't
//! export: STL -> exact STEP reconstruction.

use brep_reconstruction::stl::{parse_stl_bytes, StlFormat, StlReadOptions};
use brep_reconstruction::stl_conversion::{
    binary_stl_coordinate_precision_tolerance, convert_stl_mesh_to_step, StlConversionOptions,
};
use wasm_bindgen::prelude::*;

// Keep the kernel linked so its exports reach this cdylib.
pub use kernel;

fn js_err(message: impl ToString) -> JsValue {
    JsValue::from_str(&message.to_string())
}

/// Reconstruct an STL (binary or ASCII bytes) into a validated STEP solid.
/// `options_json` is a (possibly partial) `StlConversionOptions`; "" = defaults.
/// Returns JSON `{ step, report, sourceTriangles }`; `step` feeds the kernel's
/// IMPORT3D `stepText` lane unchanged.
#[wasm_bindgen]
pub fn stl_to_step_json(bytes: &[u8], options_json: &str, name: &str) -> Result<String, JsValue> {
    let mut options: StlConversionOptions = if options_json.trim().is_empty() {
        StlConversionOptions::default()
    } else {
        serde_json::from_str(options_json).map_err(js_err)?
    };
    let imported = parse_stl_bytes(bytes, &StlReadOptions::default()).map_err(js_err)?;
    options.coordinate_precision_tolerance = match imported.format {
        StlFormat::Binary => binary_stl_coordinate_precision_tolerance(&imported.mesh),
        StlFormat::Ascii => 0.0,
    };
    let positions: Vec<f64> = imported
        .mesh
        .vertices
        .iter()
        .flat_map(|p| [p.x, p.y, p.z])
        .collect();
    let indices: Vec<u32> = imported.mesh.triangles.iter().flatten().copied().collect();
    let name = if name.is_empty() { "converted_stl" } else { name };
    let out = convert_stl_mesh_to_step(&imported.mesh, &positions, Some(&indices), &options, name, "mm", "")
        .map_err(js_err)?;
    serde_json::to_string(&serde_json::json!({
        "step": out.step_text,
        "report": out.report,
        "sourceTriangles": imported.source_triangle_count,
    }))
    .map_err(js_err)
}
