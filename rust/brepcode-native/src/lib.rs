//! The Rust BREP kernel as a Node-API addon, for the desktop app.
//!
//! Exactly the calls src/engine.js and the build worker make on the wasm
//! module (execute_history_json, tessellate_handle, face_names_handle,
//! free_solid, stl_to_step_json), built from the upstream kernel's native Rust
//! entry points rather than its #[wasm_bindgen] wrappers: off wasm those build
//! their errors as JsValue, which panics.
//!
//! Every kernel call runs on ONE dedicated thread. The kernel keeps its solids
//! in a thread_local registry, so handles from one call are only valid on the
//! thread that made them; that thread also gets a big stack, because deep
//! booleans recurse further than a default 1 MB Windows stack allows. A panic
//! in the kernel is caught there and comes back as an ordinary error.

use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Mutex, OnceLock};

use brep_reconstruction::stl::{parse_stl_bytes, StlFormat, StlReadOptions};
use brep_reconstruction::stl_conversion::{
    binary_stl_coordinate_precision_tolerance, convert_stl_mesh_to_step, StlConversionOptions,
};
use kernel::feature_pipeline::{execute_history, HistoryRequest};
use napi::bindgen_prelude::{Buffer, Float64Array, Uint32Array};
use napi::{Error, Result};
use napi_derive::napi;

#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

type Job = Box<dyn FnOnce() + Send>;

const KERNEL_STACK: usize = 512 * 1024 * 1024;

fn kernel_thread() -> &'static Mutex<Sender<Job>> {
    static TX: OnceLock<Mutex<Sender<Job>>> = OnceLock::new();
    TX.get_or_init(|| {
        let (tx, rx) = channel::<Job>();
        std::thread::Builder::new()
            .name("brep-kernel".into())
            .stack_size(KERNEL_STACK)
            .spawn(move || {
                for job in rx {
                    job();
                }
            })
            .expect("spawn the kernel thread");
        Mutex::new(tx)
    })
}

/// Run `f` on the kernel thread and wait for it. Panics become errors.
fn on_kernel<T: Send + 'static>(f: impl FnOnce() -> std::result::Result<T, String> + Send + 'static) -> Result<T> {
    let (tx, rx) = channel();
    let job: Job = Box::new(move || {
        let out = catch_unwind(AssertUnwindSafe(f)).unwrap_or_else(|p| {
            let msg = p
                .downcast_ref::<&str>()
                .map(|s| s.to_string())
                .or_else(|| p.downcast_ref::<String>().cloned())
                .unwrap_or_else(|| "unknown panic".into());
            Err(format!("kernel panic: {msg}"))
        });
        let _ = tx.send(out);
    });
    kernel_thread()
        .lock()
        .map_err(|_| Error::from_reason("kernel thread lock poisoned"))?
        .send(job)
        .map_err(|_| Error::from_reason("kernel thread is gone"))?;
    rx.recv()
        .map_err(|_| Error::from_reason("kernel thread dropped the call"))?
        .map_err(Error::from_reason)
}

#[napi]
pub fn execute_history_json(request_json: String) -> Result<String> {
    on_kernel(move || {
        let request: HistoryRequest = serde_json::from_str(&request_json)
            .map_err(|e| format!("execute_history_json: bad request: {e}"))?;
        let result = execute_history(&request);
        serde_json::to_string(&result).map_err(|e| e.to_string())
    })
}

#[napi(object)]
pub struct MeshBuffers {
    pub positions: Float64Array,
    pub normals: Float64Array,
    pub indices: Uint32Array,
    pub face_ids: Uint32Array,
}

#[napi]
pub fn tessellate_handle(handle: u32, chord_tolerance: f64) -> Result<MeshBuffers> {
    let mesh = on_kernel(move || {
        let solid = kernel::registered_solid_clone(handle)?;
        kernel::tessellate_brep_watertight(&solid, chord_tolerance)
    })?;
    Ok(MeshBuffers {
        positions: mesh.positions.into(),
        normals: mesh.normals.into(),
        indices: mesh.indices.into(),
        face_ids: mesh.face_ids.into(),
    })
}

#[napi]
pub fn face_names_handle(handle: u32) -> Result<String> {
    on_kernel(move || {
        let solid = kernel::registered_solid_clone(handle)?;
        let map: Vec<(u64, Option<String>)> = solid
            .shells
            .iter()
            .flat_map(|s| s.faces.iter().map(|f| (f.id, f.name.clone())))
            .collect();
        serde_json::to_string(&map).map_err(|e| e.to_string())
    })
}

#[napi]
pub fn free_solid(handle: u32) -> Result<()> {
    on_kernel(move || {
        kernel::free_solid(handle);
        Ok(())
    })
}

/// Drop the incremental history cache and every handle it owns.
#[napi]
pub fn clear_history_cache() -> Result<()> {
    on_kernel(|| {
        kernel::feature_pipeline::clear_history_cache();
        Ok(())
    })
}

#[napi]
pub fn registered_solid_count() -> Result<u32> {
    on_kernel(|| Ok(kernel::registered_solid_count() as u32))
}

/// Same contract as the wasm build's export (rust/brepcode-kernel/src/lib.rs).
#[napi]
pub fn stl_to_step_json(bytes: Buffer, options_json: String, name: String) -> Result<String> {
    let bytes: Vec<u8> = bytes.to_vec();
    on_kernel(move || {
        let mut options: StlConversionOptions = if options_json.trim().is_empty() {
            StlConversionOptions::default()
        } else {
            serde_json::from_str(&options_json).map_err(|e| e.to_string())?
        };
        let imported = parse_stl_bytes(&bytes, &StlReadOptions::default()).map_err(|e| e.to_string())?;
        options.coordinate_precision_tolerance = match imported.format {
            StlFormat::Binary => binary_stl_coordinate_precision_tolerance(&imported.mesh),
            StlFormat::Ascii => 0.0,
        };
        let positions: Vec<f64> = imported.mesh.vertices.iter().flat_map(|p| [p.x, p.y, p.z]).collect();
        let indices: Vec<u32> = imported.mesh.triangles.iter().flatten().copied().collect();
        let name = if name.is_empty() { "converted_stl".to_string() } else { name };
        let out = convert_stl_mesh_to_step(&imported.mesh, &positions, Some(&indices), &options, &name, "mm", "")
            .map_err(|e| e.to_string())?;
        serde_json::to_string(&serde_json::json!({
            "step": out.step_text,
            "report": out.report,
            "sourceTriangles": imported.source_triangle_count,
        }))
        .map_err(|e| e.to_string())
    })
}

/// Which build this is, for the app's engine badge and the timing table.
#[napi]
pub fn native_info() -> String {
    format!(
        "brepcode_native {} ({}, parallel tessellation {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::ARCH,
        if cfg!(feature = "parallel") { "on" } else { "off" }
    )
}
