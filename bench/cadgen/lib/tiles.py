"""Cut a picture into the crops src/imageread.js planned (overview, tiles,
zooms), each scaled down to fit the model's 1568 px long edge.

    python -I tiles.py input.png outdir '[{"name":"overview","x":0,"y":0,"w":W,"h":H}, ...]'
    python -I tiles.py input.png --size      prints "W H"
    python -I tiles.py input.png --gray outdir '[rects]' [edge]
                                             each crop as an 8-bit PGM no longer than edge
                                             (800) px, for the outline compare (src/silhouette.js)
"""
import json
import sys
from pathlib import Path
from PIL import Image, ImageFilter

src = Path(sys.argv[1])
im = Image.open(src).convert("L")
if sys.argv[2] == "--size":
    print(im.size[0], im.size[1])
    sys.exit(0)
if sys.argv[2] == "--gray":
    out = Path(sys.argv[3])
    out.mkdir(parents=True, exist_ok=True)
    edge = int(sys.argv[5]) if len(sys.argv) > 5 else 800
    for r in json.loads(sys.argv[4]):
        c = im.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))
        s = min(1.0, edge / max(c.size))
        if s < 1:
            # thicken the strokes first so thin lines survive the shrink
            k = min(7, 2 * int(0.7 / s) + 1)
            if k > 1:
                c = c.filter(ImageFilter.MinFilter(k))
            c = c.resize((max(1, round(c.size[0] * s)), max(1, round(c.size[1] * s))), Image.LANCZOS)
        c.save(out / f"{r['name']}.pgm")
    sys.exit(0)
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
rects = json.loads(sys.argv[3])


def fit(img, edge=1568):
    s = edge / max(img.size)
    return img.resize((round(img.size[0] * s), round(img.size[1] * s)), Image.LANCZOS) if s < 1 else img


for r in rects:
    fit(im.crop((r["x"], r["y"], r["x"] + r["w"], r["y"] + r["h"]))).save(out / f"{r['name']}.png")
