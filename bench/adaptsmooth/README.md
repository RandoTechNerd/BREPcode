# Smooth surface bench: current path vs coarse-to-fine

Meshes are not checked in (copy wobbly/heart/bag/benchy20 .stl here).

    node current.mjs wobbly.stl 1200 2500          # QuadriFlow 2500 -> one bicubic per quad -> Rust import
    LAMBDA=0.2 node adaptive.mjs wobbly.stl 800 0.1 3   # coarse 800 cage, refine to 0.1% of the diagonal, max 8 spans
    MODE=insert node adaptive.mjs wobbly.stl 400 0.1 3  # knot insertion only: what control points cost the kernel
    AUTO=1 node adaptive.mjs benchy20.stl 400 0.1 3     # step the coarse cage up 400 -> 1000 -> 2500 until it keeps the shape
    node colorize.mjs wobbly.stl out/wobbly-a800-0.1-3.json out/c.json
    python render.py shots/x.png iso "title" out/c.json dev:0.3 "levels" out/c.json level

Each run prints one JSON line (times per stage, faces, two-sided deviation, kernel result); brief.mjs summarises.

Benchy follow-up (2026-11-02):

    AUTO=1 node adaptive.mjs benchy20.stl 400 0.1 3    # picks 2500 (380: 12% off, 829: 3.7%, 2448: 0.94%)
    node genus2.mjs benchy20.stl 400 1200 2500         # hole count of the closed shell (NOT a usable test: see notes)
    node clean.mjs benchy20.stl benchy20c.stl 1        # drop needle triangles
    REF=benchy20.stl node density.mjs benchy20c.stl 1000 1000 0.3   # anchors -> size field -> QuadriFlow density build

density.mjs needs QuadriFlowWasm/out/quadriflow-density.{mjs,wasm} (`bash build.sh density` in QuadriFlowWasm:
patched copies in QuadriFlowWasm/density/ let quads shrink to 1/5 size from a per-vertex field). Each QuadriFlow
seed runs in a child process with a 60-90 s deadline, as the app's watchdog does.
