# vendor/brep-kernel-smlib

The SMLib B-rep kernel, based on NVIDIA's open-source usd-brep (SMLib +
SM_API, v1.0.1, Apache-2.0), compiled to WebAssembly in
https://github.com/RandoTechNerd/smlib-wasm (commit 5d3d2cb). Staged here by
`node build-smlib-wasm.mjs`; don't edit these files by hand.

`api.mjs` gives the same functions as the desktop's native addon, so
`native/nvidia-kernel/adapter.cjs` runs on it unchanged (see
viewer/kernel-worker.js). See LICENSE and THIRD_PARTY_NOTICES.md.
