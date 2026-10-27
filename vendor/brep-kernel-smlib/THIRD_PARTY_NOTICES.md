# Third-party notices

## SMLib and SM_API, from usd-brep

`dist/smlib.wasm` is compiled from the `source/SMLib` and `source/SM_API`
folders of usd-brep (https://github.com/NVIDIA-Omniverse/usd-brep), commit
3fd5b9548d19aa8c12c29bc9637a96d42a06f8a5 (v1.0.1).

> Copyright (c) 2020-2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
> Licensed under the Apache License, Version 2.0 (see `LICENSE`).

Every one of those files carries `SPDX-License-Identifier: Apache-2.0` and an
NVIDIA copyright line, and none is modified here: `upstream/` is fetched at
the pinned commit and compiled as it is. The other components listed in
usd-brep's own THIRD_PARTY_NOTICES.md (OpenUSD, oneTBB, hwloc, MaterialX,
OpenSubdiv, CPython, pybind11 and the rest) belong to parts of usd-brep that
this build does not use or include.

This project is not affiliated with or endorsed by NVIDIA.

## Files written for this project

`src/smlib_wasm.cc` is a port of `native/nvidia-kernel/src/addon.cc` from
BREPcode to Emscripten's embind (the Napi types became `emscripten::val`,
errors are returned rather than thrown, and `init`, `lastError` and
`heapBytes` were added). It and every other file outside `upstream/` are
Apache-2.0 as well.

## Emscripten runtime

The build links Emscripten's runtime libraries into `dist/smlib.wasm` and
`dist/smlib.mjs`: the Emscripten JS runtime and embind (MIT / University of
Illinois NCSA), libc++ and libc++abi (Apache-2.0 with LLVM exception), and
musl libc (MIT). See https://github.com/emscripten-core/emscripten/blob/main/LICENSE.
