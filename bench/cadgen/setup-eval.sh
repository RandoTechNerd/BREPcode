#!/usr/bin/env bash
# One-time setup for the local CADGenBench evaluator (bench/cadgen/score.mjs,
# run.mjs's validity gate). Clones huggingface/cadgenbench next to the repo and
# installs it into bench/cadgen/.venv.
#
# Pins: the evaluator calls Bnd_Box.Get(), which OCP 8 broke, so build123d is
# held at 0.10 with cadquery-ocp-novtk 7.9 (the stack its pyproject names).
# Its renders need OpenGL and an X server: on a headless Linux box install
# libegl1 libgl1 libosmesa6 xvfb (score.mjs runs under xvfb-run by itself).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SRC="${CADGENBENCH_SRC:-$HERE/../../../cadgenbench}"
[ -d "$SRC" ] || git clone --depth 1 https://github.com/huggingface/cadgenbench "$SRC"
python3 -m venv "$HERE/.venv" 2>/dev/null || uv venv -p 3.13 "$HERE/.venv"
if [ -x "$HERE/.venv/bin/pip" ]; then PIP=("$HERE/.venv/bin/pip" install -q); else PIP=(uv pip install --python "$HERE/.venv/bin/python"); fi
"${PIP[@]}" -e "$SRC" "build123d==0.10.*" "cadquery-ocp-novtk>=7.9,<7.10"
echo "evaluator ready: $HERE/.venv/bin/cadgenbench"
