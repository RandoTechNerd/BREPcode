# Smooth surface bench: current path vs coarse-to-fine

Meshes are not checked in (copy wobbly/heart/bag/benchy20 .stl here).

    node current.mjs wobbly.stl 1200 2500          # QuadriFlow 2500 -> one bicubic per quad -> Rust import
    LAMBDA=0.2 node adaptive.mjs wobbly.stl 800 0.1 3   # coarse 800 cage, refine to 0.1% of the diagonal, max 8 spans
    MODE=insert node adaptive.mjs wobbly.stl 400 0.1 3  # knot insertion only: what control points cost the kernel
    AUTO=1 node adaptive.mjs benchy20.stl 400 0.1 3     # step the coarse cage up 400 -> 1000 -> 2500 until it keeps the shape
    node colorize.mjs wobbly.stl out/wobbly-a800-0.1-3.json out/c.json
    python render.py shots/x.png iso "title" out/c.json dev:0.3 "levels" out/c.json level

Each run prints one JSON line (times per stage, faces, two-sided deviation, kernel result); brief.mjs summarises.
