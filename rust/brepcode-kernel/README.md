# brepcode-kernel

The WebAssembly kernel in `vendor/brep-kernel-rust/` is built from this crate.

It is the **next.BREP.io Rust BREP kernel** by **mmiscool** / Autodrop3d LLC
(<https://next.brep.io>, <https://github.com/mmiscool/next.BREP.io_RUST_BREP_KERNEL>),
pinned to commit `75bad91` (BREP_kernel 0.9.0) and used **unmodified**. This crate
adds one export, `stl_to_step_json`, which calls the upstream `BREP_reconstruction`
library (the engine behind `stl2step`), so the browser loads one wasm instead of two.

The kernel is under the Autodrop3d licence: see `../../vendor/brep-kernel-rust/LICENSE.md`.

## Rebuild

Needs rustup (the toolchain in `rust-toolchain.toml` installs itself) and wasm-pack.

    cd rust/brepcode-kernel
    wasm-pack build --release --target web --out-dir pkg --out-name brep_kernel
    cp pkg/brep_kernel.js pkg/brep_kernel_bg.wasm pkg/brep_kernel.d.ts ../../vendor/brep-kernel-rust/

Then `node test/engine.js` compares every lane against the JS kernel.
