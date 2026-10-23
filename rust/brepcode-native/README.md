# brepcode-native

The desktop app's build of the Rust BREP kernel: the same upstream kernel and
commit as `../brepcode-kernel` (the wasm the website runs), compiled to a
Node-API addon instead of WebAssembly.

    npm run build:native     # -> vendor/brep-kernel-native/brepcode_native.node

`npm run desktop:build` runs it first (a first build is ~12 min, mostly the
kernel's fat LTO; after that cargo only relinks when this crate changes).

## How the app uses it

- `desktop/native-kernel.cjs` loads the addon and dresses it as the wasm
  module (same function names, `take_*()` buffers), so `src/engine.js` runs
  on it unchanged.
- `desktop/kernel-host.cjs` runs that engine in an Electron utility process,
  one per window. `desktop/kernel.cjs` (main process) spawns it and hands the
  page a MessagePort to it; the page passes the port to its build worker.
- `viewer/kernel-worker.js` builds on the port when it has one. A native
  refusal goes to the JS kernel as before; a missing addon, a crashed or
  killed host, or `BREPCODE_NATIVE=0` puts the worker back on the wasm
  kernel. The website never gets a port and is unchanged.
- The badge says "Exact (native)" / "Mesh (native)" when the native kernel
  built the model.

## What differs from the wasm build

- Every kernel call runs on one dedicated thread with a 512 MB stack: the
  kernel keeps solids in a thread_local registry, and deep booleans recurse
  past a default Windows stack. Panics are caught there and come back as
  errors (`panic = "unwind"`).
- mimalloc is the allocator. On Windows the system heap made the native
  kernel no faster than wasm; with mimalloc it is ~1.75x on the history run.
- The kernel's `parallel` feature is on: per-face tessellation uses rayon.
- Results match the wasm build vertex for vertex up to ordering (a loop can
  start at a different corner, a split face's halves can be named in either
  order); `node test/native.js` checks it.
