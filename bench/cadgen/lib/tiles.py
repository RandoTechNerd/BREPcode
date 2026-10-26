"""Cut a drawing into an overview plus overlapping zoomed tiles for the model.

    python -I tiles.py input.png outdir [grid=2]
Writes overview.png (long edge 1568) and tile_<r><c>.png (each a 1/grid
crop with 12% overlap, at up to 1568 px, i.e. near native resolution).
"""
import sys
from pathlib import Path
from PIL import Image

src, out = Path(sys.argv[1]), Path(sys.argv[2])
grid = int(sys.argv[3]) if len(sys.argv) > 3 else 2
out.mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert("L")
W, H = im.size

def fit(img, edge=1568):
    s = edge / max(img.size)
    return img.resize((round(img.size[0] * s), round(img.size[1] * s)), Image.LANCZOS) if s < 1 else img

fit(im).save(out / "overview.png")
ov = 0.12
tw, th = W / grid, H / grid
for r in range(grid):
    for c in range(grid):
        x0 = max(0, int(c * tw - ov * tw)); x1 = min(W, int((c + 1) * tw + ov * tw))
        y0 = max(0, int(r * th - ov * th)); y1 = min(H, int((r + 1) * th + ov * th))
        fit(im.crop((x0, y0, x1, y1))).save(out / f"tile_{r}{c}.png")
