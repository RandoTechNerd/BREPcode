# Render triangle soups to a PNG panel strip.
#   python render.py out.png view title1 file1 mode1 [title2 file2 mode2 ...]
# file: colorize.mjs JSON (tris, dev, level) or an STL; mode: gray | dev:<mm> | level
import sys, json, struct, numpy as np
from PIL import Image, ImageDraw, ImageFont

def load(path):
    if path.endswith('.json'):
        j = json.load(open(path))
        return np.array(j['tris'], float).reshape(-1, 3, 3), np.array(j.get('dev') or []), np.array(j.get('level') or [])
    b = open(path, 'rb').read()
    if b[:5] == b'solid' and b'facet' in b[:400]:
        import re
        v = np.array(re.findall(rb'vertex\s+(\S+)\s+(\S+)\s+(\S+)', b), float)
        return v.reshape(-1, 3, 3), np.array([]), np.array([])
    n = struct.unpack('<I', b[80:84])[0]
    a = np.frombuffer(b[84:84 + n * 50], dtype=np.dtype([('n', '<f4', 3), ('v', '<f4', (3, 3)), ('a', '<u2')]))
    return a['v'].astype(float), np.array([]), np.array([])

VIEWS = {'iso': (35, -50), 'front': (0, -90), 'side': (0, 0), 'top': (89, -90), 'back': (30, 130), 'low': (-25, -60)}

def rot(elev, azim):
    e, a = np.radians(elev), np.radians(azim)
    Rz = np.array([[np.cos(a), -np.sin(a), 0], [np.sin(a), np.cos(a), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, np.cos(e), -np.sin(e)], [0, np.sin(e), np.cos(e)]])
    # camera looks down -y after rotation; screen x = X, screen y = Z
    return Rx @ Rz

LEVEL_COL = np.array([[120, 170, 120], [110, 160, 220], [240, 200, 90], [240, 120, 60], [200, 50, 50], [0, 0, 0], [170, 90, 200], [255, 0, 255]], float)

def colors(T, dev, level, mode):
    if mode == 'level' and len(level):
        return LEVEL_COL[np.clip(level, 0, 7).astype(int)]
    if mode.startswith('dev') and len(dev):
        lim = float(mode.split(':')[1])
        x = np.clip(dev / lim, 0, 1)
        import matplotlib
        return matplotlib.colormaps['turbo'](0.08 + 0.84 * x)[:, :3] * 255
    return np.tile([200, 200, 205], (len(T), 1)).astype(float)

def panel(T, C, R, size, box):
    P = T @ R.T
    lo, hi = box
    scale = 0.9 * size / max(hi[0] - lo[0], hi[2] - lo[2])
    cx, cz = (lo[0] + hi[0]) / 2, (lo[2] + hi[2]) / 2
    sx = (P[:, :, 0] - cx) * scale + size / 2
    sy = size / 2 - (P[:, :, 2] - cz) * scale
    depth = P[:, :, 1]
    n = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    nl = np.linalg.norm(n, axis=1) + 1e-12
    n = n / nl[:, None]
    light = np.array([-0.4, -0.75, 0.5]); light /= np.linalg.norm(light)
    shade = 0.35 + 0.65 * np.abs(n @ light)
    img = np.full((size, size, 3), 255.0)
    zb = np.full((size, size), np.inf)
    for t in range(len(T)):
        x0, y0, x1, y1, x2, y2 = sx[t, 0], sy[t, 0], sx[t, 1], sy[t, 1], sx[t, 2], sy[t, 2]
        minx, maxx = int(max(0, np.floor(min(x0, x1, x2)))), int(min(size - 1, np.ceil(max(x0, x1, x2))))
        miny, maxy = int(max(0, np.floor(min(y0, y1, y2)))), int(min(size - 1, np.ceil(max(y0, y1, y2))))
        if minx > maxx or miny > maxy: continue
        den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
        if abs(den) < 1e-12: continue
        xs, ys = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
        a = ((y1 - y2) * (xs - x2) + (x2 - x1) * (ys - y2)) / den
        b = ((y2 - y0) * (xs - x2) + (x0 - x2) * (ys - y2)) / den
        c = 1 - a - b
        m = (a >= -1e-6) & (b >= -1e-6) & (c >= -1e-6)
        if not m.any(): continue
        z = a * depth[t, 0] + b * depth[t, 1] + c * depth[t, 2]
        sub = zb[miny:maxy + 1, minx:maxx + 1]
        w = m & (z < sub)
        sub[w] = z[w]
        img[miny:maxy + 1, minx:maxx + 1][w] = C[t] * shade[t]
    return img

def main():
    out, view = sys.argv[1], sys.argv[2]
    items = [sys.argv[i:i + 3] for i in range(3, len(sys.argv), 3)]
    R = rot(*VIEWS[view])
    loaded = [load(f) for _, f, _ in items]
    allP = np.concatenate([T.reshape(-1, 3) for T, _, _ in loaded]) @ R.T
    box = (allP.min(0), allP.max(0))
    size = 520
    W = Image.new('RGB', (size * len(items), size + 34), 'white')
    d = ImageDraw.Draw(W)
    try: font = ImageFont.truetype('arial.ttf', 17)
    except Exception: font = ImageFont.load_default()
    for k, ((title, _, mode), (T, dev, level)) in enumerate(zip(items, loaded)):
        img = panel(T, colors(T, dev, level, mode), R, size, box)
        W.paste(Image.fromarray(img.astype(np.uint8)), (k * size, 34))
        d.text((k * size + 10, 8), title, fill='black', font=font)
    W.save(out)

main()
