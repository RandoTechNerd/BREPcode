# Kernel benchmarks

Scripts for timing BREPcode's kernels against each other and against new upstream builds. The full write-up of the
2026-11-01 run (Rust 0.9.0 vs 0.11.0 vs SMLib) is `Claude Play/BREPcodeKernelReport/next-brep-0.11-speed-report.md`.

| Script | What it does |
|---|---|
| `kernel-bench.mjs models` | every catalog family at its defaults plus the bundled examples, through `runEngine`, cold cache, median of `--reps` |
| `kernel-bench.mjs probe` | one feature per case: what a kernel builds exactly, sends to the mesh lane, or refuses |
| `kernel-bench.mjs stl` | STL -> STEP (`stl_to_step_json`) on a list of files, with the converter's own report |
| `stl-each.sh` | the stl mode one file per process with a time cap, so a conversion that never returns is a "timeout" row |
| `stl-prep-app.mjs` | prepares STLs the way the viewer's import does (repair, ASCII, dedupe, recentre) |
| `kernel-compare.mjs` | two runs side by side: totals, geometric-mean ratio, wins and losses, changed outcomes, a Markdown section |

`--kernel` picks the kernel: `wasm` (vendor/brep-kernel-rust), `native` (vendor/brep-kernel-native), `smlib-native`
(native/nvidia-kernel), `smlib-wasm` (vendor/brep-kernel-smlib). `BREPCODE_RUST_KERNEL_DIR` and
`BREPCODE_NATIVE_KERNEL` point the Rust ones at a candidate build, so a new upstream release can be timed before it is
vendored.

## 2026-11-01, in short

- Rust 0.11.0 builds models 15 to 42% faster than 0.9.0 (wasm and native, two rounds), same output, no new refusals.
- Its STL -> STEP is about as fast and opens files 0.9.0 refused, but rebuilt two CAD parts as facets and traps or
  hangs on three meshes. Hence `src/stlexact.js`: 0.11.0 first, capped and isolated, 0.9.0
  (`vendor/brep-stl2step-legacy`) as a second opinion.
- SMLib first with Rust 0.11.0 for its refusals is the fastest path overall: about half the total time of Rust alone,
  even on a typical model natively, 19% faster on the web.
